// Le garage de Bolides : les véhicules (chacun sa conduite), les skins, et ce qu'il faut pour les débloquer. Aucun
// véhicule n'est simplement « meilleur » : ce qu'il gagne d'un côté, il le perd de l'autre.

export type VehicleId = "kart" | "moto" | "buggy" | "bolide" | "monstre" | "tondeuse" | "soucoupe";

export const VEHICLE_IDS: VehicleId[] = ["kart", "moto", "buggy", "bolide", "monstre", "tondeuse", "soucoupe"];

export interface VehicleStats {
  /** La vitesse de pointe, l'accélération et le braquage, par rapport au kart */
  top: number;
  accel: number;
  turn: number;
  /** Ce qu'il reste de la vitesse dans l'herbe (0,55 pour le kart) */
  grass: number;
  /** Le poids : le plus lourd pousse l'autre dans un choc */
  weight: number;
  /** La vitesse à laquelle un dérapage charge son mini-turbo, par rapport au kart */
  charge: number;
}

export interface Vehicle {
  id: VehicleId;
  name: string;
  blurb: string;
  /** Le nombre de victoires qu'il faut pour le débloquer (0 : dès le début) */
  wins: number;
  stats: VehicleStats;
}

export const VEHICLES: Record<VehicleId, Vehicle> = {
  kart: {
    id: "kart",
    name: "Kart",
    blurb: "Le plus équilibré : rien à lui reprocher.",
    wins: 0,
    stats: { top: 1, accel: 1, turn: 1, grass: 0.55, weight: 1, charge: 1 },
  },
  moto: {
    id: "moto",
    name: "Moto",
    blurb: "Nerveuse et agile, elle charge ses turbos plus vite, mais on la bouscule facilement.",
    wins: 0,
    stats: { top: 0.985, accel: 1.16, turn: 1.1, grass: 0.5, weight: 0.65, charge: 1.12 },
  },
  buggy: {
    id: "buggy",
    name: "Buggy",
    blurb: "À l'aise dans l'herbe : les raccourcis ne lui font pas peur.",
    wins: 2,
    stats: { top: 0.98, accel: 1.04, turn: 0.97, grass: 0.84, weight: 1.05, charge: 0.97 },
  },
  bolide: {
    id: "bolide",
    name: "Le Bolide",
    blurb: "Le plus rapide en ligne droite, mais long à lancer et mauvais dans l'herbe.",
    wins: 5,
    stats: { top: 1.045, accel: 0.84, turn: 0.93, grass: 0.42, weight: 0.85, charge: 1 },
  },
  monstre: {
    id: "monstre",
    name: "Le Monstre",
    blurb: "Lourd et haut sur roues : il pousse tout le monde, mais tourne comme un camion.",
    wins: 10,
    stats: { top: 0.975, accel: 0.9, turn: 0.88, grass: 0.78, weight: 1.9, charge: 0.92 },
  },
  tondeuse: {
    id: "tondeuse",
    name: "La Tondeuse",
    blurb: "L'herbe, c'est son métier : elle n'y ralentit pas du tout. Sur la route, un peu juste.",
    wins: 18,
    stats: { top: 0.965, accel: 1.08, turn: 1.04, grass: 1, weight: 0.9, charge: 1.04 },
  },
  soucoupe: {
    id: "soucoupe",
    name: "La Soucoupe",
    blurb: "Elle plane au-dessus de l'herbe et tourne sur un mouchoir. Légère : gare aux chocs.",
    wins: 30,
    stats: { top: 1.01, accel: 1, turn: 1.12, grass: 0.92, weight: 0.6, charge: 1.05 },
  },
};

/** Ce que la table montre pour comparer les véhicules, de 0 à 1 */
export function vehicleBars(id: VehicleId): { label: string; value: number }[] {
  const s = VEHICLES[id].stats;
  const scale = (v: number, lo: number, hi: number) => Math.max(0.08, Math.min(1, (v - lo) / (hi - lo)));
  return [
    { label: "Vitesse", value: scale(s.top, 0.94, 1.06) },
    { label: "Accélération", value: scale(s.accel, 0.76, 1.22) },
    { label: "Maniabilité", value: scale(s.turn, 0.82, 1.16) },
    { label: "Tout-terrain", value: scale(s.grass, 0.3, 1) },
    { label: "Poids", value: scale(s.weight, 0.4, 2) },
  ];
}

