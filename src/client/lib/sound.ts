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
  | "footKick"
  | "footShot"
  | "footWhistle"
  | "footWhistleEnd"
  | "footPost"
  | "footNet"
  | "cardTear"
  | "cardRare"
  | "cardEpic"
  | "cardLegend"
  | "join"
  | "cannon"
  | "splash"
  | "explosion"
  | "sunk"
  | "bubbles"
  | "sonar"
  | "torpedo"
  | "ambience"
  | "brickMove"
  | "brickRotate"
  | "brickDrop"
  | "brickLock"
  | "brickClear"
  | "brickQuad"
  | "brickCombo"
  | "brickSpin"
  | "brickHold"
  | "brickAttack"
  | "brickGarbage"
  | "brickWarn"
  | "brickKo"
  | "brickCount"
  | "brickGo"
  | "brickMusic"
  | "tourShake"
  | "tourThrow"
  | "tourReveal"
  | "tourFlip"
  | "tourRules"
  | "tourChip"
  | "tourVote"
  | "tourFanfare"
  | "tourApplause"
  | "tourMusic"
  | "tourTrophy"
  | "tourTrophyMine"
  | "capDiceShake"
  | "capDiceHit"
  | "capHop"
  | "capJump"
  | "capBuild"
  | "capBuildBig"
  | "capGavel"
  | "capBills"
  | "capBuy"
  | "capRent"
  | "capCoins"
  | "capJail"
  | "capBigMoney"
  | "capAuction"
  | "capDeal"
  | "capTurn"
  | "capBankrupt"
  | "capLose"
  | "mecheTick"
  | "mecheStrike"
  | "mecheFuse"
  | "mecheWord"
  | "mecheRefused"
  | "mecheBoom"
  | "mecheFuseBallon"
  | "mecheBoomBallon"
  | "mecheFuseNeige"
  | "mecheBoomNeige"
  | "mecheFuseGateau"
  | "mecheBoomGateau"
  | "mecheFuseReveil"
  | "mecheBoomReveil"
  | "mecheFuseRuche"
  | "mecheBoomRuche"
  | "mecheFuseFusee"
  | "mecheBoomFusee"
  | "mecheFuseGaz"
  | "mecheBoomGaz"
  | "bolidesJump"
  | "bolidesLand"
  | "bolidesTrick"
  | "bolidesTurbo"
  | "bolidesCharge"
  | "bolidesCoin"
  | "bolidesBox"
  | "bolidesBump"
  | "bolidesStrike"
  | "bolidesSplat"
  | "bolidesThunder"
  | "bolidesGrow"
  | "bolidesMagnet"
  | "bolidesThrow"
  | "bolidesFall"
  | "bolidesClang"
  | "bolidesSpring"
  | "bolidesBaa"
  | "bolidesFirework"
  | "bolidesGlide"
  | "bolidesHoop"
  | "bolidesDive"
  | "bolidesRescue";

