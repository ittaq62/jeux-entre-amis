// Les salles du bowling, par leur nom
import type { SalleId } from "../../../../shared/games/bowling/salles.ts";
import type { Salle } from "./common.ts";
import { chaletSalle } from "./chalet.ts";
import { fluoSalle } from "./fluo.ts";
import { guinguetteSalle } from "./guinguette.ts";
import { retroSalle } from "./retro.ts";

export function salleOf(id: SalleId): Salle {
  switch (id) {
    case "fluo":
      return fluoSalle();
    case "chalet":
      return chaletSalle();
    case "guinguette":
      return guinguetteSalle();
    default:
      return retroSalle();
  }
}
