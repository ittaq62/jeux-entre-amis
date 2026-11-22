// Les salles du billard : chacune un décor et une lumière autour de la même table.

export type SalleId = "club" | "bibliotheque" | "bar" | "loft" | "wagon" | "sousmarin" | "serre" | "terrasse";

export interface SalleInfo {
  name: string;
  blurb: string;
}

export const SALLES: Record<SalleId, SalleInfo> = {
  club: { name: "Le club anglais", blurb: "Boiseries d'acajou, fauteuils de cuir capitonnés et la cheminée qui crépite." },
  bibliotheque: { name: "La bibliothèque", blurb: "Des livres jusqu'au plafond, l'échelle, le lustre et le globe terrestre." },
  bar: { name: "Le bar à néons", blurb: "Briques, néons, juke-box, et la pluie sur la vitrine." },
  loft: { name: "Le loft", blurb: "Sur les toits, sous une verrière d'usine, la ville allumée tout autour." },
  wagon: { name: "Le wagon-salon", blurb: "Le salon d'un train de nuit, et le paysage qui défile aux fenêtres." },
  sousmarin: { name: "Le salon sous la mer", blurb: "De grandes baies sur les fonds marins, les poissons, les rayons du soleil." },
  serre: { name: "La serre", blurb: "Une orangerie sous verrière, des palmiers, des lanternes." },
  terrasse: { name: "La terrasse", blurb: "Au bord de la mer, au soleil couchant, sous les lampions." },
};

export const SALLE_IDS = Object.keys(SALLES) as SalleId[];

/** Les salles déjà construites (les autres arrivent) */
const BUILT: SalleId[] = ["club"];

/** Les salles où l'on peut jouer (celles qui sont construites) */
export function readySalles(): SalleId[] {
  return SALLE_IDS.filter((id) => BUILT.includes(id));
}

export function isSalle(id: unknown): id is SalleId {
  return typeof id === "string" && id in SALLES;
}
