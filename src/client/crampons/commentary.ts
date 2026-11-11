// Le commentateur : des répliques enregistrées (une voix de synthèse neuronale, générée une fois pour toutes et
// vérifiée réplique par réplique), enchaînées selon le match : un cri de but puis le nom du buteur, puis le score. Il
// annonce les buts, les arrêts, les fautes et les grosses occasions ; il se tait sur le reste plutôt que de bavarder,
// et ne se coupe la parole que pour plus important.

import type { MatchEvent, Team } from "../../shared/games/crampons/model.ts";
import { audioOut, soundBuffer } from "../lib/sound.ts";
import { usePrefs } from "../stores/prefs.ts";

export interface MatchInfo {
  teams: [string, string];
  players: { name: string; team: Team; keeper: boolean }[];
  /** Le score tel que l'image le montre */
  score: [number, number];
  period: number;
}

/** De 0 (une remarque en passant) à 3 (un but, un rouge, la fin du match) */
type Priority = 0 | 1 | 2 | 3;

const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]!;
const variants = (base: string, n: number) => Array.from({ length: n }, (_, i) => `${base}-${i + 1}`);

/** Le nom d'un fichier de réplique : « Le Goff » donne « le-goff », « Prévost » donne « prevost » */
export function voiceSlug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const GENERIC = [
  ...variants("accueil", 3),
  ...variants("envoi", 3),
  ...variants("but", 5),
  ...variants("csc", 2),
  ...variants("frappe", 3),
  ...variants("frappe-forte", 2),
  ...variants("capte", 3),
  ...variants("parade", 3),
  ...variants("poteau", 2),
  ...variants("barre", 2),
  ...variants("faute", 3),
  ...variants("penalty", 2),
  ...variants("jaune", 2),
  ...variants("rouge", 2),
  ...variants("horsjeu", 2),
  ...variants("corner", 2),
  ...variants("tacle", 2),
  ...variants("centre", 2),
  ...variants("profondeur", 2),
  ...variants("crochet", 2),
  ...variants("passe", 2),
  "mitemps",
  "prolongations",
  "tab",
  "fin",
  "fin-nul",
  ...variants("tab-marque", 3),
  ...variants("tab-rate", 3),
];

export class Commentator {
  private enabled: boolean;
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  /** Ce qui est en train d'être dit : on peut l'interrompre pour plus important */
  private playing: { prio: number; until: number; sources: AudioBufferSourceNode[]; gain: GainNode } | null = null;
  private lastEnd = 0;
  private lastLine = "";
  private followUp: ReturnType<typeof setTimeout> | null = null;
  private kickoffs = 0;
  private seq = 0;

  constructor(
    private info: () => MatchInfo,
    enabled: boolean,
  ) {
    this.enabled = enabled;
    if (enabled) this.preload();
  }

  /** Les répliques de tous les matchs, puis les noms de ceux qui jouent celui-ci : prêtes avant d'en avoir besoin */
  private preload() {
    const { players, teams } = this.info();
    const keys = [
      ...GENERIC,
      ...players.map((p) => `nom-${voiceSlug(p.name)}`),
      ...teams.flatMap((t) => [`club-${voiceSlug(t)}-pour`, `club-${voiceSlug(t)}-victoire`]),
    ];
    for (const k of keys) void this.load(k);
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (on) this.preload();
    else this.silence();
  }

  private load(key: string): Promise<AudioBuffer | null> {
    let p = this.buffers.get(key);
    if (!p) {
      p = soundBuffer(`voix/${key}.mp3`);
      this.buffers.set(key, p);
    }
    return p;
  }

  private nameKey(i: number): string | null {
    const p = this.info().players[i];
    return p ? `nom-${voiceSlug(p.name)}` : null;
  }

  /** « Deux à un », suivi de « pour Les Forges » ; « Un partout » */
  private scoreline(): string[] {
    const { score, teams } = this.info();
    const hi = Math.max(...score);
    const lo = Math.min(...score);
    if (hi > 9) return [];
    if (hi === lo) return [`score-${hi}-${lo}`];
    const lead: Team = score[0] > score[1] ? 0 : 1;
    return [`score-${hi}-${lo}`, `club-${voiceSlug(teams[lead])}-pour`];
  }

  /** Le début du match, pendant la présentation */
  welcome() {
    this.say([pick(variants("accueil", 3))], 2);
  }

