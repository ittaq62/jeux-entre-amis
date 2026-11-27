// Le décor et la mise en scène de chaque épreuve.

import type { EpreuveId } from "../../../../shared/games/cour/epreuves.ts";
import type { Stage, StageCtx } from "../stage.ts";
import { BillesStage } from "./billes.ts";
import { BiscuitStage } from "./biscuit.ts";
import { ChaisesStage } from "./chaises.ts";
import { CordeStage } from "./corde.ts";
import { EpervierStage } from "./epervier.ts";
import { MarelleStage } from "./marelle.ts";
import { NenupharsStage } from "./nenuphars.ts";
import { PolochonsStage } from "./polochons.ts";
import { SoleilStage } from "./soleil.ts";

export function makeStage(ep: EpreuveId, ctx: StageCtx): Stage {
  switch (ep) {
    case "soleil":
      return new SoleilStage(ctx);
    case "biscuit":
      return new BiscuitStage(ctx);
    case "corde":
      return new CordeStage(ctx);
    case "nenuphars":
      return new NenupharsStage(ctx);
    case "chaises":
      return new ChaisesStage(ctx);
    case "billes":
      return new BillesStage(ctx);
    case "marelle":
      return new MarelleStage(ctx);
    case "epervier":
      return new EpervierStage(ctx);
    case "polochons":
      return new PolochonsStage(ctx);
  }
}
