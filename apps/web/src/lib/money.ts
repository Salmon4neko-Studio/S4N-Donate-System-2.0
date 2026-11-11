export function formatTwd(amountMinor: number): string {
  const amount = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 }).format(amountMinor);
  return `NT$${amount}`;
}
