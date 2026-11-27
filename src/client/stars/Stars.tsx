// L'affichage des étoiles, commun à tous les jeux : les étoiles d'une carte dans un menu, ses trois seuils, le total
// d'un jeu, et l'encart de fin de partie qui annonce les nouvelles. Voir src/shared/stars.ts pour les règles.

import type { CSSProperties } from "react";
import { starMap } from "../../shared/starMaps.ts";
import { formatStarValue, MAX_STARS, nextStar, type StarAwardResult } from "../../shared/stars.ts";
import { usePrefs } from "../stores/prefs.ts";
import { useGameStars } from "../stores/stars.ts";
import "./stars.css";

const STAR_PATH = "M12 1.8l3.1 6.6 7.2.9-5.3 5 1.4 7.1L12 17.9l-6.4 3.5 1.4-7.1-5.3-5 7.2-.9z";

/**
 * Trois étoiles, pleines ou vides. `fresh` : combien des dernières pleines viennent d'être gagnées (elles s'allument
 * l'une après l'autre, sauf avec « Effets réduits » ou prefers-reduced-motion).
 */
export function Stars({
  value,
  size = 16,
  fresh = 0,
  label,
}: {
  value: number;
  size?: number;
  fresh?: number;
  /** Ce que lit un lecteur d'écran ; par défaut « 2 étoiles sur 3 » */
  label?: string;
}) {
  const still = usePrefs((s) => s.reducedEffects);
  const n = Math.max(0, Math.min(MAX_STARS, Math.floor(value)));
  return (
    <span
      className={`stars ${still ? "is-still" : ""}`}
      style={{ "--star": `${size}px` } as CSSProperties}
      role="img"
      aria-label={label ?? `${n} étoile${n > 1 ? "s" : ""} sur ${MAX_STARS}`}
    >
      {Array.from({ length: MAX_STARS }, (_, i) => {
        const on = i < n;
        const isNew = on && i >= n - fresh;
        return (
          <svg
            key={i}
            viewBox="0 0 24 24"
            aria-hidden="true"
            className={`star ${on ? "is-on" : ""} ${isNew ? "is-new" : ""}`}
            style={isNew ? ({ "--k": i - (n - fresh) } as CSSProperties) : undefined}
          >
            <path d={STAR_PATH} />
          </svg>
        );
      })}
    </span>
  );
}

/** Les étoiles du joueur sur une carte, telles que le serveur les connaît (pour un menu de choix de carte) */
export function MapStars({ game, map, size = 16 }: { game: string; map: string; size?: number }) {
  const stars = useGameStars(game);
  if (!starMap(game, map)) return null;
  return <Stars value={stars?.maps[map]?.stars ?? 0} size={size} />;
}

/** Les trois seuils d'une carte, ceux qui sont atteints en couleur, et son meilleur résultat */
export function StarGoals({ game, map }: { game: string; map: string }) {
  const stars = useGameStars(game);
  const def = starMap(game, map);
  if (!def) return null;
  const mine = stars?.maps[map];
  const got = mine?.stars ?? 0;
  return (
    <div className="star-goals">
      <ol>
        {def.rule.goals.map((goal, i) => (
          <li key={i} className={i < got ? "is-on" : ""}>
            <Stars value={i + 1} size={11} label={`${i + 1} étoile${i > 0 ? "s" : ""}`} />
            <span className="num">{formatStarValue(goal, def.rule.unit)}</span>
          </li>
        ))}
      </ol>
      {mine?.best != null && (
        <p className="hint star-best">
          Ton record : <strong className="num">{formatStarValue(mine.best, def.rule.unit)}</strong>
        </p>
      )}
    </div>
  );
}

/** Le total d'un jeu (« ★ 12 / 30 ») ; rien si ce jeu n'a pas d'étoiles */
export function GameStarsTotal({ game }: { game: string }) {
  const stars = useGameStars(game);
  if (!stars || stars.max === 0) return null;
  return (
    <span className="star-total" title="Tes étoiles dans ce jeu">
      <Stars value={1} size={14} label="Étoiles" />
      <span className="num">
        {stars.total} / {stars.max}
      </span>
    </span>
  );
}

/** L'encart de fin de partie : les étoiles de la carte, celles qui viennent d'être gagnées, les points, la suivante */
export function StarResult({ result }: { result: StarAwardResult }) {
  const def = starMap(result.game, result.map);
  const fresh = Math.max(0, result.stars - result.previous);
  const next = def ? nextStar(result.stars, def.rule) : null;
  return (
    <div className={`star-result ${fresh > 0 ? "is-new" : ""}`}>
      <Stars value={result.stars} size={30} fresh={fresh} />
      <p className="star-result-text">
        {fresh > 0 ? (
          <>
            <strong>{fresh === 1 ? "Nouvelle étoile !" : `${fresh} nouvelles étoiles !`}</strong>{" "}
            <span className="num">+{result.points} points</span>
          </>
        ) : result.stars === MAX_STARS ? (
          <strong>Les trois étoiles sont à toi.</strong>
        ) : (
          <span>Pas de nouvelle étoile cette fois.</span>
        )}
      </p>
      {next && def && (
        <p className="hint">
          {next.stars === 1 ? "Première étoile" : `${next.stars}e étoile`} : {def.rule.better === "lower" ? "en" : "à partir de"}{" "}
          <span className="num">{formatStarValue(next.goal, def.rule.unit)}</span>
          {result.best != null && (
            <>
              {" "}
              (ton record : <span className="num">{formatStarValue(result.best, def.rule.unit)}</span>)
            </>
          )}
        </p>
      )}
    </div>
  );
}
