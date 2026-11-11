import { Link } from "react-router";
import { CheckoutForm } from "@/components/donate/checkout-form";
import { PublicPage } from "@/components/public-page";
import { readCheckout } from "@/lib/payment";

export function DonateCheckoutPage() {
  const draft = readCheckout();
  return (
    <PublicPage kicker="付款" title="正在前往付款">
      {draft === null ? (
        <p className="ts-text is-description">
          沒有待送出的訂單。
          <Link to="/donate" className="ts-text is-link">
            回到贊助頁
          </Link>
        </p>
      ) : (
        <CheckoutForm draft={draft} />
      )}
    </PublicPage>
  );
}
