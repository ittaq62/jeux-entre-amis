// Les salles du bowling : chacune un décor autour de la même piste.

export type SalleId = "retro" | "fluo" | "chalet" | "guinguette" | "paquebot" | "temple" | "station" | "foire";

export interface SalleInfo {
  name: string;
  blurb: string;
}

export const SALLES: Record<SalleId, SalleInfo> = {
  retro: { name: "Le bowling du quartier", blurb: "Moquette à motifs, néons, banquettes et juke-box : la salle de toujours." },
  fluo: { name: "Nuit fluo", blurb: "Lumière noire, quilles qui brillent, boule à facettes et lasers." },
  chalet: { name: "Le chalet", blurb: "Tout en bois, la cheminée qui crépite, les sommets enneigés derrière les baies." },
  guinguette: { name: "La guinguette", blurb: "Une piste sur un ponton au bord de l'eau, sous les lampions, au soleil couchant." },
  paquebot: { name: "Le paquebot", blurb: "Sur le pont d'un grand navire, la mer jusqu'à l'horizon." },
  temple: { name: "Le temple antique", blurb: "Colonnes de marbre, statues, braseros, et le ciel du soir au-dessus de la nef." },
  station: { name: "La station spatiale", blurb: "La Terre derrière les hublots, une piste qui flotte dans l'espace." },
  foire: { name: "La fête foraine", blurb: "Manèges, guirlandes, et la grande roue qui tourne derrière la piste." },
};

export const SALLE_IDS = Object.keys(SALLES) as SalleId[];

/** Les salles déjà construites (les autres arrivent) */
export function readySalles(): SalleId[] {
  return ["retro", "fluo", "chalet", "guinguette", "foire", "paquebot", "temple"];
}

export function isSalle(id: unknown): id is SalleId {
  return typeof id === "string" && id in SALLES;
}
