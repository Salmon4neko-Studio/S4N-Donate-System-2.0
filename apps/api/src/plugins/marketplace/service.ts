import { PERMISSIONS } from "@s4n/plugin-sdk";
import type { PluginChangeAction, PluginChangedPayload } from "@s4n/events";
import type { CoreBus } from "../../realtime/bus.js";
import type { InstallationRecord, InstallationStore } from "../installations.js";
import type { SecretStore } from "../settings.js";
import { createBundledLoader, PluginLoadError, type PackageSpec, type PluginLoader } from "./loader.js";
import { readBundledManifest } from "./packages.js";
import {
  compareVersions,
  installDecision,
  permissionDiff,
  samePermissions,
} from "./policy.js";
import {
  createEmptyCommunitySource,
  createFileSource,
  loadSource,
  mergeEntries,
  officialRegistryPath,
} from "./source.js";
import { OFFICIAL_REGISTRY_PUBLIC_KEY } from "./pinned-key.js";
import type { MarketplaceListing, RegistryPlugin, RegistrySource, RegistrySourceId } from "./types.js";

const KNOWN_PERMISSIONS = new Set<string>(PERMISSIONS);

export class MarketplaceError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "MarketplaceError";
  }
}

interface CatalogEntry extends RegistryPlugin {
  source: RegistrySourceId;
}

export interface MarketplaceDeps {
  official: RegistrySource;
  community: RegistrySource;
  publicKey: string;
  installations: InstallationStore;
  secrets: SecretStore;
  bus: CoreBus;
  loader: PluginLoader;
  now?: () => Date;
}

export interface CheckResult {
  checkedAt: string | null;
  verified: boolean;
  updates: number;
}

export class MarketplaceService {
  private entries: CatalogEntry[] = [];
  private trusted = false;
  private checkedAt: string | null = null;
  private lastError: string | null = null;
  private tail: Promise<void> = Promise.resolve();
  private readonly now: () => Date;

