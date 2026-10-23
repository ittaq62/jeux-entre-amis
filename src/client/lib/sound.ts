import { usePrefs } from "../stores/prefs.ts";

/**
 * Effets sonores : fichiers libres de droits dans /public/sounds, joues via Web Audio
 * (latence faible, plusieurs sons peuvent se superposer).
 */
export type SoundName =
  | "cardPlace"
  | "cardSlide"
  | "cardDraw"
  | "shuffle"
  | "yourTurn"
  | "uno"
  | "caught"
  | "hit"
  | "bigHit"
  | "skip"
  | "reverse"
  | "wild"
  | "win"
  | "lose"
  | "click"
  | "tick"
  | "chat"
  | "pop"
  | "eliminated"
  | "buzzer"
  | "achievement"
  | "join";

const FILES: Record<SoundName, string[]> = {
  cardPlace: ["card-place-1.ogg", "card-place-2.ogg", "card-place-3.ogg"],
  cardSlide: ["card-slide-1.ogg", "card-slide-2.ogg"],
  cardDraw: ["card-draw-1.ogg", "card-draw-2.ogg"],
  shuffle: ["card-shuffle.ogg"],
  yourTurn: ["your-turn.mp3"],
  uno: ["uno.mp3"],
  caught: ["caught.mp3"],
  hit: ["hit.mp3"],
  bigHit: ["big-hit.mp3"],
  skip: ["skip.ogg"],
  reverse: ["reverse.ogg"],
  wild: ["whoosh.mp3"],
  win: ["win.mp3"],
  lose: ["lose.mp3"],
  click: ["click.ogg"],
  tick: ["tick.ogg"],
  chat: ["pop.ogg"],
  pop: ["pop.ogg"],
  eliminated: ["eliminated.mp3"],
  buzzer: ["buzzer.mp3"],
  achievement: ["achievement.mp3"],
  join: ["join.ogg"],
};

const VOLUME: Partial<Record<SoundName, number>> = {
  cardPlace: 0.9,
  cardDraw: 0.7,
  tick: 0.45,
  click: 0.5,
  chat: 0.5,
  bigHit: 0.75,
  win: 0.8,
};

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const buffers = new Map<string, AudioBuffer | null>();
const loading = new Map<string, Promise<AudioBuffer | null>>();
const lastPlayed = new Map<SoundName, number>();

function context(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  master = ctx.createGain();
  master.connect(ctx.destination);
  return ctx;
}

async function load(file: string): Promise<AudioBuffer | null> {
  if (buffers.has(file)) return buffers.get(file)!;
  if (loading.has(file)) return loading.get(file)!;
  const ac = context();
  if (!ac) return null;
  const p = fetch(`/sounds/${file}`)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
    .then((data) => ac.decodeAudioData(data))
    .catch(() => null)
    .then((buf) => {
      buffers.set(file, buf);
      return buf;
    });
  loading.set(file, p);
  return p;
}

/** A appeler sur un premier geste de l'utilisateur (les navigateurs bloquent le son avant). */
export function unlockAudio() {
  const ac = context();
  if (ac && ac.state === "suspended") void ac.resume();
}

export function preloadSounds() {
  for (const files of Object.values(FILES)) for (const f of files) void load(f);
}

export function play(name: SoundName, opts: { volume?: number; rate?: number; delay?: number } = {}) {
  const prefs = usePrefs.getState();
  if (!prefs.sound) return;
  const now = performance.now();
  // Evite l'effet mitraillette quand beaucoup d'evenements arrivent d'un coup
  if (now - (lastPlayed.get(name) ?? 0) < 45) return;
  lastPlayed.set(name, now);
  const ac = context();
  if (!ac || !master) return;
  const files = FILES[name];
  const file = files[Math.floor(Math.random() * files.length)]!;
  void load(file).then((buffer) => {
    if (!buffer || !master) return;
    const source = ac.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = (opts.rate ?? 1) * (0.96 + Math.random() * 0.08);
    const gain = ac.createGain();
    gain.gain.value = prefs.volume * (VOLUME[name] ?? 1) * (opts.volume ?? 1);
    source.connect(gain).connect(master);
    source.start(ac.currentTime + (opts.delay ?? 0) / 1000);
  });
}

export function vibrate(pattern: number | number[]) {
  if (!usePrefs.getState().haptics) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // non pris en charge (iOS)
  }
}
