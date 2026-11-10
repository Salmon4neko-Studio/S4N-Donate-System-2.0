import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api } from "@/lib/api";

const amounts = [50, 100, 300, 500, 1000];
const providers = [
  { id: "official.ecpay", label: "綠界 ECPay" },
  { id: "official.opay", label: "歐付寶 O'Pay" },
];

type SubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "not_implemented" }
  | { status: "invalid"; issues: string[] }
  | { status: "offline" };

export function DonatePage() {
  const [amount, setAmount] = useState(100);
  const [pluginId, setPluginId] = useState(providers[0]?.id ?? "official.ecpay");
  const [donorName, setDonorName] = useState("");
  const [message, setMessage] = useState("");
  const [submit, setSubmit] = useState<SubmitState>({ status: "idle" });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmit({ status: "submitting" });
    try {
      await api("/api/donations", {
        method: "POST",
        body: JSON.stringify({
          pluginId,
          amountMinor: amount,
          currency: "TWD",
          donorName,
          message,
        }),
      });
      setSubmit({ status: "idle" });
    } catch (error) {
      if (error instanceof ApiError && error.status === 0) {
        setSubmit({ status: "offline" });
        return;
      }
      if (error instanceof ApiError && error.status === 501) {
        setSubmit({ status: "not_implemented" });
        return;
      }
      if (error instanceof ApiError && error.status === 422 && isIssueBody(error.body)) {
        setSubmit({ status: "invalid", issues: error.body.issues });
        return;
      }
      setSubmit({ status: "offline" });
    }
  }

  return (
    <div className="mx-auto flex min-h-svh max-w-xl flex-col px-5 py-10 md:py-16">
      <Link to="/" className="text-sm text-indigo underline-offset-4 hover:underline">
        回到概況
      </Link>
      <p className="mt-10 text-xs tracking-[0.18em] text-cinnabar">贊助</p>
      <h1 className="mt-3 font-serif text-4xl leading-tight text-balance">送給這位創作者</h1>
      <p className="mt-4 text-base leading-7 text-ink-soft">
        金額由這個頁面先交給核心。綠界與歐付寶都還沒有真的開單，所以送出不會建立交易。顯示名稱和留言會被當成不受信任的文字。
      </p>

      <form onSubmit={onSubmit} className="s4n-rise mt-8 flex flex-col gap-6">
        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm text-ink">金額（新台幣）</legend>
          <div className="flex flex-wrap gap-2">
            {amounts.map((value) => (
              <Button
                key={value}
                type="button"
                className="h-10 px-4"
                variant={value === amount ? "default" : "outline"}
                aria-pressed={value === amount}
                onClick={() => setAmount(value)}
              >
                {value}
              </Button>
            ))}
          </div>
          <Label htmlFor="amount">自訂金額</Label>
          <Input
            id="amount"
            inputMode="numeric"
            min={1}
            step={1}
            type="number"
            value={amount}
            onChange={(event) => setAmount(Number(event.target.value))}
          />
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm text-ink">付款外掛（尚未開通）</legend>
          <div className="flex flex-wrap gap-2">
            {providers.map((provider) => (
              <Button
                key={provider.id}
                type="button"
                className="h-10 px-4"
                variant={provider.id === pluginId ? "default" : "outline"}
                aria-pressed={provider.id === pluginId}
                onClick={() => setPluginId(provider.id)}
              >
                {provider.label}
              </Button>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-2">
          <Label htmlFor="donor-name">顯示名稱</Label>
          <Input
            id="donor-name"
            maxLength={40}
            value={donorName}
            onChange={(event) => setDonorName(event.target.value)}
            autoComplete="nickname"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="message">留言</Label>
          <Textarea
            id="message"
            maxLength={200}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
        </div>

        <Button type="submit" className="h-11 px-5" disabled={submit.status === "submitting"}>
          {submit.status === "submitting" ? "送出中…" : "建立贊助"}
        </Button>
        <SubmitNote state={submit} />
      </form>
    </div>
  );
}

function SubmitNote({ state }: { state: SubmitState }) {
  if (state.status === "not_implemented") {
    return (
      <p className="text-sm leading-6 text-ink" role="status">
        沒有建立交易。付款外掛尚未實作。
      </p>
    );
  }
  if (state.status === "offline") {
    return (
      <p className="text-sm leading-6 text-cinnabar" role="status">
        無法連上核心 API。
      </p>
    );
  }
  if (state.status === "invalid") {
    return (
      <p className="text-sm leading-6 text-cinnabar" role="status">
        這筆資料不完整：{state.issues.join("、")}
      </p>
    );
  }
  return null;
}

function isIssueBody(value: unknown): value is { issues: string[] } {
  if (typeof value !== "object" || value === null || !("issues" in value)) return false;
  const issues = value.issues;
  return Array.isArray(issues) && issues.every((issue) => typeof issue === "string");
}
