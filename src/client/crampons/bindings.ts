// Les réglages du joueur, gardés dans son navigateur : quelle touche fait quoi, comment on vise, quelle qualité d'image.

export type ActionId =
  "up" | "down" | "left" | "right" | "sprint" | "shoot" | "pass" | "through" | "lob" | "skill" | "swap" | "finesse" | "chip";

/** Une touche (`KeyW`, `Space`…) ou un bouton de souris (`Mouse0` gauche, `Mouse1` molette, `Mouse2` droit) */
export type Binding = string;
export type Bindings = Record<ActionId, Binding[]>;

export type AimMode = "curseur" | "direction";
export type Quality = "auto" | "haute" | "moyenne" | "basse";

export interface CramponsSettings {
  preset: string;
  bindings: Bindings;
  aim: AimMode;
  quality: Quality;
  showFps: boolean;
  /** La voix du commentateur */
  commentary: boolean;
}

export const ACTION_ROWS: { id: ActionId; label: string; note?: string }[] = [
  { id: "up", label: "Avancer" },
  { id: "down", label: "Reculer" },
  { id: "left", label: "Aller à gauche" },
  { id: "right", label: "Aller à droite" },
  { id: "sprint", label: "Sprint" },
  { id: "shoot", label: "Tir", note: "sans le ballon : tacle glissé" },
  { id: "pass", label: "Passe", note: "sans le ballon : presser et tacler" },
  { id: "through", label: "Passe en profondeur" },
  { id: "lob", label: "Lob ou centre" },
  { id: "skill", label: "Crochet", note: "un coup d'accélération pour éviter le tacle" },
  { id: "swap", label: "Changer de joueur" },
  { id: "finesse", label: "Tir enroulé", note: "à tenir en tirant" },
  { id: "chip", label: "Tir piqué", note: "à tenir en tirant" },
];

const MOVES_ZQSD = {
  up: ["KeyW", "ArrowUp"],
  down: ["KeyS", "ArrowDown"],
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
};

export const PRESETS: { id: string; name: string; note: string; aim: AimMode; bindings: Bindings }[] = [
  {
    id: "souris",
    name: "ZQSD et souris",
    note: "Clic gauche pour tirer, clic droit pour passer",
    aim: "curseur",
    bindings: {
      ...MOVES_ZQSD,
      sprint: ["ShiftLeft", "ShiftRight"],
      shoot: ["Mouse0"],
      pass: ["Mouse2"],
      through: ["Space"],
      lob: ["Mouse1", "KeyC"],
      skill: ["KeyQ"],
      swap: ["KeyE"],
      finesse: ["KeyF"],
      chip: ["KeyR"],
    },
  },
  {
    id: "fleches",
    name: "Flèches et clavier",
    note: "La main droite sur les flèches, la gauche sur Espace et C",
    aim: "direction",
    bindings: {
      up: ["ArrowUp"],
      down: ["ArrowDown"],
      left: ["ArrowLeft"],
      right: ["ArrowRight"],
      sprint: ["ShiftLeft", "ShiftRight"],
      shoot: ["KeyC"],
      pass: ["Space"],
      through: ["KeyX"],
      lob: ["KeyV"],
      skill: ["KeyZ"],
      swap: ["KeyE"],
      finesse: ["KeyF"],
      chip: ["KeyG"],
    },
  },
  {
    id: "deux-mains",
    name: "ZQSD et lettres",
    note: "Sans souris : J, K, I et L sous la main droite",
    aim: "direction",
    bindings: {
      ...MOVES_ZQSD,
      sprint: ["ShiftLeft", "ShiftRight"],
      shoot: ["KeyK"],
      pass: ["KeyJ"],
      through: ["KeyI"],
      lob: ["KeyL"],
      skill: ["KeyO"],
      swap: ["KeyU"],
      finesse: ["KeyH"],
      chip: ["KeyY"],
    },
  },
];

const KEY = "crampons-reglages";

export function defaultSettings(): CramponsSettings {
  const p = PRESETS[0]!;
  return { preset: p.id, bindings: structuredClone(p.bindings), aim: p.aim, quality: "auto", showFps: false, commentary: true };
}

export function loadSettings(): CramponsSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSettings();
    const data = JSON.parse(raw) as Partial<CramponsSettings>;
    const base = defaultSettings();
    return {
      preset: typeof data.preset === "string" ? data.preset : base.preset,
      bindings: { ...base.bindings, ...(data.bindings ?? {}) },
      aim: data.aim === "direction" ? "direction" : data.aim === "curseur" ? "curseur" : base.aim,
      quality: data.quality === "haute" || data.quality === "moyenne" || data.quality === "basse" ? data.quality : "auto",
      showFps: data.showFps === true,
      commentary: data.commentary !== false,
    };
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(s: CramponsSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Navigation privée pleine : le réglage vaudra le temps de la session
  }
}

/** Affecte une touche à une action : si elle servait déjà ailleurs, elle y est retirée */
export function assignBinding(s: CramponsSettings, action: ActionId, slot: number, binding: Binding): CramponsSettings {
  const bindings = structuredClone(s.bindings);
  for (const id of Object.keys(bindings) as ActionId[]) bindings[id] = bindings[id].filter((b) => b !== binding);
  const list = bindings[action];
  if (slot < list.length) list[slot] = binding;
  else list.push(binding);
  return { ...s, preset: "perso", bindings };
}

export function clearBinding(s: CramponsSettings, action: ActionId, slot: number): CramponsSettings {
  const bindings = structuredClone(s.bindings);
  bindings[action].splice(slot, 1);
  return { ...s, preset: "perso", bindings };
}

let layout: Map<string, string> | null = null;
const nav =
  typeof navigator !== "undefined" ? (navigator as Navigator & { keyboard?: { getLayoutMap?: () => Promise<Map<string, string>> } }) : null;
void nav?.keyboard?.getLayoutMap?.().then((m) => {
  layout = m;
});

const AZERTY: Record<string, string> = { KeyW: "Z", KeyA: "Q", KeyQ: "A", KeyZ: "W", KeyM: ",", Semicolon: "M" };
const NAMED: Record<string, string> = {
  Space: "Espace",
  ShiftLeft: "Maj",
  ShiftRight: "Maj droite",
  ControlLeft: "Ctrl",
  ControlRight: "Ctrl droite",
  AltLeft: "Alt",
  Enter: "Entrée",
  Tab: "Tab",
  Backspace: "Retour",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Mouse0: "Clic gauche",
  Mouse1: "Molette",
  Mouse2: "Clic droit",
  Mouse3: "Souris arrière",
  Mouse4: "Souris avant",
};

/** Le nom d'une touche, tel qu'il est écrit sur le clavier du joueur */
export function keyLabel(code: Binding): string {
  if (NAMED[code]) return NAMED[code]!;
  const fromLayout = layout?.get(code);
  if (fromLayout) return fromLayout.toUpperCase();
  if (typeof navigator !== "undefined" && navigator.language.startsWith("fr") && AZERTY[code]) return AZERTY[code]!;
  return code.replace(/^Key|^Digit/, "");
}
