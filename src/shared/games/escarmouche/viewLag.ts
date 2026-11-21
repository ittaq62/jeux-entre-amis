// L'heure du tir, que l'appareil du tireur envoie avec chaque pas (`vt` : l'heure du serveur à laquelle il voyait les
// autres, c'est là que ses balles les cherchent). Un appareil truqué pourrait l'avancer de plusieurs centaines de
// millisecondes au moment de tirer, pour toucher un adversaire déjà à l'abri. Le serveur retient donc, pour chaque
// joueur, le retard qu'il a d'habitude (l'heure d'arrivée de ses pas moins leur `vt`), mesuré sur les pas où il ne tire
// pas : un tir ne peut pas remonter plus loin que ce retard habituel, avec une marge pour les à-coups du réseau.
//
// Ce qui reste possible : un appareil qui se dit en retard tout le temps, sur tous ses pas. Pour le serveur, il ressemble
// à un joueur dont la connexion est lente, et il reste borné par le plus long retour dans le temps que la salle accorde.

import { B, type Cmd } from "./soldier.ts";

/** Les pas gardés pour la mesure : les 3 dernières secondes (60 pas par seconde) */
const KEEP = 180;
/** Avant d'en avoir assez vu, pas de bride (la salle borne déjà le retour dans le temps) */
const MIN_SAMPLES = 20;
/** La marge au-dessus du retard habituel (le 9e décile) : les à-coups du réseau et du rendu */
const SLACK_MS = 45;

export class ViewLag {
  private lags: number[] = [];
  private next = 0;
  /** Le plafond du moment (recalculé quand la mesure change) */
  private cap: number | null = null;

  /**
   * Un pas vient d'arriver, à l'heure `now` du serveur : on mesure son retard s'il ne tire pas, et on ramène son `vt`
   * s'il prétend remonter plus loin que d'habitude. Renvoie le `vt` retenu.
   */
  admit(c: Cmd, now: number): number {
    const lag = now - c.vt;
    if ((c.b & (B.fire | B.melee)) === 0) {
      if (this.lags.length < KEEP) this.lags.push(lag);
      else this.lags[this.next] = lag;
      this.next = (this.next + 1) % KEEP;
      this.cap = null;
    }
    const cap = this.limit();
    return cap !== null && lag > cap ? now - cap : c.vt;
  }

  /** Le plus long retard admis, ou null tant qu'on n'en sait pas assez */
  limit(): number | null {
    if (this.lags.length < MIN_SAMPLES) return null;
    if (this.cap === null) {
      const sorted = [...this.lags].sort((a, b) => a - b);
      this.cap = sorted[Math.floor(sorted.length * 0.9)]! + SLACK_MS;
    }
    return this.cap;
  }
}