  constructor(private readonly deps: MarketplaceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  isTrusted(): boolean {
    return this.trusted;
  }

  lastCheckedAt(): string | null {
    return this.checkedAt;
  }

  failure(): string | null {
    return this.lastError;
  }

  ready(): Promise<void> {
    return this.exclusive(async () => {
      if (this.checkedAt !== null || this.lastError !== null) return;
      await this.reload();
    });
  }

  check(): Promise<CheckResult> {
    return this.exclusive(async () => {
      await this.reload();
      if (!this.trusted) {
        return { checkedAt: this.checkedAt, verified: false, updates: 0 };
      }
      const listings = await this.compose();
      return {
        checkedAt: this.checkedAt,
        verified: true,
        updates: listings.filter((item) => item.updateAvailable).length,
      };
    });
  }

  listings(): Promise<MarketplaceListing[]> {
    return this.exclusive(async () => {
      await this.ensureLoaded();
      if (!this.trusted) throw new MarketplaceError("registry_untrusted");
      return this.compose();
    });
  }

  async listing(id: string): Promise<MarketplaceListing> {
    const items = await this.listings();
    const found = items.find((item) => item.id === id);
    if (found === undefined) throw new MarketplaceError("unknown_plugin");
    return found;
  }

  install(id: string, accepted: readonly string[]): Promise<MarketplaceListing> {
    return this.exclusive(async () => {
      const entry = await this.requireEntry(id);
      const decision = this.requireAllowed(entry);
      const existing = await this.deps.installations.get(id);
      if (existing?.installed) throw new MarketplaceError("already_installed");
      this.requireAccepted(accepted, entry.permissions);
      const spec = specOf(entry);
      if (decision.runtime === "bundled") await this.stage(spec);
      const next = blankRecord(entry);
      await this.deps.installations.save(next);
      try {
        if (decision.runtime === "bundled") await this.deps.loader.start(spec);
      } catch (error) {
        if (existing) await this.deps.installations.save(existing);
        else await this.deps.installations.remove(id);
        await this.audit({
          action: "rollback",
          pluginId: id,
          version: existing?.version ?? entry.version,
          previousVersion: entry.version,
          permissions: existing?.permissions ?? [],
          added: [],
          removed: [],
          source: entry.source,
          dataKept: existing ? true : null,
        });
        throw this.loadError(error);
      }
      await this.audit({
        action: "install",
        pluginId: id,
        version: entry.version,
        previousVersion: null,
        permissions: entry.permissions,
        added: [...entry.permissions],
        removed: [],
        source: entry.source,
        dataKept: null,
      });
      return this.one(id);
    });
  }

  update(id: string, accepted: readonly string[]): Promise<MarketplaceListing> {
    return this.exclusive(async () => {
      const entry = await this.requireEntry(id);
      const decision = this.requireAllowed(entry);
      const record = await this.deps.installations.get(id);
      if (!record?.installed) throw new MarketplaceError("not_installed");
      if (record.pinned) throw new MarketplaceError("version_pinned");
      if (compareVersions(entry.version, record.version) <= 0) throw new MarketplaceError("already_current");
      this.requireAccepted(accepted, entry.permissions);
      const added = addedPermissions(record, entry);
      const removed = permissionDiff(record.permissions, entry.permissions).removed;
      const spec = specOf(entry);
      if (decision.runtime === "bundled") await this.stage(spec);
      const next: InstallationRecord = {
        ...record,
        version: entry.version,
        sha256: entry.sha256,
        previousVersion: record.version,
        previousSha256: record.sha256 === "" ? null : record.sha256,
        permissions: [...entry.permissions],
        source: entry.source,
      };
      await this.deps.installations.save(next);
      try {
        if (decision.runtime === "bundled") await this.deps.loader.start(spec);
      } catch (error) {
        await this.deps.installations.save(record);
        await this.audit({
          action: "rollback",
          pluginId: id,
          version: record.version,
          previousVersion: entry.version,
          permissions: record.permissions,
          added: [],
          removed: [],
          source: record.source,
          dataKept: null,
        });
        if (error instanceof PluginLoadError || error instanceof MarketplaceError) {
          throw new MarketplaceError("update_rolled_back");
        }
        throw new MarketplaceError("update_rolled_back");
      }
      await this.audit({
        action: "update",
        pluginId: id,
        version: entry.version,
        previousVersion: record.version,
        permissions: entry.permissions,
        added,
        removed,
        source: entry.source,
        dataKept: null,
      });
      return this.one(id);
    });
  }

  setPinned(id: string, pinned: boolean): Promise<MarketplaceListing> {
    return this.exclusive(async () => {
      await this.ensureLoaded();
      const record = await this.deps.installations.get(id);
      if (!record?.installed) throw new MarketplaceError("not_installed");
      if (record.pinned !== pinned) {
        await this.deps.installations.save({ ...record, pinned });
        await this.audit({
          action: pinned ? "pin" : "unpin",
          pluginId: id,
          version: record.version,
          previousVersion: record.previousVersion,
          permissions: record.permissions,
          added: [],
          removed: [],
          source: record.source,
          dataKept: null,
        });
      }
      return this.one(id);
    });
  }

  setEnabled(id: string, enabled: boolean): Promise<void> {
    return this.exclusive(async () => {
      await this.ensureLoaded();
      const record = await this.deps.installations.get(id);
      if (!record?.installed) throw new MarketplaceError("not_installed");
      await this.deps.installations.setEnabled(id, enabled, record.version);
      await this.audit({
        action: enabled ? "enable" : "disable",
        pluginId: id,
        version: record.version,
        previousVersion: record.previousVersion,
        permissions: record.permissions,
        added: [],
        removed: [],
        source: record.source,
        dataKept: null,
      });
    });
  }

  uninstall(id: string, keepData: boolean): Promise<void> {
    return this.exclusive(async () => {
      await this.ensureLoaded();
      const record = await this.deps.installations.get(id);
      if (!record?.installed) throw new MarketplaceError("not_installed");
      if (keepData) {
        await this.deps.installations.save({ ...record, installed: false, enabled: false });
      } else {
        await this.deps.secrets.discard(id);
        await this.deps.installations.remove(id);
      }
      await this.audit({
        action: "uninstall",
        pluginId: id,
        version: record.version,
        previousVersion: record.previousVersion,
        permissions: record.permissions,
        added: [],
        removed: [],
        source: record.source,
        dataKept: keepData,
      });
    });
  }

  private async reload(): Promise<void> {
    const official = await loadSource(this.deps.official, this.deps.publicKey);
    if (!official.ok) {
      this.lastError = official.reason;
      if (this.entries.length === 0) this.trusted = false;
      return;
    }
    const community = await loadSource(this.deps.community, this.deps.publicKey);
    const communityEntries = community.ok ? community.entries : [];
    this.entries = mergeEntries(official.entries, communityEntries);
    this.trusted = true;
    this.lastError = null;
    this.checkedAt = this.now().toISOString();
    await this.reconcile();
  }

  private async reconcile(): Promise<void> {
    for (const entry of this.entries) {
      if (entry.source !== "official" || !entry.official) continue;
      let bundled: { version: string; digest: string };
      try {
        bundled = readBundledManifest(entry.id);
      } catch {
        continue;
      }
      if (bundled.digest !== entry.sha256 || bundled.version !== entry.version) continue;
      const existing = await this.deps.installations.get(entry.id);
      if (existing === null) {
        await this.deps.installations.save(blankRecord(entry));
        continue;
      }
      if (!existing.installed) continue;
      if (existing.sha256 === "" && existing.version === entry.version) {
        await this.deps.installations.save({
          ...existing,
          sha256: entry.sha256,
          permissions: existing.permissions.length > 0 ? existing.permissions : [...entry.permissions],
        });
      }
    }
  }

  private async ensureLoaded(): Promise<void> {
    if (this.checkedAt === null && this.lastError === null) await this.reload();
  }

  private async requireEntry(id: string): Promise<CatalogEntry> {
    await this.ensureLoaded();
    if (!this.trusted) throw new MarketplaceError("registry_untrusted");
    const entry = this.entries.find((item) => item.id === id);
    if (entry === undefined) throw new MarketplaceError("unknown_plugin");
    return entry;
  }

  private requireAllowed(entry: CatalogEntry): { runtime: "bundled" | "metadata" } {
    const decision = installDecision(entry, entry.source);
    if (!decision.allow) throw new MarketplaceError(decision.reason);
    return decision;
  }

  private requireAccepted(accepted: readonly string[], required: readonly string[]): void {
    if (!samePermissions(accepted, required)) throw new MarketplaceError("permissions_not_accepted");
  }

  private async stage(spec: PackageSpec): Promise<void> {
    try {
      await this.deps.loader.stage(spec);
    } catch (error) {
      throw this.loadError(error);
    }
  }

  private loadError(error: unknown): MarketplaceError {
    if (error instanceof PluginLoadError) return new MarketplaceError(error.code);
    if (error instanceof MarketplaceError) return error;
    return new MarketplaceError("package_integrity");
  }

  private async compose(): Promise<MarketplaceListing[]> {
    const records = new Map((await this.deps.installations.list()).map((record) => [record.id, record]));
    return this.entries.map((entry) => this.toListing(entry, records.get(entry.id) ?? null));
  }

  private async one(id: string): Promise<MarketplaceListing> {
    const entry = this.entries.find((item) => item.id === id);
    if (entry === undefined) throw new MarketplaceError("unknown_plugin");
    return this.toListing(entry, await this.deps.installations.get(id));
  }

  private toListing(entry: CatalogEntry, record: InstallationRecord | null): MarketplaceListing {
    const decision = installDecision(entry, entry.source);
    const installed = record?.installed === true;
    const updateAvailable =
      installed && record !== null && compareVersions(entry.version, record.version) > 0;
    return {
      id: entry.id,
      name: entry.name,
      version: entry.version,
      installedVersion: installed && record !== null ? record.version : null,
      description: entry.description,
      category: entry.category,
      author: entry.author,
      official: entry.source === "official" && entry.official,
      featured: entry.featured,
      icon: entry.icon,
      kind: [...entry.kind],
      permissions: [...entry.permissions],
      addedPermissions: updateAvailable && record !== null ? addedPermissions(record, entry) : [],
      changelog: entry.changelog,
      compatibility: { core: entry.compatibility.core, pluginSpec: entry.compatibility.pluginSpec },
      screenshots: entry.screenshots.map((shot) => ({ ...shot })),
      source: entry.source,
      installed,
      enabled: installed && record?.enabled === true,
      pinned: installed && record?.pinned === true,
      updateAvailable,
      previousVersion: installed && record !== null ? record.previousVersion : null,
      installable: !installed && decision.allow,
      blockReason: decision.allow ? null : decision.reason,
      runtime: decision.allow ? decision.runtime : "none",
    };
  }

  private async audit(input: {
    action: PluginChangeAction;
    pluginId: string;
    version: string;
    previousVersion: string | null;
    permissions: readonly string[];
    added: readonly string[];
    removed: readonly string[];
    source: RegistrySourceId;
    dataKept: boolean | null;
  }): Promise<void> {
    const payload: PluginChangedPayload = {
      action: input.action,
      pluginId: input.pluginId,
      version: input.version,
      previousVersion: input.previousVersion,
      permissions: known(input.permissions),
      addedPermissions: known(input.added),
      removedPermissions: known(input.removed),
      source: input.source,
      dataKept: input.dataKept,
    };
    try {
      await this.deps.bus.publish("s4n.plugin.changed", payload);
    } catch {
      // The row is already updated. Do not invent a second audit write.
    }
  }

  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.tail.then(fn, fn);
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}

function specOf(entry: CatalogEntry): PackageSpec {
  return { id: entry.id, version: entry.version, sha256: entry.sha256 };
}

function blankRecord(entry: CatalogEntry): InstallationRecord {
  return {
    id: entry.id,
    enabled: false,
    installed: true,
    version: entry.version,
    pinned: false,
    source: entry.source,
    sha256: entry.sha256,
    previousVersion: null,
    previousSha256: null,
    permissions: [...entry.permissions],
  };
}

function addedPermissions(record: InstallationRecord, entry: CatalogEntry): string[] {
  if (record.permissions.length === 0) return [...entry.permissions];
  return permissionDiff(record.permissions, entry.permissions).added;
}

function known(values: readonly string[]): string[] {
  return values.filter((value) => KNOWN_PERMISSIONS.has(value));
}

export function createBundledMarketplace(deps: {
  installations: InstallationStore;
  secrets: SecretStore;
  bus: CoreBus;
  loader?: PluginLoader;
  community?: RegistrySource;
  now?: () => Date;
}): MarketplaceService {
  return new MarketplaceService({
    official: createFileSource("official", officialRegistryPath()),
    community: deps.community ?? createEmptyCommunitySource(),
    publicKey: OFFICIAL_REGISTRY_PUBLIC_KEY,
    installations: deps.installations,
    secrets: deps.secrets,
    bus: deps.bus,
    loader: deps.loader ?? createBundledLoader(),
    ...(deps.now !== undefined ? { now: deps.now } : {}),
  });
}
