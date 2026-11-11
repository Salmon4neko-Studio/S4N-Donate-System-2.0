import { ApiError, api } from "./api";

export interface TestDonationInput {
  donorName: string;
  amountMinor: number;
  message: string;
}

export async function sendTestDonation(input: TestDonationInput): Promise<void> {
  await api("/api/donations/test", {
    method: "POST",
    body: JSON.stringify({
      donorName: input.donorName,
      amountMinor: input.amountMinor,
      message: input.message,
    }),
  });
}

export function testDonationErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 422) return "名稱、金額或留言的格式不對。";
  return "測試事件沒有送出。";
}
