// La carte de la route de la roulotte : un pays dessiné à la main (la mer, les fleuves, les Alpes), la route en
// pointillés d'une étape à l'autre, chaque cuisine avec ses étoiles (ou son cadenas, et ce qu'il faut pour l'ouvrir),
// la roulotte qui attend à la dernière étape ouverte, et la fiche de la cuisine choisie.

import { motion } from "motion/react";
import { frontier, isOpen, lockText, totalStars, type StarBook } from "../../shared/games/toque/campaign.ts";
import { RECIPES } from "../../shared/games/toque/food.ts";
import { KITCHEN_IDS, KITCHENS, menuOf, type KitchenId } from "../../shared/games/toque/kitchens.ts";
import { starThresholds } from "../../shared/games/toque/sim.ts";
import { Stars } from "../stars/Stars.tsx";
import { DishIcon } from "./FoodIcon.tsx";

/** Où est chaque étape sur la carte (le dessin fait 1000 × 640) */
const SPOTS: Record<KitchenId, [number, number]> = {
  bistrot: [520, 172],
  creperie: [218, 218],
  cantine: [392, 300],
  pizzeria: [812, 548],
  brasserie: [640, 372],
  chalet: [792, 352],
  train: [668, 486],
  guinguette: [606, 150],
  banquet: [498, 410],
};

/** Le petit dessin de chaque étape, dans sa pastille */
const GLYPH: Record<KitchenId, string> = {
  bistrot: "☕",
  creperie: "⚓",
  cantine: "✎",
  pizzeria: "☀",
  brasserie: "⚖",
  chalet: "❄",
  train: "☾",
  guinguette: "♫",
  banquet: "★",
};

const NAMES = Object.fromEntries(KITCHEN_IDS.map((k) => [k, KITCHENS[k].name])) as Record<KitchenId, string>;

const LAND =
  "M330 70 L478 38 L600 58 L724 98 L806 168 L792 258 L842 330 L822 420 L884 528 L782 594 L652 560 L560 604 L470 582 L420 522 L360 470 L330 400 L302 332 L210 292 L150 252 L118 210 L230 170 L300 140 Z";

/** La route : une courbe douce d'une étape à la suivante */
function road(): string {
  let d = "";
  KITCHEN_IDS.forEach((k, i) => {
    const [x, y] = SPOTS[k];
    if (i === 0) d = `M${x} ${y}`;
    else {
      const [px, py] = SPOTS[KITCHEN_IDS[i - 1]!];
      const mx = (px + x) / 2 + (y - py) * 0.18;
      const my = (py + y) / 2 - (x - px) * 0.18;
      d += ` Q${mx} ${my} ${x} ${y}`;
    }
  });
  return d;
}
const ROAD = road();

