import {
  BANDES_CHOICES,
  DEFAULT_CONFIG,
  INNINGS_CHOICES,
  LIVES_CHOICES,
  POINTS_CHOICES,
  RACE_CHOICES,
  VARIANT_NAMES,
  type Aide,
  type BillardConfig,
  type BotLevel,
  type Pace,
} from "../../shared/games/billard/match.ts";
import { BILLARD_MAX_PLAYERS, type BillardClientMessage, type BillardRoomView } from "../../shared/games/billard/net.ts";
import type { Variant } from "../../shared/games/billard/rules.ts";
import { CUES } from "../../shared/games/billard/looks.ts";
import { readySalles, SALLES, type SalleId } from "../../shared/games/billard/salles.ts";
import { applyDrawnRules } from "../../shared/randomRules.ts";
import { TOUR_TEAMS } from "../../shared/tour.ts";
import { Check, Options } from "../components/ui.tsx";
import { drawLock, RandomRulesField, tableDraw } from "../game/RandomRules.tsx";
import { TableLobby, TableSize } from "../game/TableLobby.tsx";
import { HowToPlay } from "./BillardHelp.tsx";
import { LookPicker } from "./LookPicker.tsx";

const BOT_HINTS: Record<BotLevel, string> = {
  facile: "Ils visent à peu près : une bille rentrée sur trois.",
  moyen: "Ils rentrent les coups simples et se placent un peu.",
  fort: "Ils rentrent presque tout, se placent pour la suite et jouent la sécurité.",
};

const PACE_HINTS: Record<Pace, string> = {
  court: "25 secondes par coup.",
  normal: "40 secondes par coup.",
  long: "70 secondes par coup.",
};

const AIDE_HINTS: Record<Aide, string> = {
  longue: "La ligne jusqu'à la bille fantôme, et les directions que prendront la bille visée et la blanche.",
  courte: "Seulement la ligne jusqu'à la bille fantôme.",
  aucune: "Un petit trait devant la blanche : à toi de viser.",
};

const VARIANT_HINTS: Record<Variant, string> = {
  huit: "Les pleines contre les rayées, puis la noire dans la poche annoncée. En duel ou en deux équipes.",
  neuf: "Toujours la plus petite bille d'abord ; qui rentre la 9 gagne la manche. En duel, en équipes ou chacun pour soi.",
  killer: "Chacun ses vies : à chaque passage, il faut rentrer une bille. Le dernier en vie gagne. Idéal à plusieurs.",
  carambole: "Le billard français, sans poches : ta bille doit toucher les deux autres. Partie libre, une bande ou trois bandes.",
};

type RuleKey = "larges" | "glisse" | "rebonds";

interface Props {
  room: BillardRoomView;
  send: (msg: BillardClientMessage) => void;
  unread: number;
  onOpenChat: () => void;
  onLeave: () => void;
  onBackToGame?: () => void;
}

export function formatLabel(s: BillardConfig): string {
  if (s.variant === "killer") return `${s.lives} vies`;
  if (s.variant === "carambole") return `${s.points} points${s.bandes ? `, ${s.bandes === 1 ? "une bande" : "trois bandes"}` : ""}`;
  return s.races > 1 ? `${s.races} manches gagnantes` : "une manche";
}

