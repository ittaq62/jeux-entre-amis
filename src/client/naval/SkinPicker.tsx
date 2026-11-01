import { useId } from "react";
import { SKINS, type SkinId } from "../../shared/games/naval/skins.ts";
import { Icon } from "../components/Icon.tsx";
import { CELL, hullFill, ShipShape, SkinDefs } from "./ships.tsx";

// Le choix du thème de sa flotte : la Marine pour tout le monde, les autres s'ouvrent avec les victoires.

/** Un croiseur sur l'eau, dans un thème */
function Preview({ skin, defs }: { skin: SkinId; defs: string }) {
  const w = 4 * CELL;
  return (
    <svg className="skin-preview" viewBox={`-2 -2 ${w + 4} ${CELL + 4}`} aria-hidden="true">
      <rect x={-2} y={-2} width={w + 4} height={CELL + 4} rx={2} fill="#134e66" />
      <g style={{ ["--hull" as string]: hullFill(defs, skin, "#7c898e") }}>
        <ShipShape kind="croiseur" skin={skin} />
      </g>
    </svg>
  );
}

export function SkinPicker({
  current,
  wins,
  onPick,
  side = false,
}: {
  current: SkinId;
  wins: number;
  onPick: (skin: SkinId) => void;
  /** Au placement : une colonne à côté de la flotte, une bande au-dessus sur téléphone */
  side?: boolean;
}) {
  const defs = `skins${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const next = SKINS.find((s) => s.wins > wins);
  return (
    <div className={`field skin-field ${side ? "is-side" : ""}`}>
      <span className="field-label">Thème de ta flotte</span>
      <svg width={0} height={0} style={{ position: "absolute" }} aria-hidden="true">
        <defs>
          <SkinDefs id={defs} />
        </defs>
      </svg>
      <div className="skin-list" role="radiogroup" aria-label="Thème de ta flotte">
        {SKINS.map((s) => {
          const locked = s.wins > wins;
          return (
            <button
              key={s.id}
              type="button"
              className={`skin-option ${current === s.id ? "is-on" : ""} ${locked ? "is-locked" : ""}`}
              aria-pressed={current === s.id}
              disabled={locked}
              onClick={() => onPick(s.id)}
              title={locked ? `${s.name} : ${s.wins} victoire${s.wins > 1 ? "s" : ""} à la bataille navale` : s.name}
            >
              <Preview skin={s.id} defs={defs} />
              <span className="skin-name">{s.name}</span>
              {locked && (
                <span className="skin-lock">
                  <Icon name="lock" size={11} /> {s.wins}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {!side && (
        <p className="hint" style={{ margin: 0 }}>
          {wins > 0 ? `${wins} victoire${wins > 1 ? "s" : ""} à la bataille navale. ` : ""}
          {next ? `Prochain thème : ${next.name}, à ${next.wins} victoire${next.wins > 1 ? "s" : ""}.` : "Tous les thèmes sont à toi."}
        </p>
      )}
    </div>
  );
}
