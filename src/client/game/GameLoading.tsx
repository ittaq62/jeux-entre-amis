// L'écran de chargement commun à tous les jeux (voir shared/loadGate.ts) : aux couleurs du jeu, la vraie progression de
// son propre chargement, qui charge encore à la table, puis le compte à rebours. Un jeu peut y glisser son illustration
// ou ses astuces. Il reste affiché tant que son propre jeu n'est pas prêt, même si la partie est partie sans nous
// (un téléphone lent, un spectateur, ou qui arrive en cours de route).

import type { CSSProperties, ReactNode } from "react";
import type { AvatarConfig } from "../../shared/avatar.ts";
import type { LoadGate } from "../../shared/loadGate.ts";
import { Avatar } from "../components/Avatar.tsx";
import { useGateClock, type GateClock } from "../lib/loadGate.ts";
import { FirstSecondsPanel } from "./FirstSecondsPanel.tsx";
import "../styles/loading.css";

export interface LoadingTheme {
  /** Le fond, du haut vers le bas */
  from: string;
  to: string;
  /** La couleur de la barre et des coches */
  accent: string;
}

export interface LoadingPlayer {
  id: string;
  name: string;
  avatar?: AvatarConfig;
  userId?: string | null;
}

interface Props {
  /** Le nom du jeu (ou un titre dessiné) */
  title: ReactNode;
  theme: LoadingTheme;
  /** Son propre chargement, de 0 à 1, et ce qu'on prépare en ce moment */
  share: number;
  step?: string;
  /** Son jeu est prêt */
  done: boolean;
  /** Le départ commun, tel que la salle l'envoie (null : rien à attendre) */
  gate: LoadGate | null | undefined;
  serverOffset: number;
  /** Les joueurs de la table (les bots n'ont rien à charger) */
  players: readonly LoadingPlayer[];
  /** Son siège (null : on regarde) */
  me: string | null;
  /** Une illustration, des astuces : ce que le jeu veut montrer pendant l'attente */
  children?: ReactNode;
}

const STEPS = ["Le décor se construit…", "Les textures arrivent…", "Les effets se compilent…", "Dernières retouches…"];

export function GameLoading({ title, theme, share, step, done, gate, serverOffset, players, me, children }: Props) {
  const clock = useGateClock(gate, serverOffset);
  const waiting = new Set(gate && gate.goAt === null ? gate.waiting.filter((p) => !gate.loaded.includes(p)) : []);
  const pct = Math.round(Math.max(0, Math.min(1, done ? 1 : share)) * 100);
  const label = done ? "Prêt !" : (step ?? STEPS[Math.min(STEPS.length - 1, Math.floor(share * STEPS.length))]);
  const others = [...waiting].filter((p) => p !== me);
  const style = { "--load-from": theme.from, "--load-to": theme.to, "--load-accent": theme.accent } as CSSProperties;
  let status: string;
  if (clock.countdown !== null) status = "C'est parti dans…";
  else if (!done) status = "Préparation de la partie";
  else if (others.length > 0)
    status = `On attend ${others.length === 1 ? "un joueur" : `${others.length} joueurs`}${clock.left !== null ? ` (au plus ${clock.left} s)` : ""}`;
  else if (clock.passed) status = "La partie a commencé : on te rejoint";
  else status = "Tout le monde est prêt";

  return (
    <div className="game-loading" style={style} role="status" aria-live="polite">
      <div className="gl-card">
        <h2 className="gl-title">{title}</h2>
        {children && <div className="gl-art">{children}</div>}
        {clock.countdown !== null ? (
          <div className="gl-countdown num" key={clock.countdown}>
            {clock.countdown}
          </div>
        ) : (
          <div className="gl-progress" aria-label={`Chargement : ${pct} %`}>
            <div className="gl-bar">
              <i style={{ width: `${pct}%` }} />
            </div>
            <span className="gl-step">{label}</span>
          </div>
        )}
        <p className="gl-status">{status}</p>
        {players.length > 0 && gate && (
          <ul className="gl-players">
            {players.map((p) => {
              const ready = !waiting.has(p.id) || (p.id === me && done);
              return (
                <li key={p.id} className={ready ? "is-ready" : ""}>
                  {p.avatar && <Avatar avatar={p.avatar} userId={p.userId ?? undefined} size={28} />}
                  <span className="gl-name">{p.id === me ? "Toi" : p.name}</span>
                  <span className="gl-mark" aria-label={ready ? "prêt" : "charge encore"}>
                    {ready ? "✓" : <span className="gl-dots" />}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <FirstSecondsPanel />
    </div>
  );
}

/**
 * L'écran doit-il rester : son jeu n'est pas prêt, ou on attend encore les autres. Le compte à rebours, lui, se montre
 * par-dessus le jeu (GateCountdown) : on voit déjà la scène, la présentation peut jouer.
 */
export function loadingShown(done: boolean, clock: GateClock): boolean {
  return !done || (!clock.passed && clock.countdown === null);
}

/** Le compte à rebours du départ commun, en grand par-dessus le jeu */
export function GateCountdown({ countdown, accent }: { countdown: number | null; accent: string }) {
  if (countdown === null) return null;
  return (
    <div className="gate-countdown" style={{ "--load-accent": accent } as CSSProperties} role="status" aria-live="assertive">
      <span className="num" key={countdown}>
        {countdown}
      </span>
    </div>
  );
}
