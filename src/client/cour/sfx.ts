// Les sons de La Cour des Grands (provisoire : la version complète arrive avec les épreuves).

import { unlockAudio } from "../lib/sound.ts";

export function unlock() {
  unlockAudio();
}

export function stageSound(name: string, opts: { gain?: number; at?: number; x?: number; z?: number; rate?: number }) {
  void name;
  void opts;
}

export const fanfare = () => {};
export const eliminatedMe = () => {};
export const bell = () => {};
export const reveal = () => {};
export const drumroll = () => {};
export const ding = () => {};

export function musicFor(phase: string, ep: string | null) {
  void phase;
  void ep;
}

export function stopMusic() {}
