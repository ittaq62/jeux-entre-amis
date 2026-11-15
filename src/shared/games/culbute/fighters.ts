// Qui se bat : les six Habitués, chacun sous ses traits (ceux de sa carte de l'album) avec son style, ou son propre
// personnage de profil qui emprunte le style d'un Habitué. Et les tenues, qui ne changent que les couleurs.

import type { AvatarConfig } from "../../avatar.ts";
import { HABITUE_IDS, isHabitueId, type HabitueId } from "./model.ts";

const face = (bg: number, skin: number, hair: number, hairColor: number, eyes: number, mouth: number, hat: number, extra: number) =>
  ({ bg, skin, hair, hairColor, eyes, mouth, hat, extra }) satisfies AvatarConfig;

export interface HabitueInfo {
  id: HabitueId;
  name: string;
  /** Ses traits : les mêmes que sur sa carte de l'album */
  avatar: AvatarConfig;
  /** Une phrase pour le présenter */
  line: string;
}

export const HABITUES: Record<HabitueId, HabitueInfo> = {
  ginette: {
    id: "ginette",
    name: "Ginette",
    avatar: face(7, 0, 3, 2, 2, 4, 0, 0),
    line: "Elle garde toujours un coup pour les grandes occasions.",
  },
  marcel: { id: "marcel", name: "Marcel", avatar: face(9, 1, 0, 4, 4, 6, 4, 0), line: "Sa chaise a fini par prendre sa forme." },
  huguette: { id: "huguette", name: "Huguette", avatar: face(11, 0, 5, 4, 6, 4, 0, 5), line: "Quatre-vingt-sept ans, zéro pitié." },
  raymond: {
    id: "raymond",
    name: "Raymond",
    avatar: face(5, 0, 1, 4, 0, 3, 0, 1),
    line: "C'était mieux avant. Avant quoi ? Il ne sait plus.",
  },
  simone: { id: "simone", name: "Simone", avatar: face(10, 3, 4, 0, 6, 3, 7, 2), line: "Elle ne parle pas. Elle gagne." },
  lucien: { id: "lucien", name: "Lucien", avatar: face(3, 2, 1, 1, 7, 2, 0, 0), line: "Il annonce la victoire avant d'avoir gagné." },
};

/** Le combattant choisi : un Habitué, ou « moi » (son avatar) avec le style d'un Habitué */
export type FighterPick = { who: HabitueId; tenue?: TenueId } | { who: "moi"; style: HabitueId };

export function isFighterPick(v: unknown): v is FighterPick {
  const p = v as FighterPick | null;
  if (!p || typeof p !== "object") return false;
  if (p.who === "moi") return isHabitueId((p as { style?: unknown }).style);
  return isHabitueId(p.who) && (p.tenue === undefined || isTenueId(p.tenue));
}

export const styleOf = (p: FighterPick): HabitueId => (p.who === "moi" ? p.style : p.who);

// ---------------------------------------------------------------------------
// Les tenues : d'autres couleurs pour chaque Habitué (la boutique les vend)
// ---------------------------------------------------------------------------

/** Les couleurs d'un combattant : le haut, le bas, l'accessoire et sa touche de couleur */
export interface Palette {
  top: string;
  bottom: string;
  prop: string;
  accent: string;
}

export type TenueId = "dimanche" | "kermesse" | "nuit" | "or";
export const TENUE_IDS: TenueId[] = ["dimanche", "kermesse", "nuit", "or"];
export const isTenueId = (v: unknown): v is TenueId => typeof v === "string" && (TENUE_IDS as string[]).includes(v);

export interface TenueInfo {
  id: TenueId;
  name: string;
  price: number;
}

export const TENUES: TenueInfo[] = [
  { id: "dimanche", name: "Du dimanche", price: 0 },
  { id: "kermesse", name: "De kermesse", price: 150 },
  { id: "nuit", name: "De bal de nuit", price: 250 },
  { id: "or", name: "En or", price: 600 },
];

