import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { play } from "../lib/sound.ts";
import { usePrefs } from "../stores/prefs.ts";
import { Icon } from "./Icon.tsx";
import { Check } from "./ui.tsx";
import { TourHostMenu } from "../tour/TourHostMenu.tsx";

/**
 * Le son de tous les jeux, gardé sur l'appareil : coupé ou non, le volume général, les effets, la musique et l'ambiance.
 * `children` : les réglages propres au jeu (le commentateur de Crampons, le moteur de Bolides…).
 */
export function SoundSettings({ children }: { children?: ReactNode }) {
  const sound = usePrefs((p) => p.sound);
  const volume = usePrefs((p) => p.volume);
  const sfx = usePrefs((p) => p.sfxVolume);
  const music = usePrefs((p) => p.musicVolume);
  const set = usePrefs((p) => p.set);
  return (
    <div className="sound-settings">
      <label className="sound-row sound-main">
        <span>
          <strong>{sound ? "Son activé" : "Son coupé"}</strong>
          <span className="hint">Pour tous les jeux, sur cet appareil</span>
        </span>
        <Check label="Son" checked={sound} onChange={(v) => set({ sound: v })} />
      </label>
      <Slider label="Volume général" value={volume} disabled={!sound} onChange={(v) => set({ volume: v })} onDone={() => play("click")} />
      <Slider label="Effets" value={sfx} disabled={!sound} onChange={(v) => set({ sfxVolume: v })} onDone={() => play("click")} />
      <Slider label="Musique et ambiance" value={music} disabled={!sound} onChange={(v) => set({ musicVolume: v })} />
      {children && <div className="sound-own">{children}</div>}
    </div>
  );
}

/** Un réglage propre au jeu, sous les volumes communs : une case à cocher et son nom */
export function SoundToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="sound-row">
      <span>{label}</span>
      <Check label={label} checked={checked} onChange={onChange} />
    </label>
  );
}

function Slider({
  label,
  value,
  disabled,
  onChange,
  onDone,
}: {
  label: string;
  value: number;
  disabled: boolean;
  onChange: (v: number) => void;
  onDone?: () => void;
}) {
  return (
    <label className={`sound-slider ${disabled ? "is-off" : ""}`}>
      <span className="sound-slider-top">
        <span>{label}</span>
        <span className="hint num">{Math.round(value * 100)} %</span>
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={onDone}
        onKeyUp={onDone}
        className="range"
        aria-label={label}
      />
    </label>
  );
}

/**
 * Le haut-parleur des en-têtes (accueil, tables, tournée) : il ouvre le réglage du son. L'icône dit si le son est coupé.
 * `children` : les réglages propres au jeu, comme dans `SoundSettings`.
 */
export function SoundButton({ className = "btn btn-ghost btn-icon", children }: { className?: string; children?: ReactNode }) {
  const sound = usePrefs((p) => p.sound);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // Un clic ailleurs, ou Échap, referme le panneau
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", away);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", key);
    };
  }, [open]);
  return (
    <div className="sound-button" ref={box}>
      <button
        type="button"
        className={className}
        onClick={() => setOpen((o) => !o)}
        aria-label={sound ? "Réglages du son" : "Son coupé : réglages du son"}
        aria-expanded={open}
        title="Son"
      >
        <Icon name={sound ? "volume" : "mute"} size={19} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="sound-pop panel"
            role="dialog"
            aria-label="Réglages du son"
            initial={{ y: -6, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -6, opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <SoundSettings>{children}</SoundSettings>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * La ligne « Son » des menus de partie : elle déplie le réglage commun sur place (et les réglages propres au jeu dessous),
 * sans quitter le menu. C'est la ligne que tous les menus de partie partagent : dans une tournée, les commandes de l'hôte
 * (arrêter après ce jeu, passer ce jeu) s'affichent juste avant elle.
 */
export function MenuSound({ children }: { children?: ReactNode }) {
  const sound = usePrefs((p) => p.sound);
  const [open, setOpen] = useState(false);
  return (
    <>
      <TourHostMenu />
      <button type="button" className="menu-item" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Icon name={sound ? "volume" : "mute"} size={18} /> Son
        <Icon name={open ? "chevronUp" : "chevronDown"} size={16} className="menu-item-end" />
      </button>
      {open && (
        <div className="menu-sound">
          <SoundSettings>{children}</SoundSettings>
        </div>
      )}
    </>
  );
}
