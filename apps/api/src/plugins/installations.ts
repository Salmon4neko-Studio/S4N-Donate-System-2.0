export interface InstallationRecord {
  id: string;
  enabled: boolean;
  installed: boolean;
  version: string;
  pinned: boolean;
  source: "official" | "community";
  sha256: string;
  previousVersion: string | null;
  previousSha256: string | null;
  permissions: string[];
}

export class InstallationRejected extends Error {
  constructor(readonly code: "not_installed") {
    super(code);
    this.name = "InstallationRejected";
  }
}

export interface InstallationStore {
  enabledIds(): Promise<ReadonlySet<string>>;
  setEnabled(pluginId: string, enabled: boolean, version: string): Promise<void>;
  get(pluginId: string): Promise<InstallationRecord | null>;
  list(): Promise<InstallationRecord[]>;
  save(record: InstallationRecord): Promise<void>;
  remove(pluginId: string): Promise<void>;
}

export function createMemoryInstallations(): InstallationStore {
  const rows = new Map<string, InstallationRecord>();

  return {
    async enabledIds() {
      const enabled = new Set<string>();
      for (const row of rows.values()) {
        if (row.enabled && row.installed) enabled.add(row.id);
      }
      return enabled;
    },
    async setEnabled(pluginId, enabled, version) {
      const current = rows.get(pluginId);
      if (current !== undefined) {
        if (!current.installed) throw new InstallationRejected("not_installed");
        rows.set(pluginId, { ...current, enabled });
        return;
      }
      rows.set(pluginId, {
        id: pluginId,
        enabled,
        installed: true,
        version,
        pinned: false,
        source: "official",
        sha256: "",
        previousVersion: null,
        previousSha256: null,
        permissions: [],
      });
    },
    async get(pluginId) {
      const row = rows.get(pluginId);
      return row === undefined ? null : clone(row);
    },
    async list() {
      return [...rows.values()].map(clone);
    },
    async save(record) {
      rows.set(record.id, clone(record));
    },
    async remove(pluginId) {
      rows.delete(pluginId);
    },
  };
}

function clone(record: InstallationRecord): InstallationRecord {
  return {
    ...record,
    permissions: [...record.permissions],
  };
}