export const PALETTES: Record<HabitueId, Record<TenueId, Palette>> = {
  ginette: {
    dimanche: { top: "#c2185b", bottom: "#4a3a5e", prop: "#7a3b2e", accent: "#f2c94c" },
    kermesse: { top: "#2f9e6a", bottom: "#f4efe2", prop: "#e2483d", accent: "#ffffff" },
    nuit: { top: "#283a6b", bottom: "#151b2e", prop: "#8e44ad", accent: "#c8d7ff" },
    or: { top: "#d4a017", bottom: "#6b4c12", prop: "#f2c94c", accent: "#fff3b0" },
  },
  marcel: {
    dimanche: { top: "#8a5a3b", bottom: "#36404d", prop: "#3f7fd8", accent: "#e8e2d4" },
    kermesse: { top: "#e2483d", bottom: "#f4efe2", prop: "#2f9e6a", accent: "#ffffff" },
    nuit: { top: "#1f2a44", bottom: "#0f1424", prop: "#5b4bdb", accent: "#9fb7ff" },
    or: { top: "#d4a017", bottom: "#6b4c12", prop: "#f2c94c", accent: "#fff3b0" },
  },
  huguette: {
    dimanche: { top: "#8e7cc3", bottom: "#5d4037", prop: "#e86aa6", accent: "#f4efe2" },
    kermesse: { top: "#f2994a", bottom: "#2d6a4f", prop: "#3f7fd8", accent: "#ffffff" },
    nuit: { top: "#2c2541", bottom: "#141019", prop: "#c2185b", accent: "#e0c3ff" },
    or: { top: "#d4a017", bottom: "#6b4c12", prop: "#f2c94c", accent: "#fff3b0" },
  },
  raymond: {
    dimanche: { top: "#2f80ed", bottom: "#d8cfb8", prop: "#9aa3ad", accent: "#f2c94c" },
    kermesse: { top: "#27ae60", bottom: "#ece4cf", prop: "#c0392b", accent: "#ffffff" },
    nuit: { top: "#162447", bottom: "#0b1020", prop: "#5d6d7e", accent: "#a6c8ff" },
    or: { top: "#d4a017", bottom: "#6b4c12", prop: "#f2c94c", accent: "#fff3b0" },
  },
  simone: {
    dimanche: { top: "#1b5e20", bottom: "#212121", prop: "#c0392b", accent: "#f2c94c" },
    kermesse: { top: "#e86aa6", bottom: "#ffffff", prop: "#2980b9", accent: "#f4efe2" },
    nuit: { top: "#311b4f", bottom: "#0d0a14", prop: "#e2e2e2", accent: "#b39ddb" },
    or: { top: "#d4a017", bottom: "#6b4c12", prop: "#f2c94c", accent: "#fff3b0" },
  },
  lucien: {
    dimanche: { top: "#d35400", bottom: "#2c3e50", prop: "#c0392b", accent: "#f4efe2" },
    kermesse: { top: "#3f7fd8", bottom: "#f4efe2", prop: "#27ae60", accent: "#ffffff" },
    nuit: { top: "#232b3e", bottom: "#0e121b", prop: "#8e44ad", accent: "#b3c7ff" },
    or: { top: "#d4a017", bottom: "#6b4c12", prop: "#f2c94c", accent: "#fff3b0" },
  },
};

/** La tenue d'un avatar : le haut à la couleur de son fond, l'accessoire aux couleurs de la tenue de base du style */
export function avatarPalette(bg: string, style: HabitueId): Palette {
  const base = PALETTES[style].dimanche;
  return { top: bg, bottom: "#34383f", prop: base.prop, accent: base.accent };
}

/** Un combattant au hasard pour un bot, différent des autres quand c'est possible */
export function botPick(taken: HabitueId[], random: () => number): FighterPick {
  const free = HABITUE_IDS.filter((id) => !taken.includes(id));
  const pool = free.length > 0 ? free : HABITUE_IDS;
  return { who: pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]! };
}