// Les sons brefs sont en mp3 (six fois plus légers que le wav : un téléphone en 4G les reçoit vite). Seuls les sons
// joués en boucle restent en wav (les mèches ici, le moteur et le dérapage de Bolides) : le mp3 ajoute un court silence
// au début et à la fin, qu'on entendrait à chaque tour de boucle.
const FILES: Record<SoundName, string[]> = {
  cardPlace: ["card-place-1.mp3", "card-place-2.mp3", "card-place-3.mp3"],
  cardSlide: ["card-slide-1.mp3", "card-slide-2.mp3"],
  cardDraw: ["card-draw-1.mp3", "card-draw-2.mp3"],
  shuffle: ["card-shuffle.mp3"],
  yourTurn: ["your-turn.mp3"],
  uno: ["uno.mp3"],
  caught: ["caught.mp3"],
  hit: ["hit.mp3", "hit-2.mp3", "hit-3.mp3"],
  bigHit: ["big-hit.mp3", "big-hit-2.mp3"],
  skip: ["skip.mp3"],
  reverse: ["reverse.mp3"],
  wild: ["whoosh.mp3", "whoosh-2.mp3", "whoosh-3.mp3"],
  win: ["win.mp3"],
  lose: ["lose.mp3"],
  click: ["click.mp3"],
  tick: ["tick.mp3", "tick-2.mp3", "tick-3.mp3"],
  chat: ["pop.mp3", "pop-2.mp3", "pop-3.mp3"],
  pop: ["pop.mp3", "pop-2.mp3", "pop-3.mp3"],
  eliminated: ["eliminated.mp3"],
  buzzer: ["buzzer.mp3"],
  achievement: ["achievement.mp3"],
  footKick: ["foot-kick.mp3"],
  footShot: ["foot-shot.mp3"],
  footWhistle: ["foot-whistle.mp3", "foot-whistle-2.mp3", "foot-whistle-3.mp3"],
  footWhistleEnd: ["foot-whistle-end.mp3"],
  footPost: ["foot-post.mp3", "foot-post-2.mp3"],
  footNet: ["foot-net.mp3"],
  cardTear: ["card-tear.mp3"],
  cardRare: ["card-rare.mp3"],
  cardEpic: ["card-epic.mp3"],
  cardLegend: ["card-legend.mp3"],
  join: ["join.mp3", "join-2.mp3"],
  cannon: ["naval-cannon.mp3"],
  splash: ["naval-splash.mp3"],
  explosion: ["naval-hit.mp3"],
  sunk: ["naval-sunk.mp3"],
  bubbles: ["naval-bubbles.mp3"],
  sonar: ["naval-sonar.mp3"],
  torpedo: ["naval-torpedo.mp3"],
  ambience: ["naval-ambience.mp3"],
  // Briques : des WAV courts, sans le petit silence que le MP3 ajoute au début de chaque son
  brickMove: ["bricks-move.mp3"],
  brickRotate: ["bricks-rotate.mp3"],
  brickDrop: ["bricks-drop-1.mp3", "bricks-drop-2.mp3", "bricks-drop-3.mp3"],
  brickLock: ["bricks-lock-1.mp3", "bricks-lock-2.mp3", "bricks-lock-3.mp3"],
  brickClear: ["bricks-clear.mp3"],
  brickQuad: ["bricks-quad.mp3"],
  brickCombo: ["bricks-combo.mp3"],
  brickSpin: ["bricks-spin.mp3"],
  brickHold: ["bricks-hold.mp3"],
  brickAttack: ["bricks-attack.mp3"],
  brickGarbage: ["bricks-garbage.mp3"],
  brickWarn: ["bricks-warn.mp3"],
  brickKo: ["bricks-ko.mp3"],
  brickCount: ["bricks-count.mp3"],
  brickGo: ["bricks-go.mp3"],
  brickMusic: ["bricks-music.mp3"],
  // La tournée : des dés, des jetons et des cartes, des jingles, les applaudissements et la musique d'entracte
  tourShake: ["tour-shake.mp3"],
  tourThrow: ["tour-throw.mp3"],
  tourReveal: ["tour-reveal.mp3"],
  tourFlip: ["tour-flip.mp3"],
  tourRules: ["tour-rules.mp3"],
  tourChip: ["tour-chip.mp3"],
  tourVote: ["tour-vote.mp3"],
  tourFanfare: ["tour-fanfare.mp3"],
  tourApplause: ["tour-applause.mp3"],
  // Les trophées : un jeton posé sur la table, et un tintement de verre en plus pour les siens
  tourTrophy: ["tour-trophy.mp3"],
  tourTrophyMine: ["tour-trophy-mine.mp3"],
  tourMusic: ["tour-music.mp3"],
  // Capitale : les dés qui roulent, les pions de bois, le marteau, les billets, la sonnette, la porte de la prison
  capDiceShake: ["cap-dice-shake.mp3"],
  capDiceHit: ["cap-dice-hit-1.mp3", "cap-dice-hit-2.mp3", "cap-dice-hit-3.mp3", "cap-dice-hit-4.mp3"],
  capHop: ["cap-hop-1.mp3", "cap-hop-2.mp3", "cap-hop-3.mp3"],
  capJump: ["cap-jump.mp3"],
  capBuild: ["cap-build.mp3"],
  capBuildBig: ["cap-build-big.mp3"],
  capGavel: ["cap-gavel.mp3"],
  capBills: ["cap-bills.mp3"],
  capBuy: ["cap-buy.mp3"],
  capRent: ["cap-rent.mp3"],
  capCoins: ["cap-coins.mp3"],
  capJail: ["cap-jail.mp3"],
  capBigMoney: ["cap-big-money.mp3"],
  // Sans cuivres : la cloche de l'enchère, la signature d'un marché, la sonnette du tour, le coup sourd de la faillite
  capAuction: ["cap-auction.mp3"],
  capDeal: ["cap-deal.mp3"],
  capTurn: ["cap-turn.mp3"],
  capBankrupt: ["cap-bankrupt.mp3"],
  capLose: ["cap-lose.mp3"],
  // Mèche : un tic-tac de bois, l'allumette, la corde qui grésille, et le boum
  mecheTick: ["meche-tick.mp3"],
  mecheStrike: ["meche-strike.mp3"],
  mecheFuse: ["meche-fuse.wav"],
  mecheWord: ["meche-word.mp3"],
  mecheRefused: ["meche-refused.mp3"],
  mecheBoom: ["meche-boom.mp3"],
  // Les bombes de la boutique : la mèche de chacune, en boucle, et sa fin
  mecheFuseBallon: ["meche-ballon-fuse.wav"],
  mecheBoomBallon: ["meche-ballon-boom.mp3"],
  mecheFuseNeige: ["meche-neige-fuse.wav"],
  mecheBoomNeige: ["meche-neige-boom.mp3"],
  mecheFuseGateau: ["meche-gateau-fuse.wav"],
  mecheBoomGateau: ["meche-gateau-boom.mp3"],
  mecheFuseReveil: ["meche-reveil-fuse.wav"],
  mecheBoomReveil: ["meche-reveil-boom.mp3"],
  mecheFuseRuche: ["meche-ruche-fuse.wav"],
  mecheBoomRuche: ["meche-ruche-boom.mp3"],
  mecheFuseFusee: ["meche-fusee-fuse.wav"],
  mecheBoomFusee: ["meche-fusee-boom.mp3"],
  mecheFuseGaz: ["meche-gaz-fuse.wav"],
  mecheBoomGaz: ["meche-gaz-boom.mp3"],
  bolidesJump: ["bolides-jump.mp3"],
  bolidesLand: ["bolides-land.mp3"],
  bolidesTrick: ["bolides-trick.mp3"],
  bolidesTurbo: ["bolides-turbo.mp3"],
  bolidesCharge: ["bolides-charge.mp3"],
  bolidesCoin: ["bolides-coin.mp3"],
  bolidesBox: ["bolides-box.mp3"],
  bolidesBump: ["bolides-bump.mp3"],
  bolidesStrike: ["bolides-strike.mp3"],
  bolidesSplat: ["bolides-splat.mp3"],
  bolidesThunder: ["bolides-thunder.mp3"],
  bolidesGrow: ["bolides-grow.mp3"],
  bolidesMagnet: ["bolides-magnet.mp3"],
  bolidesThrow: ["bolides-throw.mp3"],
  bolidesFall: ["bolides-fall.mp3"],
  bolidesClang: ["bolides-clang.mp3"],
  bolidesSpring: ["bolides-spring.mp3"],
  bolidesBaa: ["bolides-baa.mp3"],
  bolidesFirework: ["bolides-firework.mp3"],
  bolidesGlide: ["bolides-glide.mp3"],
  bolidesHoop: ["bolides-hoop.mp3"],
  bolidesDive: ["bolides-dive.mp3"],
  bolidesRescue: ["bolides-rescue.mp3"],
};

