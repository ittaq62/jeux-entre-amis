import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { GAME_NAMES, type GameId } from "../../shared/protocol.ts";
import { fitsGame, type TourClientMessage, type TourView } from "../../shared/tour.ts";
import { Avatar } from "../components/Avatar.tsx";
import { ConfirmButton } from "../components/ui.tsx";
import { formatClock, useCountdown } from "../lib/countdown.ts";
import { play } from "../lib/sound.ts";
import { usePrefs } from "../stores/prefs.ts";
import { GameTicket, playedGames, ReadyVote, rulesName, Standings, TeamScore, TourTop } from "./TourParts.tsx";
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
          <section className="tour-last paper score-sheet" aria-label="Résultats du dernier jeu">
            <div className="tour-last-head">
              <GameTicket game={last.game} size="sm" />
              <div>
                <h2>{GAME_NAMES[last.game]}</h2>
                <p className="hint" style={{ margin: 0 }}>
                  Jeu {last.index}
                  {lastRules ? `, règles « ${lastRules} »` : ""}, les points qu'il rapporte
                </p>
              </div>
            </div>
            <ol className="score-lines">
              {last.results.map((r) => {
                const m = seatOf(r.userId);
                return (
                  <li key={r.userId} className={`${r.rank === 1 ? "is-winner" : ""} ${r.userId === view.you.userId ? "is-me" : ""}`}>
                    <span className="score-rank num">{r.rank}</span>
                    {m && <Avatar avatar={m.avatar} userId={m.userId} photo={m.photo} size={28} />}
                    <span className="score-name">{r.name}</span>
                    <span className="score-points num">+{r.points}</span>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        <section className="tour-standings panel" aria-label="Classement de la tournée">
          <h2>Classement</h2>
          {view.settings.teams && <TeamScore view={view} />}
          <Standings view={view} last={last} meId={view.you.userId} celebrate />
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
    const timers: ReturnType<typeof setTimeout>[] = [];
    const steps = count * 3 + target + 1;
    let at = 0;
    let gap = 70;
    for (let k = 0; k < steps; k++) {
      at += gap;
      gap *= 1.13;
      const pos = k % count;
      timers.push(
        setTimeout(() => {
          setLit(pos);
          play("tick", { volume: 0.16 });
        }, at),
      );
    }
    timers.push(
      setTimeout(() => {
        setDone(true);
        play("tourThrow");
        play("tourReveal", { delay: 120 });
        onDone();
      }, at + 260),
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
