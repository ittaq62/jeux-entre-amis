import { create } from "zustand";

/** Preferences propres a cet appareil (son, vibrations, accessibilite). */
interface Prefs {
  sound: boolean;
  volume: number;
  haptics: boolean;
  colorblind: boolean;
  reducedEffects: boolean;
  /** Musique d'entracte de la tournée */
  tourMusic: boolean;
  /** Capitale : la caméra s'approche des dés, suit le pion qui avance ; l'astuce pour bouger la vue a été vue */
  capDiceZoom: boolean;
  capFollow: boolean;
  capViewHint: boolean;
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
  tourMusic: true,
  capDiceZoom: false,
  capFollow: false,
  capViewHint: false,
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
