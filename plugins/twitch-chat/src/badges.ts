import { fallbackBadgeTitle, isTwitchCdnUrl, visibleChatText } from "./irc.js";

export interface HelixCredentials {
  clientId: string;
  clientSecret: string;
}

export interface CachedBadge {
  title: string;
  imageUrl?: string;
}

interface CacheEntry {
  title: string;
  imageUrl?: string;
  freshUntil: number;
}

const TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const GLOBAL_URL = "https://api.twitch.tv/helix/chat/badges/global";

/**
 * In-memory Helix badge cache. Images are kept only when they are on
 * static-cdn.jtvnw.net. The client secret is sent only to the token endpoint.
 *
 * This cache stays in the API process on purpose. It holds badge titles, CDN
 * URLs, and a short-lived app token. After a restart the overlay falls back to
 * text until the next refresh (default one hour). Moving it to Postgres would
 * mean storing that token, so it is not part of the durable event log.
 */
export function createBadgeCache(options: {
  fetchImpl?: typeof fetch;
  now?: () => number;
  ttlMs?: number;
}): {
  lookup(roomId: string, setId: string, version: string): CachedBadge | null;
  refresh(credentials: HelixCredentials, roomId: string | null): Promise<void>;
} {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? 60 * 60 * 1000;
  const entries = new Map<string, CacheEntry>();
  let token: { value: string; expiresAt: number } | null = null;
  let globalFreshUntil = 0;
  const roomFreshUntil = new Map<string, number>();

  function lookup(roomId: string, setId: string, version: string): CachedBadge | null {
    const room = entries.get(roomKey(roomId, setId, version));
    const global = entries.get(globalKey(setId, version));
    const hit = room ?? global;
    if (hit === undefined) return null;
    if (hit.imageUrl === undefined) return { title: hit.title };
    return { title: hit.title, imageUrl: hit.imageUrl };
  }

  async function refresh(credentials: HelixCredentials, roomId: string | null): Promise<void> {
    const clientId = credentials.clientId.trim();
    const clientSecret = credentials.clientSecret.trim();
    if (clientId === "" || clientSecret === "") return;
    try {
      const access = await appToken(clientId, clientSecret);
      if (access === null) return;
      const at = now();
      if (at >= globalFreshUntil) {
        const rows = await helixBadges(access, clientId, GLOBAL_URL);
        if (rows !== null) {
          storeRows("global", rows, at + ttlMs);
          globalFreshUntil = at + ttlMs;
        }
      }
      if (roomId !== null && /^\d{1,20}$/.test(roomId) && at >= (roomFreshUntil.get(roomId) ?? 0)) {
        const rows = await helixBadges(
          access,
          clientId,
          `https://api.twitch.tv/helix/chat/badges?broadcaster_id=${roomId}`,
        );
        if (rows !== null) {
          storeRows(roomId, rows, at + ttlMs);
          roomFreshUntil.set(roomId, at + ttlMs);
        }
      }
    } catch {
      // Chat keeps flowing without badge images.
    }
  }

  async function appToken(clientId: string, clientSecret: string): Promise<string | null> {
    const at = now();
    if (token !== null && at < token.expiresAt) return token.value;
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    });
    const response = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body,
    });
    if (!response.ok) return null;
    const parsed: unknown = await response.json();
    if (!isRecord(parsed) || typeof parsed.access_token !== "string" || parsed.access_token.length === 0) {
      return null;
    }
    const expiresIn = typeof parsed.expires_in === "number" && parsed.expires_in > 120 ? parsed.expires_in : 3600;
    token = { value: parsed.access_token, expiresAt: at + (expiresIn - 60) * 1000 };
    return token.value;
  }

  async function helixBadges(access: string, clientId: string, url: string): Promise<HelixSet[] | null> {
    const response = await fetchImpl(url, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${access}`,
        "client-id": clientId,
      },
    });
    if (!response.ok) return null;
    const parsed: unknown = await response.json();
    if (!isRecord(parsed) || !Array.isArray(parsed.data)) return null;
    const sets: HelixSet[] = [];
    for (const item of parsed.data) {
      if (!isRecord(item) || typeof item.set_id !== "string" || !Array.isArray(item.versions)) continue;
      const versions: HelixVersion[] = [];
      for (const version of item.versions) {
        if (!isRecord(version) || typeof version.id !== "string") continue;
        versions.push({
          id: version.id,
          title: version.title,
          image_url_1x: version.image_url_1x,
          image_url_2x: version.image_url_2x,
          image_url_4x: version.image_url_4x,
        });
      }
      sets.push({ set_id: item.set_id, versions });
    }
    return sets;
  }

  function storeRows(scope: string, rows: readonly HelixSet[], freshUntil: number): void {
    for (const row of rows) {
      for (const version of row.versions) {
        const title = visibleChatText(
          fallbackBadgeTitle(row.set_id) === row.set_id
            ? typeof version.title === "string" && version.title.trim() !== ""
              ? version.title
              : row.set_id
            : fallbackBadgeTitle(row.set_id),
          40,
        );
        const imageUrl = firstAllowedImage(version);
        const entry: CacheEntry = { title, freshUntil };
        if (imageUrl !== null) entry.imageUrl = imageUrl;
        const key = scope === "global"
          ? globalKey(row.set_id, version.id)
          : roomKey(scope, row.set_id, version.id);
        entries.set(key, entry);
      }
    }
  }

  return { lookup, refresh };
}

interface HelixVersion {
  id: string;
  title?: unknown;
  image_url_1x?: unknown;
  image_url_2x?: unknown;
  image_url_4x?: unknown;
}

interface HelixSet {
  set_id: string;
  versions: HelixVersion[];
}

function firstAllowedImage(version: HelixVersion): string | null {
  for (const candidate of [version.image_url_2x, version.image_url_4x, version.image_url_1x]) {
    if (typeof candidate === "string" && isTwitchCdnUrl(candidate)) return candidate;
  }
  return null;
}

function globalKey(setId: string, version: string): string {
  return `g:${setId}/${version}`;
}

function roomKey(roomId: string, setId: string, version: string): string {
  return `r:${roomId}:${setId}/${version}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
