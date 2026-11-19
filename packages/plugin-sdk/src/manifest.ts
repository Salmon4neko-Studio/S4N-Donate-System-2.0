import { isHexColor, parseOverlayRect, type OverlayRect } from "./overlay.js";
import { PERMISSIONS, type Permission } from "./permissions.js";

export const PLUGIN_API_VERSION = "0.1" as const;

export const PLUGIN_KINDS = [
  "overlay",
  "dashboard",
  "connector",
  "payment",
  "processor",
] as const;

export type PluginKind = (typeof PLUGIN_KINDS)[number];

export interface PluginEntry {
  overlay?: string;
  dashboard?: string;
  worker?: string;
}

export interface SettingsField {
  type: "string" | "number" | "boolean" | "integer";
  title?: string;
  description?: string;
  enum?: readonly string[];
  minimum?: number;
  /** Inclusive upper bound for number and integer fields. */
  maximum?: number;
  /**
   * Core encrypts the value at rest and never returns it in plaintext.
   * This is an open annotation, not a standard JSON Schema keyword.
   * A secret field cannot also declare `default` — the default would be echoed
   * to the dashboard.
   */
  "x-s4n-secret"?: boolean;
  /**
   * Render the string as a textarea. Values stay a single string (newlines allowed).
   * Not a standard JSON Schema keyword.
   */
  "x-s4n-multiline"?: boolean;
  /** Shown and used when the operator has not stored a value. Not allowed on secrets. */
  default?: string | number | boolean;
  /** String fields only. The stored value may not be longer than this. */
  maxLength?: number;
  /**
   * The string must be `#RGB` or `#RRGGBB`.
   * Not a standard JSON Schema keyword.
   */
  "x-s4n-color"?: boolean;
  /**
   * Render the string as a local date-time. The stored value is an ISO-8601
   * timestamp, or an empty string when the operator clears it.
   * Not a standard JSON Schema keyword.
   */
  "x-s4n-datetime"?: boolean;
}

export interface SettingsSchema {
  type: "object";
  properties: Record<string, SettingsField>;
  required?: readonly string[];
  additionalProperties?: boolean;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  api: typeof PLUGIN_API_VERSION;
  description?: string;
  kind: readonly PluginKind[];
  permissions: readonly Permission[];
  entry: PluginEntry;
  settingsSchema: SettingsSchema;
  /**
   * Present when this plugin draws on the shared OBS canvas.
   * `kind` may still include `overlay` without this field (a placeholder that
   * is not placed). Future plugins opt in by setting the default rectangle.
   */
  overlaySlot?: OverlayRect;
}

export class ManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManifestError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expectString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ManifestError(`${label} must be a non-empty string`);
  }
  return value;
}

/** True when the field is stored encrypted and must not be echoed to the dashboard. */
export function isSecretField(field: SettingsField): boolean {
  return field["x-s4n-secret"] === true;
}

export function secretFieldKeys(schema: SettingsSchema): string[] {
  return Object.entries(schema.properties)
    .filter(([, field]) => isSecretField(field))
    .map(([key]) => key);
}

/** Settings edited on the per-plugin page. The inverse of `secretFieldKeys`. */
export function publicFieldKeys(schema: SettingsSchema): string[] {
  return Object.entries(schema.properties)
    .filter(([, field]) => !isSecretField(field))
    .map(([key]) => key);
}

/**
 * Whether an enabled plugin belongs in the dashboard 「外掛」 sidebar.
 * Secret-only plugins stay on the management page.
 * No extra schema flag: a field is public unless `x-s4n-secret` is true,
 * and an overlay is listed even when it has no public fields.
 */
export function hasPluginSettingsNav(
  manifest: Pick<PluginManifest, "kind" | "settingsSchema">,
): boolean {
  return manifest.kind.includes("overlay") || publicFieldKeys(manifest.settingsSchema).length > 0;
}

export function parseManifest(value: unknown): PluginManifest {
  if (!isRecord(value)) throw new ManifestError("manifest must be an object");

  const id = expectString(value.id, "id");
  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/.test(id)) {
    throw new ManifestError("id must be lowercase and contain a dot or hyphen");
  }

  const api = expectString(value.api, "api");
  if (api !== PLUGIN_API_VERSION) {
    throw new ManifestError(`unsupported api ${api}`);
  }

  const kind = readKinds(value.kind);
  const permissions = readPermissions(value.permissions);
  const entry = readEntry(value.entry);
  const settingsSchema = parseSettingsSchema(value.settingsSchema);

  const manifest: PluginManifest = {
    id,
    name: expectString(value.name, "name"),
    version: expectString(value.version, "version"),
    api: PLUGIN_API_VERSION,
    kind,
    permissions,
    entry,
    settingsSchema,
  };

  if (value.description !== undefined) {
    manifest.description = expectString(value.description, "description");
  }
  if (value.overlaySlot !== undefined) {
    const slot = parseOverlayRect(value.overlaySlot);
    if (slot === null) throw new ManifestError("overlaySlot is invalid");
    manifest.overlaySlot = slot;
  }

  assertManifestCoherent(manifest);
  return manifest;
}

