import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { Overlay } from "./overlay";
import "./index.css";

const params = new URLSearchParams(window.location.search);
const transparent = params.get("transparent") === "1";
const preview = params.get("preview") === "1";
const pluginId = params.get("plugin") ?? "official.alerts";

if (preview) document.body.dataset.stage = "checker";
else if (transparent) document.body.dataset.transparent = "1";

const tokenFromUrl = params.get("token") ?? "";
const cleaned = new URL(window.location.href);
cleaned.searchParams.delete("token");
window.history.replaceState(null, "", `${cleaned.pathname}${cleaned.search}${cleaned.hash}`);

function Root() {
  const [token] = useState(tokenFromUrl);
  return <Overlay token={token} pluginId={pluginId} transparent={transparent} preview={preview} />;
}

const root = document.getElementById("root");
if (root === null) throw new Error("missing root");

createRoot(root).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
