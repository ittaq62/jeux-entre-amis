// La qualité automatique des jeux en 3D : on compte les images, et quand l'appareil peine deux secondes de suite, on
// allège l'image d'un cran. Chaque jeu dit ce que sont ses crans, du moins visible au plus visible (un peu moins de
// pixels, encore moins, plus d'ombres…). Un cran qui ne fait rien gagner (un téléphone en économie d'énergie plafonne à
// 30 images par seconde quoi qu'on fasse ; un processeur qui peine ne gagne rien à dessiner moins de pixels) est
// défait, et après deux essais pour rien on n'essaie plus ce genre de cran : l'image deviendrait laide pour rien. On
// essaie alors le cran suivant. Quand tout est fluide dix secondes de suite, on remonte d'un cran ; une remontée qui
// ne tient pas n'est plus retentée. Sur un appareil à l'aise (un ordinateur), rien ne bouge : l'image reste pleine.

export interface AutoQualityOptions {
  /** Le genre de chaque cran, dans l'ordre où on les essaie (« pixels », « ombres »…) */
  levers: readonly string[];
  /** Appliquer l'état des crans (vrai : ce cran est pris, l'image est allégée d'autant) */
  apply: (on: readonly boolean[]) => void;
  /** Sous ce nombre d'images par seconde, l'appareil peine (45 par défaut) */
  slowFps?: number;
  /** À partir de ce nombre, il est à l'aise (55 par défaut) */
  fastFps?: number;
  /** L'onglet est-il caché (pour les essais) */
  hidden?: () => boolean;
}

export class AutoQuality {
  /** Les crans pris */
  readonly on: boolean[];
  /** Les images par seconde de la dernière seconde */
  fps = 60;
  private frames = 0;
  private jank = 0;
  private at = -1;
  private last = -1;
  private startedAt = -1;
  private slowFor = 0;
  private fastFor = 0;
  /** Les images par seconde des dernières secondes (la référence d'un essai : pas seulement les deux plus lentes) */
  private recent: number[] = [];
  /**
   * Le cran qu'on vient de prendre : on compare la moyenne des cinq secondes d'avant à celle des trois secondes qui
   * suivent la première (celle du changement, où la carte graphique refait ses programmes, ne compte pas)
   */
  private trial: { before: number; kept: number[]; lever: number; skip: number; after: number[] } | null = null;
  /** Les essais pour rien, par genre de cran */
  private useless = new Map<string, number>();
  /** Les crans qu'on ne quitte plus (une remontée qui n'a pas tenu) */
  private stuck = new Set<number>();
  private raised: { at: number; lever: number } | null = null;
  private readonly slow: number;
  private readonly fast: number;
  private readonly hidden: () => boolean;

  constructor(private o: AutoQualityOptions) {
    this.on = o.levers.map(() => false);
    this.slow = o.slowFps ?? 45;
    this.fast = o.fastFps ?? 55;
    this.hidden = o.hidden ?? (() => typeof document !== "undefined" && document.hidden);
  }

  /** Combien de crans sont pris */
  get level() {
    return this.on.filter(Boolean).length;
  }

  /** À chaque image (avant tout le reste), avec l'heure en millisecondes */
  tick(now: number) {
    if (this.at < 0) {
      this.at = this.last = this.startedAt = now;
      return;
    }
    const frameMs = now - this.last;
    this.last = now;
    // Une longue pause (onglet caché, téléphone en veille) : la seconde en cours ne veut rien dire
    if (frameMs > 500) {
      this.at = now;
      this.frames = 0;
      this.jank = 0;
      this.slowFor = 0;
      this.fastFor = 0;
      this.trial = null;
      return;
    }
    this.frames++;
    if (frameMs > 25) this.jank++;
    if (now - this.at < 1000) return;
    this.fps = Math.round((this.frames * 1000) / (now - this.at));
    const jank = this.jank;
    this.frames = 0;
    this.jank = 0;
    this.at = now;
    // Les toutes premières secondes ne comptent pas : la carte graphique finit de tout préparer
    if (this.hidden() || now - this.startedAt < 3500) return;
    if (this.trial) {
      if (this.trial.skip-- > 0) return;
      this.trial.after.push(this.fps);
      if (this.trial.after.length >= 3) this.judge();
      return;
    }
    this.recent.push(this.fps);
    if (this.recent.length > 5) this.recent.shift();
    this.slowFor = this.fps < this.slow || jank >= 6 ? this.slowFor + 1 : 0;
    this.fastFor = this.fps >= this.fast && jank <= 1 ? this.fastFor + 1 : 0;
    if (this.slowFor >= 2 && this.recent.length >= 3) {
      this.slowFor = 0;
      this.fastFor = 0;
      // On venait de remonter et ça ne tient pas : ce cran-là reste pris
      if (this.raised && now - this.raised.at < 15000) {
        this.stuck.add(this.raised.lever);
        this.on[this.raised.lever] = true;
        this.raised = null;
        this.o.apply(this.on);
        return;
      }
      this.lighten(now);
    } else if (this.fastFor >= 10) {
      this.fastFor = 0;
      this.heighten(now);
    }
  }

  /** Prendre le premier cran libre dont le genre peut encore servir */
  private lighten(now: number) {
    const i = this.on.findIndex((on, k) => !on && (this.useless.get(this.o.levers[k]!) ?? 0) < 2);
    if (i < 0) return;
    this.on[i] = true;
    this.trial = { before: mean(this.recent), kept: [...this.recent], lever: i, skip: 1, after: [] };
    this.o.apply(this.on);
    void now;
  }

  /** Le cran a-t-il fait gagner des images ? Sinon on le défait */
  private judge() {
    const t = this.trial!;
    this.trial = null;
    this.slowFor = 0;
    this.fastFor = 0;
    const after = mean(t.after);
    // Gardé : les secondes de l'essai sont la nouvelle référence ; défait : on reprend celle d'avant (le cran suivant
    // s'essaie sans attendre)
    // Un gain d'au moins 10 % (et 3 images) : à 20 images par seconde, 3 de plus comptent autant que 5 à 45. Ou
    // l'appareil est redevenu fluide, s'il ne l'était pas avant : un ordinateur déjà fluide, pris de quelques à-coups
    // (d'autres programmes, le ramasse-miettes), ne perd pas sa finesse pour rien
    if (after >= t.before + Math.max(3, t.before * 0.1) || (after >= this.fast && t.before < this.fast)) {
      this.recent = [...t.after];
      return;
    }
    this.recent = t.kept;
    this.on[t.lever] = false;
    const kind = this.o.levers[t.lever]!;
    this.useless.set(kind, (this.useless.get(kind) ?? 0) + 1);
    this.o.apply(this.on);
  }

  /** Défaire le dernier cran pris (sauf ceux qu'on ne quitte plus) */
  private heighten(now: number) {
    for (let i = this.on.length - 1; i >= 0; i--) {
      if (!this.on[i] || this.stuck.has(i)) continue;
      this.on[i] = false;
      this.raised = { at: now, lever: i };
      this.o.apply(this.on);
      return;
    }
  }
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 60);
