import { readBundledManifest } from "./packages.js";

export interface PackageSpec {
  id: string;
  version: string;
  sha256: string;
}

export type PackageLoadCode = "package_integrity" | "version_mismatch" | "not_in_runtime";

export class PluginLoadError extends Error {
  constructor(readonly code: PackageLoadCode) {
    super(code);
    this.name = "PluginLoadError";
  }
}

export interface PluginLoader {
  /** Check the package bytes before the installation row changes. */
  stage(spec: PackageSpec): Promise<void>;
  /** Activate after the row is written. Throw to roll the row back. */
  start(spec: PackageSpec): Promise<void>;
}

/**
 * Official packages are the manifests already in this tree.
 * A signed index whose digest does not match those files is not loaded.
 */
export function createBundledLoader(root?: string): PluginLoader {
  const check = (spec: PackageSpec): void => {
    let bundled: { version: string; digest: string };
    try {
      bundled = root === undefined ? readBundledManifest(spec.id) : readBundledManifest(spec.id, root);
    } catch {
      throw new PluginLoadError("not_in_runtime");
    }
    if (bundled.version !== spec.version) throw new PluginLoadError("version_mismatch");
    if (bundled.digest !== spec.sha256) throw new PluginLoadError("package_integrity");
  };
  return {
    async stage(spec) {
      check(spec);
    },
    async start(spec) {
      check(spec);
    },
  };
}
