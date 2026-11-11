import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { DonateForm, type DonateMethod } from "@/components/donate/donate-form";
import { ApiError, api } from "@/lib/api";
import { saveCheckout } from "@/lib/payment";

interface DonateOptions {
  currency: "TWD";
  minAmount: number;
  maxAmount: number;
  methods: DonateMethod[];
}

interface CheckoutResponse {
  donationId: string;
  amountMinor: number;
  currency: string;
  providerId: string;
  checkout: { action: string; fields: Record<string, string> };
}

export function DonatePage() {
  const navigate = useNavigate();
  const [options, setOptions] = useState<DonateOptions | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [amount, setAmount] = useState(100);
  const [pluginId, setPluginId] = useState("");
  const [donorName, setDonorName] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api<DonateOptions>("/api/donate/options", { signal: controller.signal })
      .then((body) => {
        setLoadError(false);
        setOptions(body);
        setPluginId((current) => body.methods.find((method) => method.id === current)?.id ?? body.methods[0]?.id ?? "");
        setAmount((current) => (current >= body.minAmount && current <= body.maxAmount ? current : body.minAmount));
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoadError(true);
      });
    return () => controller.abort();
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (options === null || pluginId === "") return;
    setPending(true);
    setNote(null);
    try {
      const body = await api<CheckoutResponse>("/api/donations", {
        method: "POST",
        body: JSON.stringify({
          pluginId,
          amountMinor: amount,
          currency: "TWD",
          donorName,
          message,
        }),
      });
      saveCheckout({
        donationId: body.donationId,
        amountMinor: body.amountMinor,
        currency: body.currency,
        providerId: body.providerId,
        action: body.checkout.action,
        fields: body.checkout.fields,
      });
      navigate("/donate/checkout");
    } catch (error) {
      setNote(donateError(error));
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-xl flex-col px-5 py-10 md:py-16">
      <p className="text-xs tracking-[0.18em] text-cinnabar">贊助</p>
      <h1 className="mt-3 font-serif text-4xl leading-tight text-balance">送給這位創作者</h1>
      <p className="mt-4 text-base leading-7 text-ink-soft">
        選擇付款方式後，會先在伺服器建立訂單，再前往綠界或歐付寶的信用卡頁。顯示名稱和留言只當文字保存，不會送給金流。
      </p>
      {loadError ? <p className="mt-8 text-sm text-cinnabar">無法連上核心 API。</p> : null}
      {options === null && !loadError ? <p className="mt-8 text-sm text-ink-soft">正在讀取付款方式…</p> : null}
      {options !== null ? (
        <DonateForm
          min={options.minAmount}
          max={options.maxAmount}
          methods={options.methods}
          amount={amount}
          pluginId={pluginId}
          donorName={donorName}
          message={message}
          pending={pending}
          note={note}
          onAmount={setAmount}
          onPlugin={setPluginId}
          onDonorName={setDonorName}
          onMessage={setMessage}
          onSubmit={onSubmit}
        />
      ) : null}
    </main>
  );
}

function donateError(error: unknown): string {
  if (!(error instanceof ApiError) || error.status === 0) return "無法連上核心 API。";
  if (error.status === 422 && isIssueBody(error.body)) return `這筆資料不完整：${error.body.issues.join("、")}`;
  if (error.status === 422) return "這個付款方式還沒有開放。";
  return "訂單沒有建立。";
}

function isIssueBody(value: unknown): value is { issues: string[] } {
  if (typeof value !== "object" || value === null || !("issues" in value)) return false;
  const issues = value.issues;
  return Array.isArray(issues) && issues.every((issue) => typeof issue === "string");
}
