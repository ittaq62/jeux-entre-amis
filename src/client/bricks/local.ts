// La partie telle qu'elle tourne sur cet écran : la pièce tombe ici, sans attendre le réseau.
// Chaque pose est appliquée tout de suite avec le moteur partagé, puis envoyée au serveur qui la vérifie ;
// s'il voit autre chose, il renvoie l'état exact et on repart de là.

import {
  dropped,
  fits,
  gravityMs,
  grounded,
  gridToString,
  moved,
  place,
  rotated,
  spawn,
  type Active,
  type BricksSettings,
  type GarbageChunk,
  type Grid,
  type PieceType,
  type PlaceResult,
  type PlayerBoard,
} from "../../shared/games/bricks/engine.ts";
import type { BricksSnapshot } from "../../shared/games/bricks/view.ts";
import type { BricksClientMessage } from "../../shared/protocol.ts";

export type InputAction = "left" | "right" | "soft" | "hard" | "cw" | "ccw" | "flip" | "hold";

const LOCK_MS = 500;
const MAX_LOCK_RESETS = 15;
const SOFT_DROP_FACTOR = 20;

export interface Handling {
  /** Délai avant la répétition d'un déplacement */
  das: number;
  /** Intervalle de répétition (0 : jusqu'au mur d'un coup) */
  arr: number;
}

/** Ce que l'écran doit animer ou faire entendre tout de suite, sans attendre le serveur */
export type LocalEvent =
  | { type: "move" }
  | { type: "rotate"; spin: boolean }
  | { type: "hold" }
  | { type: "drop"; from: Active; to: Active }
  | { type: "lock"; piece: Active; result: PlaceResult; before: Grid }
  | { type: "blocked" };

export class LocalGame {
  board: PlayerBoard;
  piece: Active | null = null;
  /** La réserve a servi pour la pièce en cours */
  held = false;
  round = 0;
  /** Dernier paquet de lignes grises reçu */
  ack = 0;
  pausedUntil = 0;
  topped = false;
  /** Fraction de case parcourue vers le bas par la pièce, pour dessiner une chute qui glisse */
  fall = 0;
  private ghostFor: { piece: Active | null; grid: Grid | null; ghost: Active | null } = { piece: null, grid: null, ghost: null };
  private lastRotation = false;
  private lastKick = 0;
  private lockMs = 0;
  private lockResets = 0;
  private lowestY = -99;
  private gravityAcc = 0;
  private dir: -1 | 0 | 1 = 0;
  private dirSince = 0;
  private arrAcc = 0;
  private softDrop = false;
  /** Plateau après chaque pose, pour comparer avec ce que renvoie le serveur */
  private history = new Map<number, string>();

  constructor(
    snapshot: BricksSnapshot,
    public settings: BricksSettings,
    public startAt: number,
    private send: (msg: BricksClientMessage) => void,
    private emit: (e: LocalEvent) => void,
    public handling: Handling,
  ) {
    this.board = structuredClone(snapshot.board);
    this.round = snapshot.round;
    this.reset(snapshot);
  }

  /** Repartir de l'état exact du serveur */
  reset(snapshot: BricksSnapshot) {
    this.board = structuredClone(snapshot.board);
    this.round = snapshot.round;
    this.ack = Math.max(0, ...this.board.pending.map((g) => g.id));
    this.pausedUntil = snapshot.koUntil ?? 0;
    this.topped = false;
    this.held = false;
    this.history.clear();
    this.spawnNext();
  }

  /** Ce que montre la réserve : la pièce mise de côté pendant ce tour, ou celle d'avant */
  get shownHold(): PieceType | null {
    return this.held ? this.board.current : this.board.hold;
  }

  get queue(): PieceType[] {
    return this.held && this.board.hold === null ? this.board.bag.queue.slice(1) : this.board.bag.queue;
  }

  get pending(): number {
    return this.board.pending.reduce((n, g) => n + g.lines, 0);
  }

  /** Là où la pièce tomberait : recalculé seulement quand la pièce ou la pile bougent */
  get ghost(): Active | null {
    const c = this.ghostFor;
    if (c.piece !== this.piece || c.grid !== this.board.grid) {
      c.piece = this.piece;
      c.grid = this.board.grid;
      c.ghost = this.piece ? dropped(this.board.grid, this.piece) : null;
    }
    return c.ghost;
  }

  addGarbage(chunk: GarbageChunk) {
    if (this.board.pending.some((g) => g.id === chunk.id)) return;
    this.board.pending.push(chunk);
    this.ack = Math.max(this.ack, chunk.id);
  }

  /** Le serveur a vu notre pose : si son plateau diffère du nôtre au même moment, on demande l'état exact. */
  verify(seq: number, grid: string) {
    const mine = this.history.get(seq);
    if (mine !== undefined && mine !== grid) this.send({ t: "resync" });
    for (const k of this.history.keys()) if (k <= seq) this.history.delete(k);
  }

  private spawnNext() {
    this.piece = spawn(this.board.current);
    this.held = false;
    this.resetLock();
    this.lastRotation = false;
    this.gravityAcc = 0;
    if (!fits(this.board.grid, this.piece)) {
      this.topped = true;
      this.piece = null;
      this.emit({ type: "blocked" });
    }
  }

  private resetLock() {
    this.lockMs = 0;
    this.lockResets = 0;
    this.lowestY = this.piece?.y ?? -99;
  }

