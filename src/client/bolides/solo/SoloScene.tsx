// La scène de fin en solo, après le podium : la place au classement de la coupe et ses étoiles qui s'allument une à
// une, ce qu'en disent Madame Pinson et Mistral, la coupe qui s'ouvre ; ou, au contre-la-montre, le temps, les
// fantômes battus et le record. Un clic, Espace ou Entrée avance ; « Passer » va droit à la feuille des résultats.

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { ACHIEVEMENTS } from "../../../shared/achievements.ts";
import { CUPS, type SoloOutcome } from "../../../shared/games/bolides/campaign.ts";
import { mirrorOf, TRACKS, type TrackId } from "../../../shared/games/bolides/track.ts";
import { usePrefs } from "../../stores/prefs.ts";
import { play } from "../../lib/sound.ts";
import { TrackMap } from "../TrackMap.tsx";
import { Speech } from "./CupIntro.tsx";
import { CUP_COLORS, CupBadge } from "./SoloRules.tsx";
import { BigStar, raceTime } from "./Stars.tsx";
import "./solo.css";

const STAR_MS = 520;

/** Le nom d'un circuit, miroir compris */
function trackName(id: string): string {
  const base = id.replace("-miroir", "") as keyof typeof TRACKS;
  return `${TRACKS[base]?.name ?? id}${id.endsWith("-miroir") ? " en miroir" : ""}`;
}

