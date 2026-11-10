import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Overlay } from "./overlay";
import "./index.css";

const transparent = new URLSearchParams(window.location.search).get("transparent") === "1";
if (transparent) document.body.dataset.transparent = "1";

const root = document.getElementById("root");
if (root === null) throw new Error("missing root");

createRoot(root).render(
  <StrictMode>
    <Overlay transparent={transparent} />
  </StrictMode>,
);