/** Sons de chaque jeu, pour ne précharger que ceux qui servent */
export const CRAMPONS_SOUNDS: SoundName[] = ["footKick", "footShot", "footWhistle", "footWhistleEnd", "footPost", "footNet"];

export const CARD_SOUNDS: SoundName[] = [
  "tourShake",
  "tourFlip",
  "cardSlide",
  "cardTear",
  "cardRare",
  "cardEpic",
  "cardLegend",
  "achievement",
];

export const UNO_SOUNDS: SoundName[] = [
  "cardPlace",
  "cardSlide",
  "cardDraw",
  "shuffle",
  "yourTurn",
  "uno",
  "caught",
  "hit",
  "bigHit",
  "skip",
  "reverse",
  "wild",
  "win",
  "lose",
  "tick",
  "eliminated",
  "buzzer",
];
export const NAVAL_SOUNDS: SoundName[] = [
  "cannon",
  "splash",
  "explosion",
  "sunk",
  "bubbles",
  "sonar",
  "torpedo",
  "ambience",
  "win",
  "lose",
  "buzzer",
];

export const BRICKS_SOUNDS: SoundName[] = [
  "brickMove",
  "brickRotate",
  "brickDrop",
  "brickLock",
  "brickClear",
  "brickQuad",
  "brickCombo",
  "brickSpin",
  "brickHold",
  "brickAttack",
  "brickGarbage",
  "brickWarn",
  "brickKo",
  "brickCount",
  "brickGo",
  "brickMusic",
  "win",
  "lose",
];

