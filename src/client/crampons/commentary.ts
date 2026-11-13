// Le commentaire, à deux voix : le commentateur raconte l'action, le consultant (un ancien joueur) l'analyse. Comme à
// la télévision, et comme dans les grands jeux de football : des répliques enregistrées en morceaux, assemblées selon
// le match (« La frappe de… » + « Vasseur ! », « Et c'est le but ! » + « Vasseur ! » + « Ils passent devant ! »), avec
// beaucoup de variantes par situation, jamais deux fois la même de suite, et le contexte : l'ouverture du score,
// l'égalisation, le doublé, le but au bout du temps, le gardien en état de grâce. On se tait pendant le jeu calme, on
// cite les joueurs qui ont le ballon, et le consultant parle quand il y a de la place pour lui.

import type { MatchEvent, Team } from "../../shared/games/crampons/model.ts";
import { audioOut, soundBuffer } from "../lib/sound.ts";
import { usePrefs } from "../stores/prefs.ts";
import { VOIX } from "./voixLignes.ts";
import { voiceSlug } from "./voixNoms.ts";

export interface MatchInfo {
  teams: [string, string];
  players: { name: string; team: Team; keeper: boolean }[];
  /** Le score tel que l'image le montre */
  score: [number, number];
  period: number;
  /** Le chronomètre du match, en secondes (5400 à la fin du temps réglementaire) */
  clock: number;
  weather: "clair" | "pluie" | "neige";
  ambience: "jour" | "soir" | "nuit";
  /** Où est ce joueur à l'image */
  spot: (i: number) => { x: number; z: number } | null;
  /** Où est le ballon à l'image */
  ball: () => { x: number; z: number };
  /** Le sens d'attaque de cette équipe à cet instant : +1 vers les x positifs */
  attack: (team: Team) => 1 | -1;
}

/** De 0 (une remarque en passant) à 3 (un arrêt, un rouge, un penalty) ; 4, le but et la fin du match : rien ne les couvre */
type Priority = 0 | 1 | 2 | 3 | 4;

/** Une réplique en attente : elle suit la précédente si rien de plus important ne vient entre-temps */
interface Pending {
  keys: string[];
  prio: Priority;
  /** Le silence qui la sépare de la précédente, en millisecondes */
  gap: number;
  /** Plus après : passé ce délai, elle n'a plus de sens */
  until: number;
  who: "c" | "k";
}

/** La moitié de la longueur d'un terrain, et la ligne de la surface : pour les frappes de loin, les coups francs */
const HALF_L = 52.5;

const chance = (p: number) => Math.random() < p;

/**
 * Ces répliques appellent la suite sans reprendre son souffle : « La frappe de… », « Deux à un… » (pas « Un partout. »),
 * « D'un côté, … », le cri du but avant le nom du buteur
 */
const continues = (key: string) => /^(frappe-de|passeur|jaune|score|but)-|-cote1$/.test(key) && !/^score-(\d)-\1$/.test(key);

export class Commentator {
  private enabled: boolean;
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  /** Les chargements en attente d'une place (pas plus de six à la fois) */
  private queue: string[] = [];
  private starters = new Map<string, () => void>();
  private inFlight = 0;
  /** Ce qui est en train d'être dit : on peut l'interrompre pour plus important */
  private playing: { prio: number; until: number; sources: AudioBufferSourceNode[]; gain: GainNode; who: "c" | "k" } | null = null;
  private pending: Pending[] = [];
  private lastEnd = 0;
  private lastByWho = { c: 0, k: 0 };
  private lastName = 0;
  /** Quand chaque joueur a été cité pour la dernière fois */
  private namedAt = new Map<number, number>();
  private seq = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** Les dernières variantes de chaque réplique : on n'y revient pas tout de suite */
  private recent = new Map<string, number[]>();

  // Ce qui s'est passé dans le match, pour raconter des histoires
  private score: [number, number];
  private goalsBy = new Map<number, number>();
  private savesBy = new Map<number, number>();
  private keeperPraised = new Set<number>();
  /** Le plus gros retard de chaque équipe dans le match : une victoire après avoir été menée, c'est une remontée */
  private worstDeficit: [number, number] = [0, 0];
  private lastGoalClock = -1;
  private kickoffs = 0;
  private shot: { p: number; team: Team; at: number; done: boolean } | null = null;
  private penaltyAt = -1e9;
  private shootoutAnnounced = false;
  private cues = new Set<string>();

