import confetti from "canvas-confetti";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { GAME_NAMES } from "../../shared/protocol.ts";
import { teamScores, TOUR_TEAM_COLORS, TOUR_TEAMS, type TourClientMessage, type TourView } from "../../shared/tour.ts";
import { Avatar } from "../components/Avatar.tsx";
import { usePrefs } from "../stores/prefs.ts";
import { GameTicket, playedGames, rulesName, Standings, standingsOf, TeamDuel, TourTop } from "./TourParts.tsx";
import { TourTrophies } from "./TourTrophies.tsx";

interface Props {
  view: TourView;
  send: (msg: TourClientMessage) => void;
  serverOffset: number;
  unread: number;
  onOpenChat: () => void;
  onLeave: () => void;
}

/** La fin de la tournée : le podium, les titres, et le récapitulatif jeu par jeu. */
export function TourFinale({ view, send, serverOffset, unread, onOpenChat, onLeave }: Props) {
  const reduced = usePrefs((s) => s.reducedEffects);
  const rows = standingsOf(view, null);
  const podium = rows.filter((r) => r.rank <= 3).slice(0, 3);
  const games = playedGames(view);
  const [red, blue] = teamScores(view.members);
  const winnerTeam = view.settings.teams && red !== blue ? (red > blue ? 0 : 1) : null;
  const me = view.members.find((m) => m.userId === view.you.userId);
  const won = view.settings.teams ? me?.team === winnerTeam && winnerTeam !== null : rows[0]?.member.userId === view.you.userId;

  useEffect(() => {
    if (!won || reduced) return;
    const colors = ["#e2bd6e", "#f4ecda", "#d4453c", "#3f7fd8", "#2fa864"];
    const t = setTimeout(
      () => confetti({ particleCount: 120, spread: 90, startVelocity: 42, origin: { y: 0.3 }, colors, scalar: 0.95 }),
      700,
    );
    return () => clearTimeout(t);
  }, [won, reduced]);

  // Le podium dans l'ordre du théâtre : 2e à gauche, 1er au centre, 3e à droite
  const stage = [podium[1], podium[0], podium[2]].filter(Boolean);
  const hasTitles = Boolean(view.titles && view.titles.length > 0);
  // Sur téléphone, un onglet à la fois : tout tient sur l'écran
  const [tab, setTab] = useState<"classement" | "trophees" | "jeux">("classement");
  const tabs: ["classement" | "trophees" | "jeux", string][] = [
    ["classement", "Classement"],
    ...(hasTitles ? [["trophees", "Trophées"] as ["trophees", string]] : []),
    ["jeux", "Jeu par jeu"],
  ];
  const pane = (id: typeof tab) => `finale-pane ${tab === id ? "is-active" : ""}`;

  // Tout tient sur l'écran : un classement trop long défile dans son cadre, et l'on y voit d'emblée sa propre ligne
  const standingsBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = standingsBox.current;
    const row = box?.querySelector<HTMLElement>(".standing-row.is-me");
    if (!box || !row) return;
    const below = row.getBoundingClientRect().bottom - box.getBoundingClientRect().bottom;
    if (below > 0) box.scrollTop += below + 6;
  }, []);

  return (
    <div className="felt page tour-page tour-finale-page">
      <TourTop view={view} now={Date.now() + serverOffset} unread={unread} onOpenChat={onOpenChat} onLeave={onLeave} />
      <main className="tour-finale">
        <h2 className="tour-finale-title">
          <span className="script-word">Rideau !</span>
          {view.settings.teams
            ? winnerTeam === null
              ? " Égalité parfaite."
              : ` Victoire des ${TOUR_TEAMS[winnerTeam]}.`
            : rows[0]
              ? ` ${rows[0].member.name} remporte la tournée.`
              : " La tournée s'arrête là."}
        </h2>

        {view.settings.teams && <TeamDuel members={view.members} final />}

        <div className="tour-finale-grid">
          <div className="finale-col">
            {stage.length > 0 && (
              <div className="podium" aria-label="Podium">
                {stage.map((p, i) => (
                  <motion.div
                    key={p!.member.userId}
                    className={`podium-place place-${p!.rank}`}
                    initial={{ y: 40, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.25 + (p!.rank === 1 ? 0.5 : i * 0.2), type: "spring", stiffness: 220, damping: 20 }}
                    style={p!.member.team !== null ? { ["--team" as string]: TOUR_TEAM_COLORS[p!.member.team] } : undefined}
                  >
                    <Avatar avatar={p!.member.avatar} userId={p!.member.userId} photo={p!.member.photo} size={p!.rank === 1 ? 56 : 46} />
                    <strong className="podium-name">{p!.member.name}</strong>
                    <span className="podium-points num">{p!.member.points} pts</span>
                    <span className="podium-step num">{p!.rank}</span>
                  </motion.div>
                ))}
              </div>
            )}
            {tabs.length > 1 && (
              <div className="finale-tabs" role="tablist" aria-label="Ce qu'on regarde">
                {tabs.map(([id, label]) => (
                  <button
                    key={id}
                    role="tab"
                    aria-selected={tab === id}
                    className={`finale-tab ${tab === id ? "is-active" : ""}`}
                    onClick={() => setTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            <section className={`tour-standings panel ${pane("classement")}`} aria-label="Classement final">
              <h2>Classement final</h2>
              <div className="finale-scroll" ref={standingsBox}>
                <Standings view={view} last={null} meId={view.you.userId} />
              </div>
            </section>
          </div>

          <div className="finale-col">
            {hasTitles && (
              <section className={`tour-trophies panel ${pane("trophees")}`} aria-label="Les trophées de la tournée">
                <h2>Les trophées</h2>
                <div className="finale-scroll">
                  <TourTrophies titles={view.titles!} members={view.members} meId={view.you.userId} />
                </div>
              </section>
            )}
            <section className={`tour-recap panel ${pane("jeux")}`} aria-label="Jeu par jeu">
              <h2>Jeu par jeu</h2>
              {games.length === 0 ? (
                <p className="hint">Aucun jeu n'est allé au bout.</p>
              ) : (
                <ol className="tour-recap-list finale-scroll">
                  {games.map((g) => {
                    const winners = (g.results ?? []).filter((r) => r.rank === 1).map((r) => r.name);
                    const rules = view.settings.rules !== "base" ? rulesName(g.game, g.variant) : null;
                    return (
                      <li key={g.code}>
                        <GameTicket game={g.game} size="sm" />
                        <span>
                          <strong>
                            {g.index}. {GAME_NAMES[g.game]}
                            {rules && <span className="recap-rules"> · {rules}</span>}
                          </strong>
                          <span className="hint">{winners.length > 0 ? `gagné par ${winners.join(" et ")}` : "sans vainqueur"}</span>
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          </div>
        </div>

        <div className="tour-finale-actions">
          {view.you.isHost && (
            <button className="btn btn-primary btn-lg" onClick={() => send({ t: "again" })}>
              Nouvelle tournée
            </button>
          )}
          <button className="btn btn-lg" onClick={onLeave}>
            Retour à l'accueil
          </button>
        </div>
        {!view.you.isHost && <p className="hint center-text tour-finale-note">L'hôte peut relancer une tournée avec la même bande.</p>}
      </main>
    </div>
  );
}
