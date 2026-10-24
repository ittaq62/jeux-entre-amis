import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/young-serif";
import "@fontsource-variable/libre-franklin";
import "@fontsource-variable/libre-franklin/wght-italic";
import "@fontsource-variable/big-shoulders-display";
import "@fontsource/great-vibes";
import "./styles/base.css";
import "./styles/app.css";
import "./styles/game.css";
import { App } from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
