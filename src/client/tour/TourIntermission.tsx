import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { GAME_NAMES, type GameId } from "../../shared/protocol.ts";
import { fitsGame, type TourClientMessage, type TourView } from "../../shared/tour.ts";
import { Avatar } from "../components/Avatar.tsx";
import { ConfirmButton } from "../components/ui.tsx";
import { formatClock, useCountdown } from "../lib/countdown.ts";
import { play } from "../lib/sound.ts";
import { usePrefs } from "../stores/prefs.ts";
import { drawSchedule } from "./drawTiming.ts";
import { NextGameLooks } from "./TourLooks.tsx";
import { GameTicket, playedGames, ReadyVote, rulesName, Standings, TourTop } from "./TourParts.tsx";
import { TourRules } from "./TourRules.tsx";

interface Props {
  view: TourView;
  send: (msg: TourClientMessage) => void;
  serverOffset: number;
  unread: number;
  onOpenChat: () => void;
  onLeave: () => void;
}

/** Entre deux jeux : les résultats du jeu qui vient de finir, le classement, et le tirage du suivant. */
export function TourIntermission({ view, send, serverOffset, unread, onOpenChat, onLeave }: Props) {
  const last = playedGames(view).at(-1) ?? null;
  const left = useCountdown(view.next?.at ?? null, serverOffset);
  const isHost = view.you.isHost;
  const paused = view.next !== null && view.next.at === null;
  const players = view.members.filter((m) => m.role === "player" && !m.left && m.connected).length;
  // Comme au serveur : une place libre, ou un bot qui la cède
  const seated = view.members.filter((m) => m.role === "player" && !m.left);
  const canSit = seated.length < view.settings.maxPlayers || seated.some((m) => m.kind === "bot");
  const seatOf = (id: string) => view.members.find((m) => m.userId === id);
  const [now, setNow] = useState(() => Date.now() + serverOffset);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + serverOffset), 15_000);
    return () => clearInterval(t);
  }, [serverOffset]);
  // Le tirage révèle le jeu, puis vient le tour des règles ; un nouveau tirage repart de zéro
  const drawKey = view.next ? `${view.games.length}-${view.next.game}` : "";
  const [revealedKey, setRevealedKey] = useState("");
  const revealed = drawKey !== "" && revealedKey === drawKey;
  // Les dernières secondes du compte à rebours se font entendre
  const lastSeconds = !paused && !view.notice && left !== null && left > 0 && left <= 5;
  useEffect(() => {
    if (lastSeconds) play("tick", { volume: 0.55, rate: left === 1 ? 1.25 : 1 });
  }, [lastSeconds, left]);
  const lastRules = last && view.settings.rules !== "base" ? rulesName(last.game, last.variant) : null;

  return (
    <div className="felt page tour-page">
      <TourTop view={view} now={now} unread={unread} onOpenChat={onOpenChat} onLeave={onLeave} />
      <main className="tour-break">
        <div className="break-left">
          <section className="tour-draw panel" aria-label="Prochain jeu">
            <h2>{view.games.length === 0 ? "Premier jeu" : "Prochain jeu"}</h2>
            {view.next ? (
              <TourDraw
                key={drawKey}
                games={view.settings.games}
                pick={view.next.game}
                players={players}
                onDone={() => setRevealedKey(drawKey)}
              />
            ) : (
              <div className="tour-draw-row">
                {view.settings.games.map((g) => (
                  <GameTicket key={g} game={g} dim off={!fitsGame(g, Math.max(2, players))} />
                ))}
              </div>
            )}
            <TourRules view={view} send={send} revealed={revealed} />
            {/* Le jeu est connu : ses skins pour ce jeu-là, à changer avant le départ */}
            {revealed && view.next && view.you.role === "player" && <NextGameLooks game={view.next.game} games={view.settings.games} />}
            <div className={`tour-countdown ${lastSeconds ? "is-last" : ""}`} aria-live="polite">
              {view.notice ? (
                <p className="tour-notice">{view.notice}</p>
              ) : paused ? (
                <p>
                  <strong>En pause.</strong> {isHost ? "Relance quand tout le monde est prêt." : "L'hôte relancera la tournée."}
                </p>
              ) : view.next && left !== null ? (
                <p>
                  {/* Le nom du jeu n'est pas écrit ici : c'est le tirage qui le révèle */}
                  Départ dans{" "}
                  <strong key={lastSeconds ? left : "clock"} className="num countdown-num">
                    {left > 59 ? formatClock(left) : `${left} s`}
                  </strong>
                </p>
              ) : null}
            </div>
            {view.next && <ReadyVote view={view} send={send} action="le jeu est lancé" />}
            {isHost && (
              <div className="tour-host-actions">
                {view.next && !paused && (
                  <button className="btn btn-primary" onClick={() => send({ t: "launch" })}>
                    Lancer maintenant
                  </button>
                )}
                {view.next && !paused && (
                  <button className="btn" onClick={() => send({ t: "pause" })}>
                    Pause
                  </button>
                )}
                {(paused || !view.next) && (
                  <button className="btn btn-primary" onClick={() => send({ t: "resume" })}>
                    Reprendre
                  </button>
                )}
                <ConfirmButton className="btn btn-ghost" confirm="Terminer maintenant ?" onConfirm={() => send({ t: "finish" })}>
                  Terminer la tournée
                </ConfirmButton>
              </div>
            )}
            {view.you.member && view.you.role === "spectator" && canSit && (
              <button className="btn" onClick={() => send({ t: "sit" })}>
                Jouer au prochain jeu
              </button>
            )}
            {view.you.role === "player" && view.members.find((m) => m.userId === view.you.userId)?.waiting && (
              <p className="hint" style={{ margin: 0 }}>
                Tu entres dans la tournée au prochain jeu.
              </p>
            )}
          </section>

          {last?.results && (
            // Le dernier jeu : son podium ; les points de chacun sont dans le classement
            <section className="tour-last paper" aria-label="Résultats du dernier jeu">
              <GameTicket game={last.game} size="sm" />
              <div className="tour-last-text">
                <p className="tour-last-title">
                  {GAME_NAMES[last.game]}
                  <span>
                    {" "}
                    · jeu {last.index}
                    {lastRules ? ` · ${lastRules}` : ""}
                  </span>
                </p>
                <ol className="tour-last-podium">
                  {last.results
                    .filter((r) => r.rank <= 3)
                    .slice(0, 3)
                    .map((r) => {
                      const m = seatOf(r.userId);
                      return (
                        <li key={r.userId} className={r.userId === view.you.userId ? "is-me" : ""}>
                          <span className={`tour-last-rank place-${r.rank} num`}>{r.rank}</span>
                          {m && <Avatar avatar={m.avatar} userId={m.userId} photo={m.photo} size={22} />}
                          <span className="tour-last-name">{r.name}</span>
                          <b className="num">+{r.points}</b>
                        </li>
                      );
                    })}
                </ol>
              </div>
            </section>
          )}
        </div>

        <section className="tour-standings panel" aria-label="Classement de la tournée">
          <h2>Classement</h2>
          <Standings view={view} last={last} meId={view.you.userId} celebrate teams={view.settings.teams} />
        </section>
      </main>
    </div>
  );
}