export type SkinId = "usine" | "bandes" | "damier" | "camo" | "flammes" | "carbone" | "neon" | "chrome" | "or" | "arcenciel" | "galaxie";

export const SKIN_IDS: SkinId[] = [
  "usine",
  "bandes",
  "damier",
  "camo",
  "flammes",
  "carbone",
  "neon",
  "chrome",
  "or",
  "arcenciel",
  "galaxie",
];

/** Ce qui compte pour débloquer : les courses, les victoires, et quelques exploits cumulés */
export interface GarageProgress {
  played: number;
  won: number;
  turbos: number;
  hitsGiven: number;
}

export const NO_PROGRESS: GarageProgress = { played: 0, won: 0, turbos: 0, hitsGiven: 0 };

export interface Skin {
  id: SkinId;
  name: string;
  /** Ce qu'il faut atteindre (`need` à 0 : dès le début) */
  stat: keyof GarageProgress;
  need: number;
  /** Une petite pastille pour la choisir : deux couleurs */
  swatch: [string, string];
}

export const SKINS: Record<SkinId, Skin> = {
  usine: { id: "usine", name: "D'usine", stat: "played", need: 0, swatch: ["#e2483d", "#b5362d"] },
  bandes: { id: "bandes", name: "Bandes de course", stat: "played", need: 2, swatch: ["#2f80ed", "#ffffff"] },
  damier: { id: "damier", name: "Damier", stat: "won", need: 1, swatch: ["#16161a", "#f4f4f4"] },
  camo: { id: "camo", name: "Camouflage", stat: "played", need: 10, swatch: ["#4d5b35", "#8a8455"] },
  flammes: { id: "flammes", name: "Flammes", stat: "turbos", need: 50, swatch: ["#1b1b20", "#ff7a1a"] },
  carbone: { id: "carbone", name: "Carbone", stat: "won", need: 5, swatch: ["#26282d", "#3d4047"] },
  neon: { id: "neon", name: "Néon", stat: "hitsGiven", need: 25, swatch: ["#120a24", "#22e6ff"] },
  chrome: { id: "chrome", name: "Chrome", stat: "won", need: 12, swatch: ["#eef2f6", "#8a939d"] },
  or: { id: "or", name: "Or", stat: "won", need: 25, swatch: ["#ffd76a", "#b98a1e"] },
  arcenciel: { id: "arcenciel", name: "Arc-en-ciel", stat: "won", need: 40, swatch: ["#ff4d6d", "#4dd2ff"] },
  galaxie: { id: "galaxie", name: "Galaxie", stat: "played", need: 100, swatch: ["#1a1040", "#b48cff"] },
};

const STAT_WORDS: Record<keyof GarageProgress, [string, string]> = {
  played: ["course", "courses"],
  won: ["victoire", "victoires"],
  turbos: ["mini-turbo", "mini-turbos"],
  hitsGiven: ["coup donné", "coups donnés"],
};

/** Ce qu'il faut encore faire, en toutes lettres (« 3 victoires ») */
export function needLabel(stat: keyof GarageProgress, need: number): string {
  const [one, many] = STAT_WORDS[stat];
  return `${need} ${need > 1 ? many : one}`;
}

export function vehicleUnlocked(id: VehicleId, p: GarageProgress): boolean {
  return p.won >= VEHICLES[id].wins;
}

export function skinUnlocked(id: SkinId, p: GarageProgress): boolean {
  const s = SKINS[id];
  return p[s.stat] >= s.need;
}

export const isVehicleId = (v: unknown): v is VehicleId => VEHICLE_IDS.includes(v as VehicleId);
export const isSkinId = (v: unknown): v is SkinId => SKIN_IDS.includes(v as SkinId);

/** Pour les bots : un véhicule et un skin tirés d'après leur nom (surtout des karts et des motos, parfois une rareté) */
export function botGarage(seed: string): { vehicle: VehicleId; skin: SkinId } {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const u = h >>> 0;
  const r = (u % 1000) / 1000;
  const vehicle: VehicleId =
    r < 0.42
      ? "kart"
      : r < 0.72
        ? "moto"
        : r < 0.82
          ? "buggy"
          : r < 0.9
            ? "bolide"
            : r < 0.95
              ? "monstre"
              : r < 0.98
                ? "tondeuse"
                : "soucoupe";
  const skin = SKIN_IDS[(u >>> 10) % 8]!;
  return { vehicle, skin };
}
