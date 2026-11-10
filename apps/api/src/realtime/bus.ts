import { randomUUID } from "node:crypto";
import type { AnyS4nEvent, S4nEventMap, S4nEventName } from "@s4n/events";

export interface CoreBus {
  publish<T extends S4nEventName>(type: T, payload: S4nEventMap[T]): AnyS4nEvent;
  subscribe(handler: (event: AnyS4nEvent) => void): () => void;
}

/** In-memory bus for one API process. Plugins do not receive this object. */
export function createCoreBus(): CoreBus {
  const handlers = new Set<(event: AnyS4nEvent) => void>();
  return {
    publish(type, payload) {
      const event = {
        type,
        id: randomUUID(),
        occurredAt: new Date().toISOString(),
        payload,
      } as AnyS4nEvent;
      for (const handler of handlers) handler(event);
      return event;
    },
    subscribe(handler) {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
  };
}
