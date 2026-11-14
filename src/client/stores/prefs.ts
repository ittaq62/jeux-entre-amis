import { create } from "zustand";
import type { SkinId, VehicleId } from "../../shared/games/bolides/garage.ts";
import type { TokenId } from "../../shared/games/capitale/tokens.ts";
import type { BallId, FeteId } from "../../shared/games/crampons/boutique.ts";
import type { SkinId as NavalSkinId } from "../../shared/games/naval/skins.ts";
import type { BackId } from "../../shared/games/uno/backs.ts";

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
  /** Bolides : le bruit du moteur de son kart, et la musique de course */
  bolidesEngine: boolean;
  bolidesMusic: boolean;
  /** Bolides : le dernier véhicule et le dernier skin choisis sur cet appareil */
  bolidesVehicle: VehicleId | null;
  bolidesSkin: SkinId | null;
  /** Les objets partent tout seuls au bon moment */
  bolidesAutoItem: boolean;
  /** Un petit coup de volant pour rester sur la route */
  bolidesAssist: boolean;
  /** Combien de fois on a reçu chaque objet (l'explication s'efface quand on le connaît) */
  bolidesItemsSeen: Record<string, number>;
  /** UNO : le dos de cartes choisi en dernier sur cet appareil, repris à chaque table */
  unoBack: BackId | null;
  /** Crampons : le ballon et la célébration de ses buts, choisis sur cet appareil et repris à chaque match */
  cramponsBall: BallId | null;
  cramponsFete: FeteId | null;
  /** Bataille navale : le thème de sa flotte, choisi en dernier sur cet appareil et repris à chaque table */
  navalSkin: NavalSkinId | null;
  /** Capitale : son pion, choisi en dernier sur cet appareil et repris à chaque table */
  capitaleToken: TokenId | null;
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
  bolidesEngine: true,
  bolidesMusic: true,
  bolidesVehicle: null,
  bolidesSkin: null,
  bolidesAutoItem: false,
  bolidesAssist: false,
  bolidesItemsSeen: {},
  unoBack: null,
  cramponsBall: null,
  cramponsFete: null,
  navalSkin: null,
  capitaleToken: null,
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
