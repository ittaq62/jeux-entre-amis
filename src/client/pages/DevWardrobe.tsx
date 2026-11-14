// Page de développement : chaque chose de la garde-robe sur plusieurs visages, de la pastille de 20 px au grand portrait.
// /dev/personnage, ?place=hat pour une seule place, ?tout pour un personnage qui porte tout à la fois.

import { useSearch } from "wouter";
import { seededAvatar, type AvatarConfig } from "../../shared/avatar.ts";
import { WEAR_SLOT_NAMES, WEAR_SLOTS, wearOf, type WearSlot } from "../../shared/wardrobe.ts";
import { AvatarDrawing } from "../components/Avatar.tsx";

const FACES: AvatarConfig[] = [
  { ...seededAvatar("Gaston-ABCD"), hat: 0 },
  { bg: 5, skin: 4, hair: 3, hairColor: 0, eyes: 3, mouth: 1, hat: 0, extra: 0 },
  { bg: 2, skin: 1, hair: 4, hairColor: 3, eyes: 0, mouth: 4, hat: 0, extra: 3 },
  { bg: 8, skin: 0, hair: 2, hairColor: 4, eyes: 1, mouth: 0, hat: 0, extra: 0 },
];
const SIZES = [20, 28, 44, 64, 120];

export function DevWardrobe() {
  const params = new URLSearchParams(useSearch());
  const only = params.get("place") as WearSlot | null;
  const slots = only && WEAR_SLOTS.includes(only) ? [only] : WEAR_SLOTS;
  const everything: AvatarConfig = {
    ...FACES[1]!,
    wear: {
      hair: "afro",
      hat: "couronne-fleurs",
      extra: "lunettes-coeur",
      face: "bouc",
      outfit: "cape",
      bg: "nuit",
      frame: "cadre-or",
      fx: "etincelles",
    },
  };
  return (
    <div className="felt page" style={{ padding: 24, overflow: "auto" }}>
      <h1>Garde-robe du personnage</h1>
      {params.has("tout") && (
        <div style={{ display: "flex", gap: 16, alignItems: "end", margin: "16px 0" }}>
          {SIZES.map((s) => (
            <AvatarDrawing key={s} avatar={everything} size={s} />
          ))}
          <AvatarDrawing avatar={everything} size={220} />
        </div>
      )}
      {slots.map((slot) => (
        <section key={slot} style={{ marginBottom: 28 }}>
          <h2>{WEAR_SLOT_NAMES[slot]}</h2>
          <div style={{ display: "grid", gap: 10 }}>
            {wearOf(slot).map((item) => (
              <div key={item.id} data-item={item.id} style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ width: 170, fontSize: 14 }}>
                  {item.name} <small className="hint">{item.price}</small>
                </span>
                {SIZES.map((s) => (
                  <AvatarDrawing key={s} avatar={{ ...FACES[0]!, wear: { [slot]: item.id } }} size={s} />
                ))}
                {FACES.slice(1).map((f, i) => (
                  <AvatarDrawing key={i} avatar={{ ...f, wear: { [slot]: item.id } }} size={64} />
                ))}
                <AvatarDrawing avatar={{ ...FACES[2]!, hat: 3, wear: { [slot]: item.id } }} size={64} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
