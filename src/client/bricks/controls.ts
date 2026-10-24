import { create } from "zustand";
import type { InputAction } from "./local.ts";

/** Touches et réglages de jeu propres à cet appareil */
interface Controls {
  keys: Record<InputAction, string[]>;
  das: number;
  arr: number;
  ghost: boolean;
  music: boolean;
  set: (patch: Partial<Omit<Controls, "set">>) => void;
  reset: () => void;
}

export const DEFAULT_KEYS: Record<InputAction, string[]> = {
  left: ["ArrowLeft"],
  right: ["ArrowRight"],
  soft: ["ArrowDown"],
  hard: ["Space"],
  cw: ["ArrowUp", "KeyX"],
  ccw: ["KeyZ", "ControlLeft"],
  flip: ["KeyA"],
  hold: ["KeyC", "ShiftLeft"],
};

export const ACTION_LABELS: Record<InputAction, string> = {
  left: "Gauche",
  right: "Droite",
  soft: "Descendre",
  hard: "Lâcher",
  cw: "Tourner à droite",
  ccw: "Tourner à gauche",
  flip: "Demi-tour",
  hold: "Réserve",
};

const KEY = "tablee:briques";
const DEFAULTS = { keys: DEFAULT_KEYS, das: 133, arr: 10, ghost: true, music: true };

function load(): Partial<typeof DEFAULTS> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<typeof DEFAULTS>;
  } catch {
    return {};
  }
}

function save(state: Omit<Controls, "set" | "reset">) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // stockage indisponible (navigation privée)
  }
}

export const useControls = create<Controls>((set, get) => ({
  ...DEFAULTS,
  ...load(),
  set: (patch) => {
    set(patch);
    const { set: _s, reset: _r, ...rest } = { ...get(), ...patch };
    save(rest);
  },
  reset: () => {
    set(DEFAULTS);
    save(DEFAULTS);
  },
}));

/** Nom lisible d'une touche (« Espace », « Flèche gauche »…) */
export function keyName(code: string): string {
  const names: Record<string, string> = {
    Space: "Espace",
    ArrowLeft: "←",
    ArrowRight: "→",
    ArrowUp: "↑",
    ArrowDown: "↓",
    ShiftLeft: "Maj",
    ShiftRight: "Maj droite",
    ControlLeft: "Ctrl",
    ControlRight: "Ctrl droite",
    AltLeft: "Alt",
    Enter: "Entrée",
  };
  if (names[code]) return names[code]!;
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  return code;
}

export function actionFor(code: string, keys: Record<InputAction, string[]>): InputAction | null {
  for (const [action, list] of Object.entries(keys) as [InputAction, string[]][]) if (list.includes(code)) return action;
  return null;
}
