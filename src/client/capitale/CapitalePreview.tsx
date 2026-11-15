// L'illustration de Capitale sur l'accueil : une vue du plateau en 3D, en image (la 3D ne se charge qu'à table), et par-dessus,
// en SVG, une partie qui tourne : les dés roulent au centre, un pion avance case par case et fait le tour du plateau, puis
// touche ses 200 F en repassant par le Départ. Les animations sont en CSS (des @keyframes calculées ici une fois pour toutes).

/** Là où se tient un pion sur chaque case de l'image (720 × 540), du Départ (0) à la dernière avant lui (39), et la taille
 *  du pion à cette profondeur : projetés depuis la scène 3D qui a rendu l'image (même caméra). */
const TRACK: [number, number, number][] = [
  [360, 465.5, 0.97],
  [314, 432.7, 0.947],
  [287.6, 401.5, 0.925],
  [253.4, 378.7, 0.908],
  [229.3, 349.9, 0.888],
  [201.9, 325.7, 0.871],
  [171, 305.4, 0.856],
  [150.1, 279.9, 0.838],
  [121.2, 261.1, 0.825],
  [97.6, 240.1, 0.81],
  [73.2, 211.8, 0.79],
  [110.3, 184.9, 0.771],
  [143.7, 169, 0.759],
  [169.9, 148.8, 0.745],
  [198.3, 131.7, 0.733],
  [228.8, 117.3, 0.723],
  [252.2, 99, 0.71],
  [281.1, 85.5, 0.7],
  [302.9, 68.4, 0.688],
  [327.1, 53.7, 0.678],
  [360, 37.6, 0.666],
  [392.9, 53.7, 0.678],
  [414, 70.4, 0.689],
  [442, 83.5, 0.699],
  [467.8, 99, 0.71],
  [491.2, 117.3, 0.723],
  [521.7, 131.7, 0.733],
  [550.1, 148.8, 0.745],
  [576.3, 169, 0.759],
  [609.7, 184.9, 0.771],
  [646.8, 211.8, 0.79],
  [622.4, 240.1, 0.81],
  [598.8, 261.1, 0.825],
  [569.9, 279.9, 0.838],
  [549, 305.4, 0.856],
  [518.1, 325.7, 0.871],
  [490.7, 349.9, 0.888],
  [466.7, 378.7, 0.908],
  [432.4, 401.5, 0.925],
  [406, 432.7, 0.947],
];

/** Les lancers d'un tour de plateau : 40 cases en tout, le pion revient au Départ et la boucle reprend sans saut */
const ROLLS: [number, number][] = [
  [3, 4],
  [2, 3],
  [5, 3],
  [1, 5],
  [4, 5],
  [1, 4],
];
const ROLL = 1.1; // les dés roulent, en secondes
const LAND = 0.45; // ... et touchent la table : leur face change à ce moment, encore en mouvement
const HOP = 0.27; // un saut de case
const REST = 0.8; // le temps de regarder où l'on est tombé
const PERIOD = ROLLS.length * (ROLL + REST) + TRACK.length * HOP;

/** Les deux dés, sur la rose des vents de la place (l'image a été rendue sans les siens), et leur forme vue du ciel */
const DICE = [
  { x: 349.3, y: 200.2, lean: -4, spin: 1, late: 0 },
  { x: 370.7, y: 213.8, lean: 5, spin: -1, late: 0.06 },
];
// Le dessus du dé : un carré du plateau, vu en perspective (demi-côtés le long des deux bords du plateau), et sa hauteur ;
// projetés depuis la scène, un dixième plus gros que les dés du jeu pour qu'on les lise
const HU = [-6.1, -4.3];
const HV = [6, -4.3];
const DIE_H = 12;
const at = (u: number, v: number, lift = 0) => [HU[0]! * u + HV[0]! * v, HU[1]! * u + HV[1]! * v - lift] as const;
const pts = (list: (readonly [number, number])[]) => list.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
// Le dé est dessiné autour de son milieu : la face du dessus au-dessus, celle du dessous en dessous
const TOP = pts([at(1, 1, DIE_H / 2), at(1, -1, DIE_H / 2), at(-1, -1, DIE_H / 2), at(-1, 1, DIE_H / 2)]);
const LEFT = pts([at(1, -1, DIE_H / 2), at(-1, -1, DIE_H / 2), at(-1, -1, -DIE_H / 2), at(1, -1, -DIE_H / 2)]);
const RIGHT = pts([at(-1, -1, DIE_H / 2), at(-1, 1, DIE_H / 2), at(-1, 1, -DIE_H / 2), at(-1, -1, -DIE_H / 2)]);
const PIPS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [
    [-0.55, -0.55],
    [0.55, 0.55],
  ],
  3: [
    [-0.55, -0.55],
    [0, 0],
    [0.55, 0.55],
  ],
  4: [
    [-0.55, -0.55],
    [-0.55, 0.55],
    [0.55, -0.55],
    [0.55, 0.55],
  ],
  5: [
    [-0.55, -0.55],
    [-0.55, 0.55],
    [0, 0],
    [0.55, -0.55],
    [0.55, 0.55],
  ],
  6: [
    [-0.55, -0.55],
    [-0.55, 0],
    [-0.55, 0.55],
    [0.55, -0.55],
    [0.55, 0],
    [0.55, 0.55],
  ],
};

