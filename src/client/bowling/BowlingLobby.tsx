import { useState } from "react";
import {
  DEFAULT_CONFIG,
  FRAME_CHOICES,
  ROUND_CHOICES,
  type BotLevel,
  type BowlingConfig,
  type Mode,
  type Pace,
} from "../../shared/games/bowling/match.ts";
import { BOWLING_MAX_PLAYERS, type BowlingClientMessage, type BowlingRoomView } from "../../shared/games/bowling/net.ts";
import { colorOf } from "../../shared/games/bowling/looks.ts";
import { readySalles, SALLES, type SalleId } from "../../shared/games/bowling/salles.ts";
import { applyDrawnRules } from "../../shared/randomRules.ts";
import { TOUR_TEAMS } from "../../shared/tour.ts";
import { Check, Options } from "../components/ui.tsx";
import { drawLock, RandomRulesField, tableDraw } from "../game/RandomRules.tsx";
import { TableLobby, TableSize } from "../game/TableLobby.tsx";
import { DEFAULT_LOOK } from "../../shared/games/bowling/looks.ts";
import { HowToPlay } from "./BowlingHelp.tsx";
import { LookPicker } from "./LookPicker.tsx";
import { Practice } from "./Practice.tsx";

const BOT_HINTS: Record<BotLevel, string> = {
  facile: "Ils lancent un peu n'importe comment : autour de 110.",
  moyen: "Ils trouvent la poche une fois sur deux : autour de 145.",
  fort: "De l'effet, la poche, des strikes en série : autour de 200.",
};

const PACE_HINTS: Record<Pace, string> = {
  court: "20 secondes pour lancer.",
  normal: "30 secondes pour lancer.",
  long: "Une minute pour lancer.",
};

type RuleKey = "bumpers" | "geante" | "glisse" | "lune" | "pronostics";

interface Props {
  room: BowlingRoomView;
  send: (msg: BowlingClientMessage) => void;
  unread: number;
  onOpenChat: () => void;
  onLeave: () => void;
  onBackToGame?: () => void;
}

