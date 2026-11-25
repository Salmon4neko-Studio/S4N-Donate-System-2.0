import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { isAbsolute, resolve, sep } from "node:path";
import { isAlertSoundName } from "s4n-donate-system-2.0-plugin-alerts";

export const ALERT_SOUND_MAX_BYTES = 2 * 1024 * 1024;
export const ALERT_SOUND_FIELD = "soundFile";

export type AlertAudioKind = "mp3" | "ogg" | "wav";

const MIME_BY_KIND: Record<AlertAudioKind, readonly string[]> = {
  mp3: ["audio/mpeg", "audio/mp3"],
  ogg: ["audio/ogg", "application/ogg"],
  wav: ["audio/wav", "audio/wave", "audio/x-wav", "audio/vnd.wave"],
};

const CONTENT_TYPE: Record<AlertAudioKind, string> = {
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  wav: "audio/wav",
};

export type SoundCheck =
  | { ok: true; kind: AlertAudioKind; contentType: string }
  | { ok: false; reason: "too_large" | "invalid" };

/**
 * Trust the file header and the declared MIME together.
 * A `.mp3` name with a WAV header is rejected. The caller must not use the client filename.
 */
export function inspectAlertSound(bytes: Uint8Array, mime: string): SoundCheck {
  if (bytes.byteLength > ALERT_SOUND_MAX_BYTES) return { ok: false, reason: "too_large" };
  const kind = sniff(bytes);
  if (kind === null) return { ok: false, reason: "invalid" };
  const declared = mime.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!MIME_BY_KIND[kind].includes(declared)) return { ok: false, reason: "invalid" };
  return { ok: true, kind, contentType: CONTENT_TYPE[kind] };
}

/** A stored name is 32 hex characters plus a detected extension. Paths never qualify. */
export function safeSoundPath(directory: string, name: string): string | null {
  if (!isAlertSoundName(name)) return null;
  if (name.includes("/") || name.includes("\\") || name.includes("\0")) return null;
  const root = resolve(directory);
  const full = resolve(root, name);
  if (full !== root + sep + name) return null;
  if (isAbsolute(name)) return null;
  return full;
}

export interface StoredSound {
  bytes: Buffer;
  contentType: string;
}

export interface AlertSoundStore {
  directory: string;
  save(bytes: Uint8Array, mime: string): Promise<{ name: string } | { error: "too_large" | "invalid" }>;
  read(name: string): Promise<StoredSound | null>;
  remove(name: string): Promise<void>;
}

export function createAlertSoundStore(directory: string): AlertSoundStore {
  const root = resolve(directory);
  return {
    directory: root,
    async save(bytes, mime) {
      const checked = inspectAlertSound(bytes, mime);
      if (!checked.ok) return { error: checked.reason };
      await mkdir(root, { recursive: true });
      const name = `${randomBytes(16).toString("hex")}.${checked.kind}`;
      const path = safeSoundPath(root, name);
      if (path === null) return { error: "invalid" };
      await writeFile(path, bytes);
      return { name };
    },
    async read(name) {
      const path = safeSoundPath(root, name);
      if (path === null) return null;
      try {
        const bytes = await readFile(path);
        const kind = sniff(bytes);
        if (kind === null || !name.endsWith(`.${kind}`)) return null;
        return { bytes, contentType: CONTENT_TYPE[kind] };
      } catch {
        return null;
      }
    },
    async remove(name) {
      const path = safeSoundPath(root, name);
      if (path === null) return;
      await rm(path, { force: true });
    },
  };
}

function sniff(bytes: Uint8Array): AlertAudioKind | null {
  if (isWav(bytes)) return "wav";
  if (isOgg(bytes)) return "ogg";
  if (isMp3(bytes)) return "mp3";
  return null;
}

function isWav(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WAVE";
}

function isOgg(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 4 && ascii(bytes, 0, 4) === "OggS";
}

function isMp3(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 3) return false;
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true;
  const second = bytes[1] ?? 0;
  if (bytes[0] !== 0xff || (second & 0xe0) !== 0xe0) return false;
  const layer = (second >> 1) & 0x03;
  return layer !== 0;
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}
