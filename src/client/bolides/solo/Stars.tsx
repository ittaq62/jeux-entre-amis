/** Une rangée de trois étoiles, pleines ou vides */
const STAR = "M12 2.6l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.5l-5.9 3.1 1.2-6.5L2.5 9.5l6.6-.9z";

export function Stars({ n, size = 16, className = "" }: { n: number; size?: number; className?: string }) {
  return (
    <span className={`bol-stars ${className}`} role="img" aria-label={`${n} étoile${n > 1 ? "s" : ""} sur 3`}>
      {[0, 1, 2].map((i) => (
        <svg key={i} viewBox="0 0 24 24" width={size} height={size} className={i < n ? "is-on" : ""} aria-hidden="true">
          <path d={STAR} />
        </svg>
      ))}
    </span>
  );
}

/** Une seule étoile, pour les scènes (elle s'allume quand `on`) */
export function BigStar({ on, size = 64 }: { on: boolean; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={`bol-bigstar ${on ? "is-on" : ""}`} aria-hidden="true">
      <path d={STAR} />
    </svg>
  );
}

/** Un temps de course : 2:14.5 */
export function raceTime(ms: number): string {
  const m = Math.floor(ms / 60_000);
  const s = (ms % 60_000) / 1000;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}
