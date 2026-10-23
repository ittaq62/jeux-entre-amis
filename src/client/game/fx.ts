import { create } from "zustand";
import type { Card } from "../../shared/games/uno/cards.ts";

// ---------------------------------------------------------------------------
// Points d'ancrage : les elements du DOM dont on a besoin pour faire voler les cartes
// ---------------------------------------------------------------------------

const anchors = new Map<string, HTMLElement>();

export function anchor(name: string) {
  return (el: HTMLElement | null) => {
    if (el) anchors.set(name, el);
    else if (anchors.get(name) && !anchors.get(name)!.isConnected) anchors.delete(name);
  };
}

export function anchorRect(name: string): DOMRect | null {
  const el = anchors.get(name);
  if (!el || !el.isConnected) return null;
  return el.getBoundingClientRect();
}

// ---------------------------------------------------------------------------
// Cartes en vol et effets
// ---------------------------------------------------------------------------

export interface Flight {
  id: number;
  card: Card | null;
  from: DOMRect;
  to: DOMRect;
  width: number;
  /** Largeur a l'arrivee (par defaut celle de la cible) */
  toWidth?: number;
  /** Largeur au depart (par defaut celle de la source) */
  fromWidth?: number;
  duration: number;
  delay: number;
  fromRotate: number;
  toRotate: number;
  /** La carte se retourne en vol (dos -> face) */
  flip: boolean;
  done: () => void;
}

export type FxKind = "banner" | "stamp" | "ripple" | "float";

export interface Fx {
  id: number;
  kind: FxKind;
  text?: string;
  sub?: string;
  tone?: "gold" | "red" | "blue" | "green" | "yellow" | "white" | "danger";
  x: number;
  y: number;
  color?: string;
  big?: boolean;
  duration: number;
}

interface FxState {
  flights: Flight[];
  effects: Fx[];
  shake: number;
  removeFlight: (id: number) => void;
}

export const useFx = create<FxState>((set, get) => ({
  flights: [],
  effects: [],
  shake: 0,
  removeFlight: (id) => set({ flights: get().flights.filter((f) => f.id !== id) }),
}));

let seq = 0;

export function fly(spec: Omit<Flight, "id" | "done" | "delay" | "fromRotate" | "toRotate" | "flip"> & Partial<Pick<Flight, "delay" | "fromRotate" | "toRotate" | "flip">>): Promise<void> {
  return new Promise((resolve) => {
    const id = ++seq;
    const flight: Flight = {
      delay: 0,
      fromRotate: 0,
      toRotate: 0,
      flip: false,
      ...spec,
      id,
      done: () => {
        useFx.getState().removeFlight(id);
        resolve();
      },
    };
    useFx.setState({ flights: [...useFx.getState().flights, flight] });
    // Securite : si l'animation n'aboutit jamais (onglet en arriere-plan), on libere quand meme
    setTimeout(() => flight.done(), flight.delay + flight.duration + 600);
  });
}

export function effect(fx: Omit<Fx, "id" | "duration"> & { duration?: number }) {
  const id = ++seq;
  const item: Fx = { duration: 1300, ...fx, id };
  useFx.setState({ effects: [...useFx.getState().effects, item] });
  setTimeout(() => useFx.setState({ effects: useFx.getState().effects.filter((e) => e.id !== id) }), item.duration + 100);
}

export function shake(strength = 1) {
  useFx.setState({ shake: useFx.getState().shake + strength });
}

export function centerOf(rect: DOMRect | null): { x: number; y: number } {
  if (!rect) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
