declare const untrustedBrand: unique symbol;

/**
 * Text typed by a donor or a chat user.
 * The brand disappears on the wire. Overlay and TTS code must keep treating
 * the string as untrusted and must not interpolate it into HTML.
 * Sanitizing is intentionally not implemented in this skeleton.
 */
export type UntrustedText = string & { readonly [untrustedBrand]: true };

export function asUntrustedText(value: string): UntrustedText {
  return value as UntrustedText;
}