export function assertManifestCoherent(manifest: PluginManifest): void {
  const isPayment = manifest.kind.includes("payment");
  const providesPayments = manifest.permissions.includes("payments.provider");

  if (isPayment && !providesPayments) {
    throw new ManifestError("payment plugins must request payments.provider");
  }
  if (providesPayments && !isPayment) {
    throw new ManifestError("payments.provider requires kind payment");
  }
  if (isPayment && manifest.entry.worker === undefined) {
    throw new ManifestError("payment plugins need a worker entry");
  }

  const secrets = secretFieldKeys(manifest.settingsSchema);
  if (secrets.length > 0 && !manifest.permissions.includes("secrets")) {
    throw new ManifestError("secret settings require the secrets permission");
  }
  if (manifest.overlaySlot !== undefined) {
    if (!manifest.kind.includes("overlay")) {
      throw new ManifestError("overlaySlot requires kind overlay");
    }
    if (!manifest.permissions.includes("overlay.slot")) {
      throw new ManifestError("overlaySlot requires the overlay.slot permission");
    }
  }
}

function readKinds(value: unknown): PluginKind[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ManifestError("kind must be a non-empty array");
  }
  return value.map((item, index) => {
    if (typeof item !== "string" || !PLUGIN_KINDS.includes(item as PluginKind)) {
      throw new ManifestError(`kind[${index}] is invalid`);
    }
    return item as PluginKind;
  });
}

function readPermissions(value: unknown): Permission[] {
  if (!Array.isArray(value)) throw new ManifestError("permissions must be an array");
  return value.map((item, index) => {
    if (typeof item !== "string" || !PERMISSIONS.includes(item as Permission)) {
      throw new ManifestError(`permissions[${index}] is invalid`);
    }
    return item as Permission;
  });
}

function readEntry(value: unknown): PluginEntry {
  if (!isRecord(value)) throw new ManifestError("entry must be an object");
  const entry: PluginEntry = {};
  for (const key of ["overlay", "dashboard", "worker"] as const) {
    const item = value[key];
    if (item === undefined) continue;
    if (typeof item !== "string" || item.length === 0) {
      throw new ManifestError(`entry.${key} must be a path`);
    }
    entry[key] = item;
  }
  if (entry.overlay === undefined && entry.dashboard === undefined && entry.worker === undefined) {
    throw new ManifestError("entry needs overlay, dashboard, or worker");
  }
  return entry;
}

function parseSettingsSchema(value: unknown): SettingsSchema {
  if (!isRecord(value) || value.type !== "object" || !isRecord(value.properties)) {
    throw new ManifestError("settingsSchema must be an object schema");
  }

  const properties: Record<string, SettingsField> = {};
  for (const [key, raw] of Object.entries(value.properties)) {
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(key)) {
      throw new ManifestError(`settings field ${key} has an invalid name`);
    }
    properties[key] = parseField(raw);
  }

  const schema: SettingsSchema = { type: "object", properties };
  if (value.additionalProperties !== undefined) {
    if (typeof value.additionalProperties !== "boolean") {
      throw new ManifestError("additionalProperties must be a boolean");
    }
    schema.additionalProperties = value.additionalProperties;
  }
  if (value.required !== undefined) {
    if (!Array.isArray(value.required)) {
      throw new ManifestError("required must be an array");
    }
    const required = value.required.map((item, index) => {
      if (typeof item !== "string" || properties[item] === undefined) {
        throw new ManifestError(`required[${index}] is not a field`);
      }
      return item;
    });
    schema.required = required;
  }
  return schema;
}

