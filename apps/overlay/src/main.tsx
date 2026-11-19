import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { OverlayStage } from "./stage";
import "@s4n/plugin-alerts/motion.css";
import "./index.css";

const params = new URLSearchParams(window.location.search);
const transparent = params.get("transparent") === "1";
const preview = params.get("preview") === "1";

if (preview) document.body.dataset.stage = "checker";
else if (transparent) document.body.dataset.transparent = "1";

const tokenFromUrl = params.get("token") ?? "";
const cleaned = new URL(window.location.href);
cleaned.searchParams.delete("token");
window.history.replaceState(null, "", `${cleaned.pathname}${cleaned.search}${cleaned.hash}`);

function Root() {
  const [token] = useState(tokenFromUrl);
  return <OverlayStage token={token} transparent={transparent} preview={preview} />;
}

const root = document.getElementById("root");
if (root === null) throw new Error("missing root");

createRoot(root).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