/** Le salon d'une table de billard : le salon commun, sa queue, et les règles de la partie. */
export function BillardLobby({ room, send, ...rest }: Props) {
  const s: BillardConfig = applyDrawnRules("billard", { ...DEFAULT_CONFIG, ...room.settings.billard }, DEFAULT_CONFIG, tableDraw(room));
  const locked = drawLock(room, "billard");
  const isHost = room.you.isHost;
  const update = (patch: Partial<BillardConfig>) => send({ t: "settings", settings: patch });
  const mine = room.you.seatId ? room.teams[room.you.seatId] : undefined;
  const ready = readySalles();
  const salleName = s.salle === "hasard" ? "salle au hasard" : SALLES[s.salle].name;
  const house = [s.larges ? "grandes poches" : null, s.glisse ? "tapis qui glisse" : null, s.rebonds ? "bandes folles" : null].filter(
    Boolean,
  );
  const teamsShown = s.teams || (s.variant === "huit" && room.seats.length > 2);
  const summary = [VARIANT_NAMES[s.variant], formatLabel(s), salleName, ...house, teamsShown ? "en équipes" : null]
    .filter(Boolean)
    .join(" · ");

  const rule = (key: RuleKey, title: string, hint: string) => (
    <div className={`rule-row ${locked(key) ? "is-forced" : ""}`} onClick={() => isHost && !locked(key) && update({ [key]: !s[key] })}>
      <Check label={title} checked={s[key]} disabled={!isHost || locked(key)} onChange={() => {}} />
      <span>
        <strong>{title}</strong>
        <span className="hint">{hint}</span>
      </span>
    </div>
  );

  return (
    <TableLobby
      room={room}
      send={send}
      {...rest}
      shareTitle="Viens faire un billard"
      startLabel="À la table !"
      hostWillStart="va lancer la partie"
      canStart={room.seats.length >= 1}
      startHint="Il faut au moins un joueur à la table (un habitué viendra jouer contre toi)."
      seatNote={(seat) => {
        const look = room.seats.find((x) => x.id === seat.id)?.look;
        const cue = look ? `Queue ${CUES.find((c) => c.id === look.cue)?.name.toLowerCase() ?? ""}` : null;
        return teamsShown ? `${cue ?? ""} · ${TOUR_TEAMS[room.teams[seat.id] ?? 0]}` : cue;
      }}
      summary={summary}
      aside={
        room.you.seatId && teamsShown ? (
          <section className="lobby-section panel field">
            <span className="field-label">Ton équipe</span>
            <Options<0 | 1>
              label="Ton équipe"
              value={mine ?? 0}
              onChange={(team) => send({ t: "team", team })}
              options={[
                { value: 0, label: TOUR_TEAMS[0] },
                { value: 1, label: TOUR_TEAMS[1] },
              ]}
            />
          </section>
        ) : null
      }
      rules={
        <>
          <RandomRulesField room={room} game="billard" send={send} />

          <div className="field">
            <span className="field-label">Le jeu</span>
            <Options<Variant>
              label="Le jeu"
              value={s.variant}
              disabled={!isHost || locked("variant")}
              onChange={(variant) => update({ variant })}
              options={(Object.keys(VARIANT_NAMES) as Variant[]).map((v) => ({ value: v, label: VARIANT_NAMES[v] }))}
            />
            <p className="hint" style={{ margin: 0 }}>
              {VARIANT_HINTS[s.variant]}
            </p>
          </div>

          {(s.variant === "huit" || s.variant === "neuf") && (
            <div className="field">
              <span className="field-label">Manches à gagner</span>
              <Options<number>
                label="Manches à gagner"
                value={s.races}
                disabled={!isHost || locked("races")}
                onChange={(races) => update({ races })}
                options={RACE_CHOICES.map((n) => ({ value: n, label: String(n) }))}
              />
              <p className="hint" style={{ margin: 0 }}>
                {s.races === 1
                  ? "Une seule manche : la noire (ou la 9) décide."
                  : `Le premier à ${s.races} manches gagne ; on casse chacun son tour.`}
              </p>
            </div>
          )}

          {s.variant === "killer" && (
            <div className="field">
              <span className="field-label">Vies</span>
              <Options<number>
                label="Vies"
                value={s.lives}
                disabled={!isHost || locked("lives")}
                onChange={(lives) => update({ lives })}
                options={LIVES_CHOICES.map((n) => ({ value: n, label: String(n) }))}
              />
            </div>
          )}

          {s.variant === "carambole" && (
            <>
              <div className="field">
                <span className="field-label">Points à atteindre</span>
                <Options<number>
                  label="Points à atteindre"
                  value={s.points}
                  disabled={!isHost || locked("points")}
                  onChange={(points) => update({ points })}
                  options={POINTS_CHOICES.map((n) => ({ value: n, label: String(n) }))}
                />
              </div>
              <div className="field">
                <span className="field-label">Bandes</span>
                <Options<number>
                  label="Bandes"
                  value={s.bandes}
                  disabled={!isHost || locked("bandes")}
                  onChange={(bandes) => update({ bandes })}
                  options={BANDES_CHOICES.map((n) => ({
                    value: n,
                    label: n === 0 ? "Partie libre" : n === 1 ? "Une bande" : "Trois bandes",
                  }))}
                />
                <p className="hint" style={{ margin: 0 }}>
                  {s.bandes === 0
                    ? "Ta bille touche les deux autres, peu importe comment."
                    : `Ta bille doit toucher ${s.bandes === 1 ? "une bande" : "trois bandes"} avant la seconde bille.`}
                </p>
              </div>
              <div className="field">
                <span className="field-label">Reprises au plus</span>
                <Options<number>
                  label="Reprises au plus"
                  value={s.innings}
                  disabled={!isHost || locked("innings")}
                  onChange={(innings) => update({ innings })}
                  options={INNINGS_CHOICES.map((n) => ({ value: n, label: String(n) }))}
                />
                <p className="hint" style={{ margin: 0 }}>
                  Au bout de {s.innings} tours de table, le plus de points gagne.
                </p>
              </div>
            </>
          )}

          <div className="field">
            <span className="field-label">Salle</span>
            <Options<SalleId | "hasard">
              label="Salle"
              value={s.salle}
              disabled={!isHost || locked("salle")}
              onChange={(salle) => update({ salle })}
              options={[{ value: "hasard", label: "Au hasard" }, ...ready.map((id) => ({ value: id, label: SALLES[id].name }))]}
            />
            <p className="hint" style={{ margin: 0 }}>
              {s.salle === "hasard" ? "Une salle tirée au sort à chaque partie." : SALLES[s.salle].blurb}
            </p>
          </div>

          {!room.tour && (
            <div className="field">
              <span className="field-label">Équipes</span>
              <div className="rule-list">
                <div className="rule-row" onClick={() => isHost && update({ teams: !s.teams })}>
                  <Check label="En équipes" checked={s.teams} disabled={!isHost} onChange={() => {}} />
                  <span>
                    <strong>En équipes</strong>
                    <span className="hint">
                      Les {TOUR_TEAMS[0]} contre les {TOUR_TEAMS[1]} : on joue à tour de rôle dans l'équipe. Aux pleines et rayées à plus de
                      deux, les équipes se font d'elles-mêmes.
                    </span>
                  </span>
                </div>
              </div>
            </div>
          )}
        </>
      }
      moreRules={
        <>
          <div className="field">
            <span className="field-label">Aide à la visée</span>
            <Options<Aide>
              label="Aide à la visée"
              value={s.aide}
              disabled={!isHost || locked("aide")}
              onChange={(aide) => update({ aide })}
              options={[
                { value: "longue", label: "Longue" },
                { value: "courte", label: "Courte" },
                { value: "aucune", label: "Aucune" },
              ]}
            />
            <p className="hint" style={{ margin: 0 }}>
              {AIDE_HINTS[s.aide]}
            </p>
          </div>

          <div className="field">
            <span className="field-label">Règles folles</span>
            <div className="rule-list">
              {rule("larges", "Grandes poches", "Des poches d'un tiers plus larges : tout rentre, ou presque.")}
              {rule("glisse", "Tapis qui glisse", "Les billes roulent deux fois plus loin.")}
              {rule("rebonds", "Bandes folles", "Les bandes rebondissent comme des ressorts.")}
            </div>
          </div>

          <div className="field">
            <span className="field-label">Temps par coup</span>
            <Options<Pace>
              label="Temps par coup"
              value={s.pace}
              disabled={!isHost || locked("pace")}
              onChange={(pace) => update({ pace })}
              options={[
                { value: "court", label: "Court" },
                { value: "normal", label: "Normal" },
                { value: "long", label: "Long" },
              ]}
            />
            <p className="hint" style={{ margin: 0 }}>
              {PACE_HINTS[s.pace]} Dix de plus avec la bille en main. Au-delà, un bot joue à ta place.
            </p>
          </div>

          <div className="field">
            <span className="field-label">Niveau des bots</span>
            <Options<BotLevel>
              label="Niveau des bots"
              value={s.botLevel}
              disabled={!isHost}
              onChange={(botLevel) => update({ botLevel })}
              options={[
                { value: "facile", label: "Facile" },
                { value: "moyen", label: "Moyen" },
                { value: "fort", label: "Fort" },
              ]}
            />
            <p className="hint" style={{ margin: 0 }}>
              {BOT_HINTS[s.botLevel]}
            </p>
          </div>

          <TableSize room={room} send={send} max={BILLARD_MAX_PLAYERS} />
        </>
      }
      look={room.you.seatId ? <LookPicker room={room} send={send} /> : undefined}
      help={
        <div className="lobby-help">
          <h2>Comment jouer</h2>
          <HowToPlay variant={s.variant} />
        </div>
      }
    />
  );
}
