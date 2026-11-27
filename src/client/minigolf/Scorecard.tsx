import { useEffect, useRef, type CSSProperties } from "react";
import { strokeLimit } from "../../shared/games/minigolf/course.ts";
import { COURSES, holeDef } from "../../shared/games/minigolf/courses.ts";
import { courseOpen, STAR_COURSES } from "../../shared/games/minigolf/starCourses.ts";
import { challengeDone, challengeOf } from "../../shared/games/minigolf/stars.ts";
import { colorOf, type BallLook } from "../../shared/games/minigolf/looks.ts";
import { totals } from "../../shared/games/minigolf/match.ts";
import type { MinigolfClientMessage, MinigolfRoomView } from "../../shared/games/minigolf/net.ts";
import { TOUR_TEAMS } from "../../shared/tour.ts";
import { ReportButton } from "../components/ReportButton.tsx";
import { EloLine } from "../game/EloLine.tsx";
import { useTourBridge } from "../tour/bridge.ts";
import { TourNextNote } from "../tour/TourNextNote.tsx";
import { Stars } from "../stars/Stars.tsx";
import { useGameStars, useStarsStore } from "../stores/stars.ts";
import { HoleStarStrip } from "./Adventure.tsx";

/** Le nom d'un score sur un trou */
export function scoreName(strokes: number, par: number): { text: string; tone: "great" | "good" | "info" | "bad" } {
  if (strokes === 1) return { text: "Trou en un !", tone: "great" };
  const d = strokes - par;
  if (d <= -3) return { text: "Albatros !", tone: "great" };
  if (d === -2) return { text: "Eagle !", tone: "great" };
  if (d === -1) return { text: "Birdie !", tone: "good" };
  if (d === 0) return { text: "Par", tone: "good" };
  if (d === 1) return { text: "Bogey", tone: "info" };
  if (d === 2) return { text: "Double bogey", tone: "bad" };
  return { text: `+${d}`, tone: "bad" };
}

/** La couleur d'une case : sous le par, au par, au-dessus */
function cellClass(strokes: number | null, par: number): string {
  if (strokes === null) return "";
  if (strokes === 1) return "is-ace";
  const d = strokes - par;
  return d < 0 ? "is-under" : d === 0 ? "is-par" : d === 1 ? "is-over" : "is-way-over";
}

