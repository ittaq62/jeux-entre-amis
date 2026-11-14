// Le tirage du prochain jeu de la tournée : la lumière passe d'une affiche à l'autre, de plus en plus lentement, et
// s'arrête sur le jeu tiré. Avant, chaque pas durait un peu plus que le précédent quel que soit le nombre d'affiches :
// une seconde à peine avec deux jeux, jusqu'à seize avec sept. La durée est maintenant fixée d'avance, un peu plus
// longue quand il y a peu de jeux (on fait plusieurs tours pour ménager le suspense), un peu plus courte quand il y en a
// beaucoup (chaque tour est déjà long), et les pas s'y répartissent.

/** Le dernier pas dure autant de fois le premier : la lumière file, puis hésite */
const SLOWDOWN = 10;
/** Entre la dernière lumière et la révélation du jeu tiré */
export const DRAW_REVEAL_PAUSE = 260;
/** Le nombre de pas visé, toutes affiches confondues : quelques tours complets avec peu de jeux, deux avec beaucoup */
const STEPS_AIM = 14;

/** Le temps (ms) que met la lumière à s'arrêter sur le jeu tiré : 5 s avec deux jeux, 4 s avec sept, 3,8 s au-delà */
export function drawDuration(count: number): number {
  return Math.min(5000, Math.max(3800, 5000 - 200 * (count - 2)));
}

export interface DrawSchedule {
  /** Chaque pas : quand (ms depuis le début du tirage) la lumière passe sur l'affiche `pos` */
  steps: { at: number; pos: number }[];
  /** Quand le jeu tiré est révélé */
  doneAt: number;
}

/**
 * Le programme du tirage parmi `count` affiches, la lumière partant de la première (allumée d'office) et finissant sur
 * l'affiche `target`. Les pas s'allongent régulièrement (une suite géométrique) et la dernière lumière tombe pile à
 * `drawDuration(count)`.
 */
export function drawSchedule(count: number, target: number): DrawSchedule {
  if (count <= 1) return { steps: [], doneAt: 0 };
  const goal = Math.min(count - 1, Math.max(0, Math.floor(target)));
  const loops = Math.max(1, Math.round(STEPS_AIM / count));
  // Le premier pas éclaire la deuxième affiche : après `loops` tours et `goal` affiches de plus, on est sur le jeu tiré
  const total = loops * count + goal;
  const ratio = SLOWDOWN ** (1 / (total - 1));
  const first = (drawDuration(count) * (ratio - 1)) / (ratio ** total - 1);
  const steps: DrawSchedule["steps"] = [];
  let at = 0;
  for (let k = 0; k < total; k++) {
    at += first * ratio ** k;
    steps.push({ at: Math.round(at), pos: (k + 1) % count });
  }
  return { steps, doneAt: Math.round(at) + DRAW_REVEAL_PAUSE };
}
