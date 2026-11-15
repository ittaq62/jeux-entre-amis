import { tableTeamName } from "../../shared/games/teams.ts";
import { DEFAULT_SETTINGS, effectiveRules, type EndMode, type UnoSettings } from "../../shared/games/uno/engine.ts";
import { MAX_PLAYERS, type RoomClientMessage, type RoomView } from "../../shared/protocol.ts";
import { applyDrawnRules } from "../../shared/randomRules.ts";
import { Check, Options } from "../components/ui.tsx";
import { usePrefs } from "../stores/prefs.ts";
import { BackPicker } from "./BackPicker.tsx";
import { CrewCountField, crewProblem, CrewsPanel } from "./Crews.tsx";
import { drawLock, RandomRulesField, tableDraw } from "./RandomRules.tsx";
import { RulesHeading, TableLobby, TableSize } from "./TableLobby.tsx";

interface LobbyProps {
  room: RoomView;
  send: (msg: RoomClientMessage) => void;
  unread: number;
  onOpenChat: () => void;
  onLeave: () => void;
  onBackToGame?: () => void;
}

const HOUSE_RULES: { key: "stacking" | "drawUntilPlayable" | "sevenZero" | "jumpIn" | "noEarlyUno"; label: string; desc: string }[] = [
  { key: "stacking", label: "Cumul des +2 et +4", desc: "On renvoie la pénalité au suivant ; le dernier ramasse tout." },
  { key: "drawUntilPlayable", label: "Piocher jusqu'à pouvoir jouer", desc: "On pioche tant qu'aucune carte ne peut être posée." },
  { key: "sevenZero", label: "Règle du 7-0", desc: "Un 7 échange ta main avec celle de ton choix, un 0 fait tourner toutes les mains." },
  { key: "jumpIn", label: "Interception", desc: "Une carte strictement identique peut être jouée hors de son tour." },
  {
    key: "noEarlyUno",
    label: "Pas de UNO d'avance",
    desc: "On crie UNO avec sa dernière carte seule en main, juste après avoir posé l'avant-dernière : plus avec deux cartes. Classique comme No Mercy.",
  },
];

/** Les règles que No Mercy impose ; les autres restent au choix */
const MERCY_FREE = new Set(["jumpIn", "noEarlyUno"]);

/** Le salon d'une table de UNO : le salon commun et les règles du UNO. */
export function RoomLobby({ room, send, ...rest }: LobbyProps) {
  // Règles au hasard : ce que le tirage décide s'affiche tel qu'il sera joué, et ne se règle plus à la main
  const s = applyDrawnRules("uno", room.settings.uno, DEFAULT_SETTINGS, tableDraw(room));
  const locked = drawLock(room, "uno");
  const isHost = room.you.isHost;
  const rules = effectiveRules(s);
  const count = room.tour ? 0 : (s.teamCount ?? 0);
  const problem = room.seats.length >= 2 ? crewProblem(room, count) : null;
  const update = (patch: Partial<UnoSettings>) => send({ t: "settings", settings: patch });
  const setPrefs = usePrefs((p) => p.set);
  const mine = room.seats.find((seat) => seat.id === room.you.seatId);

  return (
    <TableLobby
      room={room}
      send={send}
      {...rest}
      shareTitle="Viens jouer au UNO"
      startLabel="Distribuer les cartes"
      hostWillStart="va distribuer les cartes"
      canStart={room.seats.length >= 2 && !problem}
      startHint={problem ?? undefined}
      seatNote={count ? (seat) => (seat.team !== undefined ? tableTeamName(seat.team) : null) : undefined}
      aside={count ? <CrewsPanel room={room} send={send} count={count} /> : undefined}
      rules={
        <section className="rules-sheet panel">
          <RulesHeading room={room} />

          <RandomRulesField room={room} game="uno" send={send} />

          {mine && (
            <BackPicker
              current={mine.back ?? "classique"}
              onPick={(back) => {
                setPrefs({ unoBack: back });
                send({ t: "back", back });
              }}
            />
          )}

          <div className="field">
            <span className="field-label">Jeu</span>
            <Options
              label="Jeu"
              value={s.variant}
              disabled={!isHost || locked("variant")}
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
              const forced = rules.noMercy && !MERCY_FREE.has(r.key);
              const drawn = locked(r.key);
              const checked = forced || Boolean(s[r.key]);
              const toggle = () => isHost && !forced && !drawn && update({ [r.key]: !s[r.key] });
              return (
                <div key={r.key} className={`rule-row ${forced || drawn ? "is-forced" : ""}`} onClick={toggle}>
                  <Check label={r.label} checked={checked} disabled={!isHost || forced || drawn} onChange={() => {}} />
                  <span>
                    <strong>{r.label}</strong>
                    <span className="hint">
                      {forced ? "Toujours en vigueur en No Mercy." : drawn ? `${r.desc} Décidé par le tirage.` : r.desc}
                    </span>
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

          {!room.tour && (
            <CrewCountField
              count={count}
              max={MAX_PLAYERS}
              disabled={!isHost}
              onChange={(teamCount) => update({ teamCount })}
              win={
                s.endMode === "points"
                  ? "On voit la main de ses coéquipiers, et leurs points s'additionnent pour l'objectif."
                  : s.endMode === "ranking"
                    ? "On voit la main de ses coéquipiers ; la première équipe à avoir vidé toutes ses mains gagne."
                    : "On voit la main de ses coéquipiers ; la première main vidée fait gagner toute l'équipe."
              }
            />
          )}

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
