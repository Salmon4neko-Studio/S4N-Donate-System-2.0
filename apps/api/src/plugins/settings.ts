import {
  isSecretField,
  publicFieldKeys,
  secretFieldKeys,
  type PluginManifest,
  type SettingsField,
  type SettingsSchema,
} from "@s4n/plugin-sdk";
import { sealSecret, secretAad, type SealedSecret } from "../crypto/secret-box.js";

export interface RedactedField {
  key: string;
  title: string | null;
  description: string | null;
  type: SettingsField["type"];
  secret: boolean;
  required: boolean;
  configured: boolean;
  enum: string[] | null;
  minimum: number | null;
  multiline: boolean;
  default: string | number | boolean | null;
  /** Present only for non-secret fields that have a stored value. */
  value?: string | number | boolean;
}

export interface SecretStore {
  readonly persistence: "memory" | "database";
  readConfiguredKeys(pluginId: string): Promise<string[]>;
  readPublicSettings(pluginId: string): Promise<Record<string, string | number | boolean>>;
  readSealed(pluginId: string): Promise<Record<string, SealedSecret>>;
  write(
    pluginId: string,
    input: {
      version: string;
      publicSettings: Record<string, string | number | boolean>;
      secrets: Record<string, SealedSecret>;
    },
  ): Promise<void>;
  /** Delete public settings and sealed secrets for one plugin. */
  discard(pluginId: string): Promise<void>;
}

export class SettingsValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super("invalid settings");
    this.name = "SettingsValidationError";
    this.issues = issues;
  }
}

export function redactSettings(
  schema: SettingsSchema,
  publicSettings: Record<string, string | number | boolean>,
  configuredSecretKeys: readonly string[],
): RedactedField[] {
  const configured = new Set(configuredSecretKeys);
  const required = new Set(schema.required ?? []);
  return Object.entries(schema.properties).map(([key, field]) => {
    const secret = isSecretField(field);
    const base = {
      key,
      title: field.title ?? null,
      description: field.description ?? null,
      type: field.type,
      secret,
      required: required.has(key),
      enum: field.enum === undefined ? null : [...field.enum],
      minimum: field.minimum ?? null,
      multiline: field["x-s4n-multiline"] === true,
      default: field.default ?? null,
    };
    if (secret) {
      return { ...base, configured: configured.has(key) };
    }
    const value = publicSettings[key];
    if (value === undefined) {
      return { ...base, configured: false };
    }
    return { ...base, configured: true, value };
  });
}

/** Same redacted list, split so callers do not re-decide which fields are secrets. */
export function splitRedactedFields(fields: readonly RedactedField[]): {
  fields: RedactedField[];
  secretFields: RedactedField[];
  publicFields: RedactedField[];
} {
  return {
    fields: [...fields],
    secretFields: fields.filter((field) => field.secret),
    publicFields: fields.filter((field) => !field.secret),
  };
}

export async function saveSettings(options: {
  manifest: PluginManifest;
  store: SecretStore;
  masterKey: Buffer;
  values: Record<string, unknown>;
}): Promise<RedactedField[]> {
  const currentPublic = await options.store.readPublicSettings(options.manifest.id);
  const configured = new Set(await options.store.readConfiguredKeys(options.manifest.id));
  const partitioned = partitionSettings(
    options.manifest.settingsSchema,
    currentPublic,
    configured,
    options.values,
  );

  const sealed: Record<string, SealedSecret> = {};
  for (const [fieldKey, plaintext] of Object.entries(partitioned.secrets)) {
    sealed[fieldKey] = sealSecret(
      plaintext,
      options.masterKey,
      secretAad(options.manifest.id, fieldKey),
    );
  }

  await options.store.write(options.manifest.id, {
    version: options.manifest.version,
    publicSettings: partitioned.publicSettings,
    secrets: sealed,
  });

  for (const fieldKey of Object.keys(partitioned.secrets)) configured.add(fieldKey);
  return redactSettings(options.manifest.settingsSchema, partitioned.publicSettings, [...configured]);
}

function partitionSettings(
  schema: SettingsSchema,
  currentPublic: Record<string, string | number | boolean>,
  configuredSecrets: ReadonlySet<string>,
  input: Record<string, unknown>,
): { publicSettings: Record<string, string | number | boolean>; secrets: Record<string, string> } {
  const issues: string[] = [];
  const secretKeys = new Set(secretFieldKeys(schema));
  const knownPublic = new Set(publicFieldKeys(schema));
  const known = new Set([...secretKeys, ...knownPublic]);
  for (const key of Object.keys(input)) {
    if (!known.has(key)) issues.push(`unknown_field:${key}`);
  }

  const publicSettings = { ...currentPublic };
  const secrets: Record<string, string> = {};
  let wroteSecret = false;
  let wrotePublic = false;

  for (const [key, field] of Object.entries(schema.properties)) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
    const value = input[key];
    if (secretKeys.has(key)) {
      wroteSecret = true;
      if (typeof value !== "string" || value.trim() === "") {
        issues.push(`invalid_secret:${key}`);
        continue;
      }
      secrets[key] = value;
      continue;
    }
    if (!knownPublic.has(key)) continue;
    wrotePublic = true;
    if (!acceptsPublicValue(value, field)) {
      issues.push(`invalid_field:${key}`);
      continue;
    }
    publicSettings[key] = value;
  }

  // Each page saves only its own side. Required secrets are not demanded when
  // the operator is saving a public field, and the reverse. A write that touches
  // both sides (the previous combined form) still checks both.
  if (wroteSecret) {
    for (const key of schema.required ?? []) {
      if (!secretKeys.has(key)) continue;
      if (secrets[key] === undefined && !configuredSecrets.has(key)) {
        issues.push(`missing_secret:${key}`);
      }
    }
  }
  if (wrotePublic) {
    for (const key of schema.required ?? []) {
      if (!knownPublic.has(key)) continue;
      if (publicSettings[key] === undefined) issues.push(`missing_field:${key}`);
    }
  }

  if (issues.length > 0) throw new SettingsValidationError(issues);
  return { publicSettings, secrets };
}

function acceptsPublicValue(value: unknown, field: SettingsField): value is string | number | boolean {
  if (field.enum !== undefined) {
    return typeof value === "string" && field.enum.includes(value);
  }
  if (field.type === "string") return typeof value === "string";
  if (field.type === "boolean") return typeof value === "boolean";
  if (field.type === "number" || field.type === "integer") {
    if (typeof value !== "number" || !Number.isFinite(value)) return false;
    if (field.type === "integer" && !Number.isInteger(value)) return false;
    if (field.minimum !== undefined && value < field.minimum) return false;
    return true;
  }
  return false;
}
