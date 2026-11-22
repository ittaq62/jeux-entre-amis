import type { SalleId } from "../../../../shared/games/billard/salles.ts";
import { bar } from "./bar.ts";
import { bibliotheque } from "./bibliotheque.ts";
import { club } from "./club.ts";
import type { Salle } from "./common.ts";
import { loft } from "./loft.ts";
import { serre } from "./serre.ts";
import { sousmarin } from "./sousmarin.ts";
import { terrasse } from "./terrasse.ts";
import { wagon } from "./wagon.ts";

const BUILDERS: Record<SalleId, (touch: boolean) => Salle> = {
  club,
  bibliotheque,
  bar,
  loft,
  wagon,
  sousmarin,
  serre,
  terrasse,
};

export function salleOf(id: SalleId, touch: boolean): Salle {
  return (BUILDERS[id] ?? club)(touch);
}