  event(e: MatchEvent) {
    switch (e.k) {
      case "goal": {
        const name = this.nameKey(e.scorer);
        this.say(e.own ? [pick(variants("csc", 2))] : [pick(variants("but", 5)), ...(name ? [name] : [])], 3);
        // Le score, une fois que la fête a commencé (et que l'image l'affiche)
        this.later(3200, () => this.say(this.scoreline(), 2));
        return;
      }
      case "shot":
        this.say([e.power > 0.85 ? pick(variants("frappe-forte", 2)) : pick(variants("frappe", 3))], 1);
        return;
      case "save":
        this.say([e.caught ? pick(variants("capte", 3)) : pick(variants("parade", 3))], 2);
        return;
      case "woodwork":
        this.say([e.bar ? pick(variants("barre", 2)) : pick(variants("poteau", 2))], 2);
        return;
      case "foul":
        if (e.penalty) this.say([pick(variants("penalty", 2))], 3);
        else this.say([pick(variants("faute", 3))], 1);
        return;
      case "card":
        this.say([e.red ? pick(variants("rouge", 2)) : pick(variants("jaune", 2))], e.red ? 3 : 2);
        return;
      case "offside":
        this.say([pick(variants("horsjeu", 2))], 1);
        return;
      case "restart":
        if (e.kind === "corner") this.say([pick(variants("corner", 2))], 1);
        return;
      case "whistle":
        if (e.why === "kickoff" && this.kickoffs++ === 0) this.say([pick(variants("envoi", 3))], 2);
        return;
      case "half":
        if (e.period === 1) this.say(["mitemps", ...this.scoreline()], 3);
        else if (e.period === 2) this.say(["prolongations"], 3);
        return;
      case "end": {
        const { score, teams } = this.info();
        if (e.winner === null) this.say(["fin-nul", ...(score[0] <= 9 ? [`score-${score[0]}-${score[1]}`] : [])], 3);
        else this.say(["fin", `club-${voiceSlug(teams[e.winner])}-victoire`], 3);
        return;
      }
      case "penalty":
        this.say([e.scored ? pick(variants("tab-marque", 3)) : pick(variants("tab-rate", 3))], 3);
        return;
      case "tackle":
        if (e.won && Math.random() < 0.35) this.say([pick(variants("tacle", 2))], 0);
        return;
      case "kick":
        if (e.kind === "cross") this.say([pick(variants("centre", 2))], 0);
        else if (e.kind === "through" && Math.random() < 0.5) this.say([pick(variants("profondeur", 2))], 0);
        else if (e.kind === "pass" && Math.random() < 0.06) this.say([pick(variants("passe", 2))], 0);
        return;
      case "skill":
        if (Math.random() < 0.4) this.say([pick(variants("crochet", 2))], 0);
        return;
      default:
        return;
    }
  }

  private later(ms: number, fn: () => void) {
    if (this.followUp) clearTimeout(this.followUp);
    this.followUp = setTimeout(() => {
      this.followUp = null;
      fn();
    }, ms);
  }

  /**
   * Dit ces répliques à la suite, si cela vaut la peine : on ne coupe la parole que pour plus important, et les petites
   * remarques attendent un silence de quelques secondes.
   */
  say(keys: string[], prio: Priority) {
    if (!this.enabled || keys.length === 0 || document.hidden) return;
    const prefs = usePrefs.getState();
    if (!prefs.sound || prefs.volume <= 0) return;
    const line = keys.join("+");
    if (line === this.lastLine && prio < 3) return;
    const now = performance.now();
    const playing = this.playing;
    if (playing && now < playing.until) {
      if (prio <= playing.prio) return;
    } else {
      const quiet = now - this.lastEnd;
      if ((prio === 0 && quiet < 6000) || (prio === 1 && quiet < 1200)) return;
    }
    const io = audioOut();
    if (!io) return;
    const seq = ++this.seq;
    this.lastLine = line;
    void Promise.all(keys.map((k) => this.load(k))).then((bufs) => {
      // Une réplique plus récente est passée devant pendant le chargement
      if (seq !== this.seq || !this.enabled) return;
      const parts = bufs.filter((b): b is AudioBuffer => b !== null);
      if (parts.length === 0) return;
      this.stopPlaying();
      const { ctx, out } = io;
      const gain = ctx.createGain();
      gain.gain.value = Math.min(1, prefs.volume * 1.1);
      gain.connect(out);
      let t = ctx.currentTime + 0.03;
      const sources: AudioBufferSourceNode[] = [];
      for (const b of parts) {
        const s = ctx.createBufferSource();
        s.buffer = b;
        s.connect(gain);
        s.start(t);
        sources.push(s);
        t += b.duration + 0.07;
      }
      const until = performance.now() + (t - ctx.currentTime) * 1000;
      this.playing = { prio, until, sources, gain };
      setTimeout(
        () => {
          if (this.playing?.sources !== sources) return;
          this.playing = null;
          this.lastEnd = performance.now();
          gain.disconnect();
        },
        until - performance.now() + 50,
      );
      if (import.meta.env.DEV) {
        const w = window as unknown as { __crSaid?: string[] };
        (w.__crSaid ??= []).push(line);
      }
    });
  }

  private stopPlaying() {
    const p = this.playing;
    if (!p) return;
    this.playing = null;
    const ctx = audioOut()?.ctx;
    if (ctx) {
      // Une coupure nette mais sans claquement
      p.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.015);
      for (const s of p.sources) s.stop(ctx.currentTime + 0.08);
    }
    setTimeout(() => p.gain.disconnect(), 200);
    this.lastEnd = performance.now();
  }

  silence() {
    if (this.followUp) clearTimeout(this.followUp);
    this.followUp = null;
    this.seq++;
    this.stopPlaying();
  }

  dispose() {
    // Un commentateur remplacé (match reconstruit) ne dit plus rien, même ce qu'il avait prévu de dire
    this.enabled = false;
    this.silence();
  }
}
