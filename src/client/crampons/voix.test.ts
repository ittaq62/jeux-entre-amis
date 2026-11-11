import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CLUBS, SURNAMES } from "../../shared/games/crampons/clubs.ts";
import { VOIX } from "./voixLignes.ts";
import { voiceSlug } from "./voixNoms.ts";

const DIR = fileURLToPath(new URL("../../../public/sounds/commentaire/", import.meta.url));
const has = (key: string) => existsSync(`${DIR}${key}.mp3`);

/** Tout ce que le commentateur peut demander : chaque variante, chaque nom de joueur et de club, chaque score */
function everyKey(): string[] {
  const keys: string[] = [];
  for (const [cat, n] of Object.entries(VOIX)) for (let i = 1; i <= n; i++) keys.push(`${cat}-${i}`);
  for (const name of SURNAMES) for (const how of ["", "-vif", "-but"]) keys.push(`nom-${voiceSlug(name)}${how}`);
  for (const c of CLUBS)
    for (const what of ["cote1", "cote2", "pour", "victoire", "devant"]) keys.push(`club-${voiceSlug(c.name)}-${what}`);
  for (let hi = 0; hi <= 9; hi++) for (let lo = 0; lo <= hi; lo++) keys.push(`score-${hi}-${lo}`);
  return keys;
}

describe("le commentaire", () => {
  it("chaque réplique que le commentateur peut dire a son fichier", () => {
    expect(everyKey().filter((k) => !has(k))).toEqual([]);
  });

  it("aucun fichier n'est oublié du catalogue", () => {
    const known = new Set(everyKey());
    const files = readdirSync(DIR)
      .filter((f) => f.endsWith(".mp3"))
      .map((f) => f.slice(0, -4));
    expect(files.filter((f) => !known.has(f))).toEqual([]);
  });

  it("les noms de fichiers sont sûrs", () => {
    expect(voiceSlug("Le Goff")).toBe("le-goff");
    expect(voiceSlug("Prévost")).toBe("prevost");
    expect(voiceSlug("Sénéchal")).toBe("senechal");
  });
});
