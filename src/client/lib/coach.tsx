// Le coach des jeux d'adresse : une main fantôme qui mime le geste sur la vraie commande (se placer, viser, reculer,
// pousser, lâcher), pendant les premiers tours d'un joueur (trois au plus), et qui s'en va pour de bon dès sa première
// réussite. On apprend en faisant : la main montre, le joueur refait. Dès que le joueur touche l'écran, elle s'efface
// le temps qu'il agisse.
//
// Pour un jeu : décrire les étapes (où la main appuie, glisse et lâche, en fractions de l'écran du jeu), poser
// <Coach id="…" active={c'est à lui et il peut jouer} steps={…} /> dans l'écran de jeu, et appeler coachDone(id) à la
// première réussite. Ce qui a été vu est gardé sur l'appareil, et sur le compte dès qu'on branche setCoachStore.

import { useEffect, useRef, useState, type CSSProperties } from "react";

/** Un point du geste : où est le doigt (0..1 sur la largeur et la hauteur de l'écran du jeu), à quel moment (ms) */
export interface CoachPoint {
  x: number;
  y: number;
  t: number;
  /** Le doigt appuie (sinon il survole) */
  down?: boolean;
}

export interface CoachStep {
  /** Ce que dit la bulle pendant cette étape */
  say: string;
  path: CoachPoint[];
}

/** Au plus tant de tours avec la main, même sans réussite */
export const COACH_MAX_TURNS = 3;
const PAUSE = 700;

export interface CoachStore {
  seen(): string[];
  mark(id: string): void;
}

const SEEN_KEY = "coach:vu";
const turnsKey = (id: string) => `coach:tours:${id}`;

const device: CoachStore = {
  seen: () => {
    try {
      const v = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as unknown;
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
    } catch {
      return [];
    }
  },
  mark: (id) => {
    try {
      const s = new Set(device.seen());
      s.add(id);
      localStorage.setItem(SEEN_KEY, JSON.stringify([...s]));
    } catch {
      // Pas de stockage (navigation privée) : le coach reviendra, tant pis
    }
  },
};

let store: CoachStore = device;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => f());

/** Où garder aussi ce qui a été vu (le compte) ; l'appareil le garde toujours */
export function setCoachStore(account: CoachStore) {
  store = {
    seen: () => [...new Set([...device.seen(), ...account.seen()])],
    mark: (id) => {
      device.mark(id);
      account.mark(id);
    },
  };
  notify();
}

export function coachSeen(id: string): boolean {
  return store.seen().includes(id);
}

/** La première réussite : la main ne reviendra plus */
export function coachDone(id: string) {
  if (coachSeen(id)) return;
  store.mark(id);
  notify();
}

function readTurns(id: string): number {
  try {
    return Number(localStorage.getItem(turnsKey(id)) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function bumpTurns(id: string): number {
  const n = readTurns(id) + 1;
  try {
    localStorage.setItem(turnsKey(id), String(n));
  } catch {
    // idem
  }
  return n;
}

const ease = (u: number) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);

/** Où est le doigt dans ce cycle d'étapes, à ce moment : l'étape, la position, s'il appuie, depuis quand */
export function coachAt(steps: readonly CoachStep[], ms: number): { step: number; x: number; y: number; down: boolean; since: number } {
  const lengths = steps.map((s) => (s.path[s.path.length - 1]?.t ?? 0) + PAUSE);
  const total = lengths.reduce((a, b) => a + b, 0) || 1;
  let t = ms % total;
  let i = 0;
  while (i < steps.length - 1 && t >= lengths[i]!) t -= lengths[i++]!;
  const path = steps[i]?.path ?? [];
  if (path.length === 0) return { step: i, x: 0.5, y: 0.5, down: false, since: 0 };
  let k = 0;
  while (k < path.length - 1 && t >= path[k + 1]!.t) k++;
  const a = path[k]!,
    b = path[Math.min(k + 1, path.length - 1)]!;
  const u = b.t > a.t ? Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t))) : 1;
  const e = ease(u);
  // Depuis quand le doigt appuie (pour l'onde sous le doigt)
  let since = 0;
  if (a.down) {
    let j = k;
    while (j > 0 && path[j - 1]!.down) j--;
    since = t - path[j]!.t;
  }
  return { step: i, x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, down: Boolean(a.down), since };
}

