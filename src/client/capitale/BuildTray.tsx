import { motion } from "motion/react";
import {
  BUILDINGS,
  buildingPrice,
  BUYABLE,
  FLOORS_PER_TURN,
  RESIDENTIAL,
  SPECIAL_ORDER,
  SQUARES,
  type BuildingKind,
} from "../../shared/games/capitale/board.ts";
import { buildCost, canBuild, floorsLeft, rentFor, specialUsed } from "../../shared/games/capitale/engine.ts";
import type { CapitaleView } from "../../shared/games/capitale/view.ts";
import { Icon } from "../components/Icon.tsx";
import { asState, colorOf, money } from "./boardUi.ts";
import { buildingThumb } from "./scene/thumbs.ts";

// Le chantier : on choisit un bâtiment dans la palette, les cases où il peut aller s'allument sur le plateau, on clique.

export interface CellRef {
  square: number;
  cell: number;
}

/** Les cases où ce bâtiment peut se poser maintenant */
export function validCells(g: CapitaleView, me: string, kind: BuildingKind): CellRef[] {
  const s = asState(g);
  const out: CellRef[] = [];
  for (const sq of BUYABLE) {
    if (!g.deeds[sq]?.lots) continue;
    for (let cell = 0; cell < 4; cell++) if (canBuild(s, me, sq, cell, kind) === null) out.push({ square: sq, cell });
  }
  return out;
}

/** Ce que changerait ce bâtiment sur cette case : son prix, le loyer avant et après */
export function buildPreview(g: CapitaleView, me: string, at: CellRef, kind: BuildingKind) {
  const s = asState(g);
  const lots = g.deeds[at.square]!.lots!;
  const owner = g.deeds[at.square]!.owner;
  const before = rentFor(s, at.square, { diceTotal: 7 });
  const was = lots[at.cell] ?? null;
  lots[at.cell] = { kind, by: me };
  const after = rentFor(s, at.square, { diceTotal: 7 });
  lots[at.cell] = was;
  return { price: buildCost(s, at.square, at.cell, kind), before, after, owner };
}

/** La palette du chantier, en bas du plateau */
export function BuildTray({
  g,
  me,
  kind,
  hover,
  onKind,
  onClose,
}: {
  g: CapitaleView;
  me: string;
  kind: BuildingKind;
  hover: CellRef | null;
  onKind: (k: BuildingKind) => void;
  onClose: () => void;
}) {
  const s = asState(g);
  const kinds = g.settings.specials ? [...RESIDENTIAL, ...SPECIAL_ORDER] : RESIDENTIAL;
  const color = colorOf(g, me);
  const left = floorsLeft(s);
  const special = specialUsed(s);
  const preview = hover ? buildPreview(g, me, hover, kind) : null;
  return (
    <motion.div className="cap-tray panel" initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
      <div className="cap-tray-head">
        <strong>Chantier</strong>
        <span className="cap-tray-site">
          <span className={left > 0 ? "" : "is-done"}>
            {left} étage{left > 1 ? "s" : ""} sur {FLOORS_PER_TURN} ce tour
          </span>
          {g.settings.specials && <span className={special ? "is-done" : ""}>{special ? "spécial déjà posé" : "1 bâtiment spécial"}</span>}
        </span>
        <button className="btn btn-sm btn-primary" onClick={onClose}>
          <Icon name="check" size={16} /> Terminer
        </button>
      </div>
      <div className="cap-tray-kinds" role="radiogroup" aria-label="Le bâtiment à poser">
        {kinds.map((k) => {
          const info = BUILDINGS[k];
          const cells = validCells(g, me, k);
          const prices = [...new Set(cells.map((c) => buildCost(s, c.square, c.cell, k)))].sort((a, b) => a - b);
          const anyPrice = prices.length > 0 ? prices : [buildingPrice(k, 39)];
          const priceText = anyPrice.length > 1 ? `dès ${money(anyPrice[0]!)}` : money(anyPrice[0]!);
          return (
            <button
              key={k}
              type="button"
              className={`cap-kind ${k === kind ? "is-on" : ""} ${info.nuisance ? "is-nuisance" : info.special ? "is-special" : ""}`}
              aria-pressed={k === kind}
              disabled={cells.length === 0}
              onClick={() => onKind(k)}
              title={`${info.where} ${info.effect}`}
            >
              <img src={buildingThumb(k, k === "gratte" ? "bleu" : "rouge", color, 160)} alt="" width={58} height={58} draggable={false} />
              <span className="cap-kind-name">{info.name}</span>
              <span className="cap-kind-price num">{priceText}</span>
              <span className="cap-kind-tag">
                {info.floors > 0 ? `${info.floors} étage${info.floors > 1 ? "s" : ""}` : info.nuisance ? "chez un autre" : "spécial"}
              </span>
            </button>
          );
        })}
      </div>
      <p className="cap-tray-help">
        {preview && hover ? (
          <>
            <strong>
              {BUILDINGS[kind].name} à {SQUARES[hover.square]!.name}
            </strong>{" "}
            : <b className="num">{money(preview.price)}</b>, loyer{" "}
            <b className="num">
              {money(preview.before)} → {money(preview.after)}
            </b>
          </>
        ) : validCells(g, me, kind).length > 0 ? (
          <>
            <strong>{BUILDINGS[kind].name}</strong> : {BUILDINGS[kind].effect} Choisis une case verte sur le plateau (au doigt : touche-la
            deux fois).
          </>
        ) : (
          <>Plus de case possible pour ce bâtiment.</>
        )}
      </p>
    </motion.div>
  );
}
