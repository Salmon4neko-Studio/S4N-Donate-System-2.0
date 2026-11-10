export const PERMISSIONS = [
  "events.subscribe",
  "events.emit",
  "overlay.slot",
  "dashboard.settings",
  "tts.speak",
  "payments.read",
  "payments.provider",
  "secrets",
  "network",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Phase 1 refuses these for any plugin that is not on the core allowlist.
 * `payments.provider` may create payments and verify callbacks.
 * It still does not grant a ledger write.
 */
export const OFFICIAL_ONLY_PERMISSIONS = [
  "payments.provider",
  "secrets",
  "network",
] as const satisfies readonly Permission[];

/** What a community plugin is expected to ask for. */
export const COMMUNITY_DEFAULT_PERMISSIONS = [
  "events.subscribe",
  "overlay.slot",
  "dashboard.settings",
] as const satisfies readonly Permission[];

export function isOfficialOnlyPermission(permission: Permission): boolean {
  return (OFFICIAL_ONLY_PERMISSIONS as readonly Permission[]).includes(permission);
}

export function assertPermissionsAllowed(
  pluginId: string,
  permissions: readonly Permission[],
  officialPluginIds: readonly string[],
): void {
  if (officialPluginIds.includes(pluginId)) return;
  for (const permission of permissions) {
    if (isOfficialOnlyPermission(permission)) {
      throw new Error(
        `Plugin ${pluginId} cannot request official-only permission ${permission}`,
      );
    }
  }
}
