import { ApiError, api } from "./api";

export interface TestChatInput {
  displayName: string;
  text: string;
}

export async function sendTestChat(input: TestChatInput): Promise<void> {
  await api("/api/chat/test", {
    method: "POST",
    body: JSON.stringify({
      displayName: input.displayName,
      text: input.text,
    }),
  });
}

export function testChatErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 422) return "名稱或訊息的格式不對。";
  return "測試聊天沒有送出。";
}
