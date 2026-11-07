// Fabrique les listes de mots de Mèche à partir du lexique Grammalecte (formes fléchies, licence MPL 2.0).
// Le lexique n'est pas dans le dépôt : https://grammalecte.net/dic/lexique-grammalecte-fr-v7.7.zip
//
//   node --experimental-strip-types scripts/meche-mots.ts chemin/vers/lexique-grammalecte-fr-v7.7.txt
//   npx prettier --write src/shared/games/meche/lettres.ts
//
// Écrit :
//   public/meche/mots.txt             tous les mots acceptés, triés, pour vérifier ce que tapent les joueurs
//   public/meche/courants.txt         les mots que les bots connaissent, du plus courant au moins courant
//   src/shared/games/meche/lettres.ts les groupes de lettres à imposer, classés par difficulté

import { readFileSync, writeFileSync } from "node:fs";
import { normalizeWord } from "../src/shared/games/meche/words.ts";

const SOURCE = "Lexique des formes fléchies du français, Grammalecte v7.7 (Olivier R., https://grammalecte.net)";
const NOTICE = [
  "# This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.",
  "# If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.",
  `# Tiré de : ${SOURCE}.`,
  "# Modifications : minuscules sans accents, sans noms propres, sigles ni symboles. Voir scripts/meche-mots.ts.",
];

/** Le plus court mot accepté */
const MIN_LETTERS = 3;

// Catégories écartées : noms de personnes et de lieux, nombres romains, ponctuation
const BANNED_TAGS = new Set(["npr", "prn", "patr", "nbro", "ponc", "titr", "sign"]);

/** Les injures racistes, homophobes ou sexistes : refusées à tout le monde */
const HATE = new Set(
  `bicot bicots bougnoul bougnoule bougnoules bougnouls crouille crouilles youpin youpine youpines youpins negre negres negresse negresses
  negrillon negrillons negrillonne negrillonnes pede pedes gouine gouines tafiole tafioles fiotte fiottes chinetoque chinetoques
  niakoue niakoues bamboula bamboulas boukak boukaks feuj feujs rital ritals polak polaks meteque meteques`.split(/\s+/),
);

/** Valables si un joueur les tape, mais un bot ne les écrit pas tout seul à la table */
const RUDE_EXACT = new Set(
  "baise baises bite bites con cons conne connes cul culs gode godes pute putes viol viols violer violeur violeurs sexe sexes".split(" "),
);
const RUDE_PREFIX =
  `bander bandant bordel branl chatte chiasse chier chieu connard connasse couill cunnil encul enfoir fellation foutr gigolo
  inceste masturb merd nazi nichon niqu orgasm partouz pedoph penis porno prostitu putain salop sodom sperm suicid tarlouz vagin zob`.split(
    /\s+/,
  );
const isRude = (w: string) => RUDE_EXACT.has(w) || RUDE_PREFIX.some((p) => w.startsWith(p));

/** Ce que tape naturellement quelqu'un : noms, adjectifs, adverbes, infinitifs, participes et présent. Pas d'imparfait du subjonctif. */
function isNatural(tags: string[]): boolean {
  const kind = tags[0] ?? "";
  if (kind === "nom" || kind === "adj" || kind === "adv" || kind === "loc.adv") return true;
  if (!/^v[0-9]/.test(kind)) return false;
  if (tags.includes("infi") || tags.includes("ppas") || tags.includes("ppre")) return true;
  return tags.includes("ipre") && (tags.includes("3sg") || tags.includes("3pl") || tags.includes("3pl!"));
}

const path = process.argv[2];
if (!path) throw new Error("Indique le chemin du lexique.");
const lines = readFileSync(path, "utf8").split("\n");
const start = lines.findIndex((l) => l.startsWith("id\tfid\t"));
const head = lines[start]!.split("\t");
const col = (name: string) => head.indexOf(name);
const FLEX = col("Flexion");
const TAGS = col("Étiquettes");
const INDEX = col("Indice de fréquence");

