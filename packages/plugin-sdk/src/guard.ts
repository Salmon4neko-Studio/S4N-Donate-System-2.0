import type { PluginBus } from "./bus.js";

type EmitArgument = Parameters<PluginBus["emit"]>[0];

/**
 * These assignments fail the build if a plugin bus can emit a core payment
 * event, or if it can no longer emit chat messages.
 */
const paymentEventsAreNotPluginEmittable: "s4n.donation.created" extends EmitArgument
  ? never
  : true = true;
const succeededEventsAreNotPluginEmittable: "s4n.donation.succeeded" extends EmitArgument
  ? never
  : true = true;
const failedEventsAreNotPluginEmittable: "s4n.donation.failed" extends EmitArgument
  ? never
  : true = true;
const chatIsPluginEmittable: "s4n.chat.message" extends EmitArgument ? true : never = true;

export const pluginBusContract = {
  paymentEventsAreNotPluginEmittable,
  succeededEventsAreNotPluginEmittable,
  failedEventsAreNotPluginEmittable,
  chatIsPluginEmittable,
} as const;
