// Le coach au doigt (la main commune, src/client/lib/coach.tsx) : pendant les premiers matchs d'un joueur au doigt (trois
// au plus), quand il a le ballon, elle mime les gestes qui ne se devinent pas sur les vraies commandes : le pouce gauche
// qui glisse pour courir, la passe tapée (tenue, en profondeur, avec les commandes simples) et le tir qu'on charge en
// gardant le doigt dessus. Elle se règle sur la place des boutons à l'écran, s'efface dès qu'on touche l'écran (le temps
// d'agir), et s'en va pour de bon quand il a fait au doigt une passe et un tir (coachDone, voir CramponsMatch).

import { useEffect, useState, type RefObject } from "react";
import { Coach, type CoachPoint, type CoachStep } from "../lib/coach.tsx";
import type { TouchPad } from "./bindings.ts";

export const COACH_ID = "crampons";

/** Le centre d'un élément, en fractions de l'écran du match ; null s'il n'est pas à l'écran */
function centerOf(el: Element | null, box: DOMRect): { x: number; y: number } | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return null;
  return { x: (r.left + r.width / 2 - box.left) / box.width, y: (r.top + r.height / 2 - box.top) / box.height };
}

const at = (p: { x: number; y: number }, t: number, down = false): CoachPoint => ({ x: p.x, y: p.y, t, down });

/** Les étapes de la main, d'après les commandes affichées dans `root` (l'écran du match) */
export function touchCoachSteps(root: HTMLElement, touchPad: TouchPad): CoachStep[] {
  const box = root.getBoundingClientRect();
  if (box.width === 0 || box.height === 0) return [];
  const steps: CoachStep[] = [];
  const zone = root.querySelector(".cr-stickzone")?.getBoundingClientRect();
  if (zone && zone.width > 0) {
    // Le pouce se pose n'importe où à gauche : la main le pose et le pousse vers l'avant, puis de côté
    const p = { x: (zone.left + zone.width * 0.45 - box.left) / box.width, y: (zone.top + zone.height * 0.6 - box.top) / box.height };
    const dx = 46 / box.width;
    const dy = 34 / box.height;
    const ahead = { x: p.x + dx, y: p.y };
    const side = { x: p.x + dx * 0.6, y: p.y - dy };
    steps.push({
      say: "Pose le pouce à gauche et glisse : ton joueur court (plus loin, il sprinte)",
      path: [
        at(p, 0),
        at(p, 300, true),
        at(ahead, 800, true),
        at(ahead, 1300, true),
        at(side, 1900, true),
        at(side, 2300, true),
        at(side, 2500),
      ],
    });
  }
  const pass = centerOf(root.querySelector(".cr-btn.is-pass"), box);
  if (pass) {
    steps.push({
      say:
        touchPad === "simple"
          ? "Passe : tape, au coéquipier marqué ; garde le doigt dessus pour la passe en profondeur"
          : "Passe : tape, le ballon part au coéquipier marqué",
      path:
        touchPad === "simple"
          ? [at(pass, 0), at(pass, 250, true), at(pass, 420), at(pass, 900, true), at(pass, 1700, true), at(pass, 1900)]
          : [at(pass, 0), at(pass, 250, true), at(pass, 420), at(pass, 800, true), at(pass, 970), at(pass, 1200)],
    });
  }
  const shot = centerOf(root.querySelector(".cr-btn.is-shot"), box);
  if (shot) {
    steps.push({
      say: "Tir : garde le doigt dessus pour charger, lâche pour frapper",
      path: [at(shot, 0), at(shot, 250, true), at(shot, 1350, true), at(shot, 1550)],
    });
  }
  return steps;
}

/**
 * La main, posée sur l'écran du match (`root`). `active` : il joue au doigt et a le ballon, sans panneau ni film devant ;
 * `turn` : ce match (un match ne compte qu'une fois parmi les trois).
 */
export function CramponsCoach({
  root,
  active,
  turn,
  touchPad,
}: {
  root: RefObject<HTMLElement | null>;
  active: boolean;
  turn: string | number;
  touchPad: TouchPad;
}) {
  const [steps, setSteps] = useState<CoachStep[]>([]);
  useEffect(() => {
    const el = root.current;
    if (!active || !el) return;
    // Après la mise en page (les boutons changent avec le ballon), et à chaque changement de taille ou de sens
    let raf = requestAnimationFrame(() => setSteps(touchCoachSteps(el, touchPad)));
    const size = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setSteps(touchCoachSteps(el, touchPad)));
    });
    size.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      size.disconnect();
    };
  }, [active, root, touchPad]);
  // La bulle sous « À toi ! » (en haut, à 16 %), là où elle ne cache ni le tableau ni les boutons
  return <Coach id={COACH_ID} active={active} steps={steps} turn={turn} bubble={{ top: "calc(16% + 60px)" }} />;
}
