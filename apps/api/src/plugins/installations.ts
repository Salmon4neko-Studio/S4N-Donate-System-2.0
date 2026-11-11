export interface InstallationStore {
  enabledIds(): Promise<ReadonlySet<string>>;
  setEnabled(pluginId: string, enabled: boolean, version: string): Promise<void>;
}

export function createMemoryInstallations(): InstallationStore {
  const enabled = new Set<string>();
  return {
    async enabledIds() {
      return new Set(enabled);
    },
    async setEnabled(pluginId, value) {
      if (value) enabled.add(pluginId);
      else enabled.delete(pluginId);
    },
  };
}
