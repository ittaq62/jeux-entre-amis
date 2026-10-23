import { useState } from "react";
import { buildClassicDeck } from "../../shared/games/uno/cards.ts";
import { buildNoMercyDeck } from "../../shared/games/uno/nomercy.ts";
import { randomAvatar } from "../../shared/avatar.ts";
import { CardBack, CardFace } from "../components/Card.tsx";
import { AvatarDrawing } from "../components/Avatar.tsx";

/** Planche de controle visuel (uniquement en developpement). */
export function DevGallery() {
  const [seed, setSeed] = useState(0);
  const classic = buildClassicDeck().filter((c, i, all) => all.findIndex((o) => o.kind === c.kind && o.color === c.color && o.value === c.value) === i);
  const extra = buildNoMercyDeck().filter(
    (c, i, all) =>
      !["number", "skip", "reverse", "draw2"].includes(c.kind) && all.findIndex((o) => o.kind === c.kind && o.color === c.color) === i,
  );
  return (
    <div className="felt" style={{ minHeight: "100dvh", padding: 24 }}>
      <h2 style={{ marginBottom: 16 }}>Cartes</h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <CardBack width={92} />
        {classic.concat(extra).map((c) => (
          <CardFace key={c.id + "-" + c.kind} card={c} width={92} />
        ))}
      </div>
      <h2 style={{ margin: "28px 0 16px" }}>
        Avatars <button className="btn btn-sm" onClick={() => setSeed(seed + 1)}>Mélanger</button>
      </h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }} key={seed}>
        {Array.from({ length: 24 }, (_, i) => (
          <AvatarDrawing key={i} avatar={randomAvatar()} size={72} />
        ))}
      </div>
      <h2 style={{ margin: "28px 0 16px" }}>Petites tailles</h2>
      <div style={{ display: "flex", gap: 6 }}>
        {classic.slice(0, 12).map((c) => (
          <CardFace key={c.id} card={c} width={46} />
        ))}
      </div>
    </div>
  );
}
