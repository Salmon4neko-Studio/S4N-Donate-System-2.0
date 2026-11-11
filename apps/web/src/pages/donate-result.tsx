import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { ResultPanel, type DonateResultState } from "@/components/donate/result-panel";
import { api } from "@/lib/api";

interface DonationStatus {
  status: "created" | "succeeded" | "failed";
  amountMinor: number;
  currency: string;
}

export function DonateResultPage() {
  const [params] = useSearchParams();
  const order = params.get("order") ?? "";
  const [state, setState] = useState<DonateResultState>(order === "" ? "missing" : "loading");
  const [amountMinor, setAmountMinor] = useState<number | undefined>();

  useEffect(() => {
    if (!/^[a-f0-9]{20}$/.test(order)) {
      setState("missing");
      return;
    }
    const controller = new AbortController();
    let timer = 0;
    let attempts = 0;

    const poll = () => {
      api<DonationStatus>(`/api/donations/${order}/status`, { signal: controller.signal })
        .then((body) => {
          setAmountMinor(body.amountMinor);
          if (body.status === "succeeded") {
            setState("thanks");
            return;
          }
          if (body.status === "failed") {
            setState("failed");
            return;
          }
          setState("pending");
          attempts += 1;
          if (attempts < 8) timer = window.setTimeout(poll, 2000);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setState("missing");
        });
    };

    poll();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [order]);

  return (
    <main className="mx-auto flex min-h-svh max-w-xl flex-col px-5 py-10 md:py-16">
      <p className="text-xs tracking-[0.18em] text-cinnabar">贊助</p>
      <ResultPanel state={state} {...(amountMinor !== undefined ? { amountMinor } : {})} />
    </main>
  );
}

export function DonateCancelledPage() {
  return (
    <main className="mx-auto flex min-h-svh max-w-xl flex-col px-5 py-10 md:py-16">
      <p className="text-xs tracking-[0.18em] text-cinnabar">贊助</p>
      <ResultPanel state="cancelled" />
    </main>
  );
}