type Keys = [number, string][];
const pct = (t: number) => `${((t / PERIOD) * 100).toFixed(3)}%`;
const rule = (name: string, keys: Keys) => {
  const byTime = new Map<string, string>();
  for (const [t, decl] of keys.sort((a, b) => a[0] - b[0])) byTime.set(pct(Math.min(PERIOD, Math.max(0, t))), decl);
  return `@keyframes ${name}{${[...byTime].map(([p, d]) => `${p}{${d}}`).join("")}}`;
};
const place = (i: number) => {
  const [x, y, s] = TRACK[i % TRACK.length]!;
  return `transform:translate(${x}px,${y}px) scale(${s})`;
};

/** Toute la partie : où sont le pion et les dés à chaque instant de la boucle */
function keyframes(): string {
  const ground: Keys = [[0, place(0)]];
  const lift: Keys = [[0, "transform:translateY(0)"]];
  const dice: Keys[] = [[], []];
  const faces: Keys[][] = [0, 1].map(() => [1, 2, 3, 4, 5, 6].map(() => [] as Keys));
  const shown = (die: number, k: number) => ROLLS[(k + ROLLS.length) % ROLLS.length]![die]!;
  let t = 0;
  let square = 0;
  ROLLS.forEach(([a, b], k) => {
    DICE.forEach(({ lean, spin, late }, d) => {
      const s = t + late;
      const turn = 360 * spin;
      const rot = (r: number) => `rotate(${(k * turn + r * spin).toFixed(0)}deg)`;
      dice[d]!.push(
        [s, `transform:translate(0px,0px) ${rot(0)}`],
        [s + 0.2, `transform:translate(${lean}px,-24px) ${rot(150)}`],
        [s + LAND, `transform:translate(${lean * 0.5}px,0px) ${rot(290)}`],
        [s + 0.62, `transform:translate(${lean * 0.2}px,-6px) ${rot(340)}`],
        [s + 0.8, `transform:translate(0px,0px) ${rot(360)}`],
      );
      // La face du dessus change quand le dé touche la table
      for (let f = 1; f <= 6; f++) {
        const keys = faces[d]![f - 1]!;
        keys.push([s + LAND - 0.001, `opacity:${shown(d, k - 1) === f ? 1 : 0}`], [s + LAND, `opacity:${shown(d, k) === f ? 1 : 0}`]);
      }
    });
    t += ROLL;
    for (let h = 0; h < a + b; h++) {
      const height = 13 * TRACK[square]![2];
      ground.push([t, place(square)]);
      lift.push([t, "transform:translateY(0)"], [t + HOP * 0.5, `transform:translateY(${-height.toFixed(1)}px)`]);
      square = (square + 1) % TRACK.length;
      t += HOP;
      ground.push([t, place(square)]);
      lift.push([t, "transform:translateY(0)"]);
    }
    t += REST;
  });
  ground.push([PERIOD, place(0)]);
  lift.push([PERIOD, "transform:translateY(0)"]);
  DICE.forEach((_, d) => {
    const turns = 360 * ROLLS.length * DICE[d]!.spin;
    dice[d]!.push([0, "transform:translate(0px,0px) rotate(0deg)"], [PERIOD, `transform:translate(0px,0px) rotate(${turns}deg)`]);
    for (let f = 1; f <= 6; f++) {
      const last = `opacity:${shown(d, -1) === f ? 1 : 0}`;
      faces[d]![f - 1]!.push([0, last], [PERIOD, last]);
    }
  });
  // Le billet de 200 F : il sort du Départ quand le pion s'y pose (à la fin du dernier saut) et monte en s'effaçant
  const landed = PERIOD - REST;
  const cash: Keys = [
    [0, "transform:translateY(-16px);opacity:0.75"],
    [0.75, "transform:translateY(-26px);opacity:0"],
    [landed - 0.01, "transform:translateY(0);opacity:0"],
    [landed + 0.12, "transform:translateY(-3px);opacity:1"],
    [PERIOD, "transform:translateY(-16px);opacity:0.75"],
  ];
  const css = [
    rule("cap-pv-ground", ground),
    rule("cap-pv-lift", lift),
    rule("cap-pv-cash", cash),
    ...dice.map((keys, d) => rule(`cap-pv-die-${d}`, keys)),
    ...faces.flatMap((list, d) => list.map((keys, f) => rule(`cap-pv-face-${d}-${f + 1}`, keys))),
  ];
  return css.join("\n");
}