  constructor(
    private info: () => MatchInfo,
    enabled: boolean,
  ) {
    this.enabled = enabled;
    const s = info().score;
    this.score = [s[0], s[1]];
    if (enabled) this.preload();
    this.timer = setInterval(() => this.tick(), 200);
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Les fichiers
  // -------------------------------------------------------------------------------------------------------------------

  /** Tout ce que ce match peut faire dire : les répliques communes, puis les noms de ses joueurs et de ses clubs */
  private preload() {
    const { players, teams } = this.info();
    const keys: string[] = [];
    // D'abord ce qui sert dès les premières secondes et sur les grands moments
    for (const cat of ["accueil-soir", "accueil-jour", "envoi", "avant", "but", "frappe", "parade", "capte"])
      keys.push(...this.variants(cat));
    for (const t of teams) keys.push(...["cote1", "cote2", "pour", "victoire", "devant"].map((x) => `club-${voiceSlug(t)}-${x}`));
    for (const p of players) keys.push(`nom-${voiceSlug(p.name)}`, `nom-${voiceSlug(p.name)}-vif`, `nom-${voiceSlug(p.name)}-but`);
    for (const cat of Object.keys(VOIX)) keys.push(...this.variants(cat));
    for (let hi = 0; hi <= 9; hi++) for (let lo = 0; lo <= hi; lo++) keys.push(`score-${hi}-${lo}`);
    for (const k of keys) this.request(k);
  }

  private variants(cat: string): string[] {
    return Array.from({ length: VOIX[cat] ?? 0 }, (_, i) => `${cat}-${i + 1}`);
  }

  /**
   * Charge une réplique, quelques-unes à la fois pour ne pas encombrer le réseau au début du match. Celle qu'on veut dire
   * tout de suite passe devant les préchargements.
   */
  private request(key: string, urgent = false): Promise<AudioBuffer | null> {
    let p = this.buffers.get(key);
    if (p) {
      const at = urgent ? this.queue.indexOf(key) : -1;
      if (at > 0) {
        this.queue.splice(at, 1);
        this.queue.unshift(key);
      }
      return p;
    }
    p = new Promise<AudioBuffer | null>((resolve) => {
      const go = () => {
        this.inFlight++;
        void soundBuffer(`commentaire/${key}.mp3`).then((b) => {
          this.inFlight--;
          resolve(b);
          const next = this.queue.shift();
          if (next) this.starters.get(next)?.();
        });
      };
      this.starters.set(key, go);
      if (this.inFlight < 6) go();
      else if (urgent) this.queue.unshift(key);
      else this.queue.push(key);
    });
    this.buffers.set(key, p);
    return p;
  }

  /** Une variante de cette réplique, en évitant les dernières dites */
  private pick(cat: string): string | null {
    const n = VOIX[cat] ?? 0;
    if (n === 0) return null;
    const last = this.recent.get(cat) ?? [];
    const free = Array.from({ length: n }, (_, i) => i + 1).filter((i) => !last.includes(i));
    const i = free[Math.floor(Math.random() * free.length)] ?? 1 + Math.floor(Math.random() * n);
    last.push(i);
    // On garde en mémoire un peu plus de la moitié des variantes : la suivante est toujours une autre
    while (last.length > Math.max(1, Math.ceil(n * 0.6))) last.shift();
    this.recent.set(cat, last);
    return `${cat}-${i}`;
  }

  private name(i: number, how: "" | "vif" | "but" = ""): string | null {
    const p = this.info().players[i];
    return p ? `nom-${voiceSlug(p.name)}${how ? `-${how}` : ""}` : null;
  }

  private club(team: Team, what: "cote1" | "cote2" | "pour" | "victoire" | "devant"): string {
    return `club-${voiceSlug(this.info().teams[team])}-${what}`;
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Le match
  // -------------------------------------------------------------------------------------------------------------------

  setEnabled(on: boolean) {
    this.enabled = on;
    if (on) this.preload();
    else this.silence();
  }

  /** Le début du match, pendant la présentation : l'accueil, les deux équipes, l'avis du consultant */
  welcome() {
    const { weather, ambience } = this.info();
    const meteo = weather !== "clair" ? `meteo-${weather}` : ambience === "nuit" ? "meteo-nuit" : ambience === "jour" ? "meteo-jour" : null;
    // Le coup d'envoi suit de près : l'accueil et les deux équipes forment une seule phrase ; l'avis du consultant
    // viendra au premier moment calme
    // « Bonjour » l'après-midi, « Bonsoir » le soir et la nuit
    const intro = this.parts([ambience === "jour" ? "accueil-jour" : "accueil-soir", ...(meteo && chance(0.5) ? [meteo] : [])]);
    this.say([...intro, this.club(0, "cote1"), this.club(1, "cote2")], 2, "c");
  }

  event(e: MatchEvent) {
    const now = performance.now();
    switch (e.k) {
      case "whistle":
        if (e.why === "kickoff") this.kickoff();
        return;
      case "touch":
        this.touch(e.p, now);
        return;
      case "kick":
        if (e.kind === "cross") this.maybe(0.7, ["centre"], 1);
        else if (e.kind === "through") this.maybe(0.5, ["profondeur"], 1);
        else if (e.kind === "lob") this.maybe(0.25, ["long"], 0);
        return;
      case "skill":
        this.maybe(0.4, ["dribble"], 1);
        return;
      case "tackle":
        if (e.won) this.maybe(0.35, ["tacle"], 1);
        return;
      case "shot":
        this.shotTaken(e.p, e.power, now);
        return;
      case "save":
        this.saved(e.p, e.caught);
        return;
      case "woodwork":
        if (this.shot) this.shot.done = true;
        this.say(this.parts([e.bar ? "barre" : "poteau"]), 3, "c");
        if (chance(0.5)) this.later(this.parts(["montant-avis"]), 1, "k", 600, 6000);
        return;
      case "goal":
        this.goal(e.team, e.scorer, e.assist, e.own);
        return;
      case "foul":
        if (e.penalty) {
          this.penaltyAt = now;
          this.say(this.parts(["penalty"]), 3, "c");
          if (chance(0.6)) this.later(this.parts(["penalty-avis"]), 1, "k", 500, 7000);
        } else {
          // Le jeu s'arrête vraiment : le temps de dire ce qui a été sifflé (un tacle par derrière, une charge dans le
          // dos...), et souvent l'avis du consultant
          if (chance(0.8)) this.say(this.parts([chance(0.75) ? `faute-${e.how ?? "glisse"}` : "faute"]), 1, "c");
          if (chance(0.45)) this.later(this.parts(["faute-avis"]), 0, "k", 450, 4500);
        }
        return;
      case "card":
        if (e.red) {
          this.say(this.parts(["rouge"]), 3, "c");
          if (chance(0.7)) this.later(this.parts(["rouge-avis"]), 1, "k", 500, 7000);
        } else {
          const n = this.name(e.p);
          this.say([...this.parts(["jaune"]), ...(n ? [n] : [])], 2, "c");
        }
        return;
      case "offside":
        this.maybe(0.7, ["horsjeu"], 1);
        return;
      case "restart":
        this.restart(e.kind, e.team, now);
        return;
      case "half":
        this.half(e.period);
        return;
      case "end":
        this.end(e.winner);
        return;
      case "penalty":
        this.say(this.parts([e.scored ? "tab-marque" : "tab-rate"]), 3, "c");
        return;
      default:
        return;
    }
  }

  private kickoff() {
    // Le score de l'image est sûr à chaque engagement : on s'y recale
    const s = this.info().score;
    this.score = [s[0], s[1]];
    const n = this.kickoffs++;
    const { period } = this.info();
    const cat = n === 0 ? "envoi" : period === 2 && !this.cues.has("reprise") ? "reprise" : null;
    if (!cat) return;
    this.cues.add(cat);
    // Si l'accueil ou le consultant parlent encore, le coup d'envoi passe juste après eux, avant tout le reste
    // Si l'accueil ou la mi-temps se disent encore, le coup d'envoi passe juste après, devant ce qui attendait (le score,
    // l'avis du consultant), sans l'effacer
    if (this.busy(performance.now())) {
      const keys = this.parts([cat]);
      for (const k of keys) void this.request(k, true);
      this.pending.unshift({ keys, prio: 2, gap: 100, until: performance.now() + 12000, who: "c" });
    } else this.say(this.parts([cat]), 2, "c");
  }

  /** Un joueur reçoit le ballon : on cite son nom de temps en temps, comme on suit le jeu à la télévision */
  private touch(p: number, now: number) {
    if (this.busy(now) || this.pending.length > 0 || now - this.lastEnd < 1200 || now - this.lastName < 3500) return;
    // Pas le même nom deux fois de suite à quelques secondes d'intervalle
    if (now - (this.namedAt.get(p) ?? -1e9) < 15000 || !chance(0.45)) return;
    const n = this.name(p);
    if (!n) return;
    this.lastName = now;
    this.namedAt.set(p, now);
    this.say([n], 1, "c");
  }

  /**
   * Une frappe : on l'annonce un tiers de seconde après, si elle n'a pas déjà fini (au fond, dans les gants) ; sinon
   * « La frappe de… » serait coupé net par le cri du but.
   */
  private shotTaken(p: number, power: number, now: number) {
    const { players } = this.info();
    const team = players[p]?.team ?? 0;
    const shot = { p, team, at: now, done: false };
    this.shot = shot;
    const dist = this.goalDistance(p, team);
    setTimeout(() => {
      if (shot.done || this.shot !== shot || !this.enabled) return;
      let keys: string[];
      if (dist > 26 && chance(0.6)) keys = this.parts(["frappe-loin"]);
      // De près, le ballon est au fond ou dans les gants en un instant : un mot court, que le cri du but peut couper
      else if (dist < 15) keys = this.parts(["frappe"]);
      else if (power > 0.85 && chance(0.4)) keys = this.parts(["frappe-forte"]);
      else if (chance(0.45)) {
        const n = this.name(p, "vif");
        keys = n ? [...this.parts(["frappe-de"]), n] : this.parts(["frappe"]);
      } else keys = this.parts(["frappe"]);
      this.say(keys, 2, "c");
    }, 380);
  }

  private saved(keeper: number, caught: boolean) {
    if (this.shot) this.shot.done = true;
    const n = (this.savesBy.get(keeper) ?? 0) + (caught ? 0.5 : 1);
    this.savesBy.set(keeper, n);
    if (caught) {
      this.say(this.parts(["capte"]), 2, "c");
      return;
    }
    const name = chance(0.35) ? this.name(keeper, "vif") : null;
    this.say([...this.parts(["parade"]), ...(name ? [name] : [])], 3, "c");
    if (n >= 3 && !this.keeperPraised.has(keeper)) {
      this.keeperPraised.add(keeper);
      this.later(this.parts(["gardien-feu"]), 2, "k", 500, 7000);
    } else if (chance(0.35)) this.later(this.parts(["parade-avis"]), 1, "k", 500, 6000);
  }

  private restart(kind: string, team: Team, now: number) {
    const { period } = this.info();
    if (period === 5) {
      if (kind === "penalty" && !this.shootoutAnnounced) {
        this.shootoutAnnounced = true;
        this.say(this.parts(["tab"]), 3, "c");
      }
      return;
    }
    const shot = this.shot;
    const fresh = shot && !shot.done && now - shot.at < 4500;
    if (kind === "goalkick" && fresh) {
      // La frappe est sortie sans que personne ne la touche
      shot.done = true;
      this.say(this.parts(["cote"]), 2, "c");
      if (chance(0.4)) this.later(this.parts(["cote-avis"]), 0, "k", 500, 6000);
      return;
    }
    if (fresh) shot.done = true;
    if (kind === "corner") this.maybe(0.6, ["corner"], 1);
    // Un coup franc à portée de tir : on prévient (le ballon est posé là où l'image le montre)
    else if (kind === "free" && now - this.penaltyAt > 1000 && this.freeKickDanger(team)) {
      this.later(this.parts(["coup-franc"]), 2, "c", 200, 4000);
    }
  }

  private freeKickDanger(team: Team): boolean {
    const { attack, ball } = this.info();
    const b = ball();
    return Math.hypot(attack(team) * HALF_L - b.x, b.z) < 30;
  }

  private goalDistance(p: number, team: Team): number {
    const at = this.info().spot(p);
    if (!at) return 0;
    const gx = this.info().attack(team) * HALF_L;
    return Math.hypot(gx - at.x, at.z);
  }

  private goal(team: Team, scorer: number, assist: number, own: boolean) {
    const now = performance.now();
    const { clock, players } = this.info();
    if (this.shot) this.shot.done = true;
    const before: [number, number] = [this.score[0], this.score[1]];
    const after: [number, number] = [before[0], before[1]];
    after[team]++;
    this.score = after;
    const other: Team = team === 0 ? 1 : 0;
    for (const t of [0, 1] as const) this.worstDeficit[t] = Math.max(this.worstDeficit[t], after[t === 0 ? 1 : 0] - after[t]);
    const minute = clock / 60;
    this.lastGoalClock = clock;

    if (own) {
      this.say(this.parts(["csc"]), 4, "c");
      this.later(this.parts(["csc-avis"]), 1, "k", 600, 9000);
      this.later([...this.scoreline()], 1, "c", 500, 14000);
      return;
    }
    const goals = (this.goalsBy.get(scorer) ?? 0) + 1;
    this.goalsBy.set(scorer, goals);
    const n = this.name(scorer, "but");
    this.say([...this.parts(["but"]), ...(n ? [n] : [])], 4, "c");

    // Ce que ce but change : on choisit l'histoire la plus forte
    const lead = after[team] - after[other];
    const wasLead = before[team] - before[other];
    let story: string[] | null = null;
    if (goals === 3) story = this.parts(["but-triple"]);
    else if (now - this.penaltyAt < 15000) story = this.parts(["but-penalty"]);
    else if (minute >= 87 && Math.abs(lead) <= 1) story = this.parts(["but-tard"]);
    else if (goals === 2 && chance(0.7)) story = this.parts(["but-double"]);
    else if (before[0] + before[1] === 0) story = this.parts(["but-ouverture"]);
    else if (lead === 0) story = this.parts(["but-egalisation"]);
    else if (lead === 1 && wasLead === 0) story = chance(0.5) ? [this.club(team, "devant")] : this.parts(["but-devant"]);
    else if (lead >= 3 && after[team] >= 5) story = this.parts(["but-festival"]);
    else if (lead >= 2) story = this.parts(["but-ecart"]);
    else if (lead < 0) story = this.parts(["but-reduit"]);
    if (story) this.later(story, 3, "c", 150, 6000);
    // La passe décisive, dite dans le même élan que le but (la voix ne retombe pas d'un coup)
    const passer = assist >= 0 && players[assist]?.team === team && chance(0.5) ? this.name(assist, "vif") : null;
    if (passer) this.later([...this.parts(["passeur"]), passer], 2, "c", 250, 8000);
    this.later(this.parts(["but-avis"]), 2, "k", 700, 11000);
    this.later(this.scoreline(), 1, "c", 600, 16000);
  }

  /** « Deux à un… pour Les Forges », « Un partout » */
  private scoreline(): string[] {
    const [a, b] = this.score;
    const hi = Math.max(a, b);
    const lo = Math.min(a, b);
    if (hi > 9) return [];
    if (hi === lo) return [`score-${hi}-${lo}`];
    return [`score-${hi}-${lo}`, this.club(a > b ? 0 : 1, "pour")];
  }

  private half(period: number) {
    if (period === 1) {
      this.say(this.parts(["mitemps"]), 3, "c");
      const [a, b] = this.score;
      const diff = Math.abs(a - b);
      const cat =
        a + b >= 4
          ? "mitemps-fou"
          : diff === 0
            ? a === 0
              ? "mitemps-nul0"
              : "mitemps-nul"
            : diff >= 3
              ? "mitemps-large"
              : "mitemps-court";
      this.later(this.scoreline(), 2, "c", 300, 8000);
      this.later(this.parts([cat]), 2, "k", 600, 14000);
    } else if (period === 2) this.say(this.parts(["prolongations"]), 3, "c");
  }

  private end(winner: Team | null) {
    const [a, b] = this.score;
    if (winner === null) {
      this.say([...this.parts(["fin-nul"]), ...this.scoreline()], 4, "c");
      this.later(this.parts([a + b >= 6 ? "bilan-fou" : a === 0 ? "bilan-nul0" : "bilan-nul"]), 2, "k", 700, 12000);
      return;
    }
    this.say([...this.parts(["fin"]), this.club(winner, "victoire")], 4, "c");
    const diff = Math.abs(a - b);
    const cat =
      this.worstDeficit[winner] >= 1
        ? "bilan-remontada"
        : diff === 1 && this.lastGoalClock >= 85 * 60
          ? "bilan-tard"
          : a + b >= 6
            ? "bilan-fou"
            : diff >= 3
              ? "bilan-large"
              : "bilan-court";
    this.later(this.scoreline(), 2, "c", 400, 9000);
    this.later(this.parts([cat]), 2, "k", 700, 14000);
  }

  /** Le temps qui passe : les fins de match, et les silences que le jeu calme laisse au consultant */
  private tick() {
    if (!this.enabled) return;
    const now = performance.now();
    this.flush(now);
    const { clock, period } = this.info();
    const minute = clock / 60;
    if (period === 2 && minute >= 80 && minute < 85 && !this.cues.has("dix")) {
      this.cues.add("dix");
      this.say(this.parts(["dix-minutes"]), 1, "c");
    }
    if (period === 2 && minute >= 89 && minute < 90 && !this.cues.has("derniere")) {
      this.cues.add("derniere");
      this.say(this.parts(["derniere-minute"]), 2, "c");
    }
    if (this.busy(now) || this.pending.length > 0 || period === 5) return;
    const quiet = now - this.lastEnd;
    // Le consultant, quand le jeu lui laisse de la place, pas plus d'une fois toutes les vingt secondes
    if (!this.cues.has("avant") && quiet > 3000 && minute > 0.5 && minute < 20) {
      // L'avis d'avant-match, que le coup d'envoi n'a pas laissé dire
      this.cues.add("avant");
      this.say(this.parts(["avant"]), 0, "k");
      return;
    }
    if (quiet > 7000 && now - this.lastByWho.k > 20000 && minute > 2 && chance(0.03)) {
      this.say(this.parts([this.analysisCategory(minute)]), 0, "k");
      return;
    }
    // Le commentateur, sur un long moment de construction
    if (quiet > 10000 && chance(0.015)) this.say(this.parts(["construction"]), 0, "c");
  }

  private analysisCategory(minute: number): string {
    const [a, b] = this.score;
    const diff = Math.abs(a - b);
    if (minute >= 70 && diff === 0) return chance(0.5) ? "analyse-nul-tard" : "analyse";
    if (minute >= 70 && diff >= 1) return chance(0.5) ? "analyse-presse" : diff === 1 ? "analyse-court" : "analyse-mene";
    if (diff >= 2) return chance(0.5) ? "analyse-mene" : "analyse";
    return "analyse";
  }

  // -------------------------------------------------------------------------------------------------------------------
  // La parole
  // -------------------------------------------------------------------------------------------------------------------

  /** Les catégories, une variante de chacune */
  private parts(cats: string[]): string[] {
    const out: string[] = [];
    for (const c of cats) {
      const k = this.pick(c);
      if (k) out.push(k);
    }
    return out;
  }

  private maybe(p: number, cats: string[], prio: Priority) {
    if (chance(p)) this.say(this.parts(cats), prio, "c");
  }

  private busy(now: number) {
    return this.playing !== null && now < this.playing.until;
  }

  /** Cette réplique suivra la précédente, après un court silence, si rien de plus important ne vient la remplacer */
  private later(keys: string[], prio: Priority, who: "c" | "k", gapMs: number, maxWaitMs: number) {
    if (keys.length === 0 || !this.enabled) return;
    for (const k of keys) void this.request(k, true);
    const now = performance.now();
    this.pending.push({ keys, prio, gap: gapMs, until: now + maxWaitMs, who });
  }

  /** Les répliques en attente, dans l'ordre, chacune après la fin de la précédente et un court silence */
  private flush(now: number) {
    this.pending = this.pending.filter((p) => p.until > now);
    if (this.busy(now)) return;
    const next = this.pending[0];
    if (!next || now - this.lastEnd < next.gap) return;
    this.pending.shift();
    this.speak(next.keys, next.prio, next.who, true);
  }

  /**
   * Dit ces répliques à la suite, si cela vaut la peine : on ne coupe la parole que pour plus important, et les petites
   * remarques attendent un silence. Une réplique importante efface ce qui attendait (ça n'a plus de sens).
   */
  say(keys: string[], prio: Priority, who: "c" | "k" = "c") {
    if (!this.enabled || keys.length === 0) return;
    const now = performance.now();
    const playing = this.playing;
    if (playing && now < playing.until) {
      if (prio <= playing.prio) return;
    } else {
      const quiet = now - this.lastEnd;
      if ((prio === 0 && quiet < 2500) || (prio === 1 && quiet < 700)) return;
    }
    if (prio >= 2) this.pending = [];
    this.speak(keys, prio, who, false);
  }

  private speak(keys: string[], prio: Priority, who: "c" | "k", queued: boolean) {
    if (document.hidden) return;
    const prefs = usePrefs.getState();
    if (!prefs.sound || prefs.volume <= 0) return;
    const io = audioOut();
    if (!io) return;
    const seq = ++this.seq;
    // Réservé dès maintenant et jusqu'à la fin du chargement (au début du match, le réseau est pris par les préchargements) :
    // une réplique moins importante ne passe pas devant, ni n'annule un cri de but encore en route
    const now = performance.now();
    this.playing = { prio, until: now + 4000, sources: [], gain: io.ctx.createGain(), who };
    void Promise.all(keys.map((k) => this.request(k, true))).then((bufs) => {
      // Une réplique plus récente est passée devant pendant le chargement
      if (seq !== this.seq || !this.enabled) return;
      // Une petite remarque arrivée trop tard n'a plus de sens : on la laisse
      if (prio <= 1 && performance.now() - now > 1500) {
        this.playing = null;
        return;
      }
      const parts = bufs.filter((b): b is AudioBuffer => b !== null);
      if (import.meta.env.DEV) {
        // Pour suivre le commentaire pendant les essais, avec le moment où il parle (et ce qui manque)
        const w = window as unknown as { __crSaid?: string[]; __crT0?: number };
        w.__crT0 ??= performance.now();
        const missing = bufs.some((b) => b === null) ? " (manque)" : "";
        (w.__crSaid ??= []).push(
          `${((performance.now() - w.__crT0) / 1000).toFixed(1)} ${who}${queued ? "+" : ""}:${keys.join("+")}${missing}`,
        );
      }
      if (parts.length === 0) {
        // Aux essais, sans les fichiers, on fait comme s'il avait parlé un instant
        if (import.meta.env.DEV) {
          const until = performance.now() + 900 * keys.length;
          this.playing = { prio, until, sources: [], gain: io.ctx.createGain(), who };
          setTimeout(() => {
            if (this.playing?.until !== until) return;
            this.playing = null;
            this.lastEnd = performance.now();
            this.lastByWho[who] = this.lastEnd;
            this.flush(this.lastEnd);
          }, until - performance.now());
        } else this.playing = null;
        return;
      }
      this.stopPlaying();
      const { ctx, out } = io;
      const gain = ctx.createGain();
      gain.gain.value = Math.min(1, prefs.volume * 1.1);
      gain.connect(out);
      let t = ctx.currentTime + 0.03;
      const sources: AudioBufferSourceNode[] = [];
      const said = keys.filter((_, k) => bufs[k] !== null);
      parts.forEach((b, k) => {
        const s = ctx.createBufferSource();
        s.buffer = b;
        s.connect(gain);
        s.start(t);
        sources.push(s);
        // Les morceaux d'une même phrase s'enchaînent presque sans pause (« La frappe de… » + « Vasseur ! ») ; d'une
        // phrase à la suivante, on respire, comme quand on parle
        t += b.duration + (continues(said[k] ?? "") ? 0.04 : 0.24);
      });
      const until = performance.now() + (t - ctx.currentTime) * 1000;
      this.playing = { prio, until, sources, gain, who };
      setTimeout(
        () => {
          if (this.playing?.sources !== sources) return;
          this.playing = null;
          this.lastEnd = performance.now();
          this.lastByWho[who] = this.lastEnd;
          gain.disconnect();
          this.flush(this.lastEnd);
        },
        until - performance.now() + 30,
      );
    });
  }

  private stopPlaying() {
    const p = this.playing;
    if (!p) return;
    this.playing = null;
    if (p.sources.length === 0) return;
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
    this.pending = [];
    this.seq++;
    this.stopPlaying();
  }

  dispose() {
    // Un commentateur remplacé (match reconstruit) ne dit plus rien, même ce qu'il avait prévu de dire
    this.enabled = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.silence();
  }
}