export function WorldMap({
  book,
  selected,
  onPick,
  chefs,
  canPick,
  allOpen = false,
}: {
  book: StarBook;
  selected: KitchenId;
  onPick?: (k: KitchenId) => void;
  /** Le nombre de chefs (pour les seuils des étoiles) */
  chefs: number;
  canPick: boolean;
  /** Le duel : toutes les cuisines se jouent, sans cadenas */
  allOpen?: boolean;
}) {
  const here = frontier(book);
  const [rx, ry] = SPOTS[here];
  const def = KITCHENS[selected];
  const open = allOpen || isOpen(selected, book);
  const goals = starThresholds(selected, chefs);
  const mine = book[selected] ?? 0;
  const total = totalStars(book);
  return (
    <div className="tq-map">
      <svg className="tq-map-svg" viewBox="0 0 1000 640" role="img" aria-label="La route de la roulotte">
        <defs>
          <radialGradient id="tq-sea" cx="30%" cy="60%" r="80%">
            <stop offset="0" stopColor="#8fd0e8" />
            <stop offset="1" stopColor="#4f9cc4" />
          </radialGradient>
          <linearGradient id="tq-land" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#d8e6a8" />
            <stop offset="1" stopColor="#c2d88a" />
          </linearGradient>
          <filter id="tq-paper">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" />
            <feColorMatrix values="0 0 0 0 0.45  0 0 0 0 0.36  0 0 0 0 0.2  0 0 0 0.09 0" />
            <feComposite in2="SourceGraphic" operator="in" />
          </filter>
        </defs>
        <rect width="1000" height="640" fill="url(#tq-sea)" />
        {/* Les vagues de la mer */}
        {[80, 160, 420, 560].map((y, i) => (
          <path key={y} d={`M${20 + i * 30} ${y} q12 -8 24 0 t24 0`} stroke="#d8f0fa" strokeWidth="2" fill="none" opacity="0.7" />
        ))}
        <path d={LAND} fill="url(#tq-land)" stroke="#8a9a5a" strokeWidth="3" strokeLinejoin="round" />
        <path d={LAND} fill="#000" filter="url(#tq-paper)" />
        {/* La Corse */}
        <path d="M900 560 l14 -18 l10 30 l-8 30 l-14 -12 z" fill="url(#tq-land)" stroke="#8a9a5a" strokeWidth="2" />
        {/* Les fleuves : la Seine, la Loire, le Rhône, la Marne */}
        <path d="M300 150 Q420 160 520 175 T610 152" stroke="#6ab0d8" strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d="M210 260 Q330 290 420 300 T560 300" stroke="#6ab0d8" strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d="M655 300 Q650 380 660 440 T690 560" stroke="#6ab0d8" strokeWidth="4" fill="none" strokeLinecap="round" />
        {/* Les Alpes, le Massif central */}
        {[
          [760, 300],
          [790, 320],
          [820, 300],
          [800, 270],
          [770, 390],
          [810, 410],
        ].map(([x, y], i) => (
          <g key={i}>
            <path d={`M${x! - 22} ${y! + 18} L${x} ${y! - 18} L${x! + 22} ${y! + 18} Z`} fill="#a8a090" />
            <path d={`M${x! - 8} ${y! - 4} L${x} ${y! - 18} L${x! + 8} ${y! - 4} Z`} fill="#f8f8f4" />
          </g>
        ))}
        {[
          [470, 450],
          [500, 470],
          [530, 452],
        ].map(([x, y], i) => (
          <path key={i} d={`M${x! - 18} ${y! + 12} Q${x} ${y! - 18} ${x! + 18} ${y! + 12} Z`} fill="#9ab070" />
        ))}
        {/* Des bosquets */}
        {[
          [360, 220],
          [450, 240],
          [560, 260],
          [300, 380],
          [420, 360],
          [600, 520],
          [700, 200],
        ].map(([x, y], i) => (
          <g key={i} fill="#6a9a4a">
            <circle cx={x} cy={y} r="8" />
            <circle cx={x! + 10} cy={y! + 3} r="7" />
            <circle cx={x! - 8} cy={y! + 4} r="6" />
          </g>
        ))}
        {/* La route */}
        <path d={ROAD} stroke="#7a5a3a" strokeWidth="7" fill="none" strokeLinecap="round" opacity="0.35" />
        <path d={ROAD} stroke="#fff8e8" strokeWidth="3" fill="none" strokeDasharray="2 10" strokeLinecap="round" />
        {/* Les étapes */}
        {KITCHEN_IDS.map((k, i) => {
          const [x, y] = SPOTS[k];
          const ok = allOpen || isOpen(k, book);
          const stars = book[k] ?? 0;
          const sel = k === selected;
          return (
            <g
              key={k}
              className={`tq-stop ${ok ? "is-open" : "is-locked"} ${sel ? "is-selected" : ""}`}
              transform={`translate(${x} ${y})`}
              onClick={() => canPick && onPick?.(k)}
              role={canPick ? "button" : undefined}
              tabIndex={canPick ? 0 : undefined}
              aria-label={`${KITCHENS[k].name}${ok ? `, ${stars} étoile${stars > 1 ? "s" : ""}` : ", fermée"}`}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && canPick && onPick?.(k)}
            >
              {sel && <circle r="34" fill="none" stroke="#fff4c2" strokeWidth="4" className="tq-stop-halo" />}
              <circle r="26" fill={ok ? KITCHENS[k].theme.from : "#9a9a92"} stroke={ok ? "#5a3a26" : "#6a6a62"} strokeWidth="3" />
              <text y="9" textAnchor="middle" fontSize="24" fill="#fff8e8">
                {ok ? GLYPH[k] : "🔒"}
              </text>
              <text y="-34" textAnchor="middle" className="tq-stop-num">
                {i + 1}
              </text>
              {ok && (
                <g transform="translate(0 44)">
                  {[0, 1, 2].map((s) => (
                    <text
                      key={s}
                      x={(s - 1) * 17}
                      textAnchor="middle"
                      fontSize="18"
                      fill={s < stars ? "#f6c33a" : "#fff8e8"}
                      stroke="#5a3a26"
                      strokeWidth="0.8"
                    >
                      ★
                    </text>
                  ))}
                </g>
              )}
            </g>
          );
        })}
        {/* La roulotte de Mémé, à la dernière étape ouverte */}
        <motion.g
          initial={false}
          animate={{ x: rx + 30, y: ry - 34 }}
          transition={{ type: "spring", stiffness: 60, damping: 14 }}
          className="tq-roulotte"
        >
          <g className="tq-roulotte-bob">
            <rect x="-22" y="-16" width="40" height="22" rx="4" fill="#c8402e" stroke="#5a2a1a" strokeWidth="2" />
            <path d="M-24 -16 Q-2 -34 20 -16 Z" fill="#f2c24a" stroke="#5a2a1a" strokeWidth="2" />
            <rect x="-12" y="-10" width="10" height="8" rx="1" fill="#fff4c2" />
            <circle cx="-12" cy="8" r="6" fill="#3a2a1e" />
            <circle cx="10" cy="8" r="6" fill="#3a2a1e" />
            <circle cx="-12" cy="8" r="2" fill="#c8a060" />
            <circle cx="10" cy="8" r="2" fill="#c8a060" />
          </g>
        </motion.g>
        <text x="40" y="610" className="tq-map-total">
          ★ {total} / {KITCHEN_IDS.length * 3}
        </text>
      </svg>
      <aside className={`tq-map-card panel ${open ? "" : "is-locked"}`}>
        <header>
          <span className="tq-map-num">Étape {KITCHEN_IDS.indexOf(selected) + 1}</span>
          <h3>{def.name}</h3>
          <p className="hint">{def.place}</p>
        </header>
        {open ? (
          <>
            <div className="tq-map-stars">
              <Stars value={mine} size={24} label={`${mine} étoile${mine > 1 ? "s" : ""}`} />
              <span className="num hint">
                ★ {goals[0]} · ★★ {goals[1]} · ★★★ {goals[2]}
              </span>
            </div>
            <ul className="tq-map-menu">
              {menuOf(selected).map((r) => (
                <li key={r}>
                  <DishIcon recipe={r} size={34} />
                  <span>{RECIPES[r].name}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="tq-map-lock">{lockText(selected, book, NAMES) ?? "Pas encore ouverte."}</p>
        )}
      </aside>
    </div>
  );
}
