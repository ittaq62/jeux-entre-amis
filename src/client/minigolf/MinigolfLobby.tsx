import type { BotLevel } from "../../shared/games/minigolf/bot.ts";
import { COURSES, readyCourses, type CourseId } from "../../shared/games/minigolf/courses.ts";
import { DEFAULT_CONFIG, HOLE_CHOICES, type MinigolfConfig, type Pace } from "../../shared/games/minigolf/match.ts";
import { MINIGOLF_MAX_PLAYERS, type MinigolfClientMessage, type MinigolfRoomView } from "../../shared/games/minigolf/net.ts";
import { applyDrawnRules } from "../../shared/randomRules.ts";
import { TOUR_TEAMS } from "../../shared/tour.ts";
import { colorOf } from "../../shared/games/minigolf/looks.ts";
import { Check, Options } from "../components/ui.tsx";
import { drawLock, RandomRulesField, tableDraw } from "../game/RandomRules.tsx";
import { TableLobby, TableSize } from "../game/TableLobby.tsx";
import { AdventurePanel, HoleStarStrip } from "./Adventure.tsx";
import { BallPicker } from "./BallPicker.tsx";
import { HowToPlay } from "./MinigolfHelp.tsx";

const BOT_HINTS: Record<BotLevel, string> = {
  facile: "Ils visent à peu près et dosent mal : souvent deux ou trois coups de plus que le par.",
  moyen: "Ils trouvent les bandes et dosent bien : autour du par.",
  fort: "Ils voient les raccourcis et réussissent des trous en un.",
};

const PACE_HINTS: Record<Pace, string> = {
  court: "Moins de temps à chaque trou : il faut jouer sans traîner.",
  normal: "De une minute et demie à deux minutes et demie par trou, selon le par.",
  long: "Tout le temps de viser.",
};

const TURN_HINTS: Record<Pace, string> = {
  court: "21 secondes pour jouer son coup.",
  normal: "30 secondes pour jouer son coup.",
  long: "45 secondes pour jouer son coup.",
};

interface Props {
  room: MinigolfRoomView;
  send: (msg: MinigolfClientMessage) => void;
  unread: number;
  onOpenChat: () => void;
  onLeave: () => void;
  onBackToGame?: () => void;
}