export function Scorecard({
  room,
  players,
  final,
  countdown,
  send,
  onLeave,
  onShowLobby,
}: {
  room: MinigolfRoomView;
  players: { id: string; name: string; look: BallLook }[];
  final: boolean;
  countdown: number | null;
  send: (m: MinigolfClientMessage) => void;
  onLeave: () => void;
  onShowLobby: () => void;
}) {
  const inTour = Boolean(useTourBridge());
  const v = room.minigolf!;
  const pars = v.holes.map((h) => holeDef(h).par);
  const played = final ? v.holes.length : v.hole + 1;
  const tot = totals({ ...v, rng: 0 });
  const parSoFar = pars.slice(0, played).reduce((s, p) => s + p, 0);
  const ranks = v.ranks ?? null;
  const order = v.players.map((_, i) => i).sort((a, b) => (ranks ? ranks[a]! - ranks[b]! : tot[a]! - tot[b]!));
  const seated = room.you.seatId !== null;
  // Il regardait : une place libre (ou celle d'un bot, qui la lui cède) pour la partie suivante, d'un clic, avant que la
  // revanche ne parte sans lui
  const canSit =
    final &&
    !seated &&
    !inTour &&
    room.status === "finished" &&
    (room.seats.length < room.settings.maxPlayers || room.seats.some((s) => s.kind === "bot"));
  const asked = room.rematch.includes(room.you.userId);
  const winners = ranks ? order.filter((i) => ranks[i] === 1) : [];
  // À égalité en tête : qui (toi d'abord), plutôt qu'un « Égalité ! » qui ne dit pas si l'on en est
  const tied = winners
    .map((i) => v.players[i]!.id)
    .sort((a, b) => Number(b === room.you.seatId) - Number(a === room.you.seatId))
    .map((id) => (id === room.you.seatId ? "Toi" : (players.find((p) => p.id === id)?.name ?? "?")));
  const tiedTitle = tied.length <= 3 ? `${tied.slice(0, -1).join(", ")} et ${tied[tied.length - 1]} à égalité !` : "Égalité en tête !";
  const course = COURSES[v.holes[0]!.c];
  // Les étoiles des trous gagnées à la fin (la salle les a comptées) : notées tout de suite pour les menus
  const myStars = final ? room.stars?.[room.you.userId] : undefined;
  useEffect(() => {
    if (myStars) for (const r of myStars.results) useStarsStore.getState().apply(r);
  }, [myStars]);
  const freshStars = myStars ? myStars.results.reduce((n, r) => n + Math.max(0, r.stars - r.previous), 0) : 0;
  const oneCourse = v.holes.every((h) => h.c === v.holes[0]!.c) ? v.holes[0]!.c : null;
  // L'aventure : les défis de chaque trou, le parcours suivant s'il vient de s'ouvrir
  const adventure = Boolean(v.cfg.adventure);
  const me = v.players.find((p) => p.id === room.you.seatId);
  const challenges = adventure
    ? v.holes.map((ref, h) => {
        const ch = challengeOf(ref.c, ref.i);
        const strokes = me?.scores[h];
        const par = pars[h]!;
        const feat = me?.feats?.[h];
        const ok = strokes != null && challengeDone(ch, { strokes, par, lost: feat?.lost ?? 0, bank: feat?.bank ?? false });
        return { ch, ok, played: strokes != null && strokes <= strokeLimit(par) };
      })
    : [];
  const stars = useGameStars("minigolf");
  const k = STAR_COURSES.findIndex((c) => c.id === course.id);
  const next = k >= 0 && k + 1 < STAR_COURSES.length ? STAR_COURSES[k + 1]! : null;
  const nextOpen = next ? courseOpen(stars, next.id) : false;
  const myTotal = me ? me.scores.reduce<number>((n, x) => n + (x ?? 0), 0) : 0;
  const title = final
    ? adventure
      ? `${course.name} : ${myTotal} coups`
      : winners.length === 0
        ? "Partie finie"
        : v.cfg.teams
          ? `Victoire des ${TOUR_TEAMS[v.players[winners[0]!]!.team]} !`
          : winners.length === 1
            ? v.players[winners[0]!]!.id === room.you.seatId
              ? "Tu gagnes !"
              : `${players.find((p) => p.id === v.players[winners[0]!]!.id)?.name ?? "?"} gagne !`
            : tiedTitle
    : `Après le trou ${v.hole + 1}`;
  // Sur un écran étroit, le tableau défile entre les noms et le total, qui restent : il montre le trou qui vient de se jouer
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const w = wrap.current;
    const cur = w?.querySelector<HTMLElement>("th.is-current");
    if (!w || !cur) return;
    const total = w.querySelector<HTMLElement>("th.mg-total-col")?.offsetWidth ?? 0;
    w.scrollLeft = Math.max(0, cur.offsetLeft + cur.offsetWidth + total + 8 - w.clientWidth);
  }, [v.hole, final]);

  return (
    <div className={`mg-scores ${final ? "is-final" : ""}`}>
      <div className="mg-scores-card panel">
        <h1>{title}</h1>
        <p className="hint" style={{ margin: 0 }}>
          {v.holes.length} trous · {v.cfg.course === "melange" ? "mélange de parcours" : course.name}
          {countdown !== null && (v.hole + 1 < v.holes.length ? ` · trou suivant dans ${countdown} s` : ` · résultats dans ${countdown} s`)}
        </p>
        {final && !adventure && <EloLine result={room.results?.[room.you.userId]} />}
        {myStars && (
          <div className={`mg-stars-won ${freshStars > 0 ? "is-new" : ""}`}>
            <Stars value={Math.min(3, Math.max(1, freshStars))} size={22} fresh={Math.min(3, freshStars)} />
            <p style={{ margin: 0 }}>
              {freshStars > 0 ? (
                <>
                  <strong>{freshStars === 1 ? "Une nouvelle étoile" : `${freshStars} nouvelles étoiles`}</strong>{" "}
                  <span className="num">+{myStars.points} points</span>
                </>
              ) : (
                "Pas de nouvelle étoile cette fois : fais mieux que ton record sur un trou."
              )}
            </p>
            {oneCourse && <HoleStarStrip course={oneCourse} />}
          </div>
        )}
        <div className="mg-table-wrap" ref={wrap}>
          <table className="mg-table">
            <thead>
              <tr>
                <th className="mg-name-col">Trou</th>
                {pars.map((_, h) => (
                  <th key={h} className={h === v.hole && !final ? "is-current" : ""}>
                    {h + 1}
                  </th>
                ))}
                <th className="mg-total-col">Total</th>
              </tr>
              <tr className="mg-par-row">
                <th className="mg-name-col">Par</th>
                {pars.map((p, h) => (
                  <td key={h}>{p}</td>
                ))}
                <td className="mg-total-col">{parSoFar}</td>
              </tr>
            </thead>
            <tbody>
              {order.map((i) => {
                const p = v.players[i]!;
                const info = players.find((x) => x.id === p.id);
                const t = p.scores.reduce<number>((s, x) => s + (x ?? 0), 0);
                const diff = t - parSoFar;
                return (
                  <tr key={p.id} className={`${p.id === room.you.seatId ? "is-me" : ""} ${ranks?.[i] === 1 ? "is-first" : ""}`}>
                    <th className="mg-name-col">
                      <span className="mg-dot" style={{ "--c": colorOf(info?.look.color ?? "blanche").hex } as CSSProperties} />
                      {ranks && <span className="mg-rank num">{ranks[i]}</span>}
                      {info?.name ?? "?"}
                      {v.cfg.teams && <small> · {TOUR_TEAMS[p.team]}</small>}
                    </th>
                    {p.scores.map((s, h) => (
                      <td key={h} className={`num ${cellClass(s, pars[h]!)}`}>
                        {s ?? ""}
                      </td>
                    ))}
                    <td className="num mg-total mg-total-col">
                      {v.cfg.teams ? tot[i] : t}
                      <small>{diff === 0 ? "=" : diff > 0 ? `+${diff}` : diff}</small>
                    </td>
                  </tr>
                );
              })}
              {adventure && (
                <tr className="mg-challenge-row">
                  <th className="mg-name-col">Défis</th>
                  {challenges.map((c, h) => (
                    <td key={h} className={c.ok ? "is-ok" : ""} title={c.ch.text}>
                      {c.ok ? "✓" : c.played ? "·" : ""}
                    </td>
                  ))}
                  <td className="num mg-total-col">
                    {challenges.filter((c) => c.ok).length}/{challenges.length}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {final && (
          <>
            {inTour ? (
              <TourNextNote />
            ) : (
              !seated && (
                <p className="hint" style={{ margin: 0 }}>
                  {canSit
                    ? "Tu regardais cette partie : prends une place pour jouer la suivante."
                    : "Tu regardes cette partie ; la table est complète pour l'instant."}
                </p>
              )
            )}
            <div className="mg-scores-actions">
              {canSit && (
                <button className="btn btn-primary" onClick={() => send({ t: "sit" })}>
                  Prendre une place
                </button>
              )}
              {adventure && room.you.isHost && next && nextOpen && (
                <button className="btn btn-primary" onClick={() => send({ t: "adventure", course: next.id })}>
                  Parcours suivant : {next.name}
                </button>
              )}
              {adventure && room.you.isHost && (
                <button
                  className={`btn ${next && nextOpen ? "" : "btn-primary"}`}
                  onClick={() => send({ t: "adventure", course: course.id })}
                >
                  Rejouer ce parcours
                </button>
              )}
              {!inTour && seated && !adventure && (
                <button className="btn btn-primary" disabled={asked} onClick={() => send({ t: "rematch" })}>
                  {asked ? "En attente des autres" : "Revanche"}
                </button>
              )}
              {!inTour && (
                <button className="btn" onClick={onShowLobby}>
                  {room.you.isHost ? "Changer les règles" : "Voir le salon"}
                </button>
              )}
              <button className="btn btn-ghost" onClick={onLeave}>
                {inTour ? "Quitter la tournée" : "Quitter"}
              </button>
            </div>
            <ReportButton
              game="minigolf"
              variant={`Minigolf, ${v.holes.length} trous, ${v.cfg.course === "melange" ? "mélange" : course.name}`}
              code={room.code}
              role={seated ? "player" : "watcher"}
            />
          </>
        )}
      </div>
    </div>
  );
}
