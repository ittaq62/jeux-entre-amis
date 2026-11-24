import { tableTeamName } from "../../shared/games/teams.ts";
import { DEFAULT_SETTINGS, effectiveRules, type EndMode, type UnoSettings } from "../../shared/games/uno/engine.ts";
import { MAX_PLAYERS, type RoomClientMessage, type RoomView } from "../../shared/protocol.ts";
import { applyDrawnRules } from "../../shared/randomRules.ts";
import { Check, Options } from "../components/ui.tsx";
import { usePrefs } from "../stores/prefs.ts";
import { BackPicker } from "./BackPicker.tsx";
import { CrewCountField, crewProblem, CrewsPanel } from "./Crews.tsx";
import { drawLock, RandomRulesField, tableDraw } from "./RandomRules.tsx";
import { TableLobby, TableSize } from "./TableLobby.tsx";

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

  const endLabel = s.endMode === "points" ? `en ${s.targetScore} points` : s.endMode === "ranking" ? "jusqu'au dernier" : "premier à finir";
  const turnLabel = s.turnSeconds ? `${s.turnSeconds < 60 ? `${s.turnSeconds} s` : "1 min"} pour jouer` : "sans limite de temps";
  const summary = [s.variant === "nomercy" ? "UNO No Mercy" : "UNO classique", endLabel, turnLabel, count ? `${count} équipes` : null]
    .filter(Boolean)
    .join(" · ");

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
      summary={summary}
      rules={
        <>
          <RandomRulesField room={room} game="uno" send={send} />

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
                +6, +10, roulette, défausse totale. Le cumul est toujours permis, on doit poser quand on peut, et on est éliminé à 25
                cartes.
              </p>
            )}
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
        </>
      }
      moreRules={
        <>
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
        </>
      }
      look={
        mine && (
          <BackPicker
            current={mine.back ?? "classique"}
            onPick={(back) => {
              setPrefs({ unoBack: back });
              send({ t: "back", back });
            }}
          />
        )
      }
      help={<UnoHelp settings={s} />}
    />
  );
}

/** Comment jouer au UNO : le but, ce qu'on pose, les cartes spéciales et le « UNO ! », selon les règles de la table */
function UnoHelp({ settings }: { settings: UnoSettings }) {
  const rules = effectiveRules(settings);
  const goal =
    settings.endMode === "ranking"
      ? "vider sa main le plus tôt possible : on joue jusqu'à ce qu'il ne reste qu'un joueur, chacun prend la place de sa sortie."
      : settings.endMode === "points"
        ? `vider sa main en premier à chaque manche : on marque les cartes restées chez les autres, la partie se gagne à ${settings.targetScore} points.`
        : "être le premier à poser toutes ses cartes.";
  return (
    <div className="lobby-help">
      <h2>Comment jouer</h2>
      <p>
        <strong>Le but :</strong> {goal}
      </p>
      <ul>
        <li>À ton tour, pose une carte de la même couleur, ou du même chiffre ou symbole que celle du dessus.</li>
        {rules.noMercy ? (
          <>
            <li>
              Les jokers se posent sur tout : tu choisis la nouvelle couleur. <strong>Roulette</strong> : le suivant annonce une couleur et
              retourne des cartes jusqu'à la trouver, toutes pour lui.
            </li>
            <li>
              Tu ne pioches que si rien ne va, et jusqu'à trouver une carte qui va : <strong>tu dois la poser</strong>. Une carte jouable en
              main se pose, on ne pioche pas à la place.
            </li>
            <li>
              <strong>+2, +4, +6, +10</strong> : le suivant pioche et passe son tour, sauf s'il renvoie une carte « + » au moins aussi forte
              ; le dernier ramasse tout. <strong>Passe pour tous</strong> : tu rejoues. <strong>Défausse tout</strong> : toutes tes cartes
              de sa couleur partent avec elle.
            </li>
            <li>Un 7 échange ta main avec celle de ton choix, un 0 fait tourner toutes les mains.</li>
            <li>
              À <strong>25 cartes</strong> en main, tu es éliminé.
            </li>
          </>
        ) : (
          <>
            <li>Les jokers se posent sur tout : tu choisis la nouvelle couleur.</li>
            <li>
              Rien à poser : tu pioches {rules.drawUntilPlayable ? "jusqu'à trouver une carte qui va" : "une carte"}, et tu la poses si elle
              va (ou tu la gardes).
            </li>
            <li>
              <strong>+2</strong> et <strong>+4</strong> : le suivant pioche et passe son tour
              {rules.stacking ? ", sauf s'il renvoie un +2 sur un +2, ou un +4 sur l'un ou l'autre ; le dernier ramasse tout" : ""}.{" "}
              <strong>Inversion</strong> : le sens change. <strong>Passe</strong> : le suivant passe son tour.
            </li>
            <li>
              Le <strong>joker +4</strong> ne se pose que sans carte de la couleur demandée. Celui qui le reçoit peut{" "}
              <strong>contester</strong> : si c'était un bluff, l'auteur pioche 4 à sa place ; sinon, il en pioche 6.
            </li>
            {rules.sevenZero && <li>Un 7 échange ta main avec celle de ton choix, un 0 fait tourner toutes les mains.</li>}
          </>
        )}
        {rules.jumpIn && (
          <li>
            <strong>Interception</strong> : la carte exactement identique à celle du dessus se pose même hors de ton tour, et le jeu repart
            de toi.
          </li>
        )}
        <li>
          {rules.earlyUno ? (
            <>
              Quand il te reste une carte, appuie sur <strong>UNO !</strong> (tu peux aussi le faire juste avant de poser ton avant-dernière
              carte).
            </>
          ) : (
            <>
              Ta carte posée, s'il ne t'en reste qu'une, appuie vite sur <strong>UNO !</strong> (pas avant : pas de UNO d'avance).
            </>
          )}{" "}
          Sinon, un autre peut te prendre la main dans le sac : tu pioches 2 cartes.
        </li>
      </ul>
      <p className="hint">
        Au clavier : <kbd>U</kbd> crie UNO, <kbd>D</kbd> ou <kbd>Espace</kbd> pioche, <kbd>P</kbd> garde la carte piochée. Une carte grisée
        dit pourquoi quand on la touche.
      </p>
    </div>
  );
}
