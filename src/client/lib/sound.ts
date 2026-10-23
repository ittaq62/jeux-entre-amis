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
  cardPlace: ["card-place-1.mp3", "card-place-2.mp3", "card-place-3.mp3"],
  cardSlide: ["card-slide-1.mp3", "card-slide-2.mp3"],
  cardDraw: ["card-draw-1.mp3", "card-draw-2.mp3"],
  shuffle: ["card-shuffle.mp3"],
  yourTurn: ["your-turn.mp3"],
  uno: ["uno.mp3"],
  caught: ["caught.mp3"],
  hit: ["hit.mp3"],
  bigHit: ["big-hit.mp3"],
  skip: ["skip.mp3"],
  reverse: ["reverse.mp3"],
  wild: ["whoosh.mp3"],
  win: ["win.mp3"],
  lose: ["lose.mp3"],
  click: ["click.mp3"],
  tick: ["tick.mp3"],
  chat: ["pop.mp3"],
  pop: ["pop.mp3"],
  eliminated: ["eliminated.mp3"],
  buzzer: ["buzzer.mp3"],
  achievement: ["achievement.mp3"],
  join: ["join.mp3"],
};

// Les sons frequents restent discrets, les evenements rares ressortent
const VOLUME: Partial<Record<SoundName, number>> = {
  cardPlace: 0.75,
  cardSlide: 0.5,
  cardDraw: 0.55,
  shuffle: 0.6,
  tick: 0.4,
  click: 0.35,
  chat: 0.45,
  pop: 0.5,
  hit: 0.7,
  bigHit: 0.7,
  yourTurn: 0.55,
  uno: 0.8,
  win: 0.75,
  lose: 0.7,
  join: 0.5,
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