  /** Un geste qui a réussi alors que la pièce touche le sol relance le verrou (15 fois au plus) */
  private touched() {
    if (!this.piece) return;
    if (this.piece.y > this.lowestY) {
      this.lowestY = this.piece.y;
      this.lockResets = 0;
    }
    if (grounded(this.board.grid, this.piece) && this.lockResets < MAX_LOCK_RESETS) {
      this.lockMs = 0;
      this.lockResets += 1;
    }
  }

  private shift(dx: number): boolean {
    if (!this.piece) return false;
    const next = moved(this.board.grid, this.piece, dx, 0);
    if (!next) return false;
    this.piece = next;
    this.lastRotation = false;
    this.touched();
    return true;
  }

  canPlay(now: number): boolean {
    return now >= this.startAt && now >= this.pausedUntil && !this.topped && this.piece !== null;
  }

  press(action: InputAction, now: number) {
    if (!this.canPlay(now) || !this.piece) return;
    switch (action) {
      case "left":
      case "right": {
        const d = action === "left" ? -1 : 1;
        this.dir = d;
        this.dirSince = now;
        this.arrAcc = 0;
        if (this.shift(d)) this.emit({ type: "move" });
        break;
      }
      case "soft":
        this.softDrop = true;
        break;
      case "hard": {
        const from = this.piece;
        const to = dropped(this.board.grid, from);
        if (to.y !== from.y) this.lastRotation = false;
        this.piece = to;
        this.emit({ type: "drop", from, to });
        this.lock(now);
        break;
      }
      case "cw":
      case "ccw":
      case "flip": {
        const r = rotated(this.board.grid, this.piece, action === "cw" ? 1 : action === "ccw" ? -1 : 2);
        if (!r) break;
        this.piece = r.piece;
        this.lastRotation = true;
        this.lastKick = r.kick;
        this.touched();
        this.emit({ type: "rotate", spin: r.piece.type === "T" });
        break;
      }
      case "hold": {
        if (!this.settings.hold || this.held) break;
        const next = this.board.hold ?? this.board.bag.queue[0]!;
        this.held = true;
        this.piece = spawn(next);
        this.resetLock();
        this.lastRotation = false;
        this.emit({ type: "hold" });
        if (!fits(this.board.grid, this.piece)) {
          this.topped = true;
          this.piece = null;
          this.emit({ type: "blocked" });
        }
        break;
      }
    }
  }

  release(action: InputAction) {
    if ((action === "left" && this.dir === -1) || (action === "right" && this.dir === 1)) this.dir = 0;
    if (action === "soft") this.softDrop = false;
  }

  /** Avance le temps : répétition des déplacements, gravité, verrou. */
  tick(dt: number, now: number) {
    if (!this.canPlay(now) || !this.piece) {
      this.fall = 0;
      return;
    }
    // Répétition automatique d'un déplacement maintenu
    if (this.dir !== 0 && now - this.dirSince >= this.handling.das) {
      if (this.handling.arr <= 0) {
        let n = 0;
        while (this.shift(this.dir) && n++ < 10);
      } else {
        this.arrAcc += dt;
        while (this.arrAcc >= this.handling.arr) {
          this.arrAcc -= this.handling.arr;
          if (!this.shift(this.dir)) break;
        }
      }
    }
    const interval = gravityMs(now - this.startAt, this.settings.speedUp) / (this.softDrop ? SOFT_DROP_FACTOR : 1);
    this.gravityAcc += dt;
    while (this.gravityAcc >= interval && this.piece) {
      this.gravityAcc -= interval;
      const next = moved(this.board.grid, this.piece, 0, 1);
      if (!next) {
        this.gravityAcc = 0;
        break;
      }
      this.piece = next;
      this.lastRotation = false;
      if (next.y > this.lowestY) {
        this.lowestY = next.y;
        this.lockResets = 0;
        this.lockMs = 0;
      }
    }
    if (this.piece && grounded(this.board.grid, this.piece)) {
      this.fall = 0;
      this.lockMs += dt;
      if (this.lockMs >= LOCK_MS || this.lockResets >= MAX_LOCK_RESETS) this.lock(now);
    } else {
      this.lockMs = 0;
      // Entre deux cases : la pièce est dessinée en chemin vers la suivante
      this.fall = Math.min(0.999, this.gravityAcc / interval);
    }
  }

  private lock(now: number) {
    const piece = this.piece;
    if (!piece) return;
    const seq = this.board.seq;
    const placement = {
      type: piece.type,
      x: piece.x,
      y: piece.y,
      rot: piece.rot,
      hold: this.held,
      lastRotation: this.lastRotation,
      kick: this.lastRotation ? this.lastKick : 0,
    };
    const before = this.board.grid;
    const result = place(this.board, placement, this.ack, { hold: this.settings.hold, strict: false });
    if (!result.ok) {
      this.send({ t: "resync" });
      return;
    }
    this.send({ t: "place", seq, p: placement, ack: this.ack });
    this.history.set(this.board.seq, gridToString(this.board.grid));
    if (this.history.size > 40) this.history.delete(this.history.keys().next().value!);
    this.emit({ type: "lock", piece, result, before });
    if (result.topOut) {
      // Le serveur va renvoyer le plateau (remis à zéro au chrono, ou la fin pour nous)
      this.topped = true;
      this.piece = null;
      return;
    }
    void now;
    this.spawnNext();
  }

  /** Position à montrer aux autres */
  get live(): Active | null {
    return this.piece;
  }
}
