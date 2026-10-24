import { effectiveRules, type EndMode, type UnoSettings } from "../../shared/games/uno/engine.ts";
import { MAX_PLAYERS, type RoomClientMessage, type RoomView } from "../../shared/protocol.ts";
import { Check, Options } from "../components/ui.tsx";
import { RulesHeading, TableLobby, TableSize } from "./TableLobby.tsx";

interface LobbyProps {
  room: RoomView;
  send: (msg: RoomClientMessage) => void;
  unread: number;
  onOpenChat: () => void;
  onLeave: () => void;
  onBackToGame?: () => void;
}

const HOUSE_RULES: { key: "stacking" | "drawUntilPlayable" | "sevenZero" | "jumpIn"; label: string; desc: string }[] = [
  { key: "stacking", label: "Cumul des +2 et +4", desc: "On renvoie la pénalité au suivant ; le dernier ramasse tout." },
  { key: "drawUntilPlayable", label: "Piocher jusqu'à pouvoir jouer", desc: "On pioche tant qu'aucune carte ne peut être posée." },
  { key: "sevenZero", label: "Règle du 7-0", desc: "Un 7 échange ta main avec celle de ton choix, un 0 fait tourner toutes les mains." },
  { key: "jumpIn", label: "Interception", desc: "Une carte strictement identique peut être jouée hors de son tour." },
];

/** Le salon d'une table de UNO : le salon commun et les règles du UNO. */
export function RoomLobby({ room, send, ...rest }: LobbyProps) {
  const s = room.settings.uno;
  const isHost = room.you.isHost;
  const rules = effectiveRules(s);
  const update = (patch: Partial<UnoSettings>) => send({ t: "settings", settings: patch });

  return (
    <TableLobby
      room={room}
      send={send}
      {...rest}
      shareTitle="Viens jouer au UNO"
      startLabel="Distribuer les cartes"
      hostWillStart="va distribuer les cartes"
      rules={
        <section className="rules-sheet panel">
          <RulesHeading room={room} />

          <div className="field">
            <span className="field-label">Jeu</span>
            <Options
              label="Jeu"
              value={s.variant}
              disabled={!isHost}
              onChange={(variant) => update({ variant })}
              options={[
                { value: "classic", label: "Classique, 108 cartes" },
                { value: "nomercy", label: "No Mercy, 168 cartes" },
              ]}
            />
            {s.variant === "nomercy" && (
              <p className="hint" style={{ margin: 0 }}>
                +6, +10, roulette, défausse totale. Le cumul est obligatoire et on est éliminé à 25 cartes.
              </p>
            )}
          </div>

          <div className="rule-list">
            {HOUSE_RULES.map((r) => {
              const forced = rules.noMercy && r.key !== "jumpIn";
              const checked = forced || s[r.key];
              const toggle = () => isHost && !forced && update({ [r.key]: !s[r.key] });
              return (
                <div key={r.key} className={`rule-row ${forced ? "is-forced" : ""}`} onClick={toggle}>
                  <Check label={r.label} checked={checked} disabled={!isHost || forced} onChange={() => {}} />
                  <span>
                    <strong>{r.label}</strong>
                    <span className="hint">{forced ? "Toujours en vigueur en No Mercy." : r.desc}</span>
                  </span>
                </div>
              );
            })}
          </div>

          <div className="field">
            <span className="field-label">Fin de partie</span>
            <Options<EndMode>
              label="Fin de partie"
              value={s.endMode}
              disabled={!isHost}
              onChange={(endMode) => update({ endMode, ...(endMode === "points" ? { targetScore: rules.noMercy ? 1000 : 500 } : {}) })}
              options={[
                { value: "first", label: "Premier à finir" },
                { value: "ranking", label: "Jusqu'au dernier" },
                { value: "points", label: "Aux points" },
              ]}
            />
            {s.endMode === "points" && (
              <Options
                label="Objectif"
                value={s.targetScore}
                disabled={!isHost}
                onChange={(targetScore) => update({ targetScore })}
                options={[200, 300, 500, 1000].map((v) => ({ value: v, label: `${v} points` }))}
              />
            )}
          </div>

          <div className="field">
            <span className="field-label">Temps pour jouer</span>
            <Options
              label="Temps pour jouer"
              value={s.turnSeconds}
              disabled={!isHost}
              onChange={(turnSeconds) => update({ turnSeconds })}
              options={[
                { value: 15, label: "15 s" },
                { value: 30, label: "30 s" },
                { value: 60, label: "1 min" },
                { value: 0, label: "Illimité" },
              ]}
            />
          </div>

          <TableSize room={room} send={send} max={MAX_PLAYERS} />
        </section>
      }
    />
  );
}