export const MECHE_SOUNDS: SoundName[] = [
  "mecheTick",
  "mecheStrike",
  "mecheFuse",
  "mecheWord",
  "mecheRefused",
  "mecheBoom",
  "brickMove",
  "capTurn",
  "capBankrupt",
  "capLose",
  "tourApplause",
  "tourTrophyMine",
  "wild",
];

export const BOLIDES_SOUNDS: SoundName[] = [
  "brickCount",
  "brickGo",
  "capDiceHit",
  "hit",
  "bigHit",
  "wild",
  "pop",
  "click",
  "torpedo",
  "mecheBoom",
  "splash",
  "tourChip",
  "capTurn",
  "tourApplause",
  "tourTrophyMine",
  "capLose",
  "bolidesJump",
  "bolidesLand",
  "bolidesTrick",
  "bolidesTurbo",
  "bolidesCharge",
  "bolidesCoin",
  "bolidesBox",
  "bolidesBump",
  "bolidesStrike",
  "bolidesSplat",
  "bolidesThunder",
  "bolidesGrow",
  "bolidesMagnet",
  "bolidesThrow",
  "bolidesFall",
  "bolidesClang",
  "bolidesSpring",
  "bolidesBaa",
  "bolidesFirework",
  "bolidesGlide",
  "bolidesHoop",
  "bolidesDive",
  "bolidesRescue",
  "tourFanfare",
  "tourApplause",
  "tick",
];

export const TOUR_SOUNDS: SoundName[] = [
  "tourShake",
  "tourThrow",
  "tourReveal",
  "tourFlip",
  "tourRules",
  "tourChip",
  "tourVote",
  "tourFanfare",
  "tourApplause",
  "tourMusic",
  "tourTrophy",
  "tourTrophyMine",
  "tick",
  "join",
  "click",
];

