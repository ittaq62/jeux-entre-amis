// Le commentateur : la voix française du navigateur raconte le match. Il annonce les buts, les arrêts, les fautes et les
// grosses occasions ; il se tait sur le reste plutôt que de bavarder, et ne se coupe la parole que pour plus important.

import type { MatchEvent, Team } from "../../shared/games/crampons/model.ts";
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

/** La plus belle voix française disponible : les voix « naturelles » en ligne d'abord, sinon celles du système */
function bestFrenchVoice(): SpeechSynthesisVoice | null {
  if (typeof speechSynthesis === "undefined") return null;
  const voices = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().replace("_", "-").startsWith("fr"));
  const score = (v: SpeechSynthesisVoice) =>
    (/natural|neural/i.test(v.name) ? 8 : 0) +
    (/online/i.test(v.name) ? 4 : 0) +
    (/google/i.test(v.name) ? 3 : 0) +
    (v.lang.toLowerCase().replace("_", "-") === "fr-fr" ? 2 : 0) +
    (/henri|remy|rémy|paul|thomas|denise|vivienne|eloise|amélie|amelie/i.test(v.name) ? 1 : 0);
  return voices.sort((a, b) => score(b) - score(a))[0] ?? null;
}

export class Commentator {
  private voice: SpeechSynthesisVoice | null = null;
  private enabled: boolean;
  private speakingPrio = -1;
  private lastEnd = 0;
  private lastLine = "";
  private followUp: ReturnType<typeof setTimeout> | null = null;
  private kickoffs = 0;
  private readonly onVoices = () => {
    this.voice = bestFrenchVoice();
  };

  constructor(
    private info: () => MatchInfo,
    enabled: boolean,
  ) {
    this.enabled = enabled;
    if (typeof speechSynthesis === "undefined") return;
    this.voice = bestFrenchVoice();
    speechSynthesis.addEventListener("voiceschanged", this.onVoices);
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (!on) this.silence();
  }

  /** Le nom d'un joueur, ou celui de son équipe s'il n'en a pas */
  private name(i: number): string {
    return this.info().players[i]?.name ?? "";
  }

  private teamOf(i: number): string {
    const p = this.info().players[i];
    return p ? this.info().teams[p.team] : "";
  }

  /** « 2 à 1 pour Forez », « 1 partout » */
  private scoreline(): string {
    const { score, teams } = this.info();
    if (score[0] === score[1]) return score[0] === 0 ? "Toujours zéro à zéro." : `${score[0]} partout.`;
    const lead: Team = score[0] > score[1] ? 0 : 1;
    return `${Math.max(...score)} à ${Math.min(...score)} pour ${teams[lead]}.`;
  }

  /** Le début du match, pendant la présentation */
  welcome() {
    const [a, b] = this.info().teams;
    this.say(
      pick([
        `Bonsoir et bienvenue au stade ! ${a} reçoit ${b}, coup d'envoi dans un instant.`,
        `Bienvenue pour ce match entre ${a} et ${b} ! Les joueurs sont prêts.`,
        `Ambiance des grands soirs pour ${a} contre ${b} ! C'est bientôt parti.`,
      ]),
      2,
    );
  }

