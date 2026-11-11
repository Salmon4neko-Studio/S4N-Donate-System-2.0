import { Navigate, Outlet, Route, Routes } from "react-router";
import { Note } from "@/components/fields";
import { PendingLine } from "@/components/public-page";
import { Shell } from "@/components/shell";
import { useAuth } from "@/lib/auth";
import { DashboardPage } from "@/pages/dashboard";
import { DonatePage } from "@/pages/donate";
import { DonateCheckoutPage } from "@/pages/donate-checkout";
import { DonateCancelledPage, DonateResultPage } from "@/pages/donate-result";
import { DonationsPage } from "@/pages/donations";
import { LoginPage } from "@/pages/login";
import { OverlayLinkPage } from "@/pages/overlay-link";
import { PluginsPage } from "@/pages/plugins";
import { SetupPage } from "@/pages/setup";

export function App() {
  return (
    <Routes>
      <Route path="setup" element={<SetupPage />} />
      <Route path="login" element={<LoginPage />} />
      <Route path="donate" element={<DonatePage />} />
      <Route path="donate/checkout" element={<DonateCheckoutPage />} />
      <Route path="donate/result" element={<DonateResultPage />} />
      <Route path="donate/cancelled" element={<DonateCancelledPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<Shell />}>
          <Route index element={<DashboardPage />} />
          <Route path="donations" element={<DonationsPage />} />
          <Route path="plugins" element={<PluginsPage />} />
          <Route path="overlay" element={<OverlayLinkPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function RequireAuth() {
  const auth = useAuth();
  if (auth.snapshot.status === "loading") {
    return <PendingLine>正在確認工作階段…</PendingLine>;
  }
  if (auth.snapshot.status === "unavailable") {
    return (
      <PendingLine>
        <Note tone="danger">核心 API 沒有回應。請確認資料庫已啟動，並且 `pnpm dev` 正在跑。</Note>
      </PendingLine>
    );
  }
  if (auth.snapshot.status === "anonymous") {
    return <Navigate to={auth.snapshot.needsSetup ? "/setup" : "/login"} replace />;
  }
  return <Outlet />;
}
