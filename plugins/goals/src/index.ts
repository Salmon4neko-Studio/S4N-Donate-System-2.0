import { manifest } from "./manifest.js";

export { manifest };

/** Declared overlay or worker slot. The shell does not load this module yet. */
export const slot = {
  pluginId: manifest.id,
  implemented: false as const,
};
