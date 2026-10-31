import type { ReactNode } from "react";
import {
  BUILDINGS,
  buildingPrice,
  floorCost,
  floorRents,
  GROUPS,
  groupOf,
  mortgageValue,
  SQUARES,
  STATION_RENTS,
  type BuildingKind,
} from "../../shared/games/capitale/board.ts";
import { floorsOf, nuisanceOn, rentFor } from "../../shared/games/capitale/engine.ts";
import type { CapitaleView } from "../../shared/games/capitale/view.ts";
import { asState, colorOf, money } from "./boardUi.ts";
import { buildingThumb } from "./scene/thumbs.ts";

// Le titre de propriété, tel qu'on le tient en main : la couleur du quartier, le nom, les loyers, la parcelle et ses 4 cases.

/** La vignette d'un bâtiment, dans le style du quartier et à la couleur de celui qui l'a posé */
export function BuildingIcon({ kind, index, color, size = 64 }: { kind: BuildingKind; index: number; color: string; size?: number }) {
  const group = SQUARES[index]?.group ?? "rouge";
  const src = buildingThumb(kind, group, color, 160);
  return src ? (
    <img className="cap-bicon" src={src} alt={BUILDINGS[kind].name} width={size} height={size} draggable={false} />
  ) : (
    <span className="cap-bicon is-text" style={{ width: size, height: size }}>
      {BUILDINGS[kind].name}
    </span>
  );
}

/** Les 4 cases d'une parcelle, vues d'en haut : le fond (2, 3) en haut, le devant (0, 1) en bas, côté rue */
export function ParcelGrid({
  g,
  index,
  size = 44,
  onCell,
  active,
}: {
  g: CapitaleView;
  index: number;
  size?: number;
  onCell?: (cell: number) => void;
  active?: number | null;
}) {
  const lots = g.deeds[index]?.lots ?? [];
  const color = GROUPS[SQUARES[index]!.group!].color;
  return (
    <span className="cap-parcel" style={{ ["--group" as string]: color, ["--cell" as string]: `${size}px` }}>
      {[2, 3, 0, 1].map((c) => {
        const b = lots[c];
        const nuisance = b && BUILDINGS[b.kind].nuisance;
        const content = b ? <BuildingIcon kind={b.kind} index={index} color={colorOf(g, b.by)} size={size} /> : null;
        const cls = `cap-parcel-cell ${b ? "is-built" : ""} ${nuisance ? "is-nuisance" : ""} ${active === c ? "is-active" : ""}`;
        return onCell ? (
          <button key={c} type="button" className={cls} onClick={() => onCell(c)} aria-label={b ? BUILDINGS[b.kind].name : "Case libre"}>
            {content}
          </button>
        ) : (
          <span key={c} className={cls}>
            {content}
          </span>
        );
      })}
      <span className="cap-parcel-street">{SQUARES[index]!.name}</span>
    </span>
  );
}

const kindLabel = (i: number) => {
  const sq = SQUARES[i]!;
  if (sq.kind === "station") return "Gare TGV";
  if (sq.kind === "utility") return "Réseau";
  return `Quartier ${GROUPS[sq.group!].name.toLowerCase()}`;
};

/** Le titre de propriété d'une case achetable */
export function DeedCard({
  g,
  index,
  children,
  compact = false,
}: {
  g: CapitaleView;
  index: number;
  children?: ReactNode;
  compact?: boolean;
}) {
  const sq = SQUARES[index]!;
  const deed = g.deeds[index];
  const group = groupOf(index);
  const s = asState(g);
  const floors = sq.kind === "property" ? floorsOf(s, index) : 0;
  const rentNow = deed?.owner && sq.kind !== "utility" ? rentFor(s, index, { diceTotal: 7 }) : null;
  const nuisance = sq.kind === "property" ? nuisanceOn(s, index) : null;
  const light = sq.group === "jaune" || sq.group === "ciel";
  return (
    <div className={`cap-deedcard ${compact ? "is-compact" : ""} ${deed?.mortgaged ? "is-mortgaged" : ""}`}>
      <div className={`cap-deedcard-head ${light ? "is-light" : ""}`} style={{ background: group?.color ?? "#cfd6d8" }}>
        <span>{sq.price !== undefined ? kindLabel(index) : "Case du plateau"}</span>
        <strong>{sq.name}</strong>
        {deed?.owner && (
          <span className="cap-deedcard-owner" style={{ ["--owner" as string]: colorOf(g, deed.owner) }}>
            {deed.mortgaged ? "hypothéqué" : `loyer ${money(rentNow ?? 0)}`}
          </span>
        )}
      </div>
      {sq.kind === "property" && (
        <div className="cap-deedcard-body">
          <ol className="cap-floors" aria-label="Loyer selon les étages bâtis">
            <li className={floors === 0 ? "is-now" : ""}>
              <span>Terrain nu</span>
              <b className="num">{money(sq.rents![0])}</b>
              <em>quartier complet {money(sq.rents![0] * 2)}</em>
            </li>
            {floorRents(index)
              .slice(1)
              .map((r, k) => (
                <li key={k} className={floors === k + 1 ? "is-now" : ""}>
                  <span>
                    {k + 1} étage{k > 0 ? "s" : ""}
                  </span>
                  <b className="num">{money(r)}</b>
                </li>
              ))}
          </ol>
          {!compact && (
            <p className="cap-deedcard-note">
              Une maison compte 1 étage, un immeuble 2. Un étage coûte <b className="num">{money(floorCost(index))}</b>, 3 étages par tour
              au plus. Le gratte-ciel du quartier (<b className="num">{money(buildingPrice("gratte", index))}</b>) double tous ses loyers.
              {nuisance && (
                <>
                  {" "}
                  <strong className="cap-warn">
                    {BUILDINGS[nuisance.kind].name} sur la parcelle : {BUILDINGS[nuisance.kind].effect.toLowerCase()}
                  </strong>
                </>
              )}
            </p>
          )}
        </div>
      )}
      {sq.kind === "station" && (
        <ol className="cap-floors">
          {STATION_RENTS.map((r, k) => (
            <li key={r}>
              <span>
                {k + 1} gare{k > 0 ? "s" : ""} au même propriétaire
              </span>
              <b className="num">{money(r)}</b>
            </li>
          ))}
        </ol>
      )}
      {sq.kind === "utility" && (
        <p className="cap-deedcard-note">Un réseau : 4 fois les dés. Les deux au même propriétaire : 10 fois les dés.</p>
      )}
      {sq.price !== undefined && (
        <p className="cap-deedcard-foot">
          <span>
            Prix <b className="num">{money(sq.price)}</b>
          </span>
          <span>
            Hypothèque <b className="num">{money(mortgageValue(index))}</b>
          </span>
        </p>
      )}
      {children}
    </div>
  );
}
