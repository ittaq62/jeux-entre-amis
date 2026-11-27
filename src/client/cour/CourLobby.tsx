import {
  CANDIDATE_CHOICES,
  DEFAULT_CONFIG,
  DUREE_NAMES,
  DUREE_ROUNDS,
  LEVEL_NAMES,
  type BotLevel,
  type CourConfig,
  type Duree,
} from "../../shared/games/cour/config.ts";
import { EPREUVE_INFO, EPREUVES, type EpreuveId } from "../../shared/games/cour/epreuves.ts";
import { JERSEY_BY_ID } from "../../shared/games/cour/looks.ts";
import { COUR_MAX_PLAYERS, type CourClientMessage, type CourRoomView } from "../../shared/games/cour/net.ts";
import { applyDrawnRules } from "../../shared/randomRules.ts";
import { Check, Options } from "../components/ui.tsx";
import { drawLock, RandomRulesField, tableDraw } from "../game/RandomRules.tsx";
import { TableLobby } from "../game/TableLobby.tsx";
import { HowToPlay } from "./CourHelp.tsx";
import { LookPicker } from "./LookPicker.tsx";
import { SeasonPanel } from "./SeasonPanel.tsx";

const LEVEL_HINTS: Record<BotLevel, string> = {
  facile: "Les bots réagissent lentement et se trompent souvent.",
  moyen: "Des candidats comme toi et moi.",
  fort: "Des réflexes, de la mémoire, de l'adresse : il faudra être bon.",
};

interface Props {
  room: CourRoomView;
  send: (msg: CourClientMessage) => void;
  unread: number;
  onOpenChat: () => void;
  onLeave: () => void;
  onBackToGame?: () => void;
}

