import { motion } from "motion/react";
import { useState } from "react";
import {
  AVATAR_BACKGROUNDS,
  AVATAR_HAIR_COLORS,
  AVATAR_PART_LABELS,
  AVATAR_PARTS,
  AVATAR_SKINS,
  randomAvatar,
  type AvatarConfig,
} from "../../shared/avatar.ts";
import { AvatarDrawing } from "./Avatar.tsx";
import { Icon } from "./Icon.tsx";

const TABS: (keyof AvatarConfig)[] = ["skin", "hair", "hairColor", "eyes", "mouth", "hat", "extra", "bg"];
const SWATCHES: Partial<Record<keyof AvatarConfig, string[]>> = {
  bg: AVATAR_BACKGROUNDS,
  skin: AVATAR_SKINS,
  hairColor: AVATAR_HAIR_COLORS,
};

export function AvatarEditor({ value, onChange }: { value: AvatarConfig; onChange: (v: AvatarConfig) => void }) {
  const [tab, setTab] = useState<keyof AvatarConfig>("hair");
  const [spin, setSpin] = useState(0);
  const swatches = SWATCHES[tab];
  return (
    <div className="avatar-editor">
      <div className="avatar-editor-preview">
        <motion.div
          key={spin}
          initial={{ rotate: -12, scale: 0.85 }}
          animate={{ rotate: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 14 }}
        >
          <AvatarDrawing avatar={value} size={132} />
        </motion.div>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => {
            onChange(randomAvatar());
            setSpin(spin + 1);
          }}
        >
          <Icon name="dice" size={16} /> Au hasard
        </button>
      </div>
      <div className="avatar-editor-controls">
        <div className="avatar-tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t} type="button" role="tab" aria-selected={t === tab} onClick={() => setTab(t)}>
              {AVATAR_PART_LABELS[t]}
            </button>
          ))}
        </div>
        <div className={`avatar-options ${swatches ? "is-swatches" : ""}`}>
          {Array.from({ length: AVATAR_PARTS[tab] }, (_, i) => {
            const selected = value[tab] === i;
            return (
              <button
                key={i}
                type="button"
                className={`avatar-option ${selected ? "is-selected" : ""}`}
                aria-pressed={selected}
                aria-label={`${AVATAR_PART_LABELS[tab]} ${i + 1}`}
                onClick={() => onChange({ ...value, [tab]: i })}
              >
                {swatches ? (
                  <span className="swatch" style={{ background: swatches[i] }} />
                ) : (
                  <AvatarDrawing avatar={{ ...value, ...(tab === "hair" ? { hat: 0 } : {}), [tab]: i }} size={52} />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
