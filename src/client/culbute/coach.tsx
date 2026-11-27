// Le coach au doigt (la main commune, src/client/lib/coach.tsx) : pendant les premiers combats d'un joueur au doigt
// (trois au plus), elle mime les gestes qui comptent sur les vraies commandes : le pouce gauche posé qui glisse pour
// marcher, Frapper (tapé, ou tenu pour le coup fort), et Saut deux fois puis Spécial vers le haut pour revenir. Elle se
// règle sur la place des boutons à l'écran (ils sont posés en pixels depuis les bords, pas en fractions de l'écran), et
// s'en va pour de bon au premier coup qui touche (coachDone, voir CulbuteFight).

import { useEffect, useState, type RefObject } from "react";
import { Coach, type CoachPoint, type CoachStep } from "../lib/coach.tsx";

export const COACH_ID = "culbute";

/** Le centre d'un élément, en fractions de la boîte du jeu ; null s'il n'est pas à l'écran */
function centerOf(el: Element | null, box: DOMRect): { x: number; y: number } | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return null;
  return { x: (r.left + r.width / 2 - box.left) / box.width, y: (r.top + r.height / 2 - box.top) / box.height };
}

const at = (p: { x: number; y: number }, t: number, down = false): CoachPoint => ({ x: p.x, y: p.y, t, down });

/** Les étapes de la main, d'après les commandes affichées dans `root` (l'écran du combat) */
export function touchCoachSteps(root: HTMLElement): CoachStep[] {
  const box = root.getBoundingClientRect();
  if (box.width === 0 || box.height === 0) return [];
  const steps: CoachStep[] = [];
  const zone = root.querySelector(".cb-stick-zone")?.getBoundingClientRect();
  if (zone && zone.width > 0) {
    // Le pouce se pose n'importe où à gauche : la main le pose juste au-dessus de « Pose ton pouce ici » (là où va le
    // pouce), glisse d'un côté, puis de l'autre
    const hint = root.querySelector(".cb-stick-hint")?.getBoundingClientRect();
    const hx = hint && hint.width > 0 ? hint.left + hint.width / 2 : zone.left + zone.width * 0.4;
    const hy = hint && hint.height > 0 ? hint.top - 28 : zone.top + zone.height * 0.75;
    const p = { x: (hx - box.left) / box.width, y: (hy - box.top) / box.height };
    const dx = 56 / box.width;
    const right = { x: p.x + dx, y: p.y };
    const left = { x: p.x - dx, y: p.y };
    steps.push({
      say: "Pose le pouce à gauche et glisse : tu marches",
      path: [at(p, 0), at(p, 300, true), at(right, 800, true), at(right, 1300, true), at(left, 2100, true), at(left, 2500, true), at(left, 2700)],
    });
  }
  const atk = centerOf(root.querySelector(".cb-touch-btn.is-atk"), box);
  if (atk) {
    steps.push({
      say: "Frapper : tape, ou garde le doigt dessus pour le coup fort",
      path: [at(atk, 0), at(atk, 250, true), at(atk, 420), at(atk, 750, true), at(atk, 1700, true), at(atk, 1900)],
    });
  }
  const jmp = centerOf(root.querySelector(".cb-touch-btn.is-jmp"), box);
  const spc = centerOf(root.querySelector(".cb-touch-btn.is-spc"), box);
  if (jmp && spc) {
    steps.push({
      say: "Tombé ? Saut, deux fois, puis Spécial en poussant vers le haut",
      path: [at(jmp, 0), at(jmp, 250, true), at(jmp, 400), at(jmp, 600, true), at(jmp, 750), at(spc, 1250), at(spc, 1450, true), at(spc, 1750)],
    });
  }
  return steps;
}

/**
 * La main, posée sur l'écran du combat (`root`). `active` : il joue au doigt, le combat tourne et il est encore en jeu ;
 * `turn` : ce combat (un combat ne compte qu'une fois parmi les trois).
 */
export function CulbuteCoach({ root, active, turn }: { root: RefObject<HTMLElement | null>; active: boolean; turn: string | number }) {
  const [steps, setSteps] = useState<CoachStep[]>([]);
  useEffect(() => {
    const el = root.current;
    if (!active || !el) return;
    // Après la mise en page (les boutons viennent d'apparaître), et à chaque changement de taille ou de sens
    let raf = requestAnimationFrame(() => setSteps(touchCoachSteps(el)));
    const size = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setSteps(touchCoachSteps(el)));
    });
    size.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      size.disconnect();
    };
  }, [active, root]);
  return <Coach id={COACH_ID} active={active} steps={steps} turn={turn} />;
}