function parseField(value: unknown): SettingsField {
  if (!isRecord(value)) throw new ManifestError("settings field must be an object");
  const type = value.type;
  if (type !== "string" && type !== "number" && type !== "boolean" && type !== "integer") {
    throw new ManifestError("settings field type is invalid");
  }
  const field: SettingsField = { type };
  if (value.title !== undefined) field.title = expectString(value.title, "title");
  if (value.description !== undefined) {
    field.description = expectString(value.description, "description");
  }
  if (value["x-s4n-secret"] !== undefined) {
    if (value["x-s4n-secret"] !== true && value["x-s4n-secret"] !== false) {
      throw new ManifestError("x-s4n-secret must be a boolean");
    }
    field["x-s4n-secret"] = value["x-s4n-secret"];
  }
  if (value.minimum !== undefined) {
    if (typeof value.minimum !== "number") throw new ManifestError("minimum must be a number");
    field.minimum = value.minimum;
  }
  if (value.maximum !== undefined) {
    const maximum = value.maximum;
    const integerField = type === "integer";
    if (
      (type !== "integer" && type !== "number") ||
      typeof maximum !== "number" ||
      !Number.isFinite(maximum) ||
      (integerField && !Number.isInteger(maximum)) ||
      (field.minimum !== undefined && maximum < field.minimum)
    ) {
      throw new ManifestError("maximum must be a number");
    }
    field.maximum = maximum;
  }
  if (value.enum !== undefined) {
    if (!Array.isArray(value.enum) || value.enum.some((item) => typeof item !== "string")) {
      throw new ManifestError("enum must be an array of strings");
    }
    field.enum = value.enum as string[];
  }
  if (value["x-s4n-multiline"] !== undefined) {
    if (value["x-s4n-multiline"] !== true && value["x-s4n-multiline"] !== false) {
      throw new ManifestError("x-s4n-multiline must be a boolean");
    }
    if (value["x-s4n-multiline"] === true && type !== "string") {
      throw new ManifestError("x-s4n-multiline is only valid on string fields");
    }
    field["x-s4n-multiline"] = value["x-s4n-multiline"];
  }
  if (value["x-s4n-color"] !== undefined) {
    if (value["x-s4n-color"] !== true && value["x-s4n-color"] !== false) {
      throw new ManifestError("x-s4n-color must be a boolean");
    }
    if (value["x-s4n-color"] === true && type !== "string") {
      throw new ManifestError("x-s4n-color is only valid on string fields");
    }
    if (value["x-s4n-color"] === true && field["x-s4n-secret"] === true) {
      throw new ManifestError("secret fields cannot be colors");
    }
    field["x-s4n-color"] = value["x-s4n-color"];
  }
  if (value["x-s4n-datetime"] !== undefined) {
    if (value["x-s4n-datetime"] !== true && value["x-s4n-datetime"] !== false) {
      throw new ManifestError("x-s4n-datetime must be a boolean");
    }
    if (value["x-s4n-datetime"] === true && type !== "string") {
      throw new ManifestError("x-s4n-datetime is only valid on string fields");
    }
    if (value["x-s4n-datetime"] === true && (field["x-s4n-secret"] === true || field["x-s4n-color"] === true)) {
      throw new ManifestError("x-s4n-datetime is only valid on string fields");
    }
    field["x-s4n-datetime"] = value["x-s4n-datetime"];
  }
  if (value.maxLength !== undefined) {
    if (
      type !== "string" ||
      typeof value.maxLength !== "number" ||
      !Number.isInteger(value.maxLength) ||
      value.maxLength < 1 ||
      value.maxLength > 4_000
    ) {
      throw new ManifestError("maxLength is invalid");
    }
    field.maxLength = value.maxLength;
  }
  if (value.default !== undefined) {
    if (!defaultMatches(value.default, field)) {
      throw new ManifestError("settings field default is invalid");
    }
    if (field["x-s4n-secret"] === true) {
      throw new ManifestError("secret fields cannot have a default");
    }
    if (field.maxLength !== undefined && typeof value.default === "string" && value.default.length > field.maxLength) {
      throw new ManifestError("settings field default is invalid");
    }
    if (field["x-s4n-color"] === true && (typeof value.default !== "string" || !isHexColor(value.default))) {
      throw new ManifestError("settings field default is invalid");
    }
    field.default = value.default;
  }
  return field;
}

function defaultMatches(value: unknown, field: SettingsField): value is string | number | boolean {
  if (field.enum !== undefined) {
    return typeof value === "string" && field.enum.includes(value);
  }
  if (field.type === "string") return typeof value === "string";
  if (field.type === "boolean") return typeof value === "boolean";
  if (field.type === "number" || field.type === "integer") {
    if (typeof value !== "number" || !Number.isFinite(value)) return false;
    if (field.type === "integer" && !Number.isInteger(value)) return false;
    if (field.minimum !== undefined && value < field.minimum) return false;
    if (field.maximum !== undefined && value > field.maximum) return false;
    return true;
  }
  return false;
}
