import { COMMUNITY_DEFAULT_PERMISSIONS } from "s4n-donate-system-2.0-plugin-sdk";
import { isOfficialPluginId, isPaymentPluginId } from "../official.js";
import type { InstallRuntime, RegistryPlugin, RegistrySourceId } from "./types.js";

export const TRIVIAL_PERMISSIONS = COMMUNITY_DEFAULT_PERMISSIONS;

export type InstallBlock =
  | "payment_official_only"
  | "community_not_installable"
  | "not_official_allowlist"
  | "incompatible";

export type InstallDecision =
  | { allow: true; runtime: InstallRuntime }
  | { allow: false; reason: InstallBlock };

const TRIVIAL = new Set<string>(TRIVIAL_PERMISSIONS);

/**
 * Payment plugins are official-only, and only the pinned payment ids may install.
 * A community plugin installs in v1 only when every permission is the trivial
 * overlay set and it does not run as a payment, connector, or processor.
 * That install records state. It does not load community code.
 */
export function installDecision(entry: RegistryPlugin, source: RegistrySourceId): InstallDecision {
  if (entry.api !== "0.1" || entry.compatibility.core !== "0.1" || entry.compatibility.pluginSpec !== "0.1") {
    return { allow: false, reason: "incompatible" };
  }
  if (isPayment(entry)) {
    if (source !== "official" || !entry.official || !isPaymentPluginId(entry.id)) {
      return { allow: false, reason: "payment_official_only" };
    }
    return { allow: true, runtime: "bundled" };
  }
  if (source === "official") {
    if (!entry.official || !isOfficialPluginId(entry.id)) {
      return { allow: false, reason: "not_official_allowlist" };
    }
    return { allow: true, runtime: "bundled" };
  }
  const kindsOk = entry.kind.length > 0 && entry.kind.every((kind) => kind === "overlay" || kind === "dashboard");
  const permissionsOk = entry.permissions.every((permission) => TRIVIAL.has(permission));
  if (!entry.official && kindsOk && permissionsOk) {
    return { allow: true, runtime: "metadata" };
  }
  return { allow: false, reason: "community_not_installable" };
}

export function isPayment(entry: Pick<RegistryPlugin, "category" | "kind" | "permissions">): boolean {
  return (
    entry.category === "payment" ||
    entry.kind.includes("payment") ||
    entry.permissions.includes("payments.provider")
  );
}

export function permissionDiff(
  before: readonly string[],
  after: readonly string[],
): { added: string[]; removed: string[] } {
  const previous = new Set(before);
  const next = new Set(after);
  return {
    added: after.filter((permission) => !previous.has(permission)),
    removed: before.filter((permission) => !next.has(permission)),
  };
}

/** Order does not matter. Duplicates are not an acceptance. */
export function samePermissions(accepted: readonly string[], required: readonly string[]): boolean {
  if (accepted.length !== required.length) return false;
  const got = new Set(accepted);
  if (got.size !== required.length) return false;
  return required.every((permission) => got.has(permission));
}

export function compareVersions(left: string, right: string): number {
  const a = left.split(".").map((part) => Number(part));
  const b = right.split(".").map((part) => Number(part));
  for (let index = 0; index < 3; index += 1) {
    const delta = (a[index] ?? 0) - (b[index] ?? 0);
    if (delta !== 0) return delta > 0 ? 1 : -1;
  }
  return 0;
}