// Les sons frequents restent discrets, les evenements rares ressortent
const VOLUME: Partial<Record<SoundName, number>> = {
  footKick: 0.55,
  footShot: 0.8,
  footWhistle: 0.5,
  footWhistleEnd: 0.5,
  footPost: 0.6,
  footNet: 0.5,
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
  // Deux coups frappés sur du bois : des crêtes nettes, moins de corps que l'ancien bip, d'où un peu plus de volume
  join: 0.85,
  buzzer: 1.15,
  cannon: 0.7,
  splash: 0.6,
  explosion: 0.8,
  sunk: 0.85,
  // Les nouvelles bulles (de vraies petites résonances isolées) portent moins que l'ancien son continu
  bubbles: 0.95,
  sonar: 0.5,
  torpedo: 0.6,
  ambience: 0.35,
  // Doux et feutré : la pose et les gestes restent à peine audibles, les belles poses sortent un peu
  brickMove: 0.18,
  brickRotate: 0.28,
  brickDrop: 0.55,
  brickLock: 0.42,
  brickClear: 0.55,
  brickQuad: 0.62,
  brickCombo: 0.4,
  brickSpin: 0.45,
  brickHold: 0.35,
  brickAttack: 0.35,
  brickGarbage: 0.6,
  brickWarn: 0.35,
  brickKo: 0.6,
  brickCount: 0.5,
  brickGo: 0.55,
  brickMusic: 0.22,
  tourShake: 0.45,
  tourThrow: 0.5,
  tourReveal: 0.55,
  tourFlip: 0.5,
  tourRules: 0.45,
  tourChip: 0.4,
  tourVote: 0.4,
  tourFanfare: 0.6,
  tourApplause: 0.55,
  tourMusic: 0.25,
  tourTrophy: 0.5,
  tourTrophyMine: 0.6,
  capDiceShake: 0.4,
  capDiceHit: 0.55,
  capHop: 0.45,
  capJump: 0.55,
  capBuild: 0.5,
  capBuildBig: 0.55,
  capGavel: 0.55,
  capBills: 0.35,
  capBuy: 0.45,
  capRent: 0.5,
  capCoins: 0.45,
  capJail: 0.5,
  capBigMoney: 0.5,
  mecheTick: 0.42,
  mecheStrike: 0.5,
  mecheFuse: 0.2,
  mecheWord: 0.55,
  mecheRefused: 0.55,
  mecheBoom: 0.85,
  mecheFuseBallon: 0.26,
  mecheBoomBallon: 0.9,
  mecheFuseNeige: 0.26,
  mecheBoomNeige: 0.85,
  mecheFuseGateau: 0.3,
  mecheBoomGateau: 0.8,
  mecheFuseReveil: 0.32,
  mecheBoomReveil: 0.6,
  mecheFuseRuche: 0.2,
  mecheBoomRuche: 0.75,
  mecheFuseFusee: 0.2,
  mecheBoomFusee: 0.9,
  mecheFuseGaz: 0.17,
  mecheBoomGaz: 0.85,
  bolidesJump: 0.42,
  bolidesLand: 0.5,
  bolidesTrick: 0.4,
  bolidesTurbo: 0.45,
  bolidesCharge: 0.3,
  bolidesCoin: 0.4,
  bolidesBox: 0.45,
  bolidesBump: 0.5,
  bolidesStrike: 0.6,
  bolidesSplat: 0.6,
  bolidesThunder: 0.7,
  bolidesGrow: 0.5,
  bolidesMagnet: 0.4,
  bolidesThrow: 0.45,
};

type SoundPrefs = Pick<ReturnType<typeof usePrefs.getState>, "sound" | "volume" | "sfxVolume" | "musicVolume">;

/** Le volume des effets (cartes, tirs, coups, voix) : général × effets, 0 si le son est coupé. Pour tous les jeux. */
export function effectsLevel(p: SoundPrefs = usePrefs.getState()): number {
  return p.sound ? p.volume * (p.sfxVolume ?? 1) : 0;
}

/** Le volume de la musique et de l'ambiance (foule, mer, entracte) : général × musique, 0 si le son est coupé */
export function musicLevel(p: SoundPrefs = usePrefs.getState()): number {
  return p.sound ? p.volume * (p.musicVolume ?? 1) : 0;
}

