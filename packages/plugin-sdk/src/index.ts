export {
  COMMUNITY_DEFAULT_PERMISSIONS,
  OFFICIAL_ONLY_PERMISSIONS,
  PERMISSIONS,
  assertPermissionsAllowed,
  isOfficialOnlyPermission,
} from "./permissions.js";
export type { Permission } from "./permissions.js";

export {
  ManifestError,
  PLUGIN_API_VERSION,
  PLUGIN_KINDS,
  assertManifestCoherent,
  hasPluginSettingsNav,
  isSecretField,
  parseManifest,
  publicFieldKeys,
  secretFieldKeys,
} from "./manifest.js";
export type {
  PluginEntry,
  PluginKind,
  PluginManifest,
  SettingsField,
  SettingsSchema,
} from "./manifest.js";

export { OVERLAY_RECT_MIN, clampOverlayRect, isHexColor, normalizeHexColor, parseOverlayRect } from "./overlay.js";
export type { OverlayRect } from "./overlay.js";

export { PaymentConfigError, PaymentNotImplemented } from "./payments.js";
export type {
  CallbackVerification,
  CheckoutForm,
  CreatePaymentInput,
  CreatePaymentResult,
  IssuedPayment,
  PaymentInfoVerification,
  PaymentProvider,
  ProviderMaterial,
  QueryTradeResult,
  RawCallback,
} from "./payments.js";

export { createPluginBus } from "./bus.js";
export type { EventSink, PluginBus } from "./bus.js";

export type { ChatSource, ChatSourceHost, ChatSourceSettings } from "./chat.js";

export { pluginBusContract } from "./guard.js";