/** Le salon d'une table de bowling : le salon commun, sa boule, et les règles de la partie. */
export function BowlingLobby({ room, send, ...rest }: Props) {
  const s: BowlingConfig = applyDrawnRules("bowling", { ...DEFAULT_CONFIG, ...room.settings.bowling }, DEFAULT_CONFIG, tableDraw(room));
  const locked = drawLock(room, "bowling");
  const isHost = room.you.isHost;
  const update = (patch: Partial<BowlingConfig>) => send({ t: "settings", settings: patch });
  const mine = room.you.seatId ? room.teams[room.you.seatId] : undefined;
  // Le lancer d'essai, pendant l'attente (pour qui est assis, tant que la partie n'est pas lancée)
  const [practice, setPractice] = useState(false);
  const me = room.you.seatId ? room.seats.find((x) => x.id === room.you.seatId) : undefined;
  const canPractice = Boolean(me) && room.status !== "playing";
  const ready = readySalles();
  const salleName = s.salle === "hasard" ? "salle au hasard" : SALLES[s.salle].name;
  const house = [
    s.bumpers ? "barrières" : null,
    s.geante ? "boule géante" : null,
    s.glisse ? "piste qui glisse" : null,
    s.lune ? "sur la lune" : null,
  ].filter(Boolean);
  const summary = [
    s.mode === "spares" ? `défi des spares, ${s.frames} manches` : `${s.frames} frames`,
    salleName,
    ...house,
    s.teams ? "en équipes" : null,
  ]
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
    <>
      <TableLobby
        room={room}
        send={send}
        {...rest}
        shareTitle="Viens faire un bowling"
        startLabel="Sur la piste !"
        hostWillStart="va lancer la partie"
        canStart={room.seats.length >= 1}
        startHint="Il faut au moins un joueur sur la piste."
        seatNote={(seat) => {
          const look = room.seats.find((x) => x.id === seat.id)?.look;
          const color = look ? `Boule ${colorOf(look.color).name.toLowerCase()}${look.left ? ", gaucher" : ""}` : null;
          return s.teams ? `${color ?? ""} · ${TOUR_TEAMS[room.teams[seat.id] ?? 0]}` : color;
        }}
        summary={summary}
        aside={
          room.you.seatId && (s.teams || canPractice) ? (
            <>
              {s.teams && (
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
              )}
              {canPractice && (
                <section className="lobby-section panel bw-practice-card">
                  <span className="bw-practice-text">
                    <strong>En attendant les autres</strong>
                    <small className="hint">
                      Fais-toi la main sur ta propre piste, dans la salle de la table. Rien ne compte, et la partie lancée, tu y es.
                    </small>
                  </span>
                  <button className="btn btn-primary" onClick={() => setPractice(true)}>
                    Lancer d'essai
                  </button>
                </section>
              )}
            </>
          ) : null
        }
        rules={
          <>
            <RandomRulesField room={room} game="bowling" send={send} />

            <div className="field">
              <span className="field-label">Partie</span>
              <Options<Mode>
                label="Partie"
                value={s.mode}
                disabled={!isHost || locked("mode")}
                onChange={(mode) => update({ mode, frames: mode === "spares" ? 5 : 10 })}
                options={[
                  { value: "classique", label: "Classique" },
                  { value: "spares", label: "Défi des spares" },
                ]}
              />
              <p className="hint" style={{ margin: 0 }}>
                {s.mode === "spares"
                  ? "À chaque manche, tout le monde a les mêmes quilles à abattre en une seule boule : une quille, puis des splits. Un point par quille, cinq de plus si tout tombe."
                  : "Deux boules par frame, strikes et spares comptés comme au vrai bowling."}
              </p>
            </div>

            <div className="field">
              <span className="field-label">{s.mode === "spares" ? "Manches" : "Frames"}</span>
              <Options<number>
                label={s.mode === "spares" ? "Manches" : "Frames"}
                value={s.frames}
                disabled={!isHost || locked("frames")}
                onChange={(frames) => update({ frames })}
                options={(s.mode === "spares" ? ROUND_CHOICES : FRAME_CHOICES).map((n) => ({ value: n, label: String(n) }))}
              />
              <p className="hint" style={{ margin: 0 }}>
                {s.mode === "spares"
                  ? `${s.frames} manches, de plus en plus difficiles.`
                  : s.frames === 10
                    ? "Une vraie partie : la dixième frame donne des boules en plus après un strike ou un spare."
                    : `Une partie courte : la ${s.frames === 3 ? "troisième" : "cinquième"} frame fait office de dixième.`}
              </p>
            </div>

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
                        Les {TOUR_TEAMS[0]} contre les {TOUR_TEAMS[1]} : on lance chacun son tour, les scores de l'équipe s'additionnent.
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
              <span className="field-label">Règles folles</span>
              <div className="rule-list">
                {rule("bumpers", "Barrières", "Des barrières le long des rigoles : la boule rebondit au lieu d'y tomber.")}
                {rule("geante", "Boule géante", "Une boule énorme et lourde : les quilles n'ont aucune chance… presque.")}
                {rule("glisse", "Piste qui glisse", "La piste est huilée d'un bout à l'autre : plus aucune boule ne courbe.")}
                {rule("lune", "Sur la lune", "La pesanteur fond : les quilles s'envolent et retombent tout doucement.")}
              </div>
            </div>

            <div className="field">
              <span className="field-label">Pronostics</span>
              <div className="rule-list">
                {rule(
                  "pronostics",
                  "Pronostics",
                  "Pendant qu'un joueur lance, les autres parient : strike, il en reste, la cata (ou spare, raté). Un classement des devins à la fin.",
                )}
              </div>
            </div>

            <div className="field">
              <span className="field-label">Temps pour lancer</span>
              <Options<Pace>
                label="Temps pour lancer"
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
                {PACE_HINTS[s.pace]} Au-delà, un bot lance à ta place.
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

            <TableSize room={room} send={send} max={BOWLING_MAX_PLAYERS} />
          </>
        }
        look={room.you.seatId ? <LookPicker room={room} send={send} /> : undefined}
        help={
          <div className="lobby-help">
            <h2>Comment jouer</h2>
            <HowToPlay />
          </div>
        }
      />
      {practice && me && canPractice && (
        <Practice rules={s} name={me.name} avatar={me.avatar} look={me.look ?? DEFAULT_LOOK} onClose={() => setPractice(false)} />
      )}
    </>
  );
}
