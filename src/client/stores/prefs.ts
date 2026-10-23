import { create } from "zustand";

/** Preferences propres a cet appareil (son, vibrations, accessibilite). */
interface Prefs {
  sound: boolean;
  volume: number;
  haptics: boolean;
  colorblind: boolean;
  reducedEffects: boolean;
  set: (patch: Partial<Omit<Prefs, "set">>) => void;
}

const KEY = "tablee:prefs";

function load(): Partial<Prefs> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Prefs>;
  } catch {
    return {};
  }
}

export const usePrefs = create<Prefs>((set, get) => ({
  sound: true,
  volume: 0.7,
  haptics: true,
  colorblind: false,
  reducedEffects: false,
  ...load(),
  set: (patch) => {
    set(patch);
    const { set: _omit, ...rest } = { ...get(), ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify(rest));
    } catch {
      // stockage indisponible (navigation privee)
    }
  },
}));
