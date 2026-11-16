// Les commandes du joueur, gardées dans son navigateur : quelle touche ou quel bouton de souris fait quoi, et deux
// manières de sauter (la touche du haut, ou le stick poussé vers le haut au doigt).

import { keyLabel } from "../crampons/bindings.ts";

export { keyLabel };

export type ActionId = "up" | "down" | "left" | "right" | "attack" | "strong" | "special" | "jump" | "shield" | "grab" | "taunt";

/** Une touche (`KeyW`, `Space`…) ou un bouton de souris (`Mouse0` gauche, `Mouse1` molette, `Mouse2` droit) */
export type Binding = string;
export type Bindings = Record<ActionId, Binding[]>;

export interface CulbuteSettings {
  preset: string;
  bindings: Bindings;
  /** La touche du haut fait aussi sauter */
  upJumps: boolean;
  /** Au doigt : sauter en poussant le stick vers le haut (et pas de bouton Saut) */
  stickJump: boolean;
  /** La musique pendant le combat */
  music: boolean;
}

export const ACTION_IDS: ActionId[] = ["up", "down", "left", "right", "attack", "strong", "special", "jump", "shield", "grab", "taunt"];
/** Les actions qu'on peut laisser sans touche (le coup fort se fait aussi en tenant Frapper) */
const OPTIONAL: ActionId[] = ["strong", "taunt"];

export const ACTION_ROWS: { id: ActionId; label: string; note?: string }[] = [
  { id: "left", label: "Gauche" },
  { id: "right", label: "Droite" },
  { id: "up", label: "Haut", note: "vise les coups vers le haut" },
  { id: "down", label: "Bas", note: "vise vers le bas, tombe plus vite, traverse une planche" },
  { id: "attack", label: "Frapper", note: "avec une direction : un autre coup ; en courant : coup en courant ; tenir : coup fort chargé" },
  { id: "strong", label: "Coup fort", note: "tout de suite, dans la direction tenue (devant si aucune) ; tenir pour le charger" },
  { id: "special", label: "Spécial", note: "haut + Spécial : remonter vers l'arène" },
  { id: "jump", label: "Sauter", note: "deux fois, une au sol et une en l'air" },
  { id: "shield", label: "Garde", note: "avec une direction : esquive ou roulade" },
  { id: "grab", label: "Saisir", note: "aussi : Frapper pendant la garde ; puis une direction pour projeter" },
  { id: "taunt", label: "Narguer", note: "pour rire, sans effet sur le combat (mais on reste à découvert)" },
];

const MOVES_ZQSD = {
  up: ["KeyW", "ArrowUp"],
  down: ["KeyS", "ArrowDown"],
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
};

export const PRESETS: { id: string; name: string; note: string; bindings: Bindings }[] = [
  {
    id: "souris",
    name: "ZQSD et souris",
    note: "Clic gauche pour frapper (tenu : coup fort), clic droit pour le spécial, F pour le coup fort, Espace pour sauter, Maj pour la garde, E pour saisir",
    bindings: {
      ...MOVES_ZQSD,
      attack: ["Mouse0", "KeyJ"],
      strong: ["KeyF", "Mouse4"],
      special: ["Mouse2", "KeyK"],
      jump: ["Space"],
      shield: ["ShiftLeft", "Mouse1"],
      grab: ["KeyE", "Mouse3"],
      taunt: ["KeyR"],
    },
  },
  {
    id: "fleches",
    name: "Flèches et clavier",
    note: "La main droite sur les flèches, la gauche sur X (frapper), W (coup fort), C, Espace, V et B",
    bindings: {
      up: ["ArrowUp"],
      down: ["ArrowDown"],
      left: ["ArrowLeft"],
      right: ["ArrowRight"],
      attack: ["KeyX"],
      strong: ["KeyZ"],
      special: ["KeyC"],
      jump: ["Space"],
      shield: ["KeyV", "ShiftLeft"],
      grab: ["KeyB"],
      taunt: ["KeyN"],
    },
  },
  {
    id: "lettres",
    name: "ZQSD et lettres",
    note: "Sans souris : J pour frapper, H pour le coup fort, K pour le spécial, Espace pour sauter, L pour la garde, U pour saisir",
    bindings: {
      ...MOVES_ZQSD,
      attack: ["KeyJ"],
      strong: ["KeyH"],
      special: ["KeyK"],
      jump: ["Space", "KeyI"],
      shield: ["KeyL", "ShiftLeft"],
      grab: ["KeyU"],
      taunt: ["KeyO"],
    },
  },
];