const HAND = (
  <svg width="44" height="56" viewBox="0 0 40 52" aria-hidden="true">
    <path
      d="M15 5a4 4 0 0 1 8 0v17l1.6-.6a4 4 0 0 1 4.4 3.8l2.2-.5a4 4 0 0 1 4.8 3.9V40c0 6.6-5.4 11-11.5 11h-4.2c-4 0-7.3-2-9.3-5.2L4.6 35.4a3.8 3.8 0 0 1 6-4.6L15 35z"
      fill="#fffdf6"
      stroke="#2a1f1a"
      strokeWidth="2"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * La main fantôme. `active` : c'est au joueur et il peut jouer (elle ne compte un tour que lorsqu'il commence) ;
 * `steps` : le geste, étape par étape.
 */
export function Coach({ id, active, steps }: { id: string; active: boolean; steps: readonly CoachStep[] }) {
  const [, rerender] = useState(0);
  const [turn, setTurn] = useState(() => readTurns(id));
  const was = useRef(false);
  const busyUntil = useRef(0);
  const hand = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const bubble = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const f = () => rerender((n) => n + 1);
    listeners.add(f);
    return () => void listeners.delete(f);
  }, []);

  useEffect(() => {
    if (active && !was.current && !coachSeen(id)) setTurn(bumpTurns(id));
    was.current = active;
  }, [active, id]);

  const show = active && !coachSeen(id) && turn <= COACH_MAX_TURNS && steps.length > 0;

  useEffect(() => {
    if (!show) return;
    // Le joueur touche l'écran : la main s'efface le temps qu'il agisse
    const busy = () => (busyUntil.current = performance.now() + 2600);
    window.addEventListener("pointerdown", busy, true);
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const t0 = performance.now();
    let raf = 0;
    const frame = () => {
      const now = performance.now();
      const h = hand.current,
        r = ring.current,
        b = bubble.current;
      if (h && r && b) {
        const idle = now >= busyUntil.current;
        // Sans animation : la main se pose sur le premier point de chaque étape, tour à tour
        const p = still
          ? (() => {
              const i = Math.floor((now - t0) / 3000) % steps.length;
              const q = steps[i]!.path[0]!;
              return { step: i, x: q.x, y: q.y, down: false, since: 0 };
            })()
          : coachAt(steps, now - t0);
        const x = `${(p.x * 100).toFixed(2)}%`,
          y = `${(p.y * 100).toFixed(2)}%`;
        h.style.left = x;
        h.style.top = y;
        h.style.opacity = idle ? "0.92" : "0";
        h.style.transform = `translate(-48%, -4%) scale(${p.down ? 0.9 : 1})`;
        r.style.left = x;
        r.style.top = y;
        const k = p.down ? Math.min(1, p.since / 380) : 1;
        r.style.opacity = idle && p.down ? String(0.75 * (1 - k * 0.6)) : "0";
        r.style.transform = `translate(-50%, -50%) scale(${0.6 + k * 0.7})`;
        b.style.opacity = idle ? "1" : "0";
        const say = steps[p.step]?.say ?? "";
        if (b.textContent !== say) b.textContent = say;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointerdown", busy, true);
    };
  }, [show, steps]);

  if (!show) return null;
  const layer: CSSProperties = { position: "absolute", inset: 0, pointerEvents: "none", zIndex: 6, overflow: "hidden" };
  return (
    <div style={layer} aria-hidden="true">
      <div
        ref={ring}
        style={{
          position: "absolute",
          width: 54,
          height: 54,
          borderRadius: "50%",
          border: "3px solid rgba(255, 236, 170, 0.95)",
          boxShadow: "0 0 18px rgba(255, 210, 110, 0.7)",
          opacity: 0,
        }}
      />
      <div
        ref={hand}
        style={{
          position: "absolute",
          filter: "drop-shadow(0 6px 10px rgba(0,0,0,0.45))",
          transition: "opacity 0.25s ease",
          opacity: 0,
        }}
      >
        {HAND}
      </div>
      <div
        ref={bubble}
        style={{
          position: "absolute",
          left: "50%",
          top: "calc(12% + 52px)",
          transform: "translateX(-50%)",
          maxWidth: "min(420px, calc(100vw - 32px))",
          padding: "8px 14px",
          borderRadius: 12,
          background: "rgba(20, 12, 14, 0.82)",
          color: "#fff4dc",
          fontSize: 15,
          fontWeight: 600,
          textAlign: "center",
          transition: "opacity 0.25s ease",
          boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
        }}
      />
    </div>
  );
}
