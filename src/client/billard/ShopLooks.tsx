// Les aperçus des articles du billard à la boutique : la queue, le tapis, le jeu de billes, ce qui éclate sur un beau coup.

import type { CSSProperties } from "react";
import { BallDot, ClothSwatch, CueSwatch } from "./LookPicker.tsx";

const FX_GLYPHS: Record<string, string[]> = {
  confettis: ["🎊", "🎉"],
  etoiles: ["✨", "⭐"],
  bulles: ["🫧", "🫧"],
  coeurs: ["💖", "💕"],
  feu: ["🎆", "🎇"],
  eclairs: ["⚡", "⚡"],
  pieces: ["🪙", "💰"],
};

/** L'aperçu d'un article du billard (petit dans la liste, grand dans la fenêtre d'achat) */
export function BillardShopLook({ kind, id, big = false }: { kind: string; id: string; big?: boolean }) {
  const s = big ? 2.2 : 1;
  if (kind === "bilqueue") return <CueSwatch style={id} width={Math.round(110 * s)} />;
  if (kind === "biltapis") return <ClothSwatch cloth={id} size={Math.round(46 * s)} />;
  if (kind === "bilbilles")
    return (
      <span style={{ display: "inline-flex", gap: 2 * s }} aria-hidden="true">
        {[1, 11, 8, 6].map((n) => (
          <BallDot key={n} id={n} set={id} size={Math.round(20 * s)} />
        ))}
      </span>
    );
  const glyphs = FX_GLYPHS[id] ?? ["✨"];
  return (
    <span style={{ fontSize: 30 * s, lineHeight: 1, display: "inline-flex", gap: 2 } as CSSProperties} aria-hidden="true">
      {glyphs.map((g, i) => (
        <span key={i} style={{ transform: i ? "translateY(-30%) scale(0.7)" : undefined }}>
          {g}
        </span>
      ))}
    </span>
  );
}
