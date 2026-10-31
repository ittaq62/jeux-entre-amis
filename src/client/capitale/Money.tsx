import type { ReactNode } from "react";

// Les billets de Capitale : sept coupures, chacune sa couleur. Les liasses des joueurs et ceux qui volent d'un joueur à l'autre.

export const DENOMS = [500, 100, 50, 20, 10, 5, 1] as const;

/** Une somme en billets, des plus gros aux plus petits ; au plus max billets (les derniers sont omis) */
export function breakdown(amount: number, max = Infinity): number[] {
  const out: number[] = [];
  let left = Math.max(0, Math.round(amount));
  for (const d of DENOMS) {
    while (left >= d && out.length < max) {
      out.push(d);
      left -= d;
    }
  }
  return out;
}

/** Un billet : la valeur aux coins et au centre, un médaillon, la banque de Capitale */
export function Note({ value, size = "md" }: { value: number; size?: "sm" | "md" | "lg" | "xl" }) {
  return (
    <span className={`cap-note v-${value} is-${size}`} aria-hidden="true">
      <span className="cap-note-corner">{value}</span>
      <span className="cap-note-mark">₣</span>
      {size === "xl" && <span className="cap-note-bank">BANQUE DE CAPITALE</span>}
      {size === "xl" && <span className="cap-note-seal" />}
      <span className="cap-note-value">{value}</span>
    </span>
  );
}

/** Mes billets en main, en éventail comme des cartes : une liasse par coupure, le total en dessous */
export function Hand({ cash, anchor, children }: { cash: number; anchor: string; children?: ReactNode }) {
  const notes = breakdown(cash);
  const stacks = DENOMS.map((d) => [d, notes.filter((n) => n === d).length] as const).filter(([, n]) => n > 0);
  const mid = (stacks.length - 1) / 2;
  return (
    <div className="cap-hand" data-cap-anchor={anchor}>
      <div className="cap-hand-fan" aria-hidden="true">
        {stacks.map(([d, n], k) => (
          <span
            key={d}
            className="cap-hand-stack"
            style={{ ["--a" as string]: `${(k - mid) * 8}deg`, ["--y" as string]: `${Math.abs(k - mid) * 4}px`, zIndex: k }}
          >
            {Array.from({ length: Math.min(n, 4) }, (_, j) => (
              <span key={j} className="cap-hand-note" style={{ ["--j" as string]: j }}>
                <Note value={d} size="xl" />
              </span>
            ))}
            {n > 1 && <span className="cap-hand-count">×{n}</span>}
          </span>
        ))}
        {stacks.length === 0 && <span className="cap-hand-empty">Plus un sou</span>}
      </div>
      {children}
    </div>
  );
}

/** La liasse d'un joueur : une pile par coupure, en éventail, avec le nombre de billets */
export function Wallet({ cash, compact = false }: { cash: number; compact?: boolean }) {
  const notes = breakdown(cash);
  const counts = DENOMS.map((d) => [d, notes.filter((n) => n === d).length] as const).filter(([, n]) => n > 0);
  return (
    <span className={`cap-wallet ${compact ? "is-compact" : ""}`} aria-hidden="true">
      {counts.map(([d, n]) => (
        <span key={d} className="cap-stack" style={{ ["--n" as string]: Math.min(n, 3) }}>
          {Array.from({ length: Math.min(n, 3) }, (_, k) => (
            <span key={k} className="cap-stack-note" style={{ ["--k" as string]: k }}>
              <Note value={d} size="sm" />
            </span>
          ))}
          {n > 1 && <span className="cap-stack-count">×{n}</span>}
        </span>
      ))}
    </span>
  );
}
