// La présentation d'une coupe du championnat, avant la première course : son nom, ses circuits qui se dessinent un à
// un, puis Madame Pinson et Mistral. Un clic, Espace ou Entrée passe à la suite ; « Passer » va droit au départ.

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { CUPS, PORTRAITS, SPEAKERS, type CupId, type Line } from "../../../shared/games/bolides/campaign.ts";
import { mirrorOf, TRACKS } from "../../../shared/games/bolides/track.ts";
import { usePrefs } from "../../stores/prefs.ts";
import { play } from "../../lib/sound.ts";
import { AvatarDrawing } from "../../components/Avatar.tsx";
import { TrackMap } from "../TrackMap.tsx";
import { CUP_COLORS, CupBadge } from "./SoloRules.tsx";
import "./solo.css";

/** Le temps de lire une réplique avant qu'elle ne passe toute seule */
const LINE_MS = 5200;
const CHAR_MS = 22;

export function CupIntro({ cup, onDone, onCancel }: { cup: CupId; onDone: () => void; onCancel: () => void }) {
  const def = CUPS[cup];
  const reduced = usePrefs((s) => s.reducedEffects);
  // 0 : le titre ; 1 : les circuits ; 2… : les répliques
  const [step, setStep] = useState(0);
  const last = 1 + def.intro.length;
  const next = () => (step >= last ? onDone() : setStep((n) => n + 1));

  useEffect(() => {
    play(step === 0 ? "tourApplause" : "tourChip", { volume: step === 0 ? 0.5 : 0.35 });
    const auto = window.setTimeout(next, step === 0 ? 2600 : step === 1 ? 900 + def.tracks.length * 650 : LINE_MS);
    return () => window.clearTimeout(auto);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  const line = step >= 2 ? def.intro[step - 2] : undefined;
  return (
    <div
      className="bol-scene is-intro"
      style={{ "--cup": CUP_COLORS[cup] } as React.CSSProperties}
      role="dialog"
      aria-modal="true"
      aria-label={`Présentation de la ${def.name}`}
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
      <motion.div
        className="bol-scene-title"
        initial={reduced ? false : { opacity: 0, y: -16, scale: 0.94 }}
        animate={{ opacity: 1, y: step === 0 ? 0 : -6, scale: step === 0 ? 1 : 0.82 }}
        transition={{ type: "spring", stiffness: 160, damping: 18 }}
      >
        <span className="bol-scene-kicker">Championnat des Bolides</span>
        <CupBadge id={cup} size={step === 0 ? 92 : 56} />
        <h2>{def.name}</h2>
        <p>{def.tagline}</p>
      </motion.div>

      {step >= 1 && (
        <div className="bol-scene-tracks">
          {def.tracks.map((t, i) => (
            <motion.div
              key={t}
              className="bol-scene-track"
              initial={reduced ? false : { opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reduced ? 0 : 0.25 + i * 0.55 }}
            >
              <TrackMap id={def.mirror ? mirrorOf(t) : t} />
              <small>Course {i + 1}</small>
              <strong>{TRACKS[t].name}</strong>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence mode="wait">{line && <Speech key={step} line={line} reduced={reduced} />}</AnimatePresence>

      <p className="bol-scene-hint">Clique ou appuie sur Espace pour continuer</p>
    </div>
  );
}

/** Une réplique : le portrait, le nom, et le texte qui s'écrit */
export function Speech({ line, reduced }: { line: Line; reduced: boolean }) {
  const [shown, setShown] = useState(reduced ? line.text.length : 0);
  useEffect(() => {
    if (shown >= line.text.length) return;
    const t = window.setTimeout(() => setShown((n) => Math.min(line.text.length, n + 2)), CHAR_MS * 2);
    return () => window.clearTimeout(t);
  }, [shown, line.text.length]);
  const who = SPEAKERS[line.who];
  return (
    <motion.div
      className={`bol-speech is-${line.who}`}
      initial={reduced ? false : { opacity: 0, x: line.who === "mistral" ? 30 : -30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 22 }}
    >
      <AvatarDrawing avatar={PORTRAITS[line.who]} size={64} title={who.name} />
      <div className="bol-speech-text">
        <span className="bol-speech-name">
          {who.name} <small>{who.role}</small>
        </span>
        <p>
          {line.text.slice(0, shown)}
          <span className="bol-speech-rest" aria-hidden="true">
            {line.text.slice(shown)}
          </span>
        </p>
      </div>
    </motion.div>
  );
}
