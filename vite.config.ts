import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

/** La version du site, jointe aux signalements : le commit et la date de construction (« dev » en local) */
function siteVersion(dev: boolean): string {
  // À l'heure de la machine qui construit (« 2026-11-14 23:16 »)
  const date = new Date().toLocaleString("sv-SE").slice(0, 16);
  let commit = "";
  try {
    commit = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    // Construit hors d'un dépôt : la date seule
  }
  if (dev) return commit ? `dev ${commit}` : "dev";
  return commit ? `${commit} du ${date}` : `du ${date}`;
}

export default defineConfig(({ command }) => ({
  plugins: [react(), cloudflare()],
  define: {
    __SITE_VERSION__: JSON.stringify(siteVersion(command === "serve")),
  },
  server: {
    // Accessible depuis un telephone sur le meme wifi
    host: true,
  },
  optimizeDeps: {
    // En dev, toutes les pages et tous les jeux sont parcourus dès le démarrage : les dépendances
    // sont pré-assemblées une fois pour toutes, au lieu de l'être à nouveau en pleine séance
    // (pages noires, « Outdated Optimize Dep ») quand un jeu chargé à la demande en importe une nouvelle
    entries: ["index.html", "src/client/**/*.tsx"],
  },
}));