const KEY = "culbute-commandes";
/** L'ancien réglage du saut au stick, avant l'écran des commandes */
const OLD_STICK_KEY = "culbute-saut-au-stick";

export function defaultSettings(): CulbuteSettings {
  const p = PRESETS[0]!;
  return { preset: p.id, bindings: structuredClone(p.bindings), upJumps: true, stickJump: false, music: true };
}

function cleanList(v: unknown): Binding[] | null {
  if (!Array.isArray(v)) return null;
  const list = v.filter((b): b is string => typeof b === "string" && b.length > 0 && b.length < 32).slice(0, 2);
  return list;
}

export function loadSettings(): CulbuteSettings {
  const base = defaultSettings();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...base, stickJump: localStorage.getItem(OLD_STICK_KEY) === "1" };
    const data = JSON.parse(raw) as Partial<CulbuteSettings>;
    const bindings = structuredClone(base.bindings);
    for (const id of ACTION_IDS) {
      const list = cleanList(data.bindings?.[id]);
      if (list) bindings[id] = list;
    }
    // Une action venue après coup (Coup fort, Narguer) : sa touche par défaut ne doit pas voler celle d'une autre
    for (const late of OPTIONAL) {
      if (data.bindings?.[late]) continue;
      const used = new Set(ACTION_IDS.filter((id) => !OPTIONAL.includes(id)).flatMap((id) => bindings[id]));
      bindings[late] = bindings[late].filter((b) => !used.has(b));
    }
    return {
      preset: typeof data.preset === "string" ? data.preset : base.preset,
      bindings,
      upJumps: data.upJumps !== false,
      stickJump: data.stickJump === true,
      music: data.music !== false,
    };
  } catch {
    return base;
  }
}

export function saveSettings(s: CulbuteSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Navigation privée pleine : le réglage vaudra le temps de la session
  }
}

/** Affecte une touche à une action : si elle servait déjà ailleurs, elle y est retirée */
export function assignBinding(s: CulbuteSettings, action: ActionId, slot: number, binding: Binding): CulbuteSettings {
  const bindings = structuredClone(s.bindings);
  for (const id of ACTION_IDS) bindings[id] = bindings[id].filter((b) => b !== binding);
  const list = bindings[action];
  if (slot < list.length) list[slot] = binding;
  else list.push(binding);
  return { ...s, preset: "perso", bindings };
}

export function clearBinding(s: CulbuteSettings, action: ActionId, slot: number): CulbuteSettings {
  const bindings = structuredClone(s.bindings);
  bindings[action].splice(slot, 1);
  return { ...s, preset: "perso", bindings };
}

/** Les touches d'une action, pour l'aide (« Clic gauche ou J ») */
export function bindingText(s: CulbuteSettings, action: ActionId): string {
  const list = s.bindings[action];
  return list.length > 0 ? list.map(keyLabel).join(" ou ") : "aucune touche";
}

/** Les actions sans aucune touche : on le signale, sinon le joueur ne pourrait plus sauter ou frapper (narguer est facultatif) */
export function unbound(s: CulbuteSettings): ActionId[] {
  return ACTION_IDS.filter((id) => !OPTIONAL.includes(id) && s.bindings[id].length === 0);
}
