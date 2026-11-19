export type OverlayConnection = "connecting" | "open" | "reconnecting" | "denied";

export type OverlayStatusKind = "alerts" | "chat" | "goals" | "ticker" | "stage-denied" | "stage-empty";

/**
 * Connection copy is for the dashboard checker (`preview=1`) only.
 * The OBS URL (`transparent=1`, no preview) and every other mode stay blank,
 * including when the transparent flag is missing.
 */
export function overlayStatusLine(input: {
  preview: boolean;
  kind: OverlayStatusKind;
  connection?: OverlayConnection;
  idle?: boolean;
}): string | null {
  if (!input.preview) return null;
  const connection = input.connection ?? "connecting";
  const label = connectionLabel(connection);
  if (input.kind === "alerts") {
    if (input.idle === false) return null;
    return connection === "denied" ? "權杖無效。" : `贊助提醒${label}。等待贊助。`;
  }
  if (input.kind === "chat") {
    if (input.idle === false) return null;
    return connection === "denied"
      ? "這個網址的權杖無效。請從工作台複製新的疊層網址。"
      : `聊天疊層${label}。等待訊息。`;
  }
  if (input.kind === "goals") {
    if (connection === "open") return null;
    return `目標進度${label}。`;
  }
  if (input.kind === "ticker") {
    if (input.idle === false) return null;
    return `跑馬燈${label}。還沒有文字。`;
  }
  if (input.kind === "stage-denied") return "這個網址的權杖無效。請從工作台複製新的疊層網址。";
  return "還沒有啟用需要疊層的外掛。請啟用贊助提醒、聊天疊層、目標或跑馬燈。";
}

function connectionLabel(connection: OverlayConnection): string {
  if (connection === "open") return "已連線";
  if (connection === "reconnecting") return "重新連線中";
  if (connection === "denied") return "權杖無效";
  return "連線中";
}
