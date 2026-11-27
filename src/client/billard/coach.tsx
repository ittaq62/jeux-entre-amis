// Le geste du billard, tel que la main fantôme du coach commun (lib/coach.tsx) le mime sur la vraie commande : glisser
// sur la table pour viser, tirer la réglette de droite vers le bas puis lâcher, et au téléphone la molette pour un coup
// fin. Les points sont pris sur les commandes telles qu'elles sont à l'écran (elles bougent avec sa taille et son sens).

import { useEffect, useState, type RefObject } from "react";
import { Coach, type CoachStep } from "../lib/coach.tsx";

/** Les étapes du geste, mesurées sur l'écran du jeu (`root`) et ses commandes (la réglette, la molette) */
export function billardSteps(root: DOMRect, power: DOMRect | null, fine: DOMRect | null): CoachStep[] {
  const fx = (x: number) => (x - root.left) / root.width;
  const fy = (y: number) => (y - root.top) / root.height;
  const steps: CoachStep[] = [
    {
      say: "Glisse sur la table : la queue tourne autour de la blanche",
      path: [
        { x: 0.44, y: 0.55, t: 0 },
        { x: 0.44, y: 0.55, t: 350, down: true },
        { x: 0.58, y: 0.55, t: 1000, down: true },
        { x: 0.34, y: 0.55, t: 1900, down: true },
        { x: 0.44, y: 0.55, t: 2400, down: true },
        { x: 0.44, y: 0.53, t: 2600 },
      ],
    },
  ];
  if (power) {
    const x = fx(power.left + power.width / 2);
    const top = fy(power.top + power.height * 0.16);
    const bottom = fy(power.top + power.height * 0.66);
    steps.push({
      say: "Tire la réglette vers le bas (plus tu tires, plus c'est fort), puis lâche pour frapper",
      path: [
        { x, y: top, t: 0 },
        { x, y: top, t: 400, down: true },
        { x, y: bottom, t: 1400, down: true },
        { x, y: bottom, t: 1750, down: true },
        { x, y: bottom - 0.02, t: 1950 },
      ],
    });
  }
  if (fine) {
    const x = fx(fine.left + fine.width / 2);
    const y = fy(fine.top + fine.height / 2);
    const d = (fine.width * 0.25) / root.width;
    steps.push({
      say: "Pour un coup fin, fais rouler la molette",
      path: [
        { x, y, t: 0 },
        { x, y, t: 350, down: true },
        { x: x + d, y, t: 1000, down: true },
        { x: x - d, y, t: 1800, down: true },
        { x, y, t: 2200, down: true },
        { x, y: y - 0.02, t: 2400 },
      ],
    });
  }
  return steps;
}

/** La main fantôme du billard : pendant ses premiers tours, quand c'est à lui de jouer et qu'il peut frapper */
export function BillardCoach({
  root,
  active,
  turn,
}: {
  root: RefObject<HTMLElement | null>;
  active: boolean;
  /** Ce qui distingue un tour du suivant (la table et le numéro du coup) : un tour ne compte qu'une fois */
  turn: string;
}) {
  const [steps, setSteps] = useState<CoachStep[]>([]);
  useEffect(() => {
    if (!active) return;
    const measure = () => {
      const el = root.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width < 10 || r.height < 10) return;
      const power = el.querySelector(".bl-power")?.getBoundingClientRect() ?? null;
      const fine = el.querySelector(".bl-fine")?.getBoundingClientRect() ?? null;
      setSteps(billardSteps(r, power, fine));
    };
    // Les commandes viennent d'apparaître (elles sont déjà dans la page) : on les mesure tout de suite, encore à l'image
    // suivante (leur place finale), puis à chaque changement de taille
    measure();
    const raf = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
    };
  }, [active, root]);
  return <Coach id="billard" active={active && steps.length > 0} steps={steps} turn={turn} />;
}
