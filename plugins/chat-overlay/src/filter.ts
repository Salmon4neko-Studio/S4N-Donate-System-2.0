import type { ChatFragment, ChatMessagePayload } from "@s4n/events";
import { asUntrustedText } from "@s4n/events";
import type { ChatOverlaySettings } from "./settings.js";
import { splitList } from "./settings.js";

const CONTROL = /[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g;

export function shouldHideChatMessage(payload: ChatMessagePayload, settings: ChatOverlaySettings): boolean {
  if (payload.donation !== undefined) return false;
  if (settings.hideCommands && payload.text.trimStart().startsWith("!")) return true;
  if (settings.hideBots && matchesBot(payload, settings.botNames)) return true;
  return false;
}

export function maskKeywords(input: string, keywords: readonly string[]): string {
  const needles = [...keywords].filter((item) => item.length > 0).sort((a, b) => b.length - a.length);
  if (needles.length === 0 || input.length === 0) return input;
  const folded = input.toLocaleLowerCase("en-US");
  const foldedNeedles = needles.map((item) => item.toLocaleLowerCase("en-US"));
  let index = 0;
  let out = "";
  while (index < input.length) {
    let matched = 0;
    for (const needle of foldedNeedles) {
      if (needle.length === 0) continue;
      if (folded.startsWith(needle, index)) {
        matched = needle.length;
        break;
      }
    }
    if (matched === 0) {
      out += input[index] ?? "";
      index += 1;
      continue;
    }
    const original = input.slice(index, index + matched);
    out += "＊".repeat([...original].length);
    index += matched;
  }
  return out;
}

export function maskFragments(fragments: readonly ChatFragment[], keywords: readonly string[]): ChatFragment[] {
  if (keywords.length === 0) return [...fragments];
  const masked: ChatFragment[] = [];
  for (const fragment of fragments) {
    if (fragment.type === "text") {
      const text = maskKeywords(fragment.text, keywords);
      if (text.length === 0) continue;
      masked.push({ type: "text", text: asUntrustedText(text) });
      continue;
    }
    const name = maskKeywords(fragment.name, keywords);
    if (name !== fragment.name) {
      if (name.length > 0) masked.push({ type: "text", text: asUntrustedText(name) });
      continue;
    }
    masked.push(fragment);
  }
  return masked;
}

export function visiblePlain(value: string, max = 500): string {
  return value.replace(CONTROL, "").slice(0, max);
}

function matchesBot(payload: ChatMessagePayload, botNames: string): boolean {
  const names = splitList(botNames);
  const display = payload.displayName.trim().toLocaleLowerCase("en-US");
  const login = payload.login.trim().toLocaleLowerCase("en-US");
  return names.some((name) => {
    const needle = name.toLocaleLowerCase("en-US");
    return needle === display || (login !== "" && needle === login);
  });
}