/** Le tirage : les dés roulent, la lumière passe d'une affiche à l'autre, ralentit, et s'arrête sur le jeu tiré. */
function TourDraw({ games, pick, players, onDone }: { games: GameId[]; pick: GameId; players: number; onDone: () => void }) {
  const reduced = usePrefs((s) => s.reducedEffects);
  const target = Math.max(0, games.indexOf(pick));
  const [lit, setLit] = useState(reduced ? target : 0);
  const [done, setDone] = useState(reduced);
  // La tournée est rediffusée à chaque arrivée : le tirage ne repart que si le programme change vraiment
  const count = games.length;

  useEffect(() => {
    if (reduced || count <= 1) {
      setLit(target);
      setDone(true);
      onDone();
      return;
    }
    play("tourShake");
    // La durée est fixée d'avance selon le nombre de jeux (voir drawTiming.ts), les pas s'y répartissent
    const { steps, doneAt } = drawSchedule(count, target);
    const timers = steps.map(({ at, pos }) =>
      setTimeout(() => {
        setLit(pos);
        play("tick", { volume: 0.16 });
      }, at),
    );
    timers.push(
      setTimeout(() => {
        setDone(true);
        play("tourThrow");
        play("tourReveal", { delay: 120 });
        onDone();
      }, doneAt),
    );
    return () => timers.forEach(clearTimeout);
    // Le tirage ne repart que si le programme change vraiment, pas à chaque nouvelle vue
  }, [count, target, reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="tour-draw-row">
      {games.map((g, i) => (
        <motion.span
          key={g}
          animate={done && g === pick ? { scale: 1.08, y: -6 } : { scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 18 }}
        >
          <GameTicket
            game={g}
            lit={!done && i === lit}
            chosen={done && g === pick}
            dim={done && g !== pick}
            off={!fitsGame(g, Math.max(2, players))}
          />
        </motion.span>
      ))}
    </div>
  );
}