/** Les boucles qui sont de la musique ou de l'ambiance (les autres, comme une mèche qui brûle, sont des effets) */
const MUSIC_LOOPS = new Set<SoundName>(["brickMusic", "tourMusic", "ambience"]);
const loopLevel = (name: SoundName, p: SoundPrefs = usePrefs.getState()) =>
  (MUSIC_LOOPS.has(name) ? musicLevel(p) : effectsLevel(p)) * (VOLUME[name] ?? 1);

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const buffers = new Map<string, AudioBuffer | null>();
const loading = new Map<string, Promise<AudioBuffer | null>>();
const lastPlayed = new Map<SoundName, number>();
/** La dernière prise jouée de chaque son (pour ne pas rejouer la même) */
const lastTake = new Map<SoundName, number>();

/**
 * Une longue musique en boucle (plus de 20 s) pèse ses 40 Mo une fois décodée (en flottants, en stéréo) : sur un
 * téléphone, on ne la garde pas jusqu'au rechargement de la page. Une minute après son arrêt (ou après son chargement si
 * elle ne part pas, la musique coupée dans les réglages), on l'oublie. Une revanche ou une manche de tournée lancée d'ici
 * là la retrouve telle quelle, sans trou ; plus tard, elle revient du cache du navigateur et repart en fondu.
 */
const LONG_LOOP_S = 20;
export const FORGET_LOOP_MS = 60_000;
const MUSIC_FILES = new Set([...MUSIC_LOOPS].flatMap((name) => FILES[name]));
const forgetting = new Map<string, ReturnType<typeof setTimeout>>();

function forgetLater(file: string) {
  const buf = buffers.get(file);
  if (!MUSIC_FILES.has(file) || !buf || buf.duration < LONG_LOOP_S) return;
  const old = forgetting.get(file);
  if (old !== undefined) clearTimeout(old);
  forgetting.set(
    file,
    setTimeout(() => {
      forgetting.delete(file);
      // Elle joue (ou on l'attend) : on la garde, son arrêt la remettra à oublier
      if ((loop && loop.source.buffer === buf) || (wanted && FILES[wanted][0] === file)) return;
      buffers.delete(file);
      loading.delete(file);
    }, FORGET_LOOP_MS),
  );
}

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
      forgetLater(file);
      return buf;
    });
  loading.set(file, p);
  return p;
}

/** Un son chargé (depuis /sounds), pour le jouer soi-même en boucle (le moteur d'un kart) */
export function soundBuffer(file: string): Promise<AudioBuffer | null> {
  return load(file);
}

/** Le contexte audio et la sortie générale, pour les sons fabriqués à la volée (le moteur d'un kart) */
export function audioOut(): { ctx: AudioContext; out: GainNode } | null {
  const ac = context();
  if (!ac || !master) return null;
  return { ctx: ac, out: master };
}

/** A appeler sur un premier geste de l'utilisateur (les navigateurs bloquent le son avant). */
export function unlockAudio() {
  const ac = context();
  if (ac && ac.state === "suspended") void ac.resume();
}

export function preloadSounds(names: SoundName[] = Object.keys(FILES) as SoundName[]) {
  for (const name of names) for (const f of FILES[name]) void load(f);
}

/** Prêt quand ces sons et ces fichiers sont chargés (ou n'ont pas pu l'être) */
export function soundsLoaded(names: SoundName[], files: string[] = []): Promise<void> {
  return Promise.all([...names.flatMap((name) => FILES[name]), ...files].map((file) => load(file))).then(() => undefined);
}

let loop: { name: SoundName; source: AudioBufferSourceNode; gain: GainNode } | null = null;
/** La boucle demandée : si on l'a coupée pendant son chargement, elle ne part pas une fois chargée */
let wanted: SoundName | null = null;