/** Le salon d'une table de La Cour des Grands : les vrais joueurs, la taille de la foule, les épreuves qui peuvent tomber */
export function CourLobby({ room, send, ...rest }: Props) {
  const s: CourConfig = applyDrawnRules("cour", { ...DEFAULT_CONFIG, ...room.settings.cour }, DEFAULT_CONFIG, tableDraw(room));
  const locked = drawLock(room, "cour");
  const isHost = room.you.isHost;
  const update = (patch: Partial<CourConfig>) => send({ t: "settings", settings: patch });
  const rounds = Math.min(DUREE_ROUNDS[s.duree], s.pool.length);
  const summary = s.only
    ? `${EPREUVE_INFO[s.only].name} seule · ${s.candidates} candidats`
    : `${s.candidates} candidats · ${rounds} épreuve${rounds > 1 ? "s" : ""} et la finale · bots ${LEVEL_NAMES[s.botLevel].toLowerCase()}${s.eclair ? " · éclair" : ""}`;
  const toggle = (e: Exclude<EpreuveId, "polochons">) => {
    const pool = s.pool.includes(e) ? s.pool.filter((x) => x !== e) : [...s.pool, e];
    if (pool.length) update({ pool });
  };
  return (
    <TableLobby
      room={room}
      send={send}
      {...rest}
      shareTitle="Viens jouer à La Cour des Grands"
      startLabel="Ouvrir la cour !"
      hostWillStart="va ouvrir les portes de la cour"
      canStart={room.seats.length >= 1}
      startHint="Il faut au moins un candidat : les bots complètent la foule."
      noBots
      seatNote={(seat) => {
        const look = room.seats.find((x) => x.id === seat.id)?.look;
        return look ? `Maillot ${JERSEY_BY_ID.get(look.jersey)?.name.toLowerCase() ?? ""}` : null;
      }}
      summary={summary}
      aside={isHost && !room.tour ? <SeasonPanel room={room} send={send} /> : undefined}
      look={room.you.seatId ? <LookPicker room={room} send={send} /> : undefined}
      help={<HowToPlay />}
      rules={
        <>
          <RandomRulesField room={room} game="cour" send={send} />
          <div className="field">
            <span className="field-label">Candidats</span>
            <Options<number>
              label="Candidats"
              value={s.candidates}
              disabled={!isHost || locked("candidates")}
              onChange={(candidates) => update({ candidates })}
              options={CANDIDATE_CHOICES.map((n) => ({ value: n, label: String(n) }))}
            />
            <p className="hint" style={{ margin: 0 }}>
              Les vrais joueurs, complétés par des bots jusqu'à {s.candidates}.
            </p>
          </div>
          <div className="field">
            <span className="field-label">Le jeu</span>
            <Options<string>
              label="Le jeu"
              value={s.only || "grand"}
              disabled={!isHost || locked("only")}
              onChange={(v) => update({ only: v === "grand" ? "" : (v as EpreuveId) })}
              options={[{ value: "grand", label: "Le grand jeu" }, ...EPREUVES.map((e) => ({ value: e, label: EPREUVE_INFO[e].name }))]}
            />
            <p className="hint" style={{ margin: 0 }}>
              {s.only
                ? `Une seule épreuve : ${EPREUVE_INFO[s.only].rules[0]}`
                : "Des épreuves tirées au sort, puis la finale des polochons entre les deux derniers."}
            </p>
          </div>
          {!s.only && (
            <>
              <div className="field">
                <span className="field-label">Longueur</span>
                <Options<Duree>
                  label="Longueur"
                  value={s.duree}
                  disabled={!isHost}
                  onChange={(duree) => update({ duree })}
                  options={(Object.keys(DUREE_NAMES) as Duree[]).map((d) => ({ value: d, label: DUREE_NAMES[d] }))}
                />
                <p className="hint" style={{ margin: 0 }}>
                  {rounds} épreuve{rounds > 1 ? "s" : ""} avant la finale, environ {Math.round(rounds * 1.6 + 2)} minutes.
                </p>
              </div>
              <div className="field">
                <span className="field-label">Les épreuves qui peuvent tomber</span>
                <div className="rule-list">
                  {EPREUVES.map((e) => (
                    <div key={e} className="rule-row" onClick={() => isHost && toggle(e)}>
                      <Check label={EPREUVE_INFO[e].name} checked={s.pool.includes(e)} disabled={!isHost} onChange={() => {}} />
                      <span>
                        <strong>{EPREUVE_INFO[e].name}</strong>
                        <span className="hint">{EPREUVE_INFO[e].tagline}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      }
      moreRules={
        <>
          <div className="field">
            <span className="field-label">Niveau des bots</span>
            <Options<BotLevel>
              label="Niveau des bots"
              value={s.botLevel}
              disabled={!isHost}
              onChange={(botLevel) => update({ botLevel })}
              options={(Object.keys(LEVEL_NAMES) as BotLevel[]).map((l) => ({ value: l, label: LEVEL_NAMES[l] }))}
            />
            <p className="hint" style={{ margin: 0 }}>
              {LEVEL_HINTS[s.botLevel]}
            </p>
          </div>
          <div className="rule-list">
            <div
              className={`rule-row ${locked("eclair") ? "is-forced" : ""}`}
              onClick={() => isHost && !locked("eclair") && update({ eclair: !s.eclair })}
            >
              <Check label="Épreuves éclair" checked={s.eclair} disabled={!isHost || locked("eclair")} onChange={() => {}} />
              <span>
                <strong>Épreuves éclair</strong>
                <span className="hint">Tous les chronos raccourcis : on court, on découpe et on saute plus vite.</span>
              </span>
            </div>
            <div className="rule-row" onClick={() => isHost && update({ cinema: !s.cinema })}>
              <Check label="Cinématiques complètes" checked={s.cinema} disabled={!isHost} onChange={() => {}} />
              <span>
                <strong>Cinématiques complètes</strong>
                <span className="hint">
                  L'arrivée des candidats et la révélation de chaque épreuve en entier (on peut toujours les passer).
                </span>
              </span>
            </div>
          </div>
          <p className="hint">Jusqu'à {COUR_MAX_PLAYERS} vrais joueurs à une table.</p>
        </>
      }
    />
  );
}
