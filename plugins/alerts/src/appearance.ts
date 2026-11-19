import { isHexColor, normalizeHexColor } from "@s4n/plugin-sdk";
import { alertDurationMs, visibleUntrusted, type DonationAlert } from "./alert.js";

export const ALERT_MOTIONS = ["rise", "fade", "slide-left", "slide-right", "bounce", "scale"] as const;
export type AlertMotion = (typeof ALERT_MOTIONS)[number];

export const ALERT_TEMPLATE_NAMES = ["name", "amount", "message", "currency"] as const;

/** Rendered title. Longer templates are cut after substitution. */
export const ALERT_TITLE_MAX = 80;
/** Rendered body. Same cap the donation message already uses. */
export const ALERT_BODY_MAX = 200;
export const ALERT_EXIT_MS = 420;

export const DEFAULT_TITLE_TEMPLATE = "{name} 贊助了 {amount}";
export const DEFAULT_BODY_TEMPLATE = "{message}";

export const DEFAULT_ALERT_APPEARANCE = {
  durationMs: 12_000,
  titleTemplate: DEFAULT_TITLE_TEMPLATE,
  bodyTemplate: DEFAULT_BODY_TEMPLATE,
  titleColor: "#1a1512",
  bodyColor: "#6b5e56",
  primaryColor: "#f28500",
  secondaryColor: "#fbf8f3",
  enterAnimation: "rise",
  exitAnimation: "fade",
} as const;

const KNOWN = new Set<string>(ALERT_TEMPLATE_NAMES);
const TOKEN = /\{([A-Za-z][A-Za-z0-9]*)\}/g;

export interface AlertAppearance {
  durationMs: number;
  titleTemplate: string;
  bodyTemplate: string;
  titleColor: string;
  bodyColor: string;
  primaryColor: string;
  secondaryColor: string;
  enterAnimation: AlertMotion;
  exitAnimation: AlertMotion;
}

/**
 * Plain text only. Known tokens are replaced once; unknown `{tokens}` stay as written.
 * Hidden characters are removed. The result is sliced to `max` and is never parsed as HTML.
 */
export function renderAlertTemplate(
  template: string,
  values: Readonly<Record<string, string>>,
  max: number,
): string {
  const cleaned = visibleUntrusted(template, Math.max(template.length, 0));
  const rendered = cleaned.replace(TOKEN, (whole, name: string) => {
    if (!KNOWN.has(name)) return whole;
    return visibleUntrusted(values[name] ?? "", 400);
  });
  return visibleUntrusted(rendered, max);
}

export function formatAlertAmount(amountMinor: number, currency: string): string {
  const amount = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 }).format(amountMinor);
  if (currency === "TWD") return `NT$${amount}`;
  return `${amount} ${currency}`;
}

export function alertTemplateValues(alert: DonationAlert): Record<string, string> {
  return {
    name: alert.donorName,
    amount: formatAlertAmount(alert.amountMinor, alert.currency),
    message: alert.message,
    currency: alert.currency,
  };
}

/** Missing or invalid fields use the defaults, so older saved settings still render. */
export function parseAlertAppearance(settings: Record<string, unknown>): AlertAppearance {
  return {
    durationMs: alertDurationMs(settings, DEFAULT_ALERT_APPEARANCE.durationMs),
    titleTemplate: readTemplate(settings.titleTemplate, DEFAULT_TITLE_TEMPLATE, 160),
    bodyTemplate: readTemplate(settings.bodyTemplate, DEFAULT_BODY_TEMPLATE, 400),
    titleColor: readColor(settings.titleColor, DEFAULT_ALERT_APPEARANCE.titleColor),
    bodyColor: readColor(settings.bodyColor, DEFAULT_ALERT_APPEARANCE.bodyColor),
    primaryColor: readColor(settings.primaryColor, DEFAULT_ALERT_APPEARANCE.primaryColor),
    secondaryColor: readColor(settings.secondaryColor, DEFAULT_ALERT_APPEARANCE.secondaryColor),
    enterAnimation: readMotion(settings.enterAnimation, DEFAULT_ALERT_APPEARANCE.enterAnimation),
    exitAnimation: readMotion(settings.exitAnimation, DEFAULT_ALERT_APPEARANCE.exitAnimation),
  };
}

export function renderAlertCopy(alert: DonationAlert, appearance: AlertAppearance): { title: string; body: string } {
  const values = alertTemplateValues(alert);
  return {
    title: renderAlertTemplate(appearance.titleTemplate, values, ALERT_TITLE_MAX),
    body: renderAlertTemplate(appearance.bodyTemplate, values, ALERT_BODY_MAX),
  };
}

export function alertExitHoldMs(reducedMotion: boolean): number {
  return reducedMotion ? 0 : ALERT_EXIT_MS;
}

export function isAlertMotion(value: string): value is AlertMotion {
  return (ALERT_MOTIONS as readonly string[]).includes(value);
}

function readTemplate(value: unknown, fallback: string, max: number): string {
  if (typeof value !== "string") return fallback;
  return visibleUntrusted(value, max);
}

function readColor(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !isHexColor(value)) return fallback;
  return normalizeHexColor(value) ?? fallback;
}

function readMotion(value: unknown, fallback: AlertMotion): AlertMotion {
  if (typeof value === "string" && isAlertMotion(value)) return value;
  return fallback;
}
