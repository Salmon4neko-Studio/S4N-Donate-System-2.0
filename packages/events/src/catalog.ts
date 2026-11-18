import type { S4nEventMap } from "./events.js";

/** Every event the core and plugins are allowed to talk about. */
export const S4N_EVENT_NAMES = [
  "s4n.donation.created",
  "s4n.donation.succeeded",
  "s4n.donation.failed",
  "s4n.donation.test",
  "s4n.chat.message",
  "s4n.chat.delete",
  "s4n.chat.clear",
  "s4n.goal.updated",
  "s4n.tts.request",
  "s4n.media.now_playing",
  "s4n.plugin.changed",
] as const satisfies readonly (keyof S4nEventMap)[];

type Missing = Exclude<keyof S4nEventMap, (typeof S4N_EVENT_NAMES)[number]>;
type Extra = Exclude<(typeof S4N_EVENT_NAMES)[number], keyof S4nEventMap>;

/** Fails the build when the catalog and the map drift apart. */
export const eventCatalogIsExhaustive: [Missing, Extra] extends [never, never] ? true : never = true;
