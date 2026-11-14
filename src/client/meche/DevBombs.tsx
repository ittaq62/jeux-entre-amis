import { useState, type CSSProperties } from "react";
import { BOMBS, isBombId, type BombId } from "../../shared/games/meche/bombs.ts";
import { unlockAudio } from "../lib/sound.ts";
import { BombArt } from "./bombs/BombArt.tsx";
import { BombShow } from "./bombs/BombShow.tsx";

/**
 * Page de développement : chaque bombe de Mèche jouée en boucle jusqu'à sa fin, sans table ni compte. `?bombe=gaz` :
 * une seule, en grand. Toucher un aperçu le rejoue avec le son.
 */
export function DevBombs() {
  const params = new URLSearchParams(window.location.search);
  const only = params.get("bombe");
  const list: BombId[] = isBombId(only) ? [only] : BOMBS.map((b) => b.id);
  const [heard, setHeard] = useState<Record<string, number>>({});
  // `?dessins` : chaque bombe en grand, au début de la mèche, à mi-chemin, et tout au bout quand ça chauffe
  if (params.has("dessins")) {
    return (
      <div className="felt page">
        <main style={{ padding: 16, display: "grid", gridTemplateColumns: "repeat(3, 220px)", gap: 12 }}>
          {list.flatMap((id) =>
            [0, 0.5, 1].map((p) => (
              <div key={`${id}-${p}`} className="panel" style={{ padding: 8, background: "#3a2a1e" }}>
                <div className={`meche-bomb ${p === 1 ? "is-hot" : ""}`} style={{ width: 200, "--p": p } as CSSProperties}>
                  <BombArt id={id} />
                </div>
              </div>
            )),
          )}
        </main>
      </div>
    );
  }
  return (
    <div className="felt page">
      <main style={{ padding: 16, display: "grid", gap: 16 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {BOMBS.map((b) => (
            <div key={b.id} className="bomb-choice" style={{ cursor: "default" }} title={b.name}>
              <BombArt id={b.id} className="bomb-thumb" />
            </div>
          ))}
        </div>
        <div
          style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${list.length === 1 ? 560 : 300}px, 1fr))`, gap: 16 }}
        >
          {list.map((id) => (
            <button
              key={id}
              type="button"
              className="panel"
              style={{ padding: 10, display: "grid", gap: 6, textAlign: "left", color: "inherit", font: "inherit", cursor: "pointer" }}
              onClick={() => {
                unlockAudio();
                setHeard((h) => ({ ...h, [id]: (h[id] ?? 0) + 1 }));
              }}
            >
              <strong>{BOMBS.find((b) => b.id === id)!.name}</strong>
              <BombShow bomb={id} audible={heard[id] ?? 0} className="dev-bomb-show" />
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
