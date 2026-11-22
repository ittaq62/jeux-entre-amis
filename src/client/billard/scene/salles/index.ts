import type { SalleId } from "../../../../shared/games/billard/salles.ts";
import { club } from "./club.ts";
import type { Salle } from "./common.ts";

const BUILDERS: Partial<Record<SalleId, (touch: boolean) => Salle>> = {
  club,
};

export function salleOf(id: SalleId, touch: boolean): Salle {
  return (BUILDERS[id] ?? club)(touch);
}