const KEYFRAMES = keyframes();
const anim = (name: string) => ({ animation: `${name} ${PERIOD.toFixed(3)}s linear infinite` });

function Die({ index }: { index: number }) {
  const { x, y } = DICE[index]!;
  const final = ROLLS[ROLLS.length - 1]![index]!;
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse className="cap-pv-die-shadow" cx={2} cy={DIE_H / 2 + 1} rx={12} ry={6} />
      <g className="cap-pv-die" style={anim(`cap-pv-die-${index}`)}>
        <polygon className="cap-pv-die-left" points={LEFT} />
        <polygon className="cap-pv-die-right" points={RIGHT} />
        <polygon className="cap-pv-die-top" points={TOP} />
        {[1, 2, 3, 4, 5, 6].map((f) => (
          <g key={f} opacity={f === final ? 1 : 0} style={anim(`cap-pv-face-${index}-${f}`)}>
            {PIPS[f]!.map(([u, v]) => {
              const [px, py] = at(u, v, DIE_H / 2);
              return <ellipse key={`${u},${v}`} className="cap-pv-pip" cx={px} cy={py} rx={1.5} ry={1.05} />;
            })}
          </g>
        ))}
      </g>
    </g>
  );
}

/** L'illustration de Capitale sur l'accueil, au format de l'image (4:3), large de `px` */
export function CapitalePreview({ px }: { px: number }) {
  const [x0, y0, s0] = TRACK[0]!;
  return (
    <div className="capitale-preview" style={{ width: px }}>
      <img
        className="capitale-preview-board"
        src="/capitale-apercu.webp"
        width={px}
        height={Math.round(px * 0.75)}
        alt=""
        loading="lazy"
        decoding="async"
      />
      <svg className="capitale-preview-life" viewBox="0 0 720 540" aria-hidden="true">
        <style>{KEYFRAMES}</style>
        <defs>
          <linearGradient id="cap-pv-pawn" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#b48cf2" />
            <stop offset="0.45" stopColor="#8a5ad8" />
            <stop offset="1" stopColor="#5a3399" />
          </linearGradient>
        </defs>
        <Die index={0} />
        <Die index={1} />
        {/* Le pion (son ombre reste au sol pendant qu'il saute) */}
        <g className="cap-pv-pawn" style={{ transform: `translate(${x0}px, ${y0}px) scale(${s0})`, ...anim("cap-pv-ground") }}>
          <g transform="scale(1.25)">
            <ellipse className="cap-pv-pawn-shadow" cx={1.5} cy={0.5} rx={10} ry={4.5} />
            <g style={anim("cap-pv-lift")}>
              <path
                className="cap-pv-pawn-body"
                d="M-9 -1.5C-9 -4.5-5.5-6.5-3.5-7.5L-2.6-14.5C-5.2-15.2-5.4-18.2-2.2-18.8C-5.6-20.5-6.4-29 0-29C6.4-29 5.6-20.5 2.2-18.8C5.4-18.2 5.2-15.2 2.6-14.5L3.5-7.5C5.5-6.5 9-4.5 9-1.5C9 1.2 4.5 2.2 0 2.2C-4.5 2.2-9 1.2-9-1.5Z"
                fill="url(#cap-pv-pawn)"
              />
              <ellipse className="cap-pv-pawn-shine" cx={-2.2} cy={-25} rx={1.6} ry={2.4} />
            </g>
          </g>
        </g>
        {/* Le billet de 200 F, au Départ */}
        <g transform={`translate(${x0} ${y0 - 46})`}>
          <g className="cap-pv-cash" style={anim("cap-pv-cash")}>
            <rect x={-25} y={-11} width={50} height={22} rx={4} className="cap-pv-cash-note" />
            <text y={6} textAnchor="middle" className="cap-pv-cash-text">
              +200 F
            </text>
          </g>
        </g>
      </svg>
    </div>
  );
}
