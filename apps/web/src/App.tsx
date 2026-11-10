import { Navigate, Route, Routes } from "react-router";
import { Shell } from "@/components/shell";
import { DashboardPage } from "@/pages/dashboard";
import { DonatePage } from "@/pages/donate";
import { PluginsPage } from "@/pages/plugins";

export function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<DashboardPage />} />
        <Route path="plugins" element={<PluginsPage />} />
      </Route>
      <Route path="donate" element={<DonatePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
