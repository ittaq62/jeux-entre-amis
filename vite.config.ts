import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

/** La version du site, jointe aux signalements : le commit et la date de construction (« dev » en local) */
function siteVersion(dev: boolean): string {
  const date = new Date().toISOString().slice(0, 16).replace("T", " ");
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
}));
