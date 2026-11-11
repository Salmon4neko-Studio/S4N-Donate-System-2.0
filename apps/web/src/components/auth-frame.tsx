import type { ReactNode } from "react";
import { PublicPage } from "@/components/public-page";

export function AuthFrame({
  kicker,
  title,
  lede,
  children,
}: {
  kicker: string;
  title: string;
  lede: string;
  children: ReactNode;
}) {
  return (
    <PublicPage kicker={kicker} title={title} lede={lede} link={{ to: "/donate", label: "贊助頁" }}>
      {children}
    </PublicPage>
  );
}