/** Le salon d'une table de minigolf : le salon commun, sa balle, et les règles de la partie. */
export function MinigolfLobby({ room, send, ...rest }: Props) {
  const s: MinigolfConfig = applyDrawnRules("minigolf", { ...DEFAULT_CONFIG, ...room.settings.minigolf }, DEFAULT_CONFIG, tableDraw(room));
  const locked = drawLock(room, "minigolf");
  const isHost = room.you.isHost;
  const update = (patch: Partial<MinigolfConfig>) => send({ t: "settings", settings: patch });
  const mine = room.you.seatId ? room.teams[room.you.seatId] : undefined;
  const ready = readyCourses();
  const courseName = s.course === "hasard" ? "parcours au hasard" : s.course === "melange" ? "trous mélangés" : COURSES[s.course].name;
  const house = [
    s.mirror ? "à l'envers" : null,
    s.lune ? "sur la lune" : null,
    s.glace ? "tout glisse" : null,
    s.bonus ? "bulles bonus" : null,
  ].filter(Boolean);
  const summary = [
    `${s.holes} trous`,
    courseName,
    s.turns ? "chacun son tour" : "tous en même temps",
    ...house,
    s.teams ? "en équipes" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const rule = (key: "mirror" | "lune" | "glace" | "bonus", title: string, hint: string) => (
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
      shareTitle="Viens faire un minigolf"
      startLabel="Au départ !"
      hostWillStart="va lancer la partie"
      canStart={room.seats.length >= 1}
      startHint="Il faut au moins un joueur au départ."
      seatNote={(seat) => {
        const look = room.seats.find((x) => x.id === seat.id)?.look;
        const color = look ? `Balle ${colorOf(look.color).name.toLowerCase()}` : null;
        return s.teams ? `${color ?? ""} · ${TOUR_TEAMS[room.teams[seat.id] ?? 0]}` : color;
      }}
      summary={summary}
      aside={
        <>
          {room.you.seatId && s.teams && (
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
          {/* L'aventure, en solo : pour l'hôte d'une table hors tournée */}
          {room.you.isHost && !room.tour && <AdventurePanel room={room} send={send} />}
        </>
      }
      rules={
        <>
          <RandomRulesField room={room} game="minigolf" send={send} />

          <div className="field">
            <span className="field-label">Parcours</span>
            <Options<CourseId | "hasard" | "melange">
              label="Parcours"
              value={s.course}
              disabled={!isHost || locked("course")}
              onChange={(course) => update({ course })}
              options={[
                { value: "hasard", label: "Au hasard" },
                ...ready.map((id) => ({ value: id, label: COURSES[id].name })),
                ...(ready.length > 1 ? [{ value: "melange" as const, label: "Mélange" }] : []),
              ]}
            />
            <p className="hint" style={{ margin: 0 }}>
              {s.course === "hasard"
                ? "Un parcours tiré au sort à chaque partie."
                : s.course === "melange"
                  ? "Des trous pris dans tous les parcours."
                  : COURSES[s.course].blurb}
            </p>
            {/* Les étoiles du parcours choisi, trou par trou */}
            {s.course !== "hasard" && s.course !== "melange" && <HoleStarStrip course={s.course} />}
            <p className="hint" style={{ margin: 0 }}>
              {s.bonus || s.lune || s.glace
                ? "Avec les bulles bonus, la lune ou la glace, les trous ne donnent pas d'étoiles."
                : "Chaque trou donne ses étoiles : une fini, deux au par, trois sous le par."}
            </p>
          </div>

          <div className="field">
            <span className="field-label">Trous</span>
            <Options<number>
              label="Trous"
              value={s.holes}
              disabled={!isHost || locked("holes")}
              onChange={(holes) => update({ holes })}
              options={HOLE_CHOICES.map((n) => ({ value: n, label: String(n) }))}
            />
            <p className="hint" style={{ margin: 0 }}>
              {s.holes === 18
                ? "Deux parcours de neuf trous à la suite."
                : s.holes === 9
                  ? "Un parcours entier, du premier au neuvième trou."
                  : `${s.holes} trous tirés dans le parcours.`}
            </p>
          </div>

          <div className="field">
            <span className="field-label">Déroulé</span>
            <Options<"tour" | "ensemble">
              label="Déroulé"
              value={s.turns === false ? "ensemble" : "tour"}
              disabled={!isHost || locked("turns")}
              onChange={(v) => update({ turns: v === "tour" })}
              options={[
                { value: "tour", label: "Chacun son tour" },
                { value: "ensemble", label: "Tous en même temps" },
              ]}
            />
            <p className="hint" style={{ margin: 0 }}>
              {s.turns !== false
                ? "Un coup chacun, à tour de rôle, pendant que les autres regardent ; on peut pousser la balle des autres. Au trou suivant, le meilleur commence."
                : "Tout le monde joue sa balle en même temps, les balles se traversent : plus rapide, plus chaotique."}
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
                      Les {TOUR_TEAMS[0]} contre les {TOUR_TEAMS[1]} : à chaque trou, seule la meilleure balle de l'équipe compte.
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
            <span className="field-label">{s.turns ? "Temps par coup" : "Temps par trou"}</span>
            <Options<Pace>
              label={s.turns ? "Temps par coup" : "Temps par trou"}
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
              {s.turns
                ? `${TURN_HINTS[s.pace]} Le temps écoulé, le coup compte quand même.`
                : `${PACE_HINTS[s.pace]} Quand la moitié des joueurs a fini, les autres ont encore 20 secondes.`}
            </p>
          </div>

          <div className="field">
            <span className="field-label">Règles maison</span>
            <div className="rule-list">
              {rule("mirror", "À l'envers", "Chaque trou se joue en miroir : la gauche devient la droite.")}
              {rule("lune", "Sur la lune", "La pesanteur fond : les sauts durent, les pentes poussent à peine.")}
              {rule("glace", "Tout glisse", "Le gazon devient patinoire : la balle roule bien plus loin.")}
              {rule(
                "bonus",
                "Bulles bonus",
                "Trois bulles par trou : en traverser une donne un pouvoir pour le coup suivant (force, aimant, fantôme, glisse, rebond).",
              )}
            </div>
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

          <TableSize room={room} send={send} max={MINIGOLF_MAX_PLAYERS} />
        </>
      }
      look={room.you.seatId ? <BallPicker room={room} send={send} /> : undefined}
      help={
        <div className="lobby-help">
          <h2>Comment jouer</h2>
          <HowToPlay />
        </div>
      }
    />
  );
}