export function SoloScene({
  outcome,
  targets,
  onDone,
}: {
  outcome: SoloOutcome;
  targets: { bronze: number; argent: number; or: number } | null;
  onDone: () => void;
}) {
  const reduced = usePrefs((s) => s.reducedEffects);
  const lines = outcome.kind === "coupe" ? (outcome.stars > 0 ? CUPS[outcome.cup].podium : CUPS[outcome.cup].missed) : [];
  // 0 : le résultat et les étoiles ; 1… : les répliques ; puis la coupe qui s'ouvre ; puis le bouton
  const unlockStep = outcome.kind === "coupe" && outcome.unlocked ? 1 + lines.length : -1;
  const last = 1 + lines.length + (unlockStep >= 0 ? 1 : 0);
  const [step, setStep] = useState(0);
  const [lit, setLit] = useState(reduced ? outcome.stars : 0);
  const next = () => (step >= last ? onDone() : setStep((n) => n + 1));

  // Les étoiles s'allument une à une, chacune un peu plus haut
  useEffect(() => {
    if (lit >= outcome.stars) return;
    const t = window.setTimeout(
      () => {
        setLit((n) => n + 1);
        play("tourChip", { volume: 0.6, rate: 1 + lit * 0.12 });
      },
      lit === 0 ? 700 : STAR_MS,
    );
    return () => window.clearTimeout(t);
  }, [lit, outcome.stars]);

  useEffect(() => {
    if (step === 0) play(outcome.stars > 0 ? "tourApplause" : "capLose", { volume: 0.55 });
    if (step === unlockStep) play("tourTrophyMine", { volume: 0.7 });
    if (step >= last) return;
    const wait = step === 0 ? 1400 + outcome.stars * STAR_MS : step === unlockStep ? 3200 : 5200;
    const auto = window.setTimeout(next, wait);
    return () => window.clearTimeout(auto);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter" || e.key === "Escape") {
        e.preventDefault();
        if (e.key === "Escape") onDone();
        else next();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  const color = outcome.kind === "coupe" ? CUP_COLORS[outcome.cup] : "#f2c94c";
  const line = step >= 1 && step <= lines.length ? lines[step - 1] : undefined;
  const unlocked = outcome.kind === "coupe" && outcome.unlocked ? CUPS[outcome.unlocked] : null;

  return (
    <div
      className="bol-scene is-outcome"
      style={{ "--cup": color } as React.CSSProperties}
      role="dialog"
      aria-modal="true"
      aria-label={outcome.kind === "coupe" ? `Fin de la ${CUPS[outcome.cup].name}` : "Fin du contre-la-montre"}
      onClick={next}
    >
      <div className="bol-scene-glow" aria-hidden="true" />
      <button
        className="btn btn-ghost bol-scene-skip"
        onClick={(e) => {
          e.stopPropagation();
          onDone();
        }}
      >
        Passer
      </button>

      {outcome.kind === "coupe" ? (
        <div className="bol-scene-title">
          <span className="bol-scene-kicker">{CUPS[outcome.cup].name} · classement final</span>
          <CupBadge id={outcome.cup} size={72} />
          <p className="bol-scene-big">{outcome.rank === 1 ? "Vainqueur !" : `${outcome.rank}e place`}</p>
          <p className="bol-scene-sub">
            {outcome.stars > outcome.before
              ? outcome.before > 0
                ? "Ton meilleur résultat sur cette coupe !"
                : outcome.stars > 0
                  ? "Ta première étoile sur cette coupe."
                  : "Le podium t'a échappé."
              : outcome.stars > 0
                ? `Ton record reste à ${outcome.before} étoile${outcome.before > 1 ? "s" : ""}.`
                : "Le podium t'a échappé."}
          </p>
        </div>
      ) : (
        <div className="bol-scene-title">
          <span className="bol-scene-kicker">Contre-la-montre · {trackName(outcome.track)}</span>
          <p className="bol-scene-big num">{raceTime(outcome.ms)}</p>
          <p className="bol-scene-sub">
            {outcome.refused
              ? "Ce temps n'est pas retenu : un tour est bien plus rapide que celui du fantôme d'or."
              : outcome.previous === null
                ? "Ton premier temps sur ce circuit."
                : outcome.ms < outcome.previous
                  ? `Nouveau record ! ${((outcome.previous - outcome.ms) / 1000).toFixed(1)} s de mieux.`
                  : `Ton record reste ${raceTime(outcome.previous)}.`}
          </p>
        </div>
      )}

      <div className="bol-scene-stars" aria-label={`${outcome.stars} étoile${outcome.stars > 1 ? "s" : ""} sur 3`}>
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            animate={i < lit && !reduced ? { scale: [0.4, 1.25, 1], rotate: [0, -12, 0] } : {}}
            transition={{ duration: 0.45 }}
          >
            <BigStar on={i < lit} size={68} />
          </motion.span>
        ))}
      </div>

      {/* Les nouvelles étoiles rapportent des points, et parfois un succès */}
      {lit >= outcome.stars && ((outcome.points ?? 0) > 0 || (outcome.trophies?.length ?? 0) > 0) && (
        <motion.div className="bol-scene-reward" initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          {(outcome.points ?? 0) > 0 && <strong className="num">+{outcome.points} points</strong>}
          {outcome.trophies?.map((id) => (
            <span key={id}>Succès : {ACHIEVEMENTS.find((a) => a.id === id)?.title ?? id}</span>
          ))}
        </motion.div>
      )}

      {outcome.kind === "chrono" && targets && (
        <ul className="bol-scene-ghosts">
          {(
            [
              ["bronze", "Fantôme de bronze"],
              ["argent", "Fantôme d'argent"],
              ["or", "Fantôme d'or"],
            ] as const
          ).map(([key, name]) => {
            const beaten = !outcome.refused && outcome.ms <= targets[key];
            const gap = Math.abs(outcome.ms - targets[key]);
            return (
              <li key={key} className={beaten ? "is-beaten" : ""}>
                <span>{name}</span>
                <span className="num">{raceTime(targets[key])}</span>
                <strong className="num">
                  {beaten ? "−" : "+"}
                  {(gap / 1000).toFixed(1)} s
                </strong>
              </li>
            );
          })}
        </ul>
      )}

      <AnimatePresence mode="wait">{line && <Speech key={step} line={line} reduced={reduced} />}</AnimatePresence>

      {unlocked && step >= unlockStep && (
        <motion.div
          className="bol-scene-unlock"
          style={{ "--unlock": CUP_COLORS[unlocked.id] } as React.CSSProperties}
          initial={reduced ? false : { opacity: 0, scale: 0.8, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 180, damping: 16 }}
        >
          <CupBadge id={unlocked.id} size={58} />
          <span>
            <small>Nouvelle coupe ouverte</small>
            <strong>{unlocked.name}</strong>
            <span className="bol-cup-maps">
              {unlocked.tracks.map((t) => (
                <TrackMap key={t} id={(unlocked.mirror ? mirrorOf(t) : t) as TrackId} className="is-tiny" />
              ))}
            </span>
          </span>
        </motion.div>
      )}

      {step >= last && (
        <button
          className="btn btn-primary btn-lg"
          onClick={(e) => {
            e.stopPropagation();
            onDone();
          }}
        >
          Voir les résultats
        </button>
      )}
      <p className="bol-scene-hint">Clique ou appuie sur Espace pour continuer</p>
    </div>
  );
}
