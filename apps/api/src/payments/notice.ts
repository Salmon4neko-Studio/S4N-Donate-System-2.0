const DROPPED_KEY = /^(CheckMacValue|HashKey|HashIV)$/i;
const SECRET_KEY = /secret|password|token|apikey|api_key/i;

/** Keep a provider notice for the operator. Drop the checksum and anything that looks like key material. */
export function providerNotice(fields: Readonly<Record<string, string>>): Record<string, string> {
  const notice: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (Object.keys(notice).length >= 40) break;
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(key)) continue;
    if (DROPPED_KEY.test(key) || SECRET_KEY.test(key)) continue;
    if (value.length > 200) continue;
    notice[key] = value;
  }
  return notice;
}

export function noticeFromForm(rawBody: string): Record<string, string> {
  if (rawBody.length === 0 || rawBody.length > 20_000) return {};
  const fields: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(rawBody)) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) continue;
    fields[key] = value;
  }
  return providerNotice(fields);
}
