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
import { listenForStaleChunks } from "./components/ErrorScreen.tsx";

// « ?perf » dans l'adresse (n'importe quelle page) : le panneau des premières secondes des parties, retenu sur cet
// appareil jusqu'à « ?perf=0 » (voir lib/firstSeconds.ts). Lu ici : la page d'une table retire vite ses paramètres
const perf = new URLSearchParams(window.location.search).get("perf");
if (perf !== null) {
  try {
    localStorage.setItem("tablee:perf", perf === "0" ? "0" : "1");
  } catch {
    // Pas de stockage : pas de panneau
  }
}

// Après une mise à jour du site, un morceau chargé à la demande peut ne plus exister : la page se recharge
listenForStaleChunks();

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
