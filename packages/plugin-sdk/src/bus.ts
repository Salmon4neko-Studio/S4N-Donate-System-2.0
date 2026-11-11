import {
  CORE_PAYMENT_EVENTS,
  type PluginEmittableEventName,
  type S4nEvent,
  type S4nEventMap,
  type S4nEventName,
} from "@s4n/events";

export interface EventSink {
  publish<T extends S4nEventName>(type: T, payload: S4nEventMap[T]): void;
  subscribe<T extends S4nEventName>(
    type: T,
    handler: (event: S4nEvent<T>) => void,
  ): () => void;
}

export interface PluginBus {
  subscribe<T extends S4nEventName>(
    type: T,
    handler: (event: S4nEvent<T>) => void,
  ): () => void;
  emit<T extends PluginEmittableEventName>(type: T, payload: S4nEventMap[T]): void;
}

const NOT_PLUGIN_EMITTABLE = new Set<string>([...CORE_PAYMENT_EVENTS, "s4n.donation.test"]);

/**
 * Plugins subscribe and emit only through this object.
 * `events.emit` still cannot publish core payment events.
 */
export function createPluginBus(sink: EventSink): PluginBus {
  return {
    subscribe(type, handler) {
      return sink.subscribe(type, handler);
    },
    emit(type, payload) {
      if (NOT_PLUGIN_EMITTABLE.has(type)) {
        throw new Error(`plugins cannot emit reserved event ${type}`);
      }
      sink.publish(type, payload);
    },
  };
}
