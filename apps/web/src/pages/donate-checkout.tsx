import { Link } from "react-router";
import { CheckoutForm } from "@/components/donate/checkout-form";
import { readCheckout } from "@/lib/payment";

export function DonateCheckoutPage() {
  const draft = readCheckout();
  return (
    <main className="mx-auto flex min-h-svh max-w-xl flex-col px-5 py-10 md:py-16">
      <p className="text-xs tracking-[0.18em] text-cinnabar">付款</p>
      <h1 className="mt-3 font-serif text-4xl leading-tight text-balance">正在前往付款</h1>
      {draft === null ? (
        <p className="mt-8 text-sm leading-6 text-ink-soft">
          沒有待送出的訂單。
          <Link to="/donate" className="ml-1 text-indigo underline-offset-4 hover:underline">
            回到贊助頁
          </Link>
        </p>
      ) : (
        <CheckoutForm draft={draft} />
      )}
    </main>
  );
}