const all = new Set<string>();
/** Le meilleur indice de fréquence de chaque mot, sous sa forme naturelle */
const natural = new Map<string, number>();

for (const line of lines.slice(start + 1)) {
  const parts = line.split("\t");
  if (parts.length !== head.length) continue;
  const form = parts[FLEX]!;
  // Une majuscule : un nom propre ou un sigle ; autre chose que des lettres, un tiret ou une apostrophe : une unité, une formule
  if (form !== form.toLowerCase() || !/^[\p{L}’'-]+$/u.test(form)) continue;
  if (/[Ͱ-Ͽᴀ-ᶿ]/.test(form)) continue;
  const tags = parts[TAGS]!.split(" ");
  if (BANNED_TAGS.has(tags[0]!) || BANNED_TAGS.has(tags[1]!)) continue;
  const word = normalizeWord(form);
  // Sans voyelle, c'est un sigle ou une onomatopée (hlm, zzz…)
  if (word.length < MIN_LETTERS || HATE.has(word) || !/[aeiouy]/.test(word)) continue;
  all.add(word);
  if (isNatural(tags) && !form.includes("-") && !form.includes("’") && !isRude(word)) {
    const index = Number(parts[INDEX]);
    if (index > (natural.get(word) ?? -1)) natural.set(word, index);
  }
}

const sorted = [...all].sort();
writeFileSync("public/meche/mots.txt", [...NOTICE, ...sorted].join("\n") + "\n");

// Les mots des bots : quatre niveaux de vocabulaire, chacun sur sa ligne de séparation « = »
const level = (min: number, max: number) => [...natural].filter(([, i]) => i >= min && i <= max).map(([w]) => w);
const tiers = [level(7, 9), level(6, 6), level(5, 5)];
const common = tiers.flatMap((t, i) => [`=${i}`, ...t.sort()]);
writeFileSync("public/meche/courants.txt", [...NOTICE, ...common].join("\n") + "\n");

// Les groupes de lettres : combien de mots courants les contiennent ?
const vocab = tiers.flat().filter((w) => w.length >= 4);
const counts = new Map<string, number>();
for (const w of vocab) {
  const seen = new Set<string>();
  for (const n of [2, 3]) for (let i = 0; i + n <= w.length; i++) seen.add(w.slice(i, i + n));
  for (const g of seen) counts.set(g, (counts.get(g) ?? 0) + 1);
}
// « tres » : jamais tirés au sort, trop faciles, mais une fin de mot au Marabout peut y tomber
const BANDS: [string, number, number][] = [
  ["tres", 4001, Infinity],
  ["facile", 900, 4000],
  ["moyen", 250, 899],
  ["corse", 70, 249],
  ["dur", 22, 69],
];
const groups: Record<string, string[]> = {};
for (const [name, min, max] of BANDS) {
  groups[name] = [...counts]
    .filter(([g, n]) => n >= min && n <= max && !isRude(g) && !HATE.has(g))
    .map(([g]) => g)
    .sort();
}
const out = [
  "// Fichier fabriqué par scripts/meche-mots.ts : ne pas le modifier à la main.",
  "// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.",
  `// Tiré de : ${SOURCE}.`,
  "",
  "/** Les groupes de lettres à imposer, selon le nombre de mots courants qui les contiennent */",
  "export const LETTRES = {",
  ...Object.entries(groups).map(([name, list]) => `  ${name}: "${list.join(" ")}",`),
  "} as const;",
  "",
].join("\n");
writeFileSync("src/shared/games/meche/lettres.ts", out);

console.log(`mots acceptés : ${sorted.length}, ${Math.round(sorted.join("\n").length / 1024)} Ko`);
tiers.forEach((t, i) => console.log(`vocabulaire ${i} : ${t.length} mots`));
for (const [name, list] of Object.entries(groups)) console.log(`${name} : ${list.length} groupes`);