/** Un son d'ambiance en boucle (une seule à la fois), coupé avec le reste quand le son est désactivé. */
export function startLoop(name: SoundName) {
  stopLoop();
  const prefs = usePrefs.getState();
  if (!prefs.sound) return;
  const ac = context();
  if (!ac || !master) return;
  wanted = name;
  void load(FILES[name][0]!).then((buffer) => {
    if (!buffer || !master || loop || wanted !== name) return;
    const source = ac.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0, ac.currentTime);
    gain.gain.linearRampToValueAtTime(loopLevel(name), ac.currentTime + 1.5);
    source.connect(gain).connect(master);
    source.start();
    loop = { name, source, gain };
  });
}

// Les réglages changent (curseurs du menu, son coupé) : la boucle en cours suit tout de suite, sans repartir
usePrefs.subscribe((p, prev) => {
  if (p.sound === prev.sound && p.volume === prev.volume && p.sfxVolume === prev.sfxVolume && p.musicVolume === prev.musicVolume) return;
  if (!loop || !ctx) return;
  const g = loop.gain.gain;
  g.cancelScheduledValues(ctx.currentTime);
  g.setTargetAtTime(loopLevel(loop.name, p), ctx.currentTime, 0.08);
});

/** Coupe la boucle en cours ; avec un nom, seulement si c'est celle-là (la musique d'entracte ne coupe pas celle d'un jeu) */
export function stopLoop(only?: SoundName) {
  if (!only || wanted === only) wanted = null;
  if (!loop || !ctx || (only && loop.name !== only)) return;
  const { name, source, gain } = loop;
  loop = null;
  gain.gain.cancelScheduledValues(ctx.currentTime);
  gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6);
  source.stop(ctx.currentTime + 0.65);
  forgetLater(FILES[name][0]!);
}

export function play(name: SoundName, opts: { volume?: number; rate?: number; delay?: number } = {}) {
  const prefs = usePrefs.getState();
  if (effectsLevel(prefs) <= 0) return;
  // Evite l'effet mitraillette quand beaucoup d'evenements arrivent d'un coup (sur l'heure prevue du son)
  const when = performance.now() + (opts.delay ?? 0);
  if (Math.abs(when - (lastPlayed.get(name) ?? -1e9)) < 45) return;
  lastPlayed.set(name, when);
  const ac = context();
  if (!ac || !master) return;
  const files = FILES[name];
  // Plusieurs prises d'un même son : jamais deux fois de suite la même (une main ne frappe pas deux fois pareil)
  let k = Math.floor(Math.random() * files.length);
  if (files.length > 1 && k === lastTake.get(name)) k = (k + 1 + Math.floor(Math.random() * (files.length - 1))) % files.length;
  lastTake.set(name, k);
  const file = files[k]!;
  const asked = performance.now();
  void load(file).then((buffer) => {
    if (!buffer || !master) return;
    // En développement seulement : quand chaque son part vraiment, pour mesurer les décalages
    if (import.meta.env.DEV) {
      const w = window as unknown as { __sounds?: { name: string; asked: number; started: number }[] };
      (w.__sounds ??= []).push({ name, asked, started: performance.now() });
    }
    const source = ac.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = (opts.rate ?? 1) * (0.96 + Math.random() * 0.08);
    const gain = ac.createGain();
    // Un peu plus fort ou plus doux à chaque fois (environ un décibel), comme la hauteur juste au-dessus
    gain.gain.value = effectsLevel(prefs) * (VOLUME[name] ?? 1) * (opts.volume ?? 1) * (0.89 + Math.random() * 0.22);
    source.connect(gain).connect(master);
    source.start(ac.currentTime + (opts.delay ?? 0) / 1000);
  });
}

export function vibrate(pattern: number | number[]) {
  if (!usePrefs.getState().haptics) return;
  // Avant le premier geste du joueur, le navigateur refuse (et le dit dans la console) : on n'essaie pas
  const ua = typeof navigator !== "undefined" ? (navigator as { userActivation?: { hasBeenActive: boolean } }).userActivation : undefined;
  if (ua && !ua.hasBeenActive) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // non pris en charge (iOS)
  }
}
