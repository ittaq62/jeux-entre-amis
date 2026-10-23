/** Avatar dessine a partir de quelques choix : fond, teint, yeux, bouche, chapeau, accessoire. */
export interface AvatarConfig {
  bg: number;
  skin: number;
  hair: number;
  hairColor: number;
  eyes: number;
  mouth: number;
  hat: number;
  extra: number;
}

export const AVATAR_BACKGROUNDS = [
  "#c0392b",
  "#d35400",
  "#d4a017",
  "#27ae60",
  "#16a085",
  "#2980b9",
  "#5b4bdb",
  "#8e44ad",
  "#c2185b",
  "#5d4037",
  "#37474f",
  "#1b5e20",
];

export const AVATAR_SKINS = ["#ffdbb4", "#f1c27d", "#e0ac69", "#c68642", "#8d5524", "#5c3a1e", "#a5d6a7", "#b39ddb"];

export const AVATAR_HAIR_COLORS = ["#1f1a17", "#4a2e1e", "#8a3b1f", "#d9a74a", "#c8c2b8", "#e86aa6", "#4f7bd9"];

export const AVATAR_PARTS = {
  bg: AVATAR_BACKGROUNDS.length,
  skin: AVATAR_SKINS.length,
  hair: 8,
  hairColor: AVATAR_HAIR_COLORS.length,
  eyes: 8,
  mouth: 8,
  hat: 9,
  extra: 7,
} as const;

export const AVATAR_PART_LABELS: Record<keyof AvatarConfig, string> = {
  bg: "Fond",
  skin: "Teint",
  hair: "Coiffure",
  hairColor: "Couleur",
  eyes: "Yeux",
  mouth: "Bouche",
  hat: "Chapeau",
  extra: "Accessoire",
};

export function randomAvatar(rand: () => number = Math.random): AvatarConfig {
  const r = (n: number) => Math.floor(rand() * n);
  return {
    bg: r(AVATAR_PARTS.bg),
    skin: r(6),
    hair: rand() < 0.85 ? 1 + r(AVATAR_PARTS.hair - 1) : 0,
    hairColor: rand() < 0.88 ? r(5) : 5 + r(2),
    eyes: r(AVATAR_PARTS.eyes),
    mouth: r(AVATAR_PARTS.mouth),
    hat: rand() < 0.3 ? r(AVATAR_PARTS.hat) : 0,
    extra: rand() < 0.4 ? r(AVATAR_PARTS.extra) : 0,
  };
}

/** Avatar deterministe pour les bots et les comptes sans avatar. */
export function seededAvatar(seed: string): AvatarConfig {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  let state = h >>> 0;
  return randomAvatar(() => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  });
}

export function sanitizeAvatar(input: unknown): AvatarConfig | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const out = {} as AvatarConfig;
  for (const key of Object.keys(AVATAR_PARTS) as (keyof AvatarConfig)[]) {
    const v = raw[key];
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v >= AVATAR_PARTS[key]) return null;
    out[key] = v;
  }
  return out;
}
