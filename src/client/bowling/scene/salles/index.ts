// Les salles du bowling, par leur nom
import type { SalleId } from "../../../../shared/games/bowling/salles.ts";
import type { Salle } from "./common.ts";
import { chaletSalle } from "./chalet.ts";
import { fluoSalle } from "./fluo.ts";
import { foireSalle } from "./foire.ts";
import { guinguetteSalle } from "./guinguette.ts";
import { paquebotSalle } from "./paquebot.ts";
import { retroSalle } from "./retro.ts";
import { stationSalle } from "./station.ts";
import { templeSalle } from "./temple.ts";

export function salleOf(id: SalleId): Salle {
  switch (id) {
    case "fluo":
      return fluoSalle();
    case "chalet":
      return chaletSalle();
    case "guinguette":
      return guinguetteSalle();
    case "foire":
      return foireSalle();
    case "paquebot":
      return paquebotSalle();
    case "temple":
      return templeSalle();
    case "station":
      return stationSalle();
    default:
      return retroSalle();
  }
}