  event(e: MatchEvent) {
    switch (e.k) {
      case "goal": {
        const who = this.name(e.scorer);
        this.say(
          e.own
            ? pick([`Oh non ! Contre son camp de ${who} !`, `But contre son camp ! ${who} trompe son propre gardien !`])
            : pick([
                `But ! ${who} !`,
                `Et c'est le but ! ${who} !`,
                `Il l'a fait ! But de ${who} !`,
                `${who} fait trembler les filets ! But !`,
                `Quelle réalisation de ${who} ! But !`,
              ]),
          3,
          true,
        );
        // Le score, une fois que la fête a commencé (et que l'image l'affiche)
        this.later(2600, () => this.say(this.scoreline(), 2));
        return;
      }
      case "shot":
        this.say(
          e.power > 0.85
            ? pick([`Quelle frappe de ${this.name(e.p)} !`, `${this.name(e.p)} déclenche une frappe terrible !`])
            : pick([`${this.name(e.p)} frappe !`, `Frappe de ${this.name(e.p)} !`, `${this.name(e.p)} tente sa chance !`]),
          1,
        );
        return;
      case "save":
        this.say(
          e.caught
            ? pick([`Bien capté par ${this.name(e.p)}.`, `${this.name(e.p)} s'en saisit.`, `Le gardien ${this.name(e.p)} est là.`])
            : pick([`Quel arrêt de ${this.name(e.p)} !`, `Superbe parade de ${this.name(e.p)} !`, `${this.name(e.p)} sort le grand jeu !`]),
          2,
        );
        return;
      case "woodwork":
        this.say(
          e.bar
            ? pick(["Sur la barre !", "La transversale ! Quelle occasion !"])
            : pick(["Sur le poteau !", "Le poteau ! C'était tout près !"]),
          2,
        );
        return;
      case "foul":
        if (e.penalty)
          this.say(pick([`Penalty ! ${this.name(e.p)} fauche dans la surface !`, `L'arbitre désigne le point de penalty !`]), 3);
        else
          this.say(
            pick([`Faute de ${this.name(e.p)}.`, `Coup de sifflet, faute de ${this.name(e.p)}.`, `${this.name(e.p)} commet la faute.`]),
            1,
          );
        return;
      case "card":
        if (e.red)
          this.say(
            pick([`Carton rouge pour ${this.name(e.p)} ! Il est expulsé !`, `Rouge ! ${this.name(e.p)} doit quitter le terrain !`]),
            3,
          );
        else this.say(pick([`Carton jaune pour ${this.name(e.p)}.`, `${this.name(e.p)} est averti.`]), 2);
        return;
      case "offside":
        this.say(pick([`Hors-jeu de ${this.name(e.p)}.`, "Le drapeau se lève : hors-jeu.", `${this.name(e.p)} était parti trop tôt.`]), 1);
        return;
      case "restart":
        if (e.kind === "corner") this.say(pick([`Corner pour ${this.info().teams[e.team]}.`, `Ce sera un corner.`]), 1);
        return;
      case "whistle":
        if (e.why === "kickoff" && this.kickoffs++ === 0) this.say(pick(["C'est parti !", "Coup d'envoi !", "Et le match commence !"]), 2);
        return;
      case "half":
        if (e.period === 1) this.say(`C'est la mi-temps. ${this.scoreline()}`, 3);
        else if (e.period === 2) this.say(`Fin du temps réglementaire. ${this.scoreline()} Place aux prolongations !`, 3);
        return;
      case "end": {
        const { score, teams } = this.info();
        if (e.winner === null) this.say(`C'est terminé ! Match nul, ${score[0]} partout.`, 3, true);
        else this.say(`C'est terminé ! Victoire de ${teams[e.winner]} !`, 3, true);
        return;
      }
      case "penalty":
        this.say(e.scored ? pick(["Marqué !", "Dans le but !", "Il ne tremble pas !"]) : pick(["Manqué !", "Arrêté !", "Raté !"]), 3);
        return;
      case "tackle":
        if (e.won && Math.random() < 0.35) this.say(pick([`Beau tacle de ${this.name(e.p)}.`, `${this.name(e.p)} récupère le ballon.`]), 0);
        return;
      case "kick":
        if (e.kind === "cross") this.say(pick([`Le centre de ${this.name(e.p)}…`, `${this.name(e.p)} centre…`]), 0);
        else if (e.kind === "through" && Math.random() < 0.5)
          this.say(pick([`${this.name(e.p)} lance en profondeur…`, `Ballon en profondeur de ${this.name(e.p)}…`]), 0);
        else if (e.kind === "pass" && Math.random() < 0.07)
          this.say(pick([`${this.name(e.p)}…`, `${this.teamOf(e.p)} fait tourner.`, `${this.name(e.p)} oriente le jeu.`]), 0);
        return;
      case "skill":
        if (Math.random() < 0.4) this.say(pick([`Joli crochet de ${this.name(e.p)} !`, `${this.name(e.p)} élimine son vis-à-vis !`]), 0);
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
   * Parle, si cela vaut la peine : on ne coupe la parole que pour plus important, et les petites remarques attendent
   * un silence de quelques secondes. `excited` : plus vite, plus haut.
   */
  say(text: string, prio: Priority, excited = false) {
    if (!this.enabled || typeof speechSynthesis === "undefined" || !this.voice || document.hidden) return;
    const prefs = usePrefs.getState();
    if (!prefs.sound || prefs.volume <= 0) return;
    if (text === this.lastLine) return;
    const now = performance.now();
    const busy = speechSynthesis.speaking && this.speakingPrio >= 0;
    if (busy) {
      if (prio <= this.speakingPrio) return;
      speechSynthesis.cancel();
    } else {
      const quiet = now - this.lastEnd;
      if ((prio === 0 && quiet < 6000) || (prio === 1 && quiet < 1200)) return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.voice = this.voice;
    u.lang = this.voice.lang;
    u.rate = excited ? 1.18 : 1.1;
    u.pitch = excited ? 1.25 : 1;
    u.volume = Math.min(1, prefs.volume * 1.15);
    const done = () => {
      if (this.speakingPrio === prio) this.speakingPrio = -1;
      this.lastEnd = performance.now();
    };
    u.onend = done;
    u.onerror = done;
    this.speakingPrio = prio;
    this.lastLine = text;
    speechSynthesis.speak(u);
    if (import.meta.env.DEV) {
      const w = window as unknown as { __crSaid?: string[] };
      (w.__crSaid ??= []).push(text);
    }
  }

  silence() {
    if (this.followUp) clearTimeout(this.followUp);
    this.followUp = null;
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    this.speakingPrio = -1;
  }

  dispose() {
    this.silence();
    if (typeof speechSynthesis !== "undefined") speechSynthesis.removeEventListener("voiceschanged", this.onVoices);
  }
}
