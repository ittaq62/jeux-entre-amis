// Les commandes d'Escarmouche : le clavier et la souris (prise par le jeu pour viser), une manette, et l'écran tactile
// du téléphone couché (un stick sous le pouce gauche, la vue qui glisse sous le pouce droit, des boutons).

import { B } from "../../shared/games/escarmouche/soldier.ts";

export type Scheme = "clavier" | "manette" | "tactile";

/** Les touches, par leur place sur le clavier (ZQSD en AZERTY, WASD en QWERTY : les mêmes touches physiques) */
const KEYS = {
  fwd: ["KeyW", "ArrowUp"],
  back: ["KeyS", "ArrowDown"],
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  jump: ["Space"],
  sprint: ["ShiftLeft", "ShiftRight"],
  crouch: ["ControlLeft", "KeyC"],
  reload: ["KeyR"],
  grenade: ["KeyG"],
  melee: ["KeyV", "KeyF"],
  swap: ["KeyQ"],
  spot: ["KeyE"],
  slot1: ["Digit1"],
  slot2: ["Digit2"],
  board: ["Tab"],
} as const;
type Action = keyof typeof KEYS;
const ALL_CODES = new Set<string>(Object.values(KEYS).flat());

export interface PadRead {
  mx: number;
  mz: number;
  /** Ce que la vue a tourné depuis la dernière lecture (radians) */
  dyaw: number;
  dpitch: number;
  b: number;
  board: boolean;
  scheme: Scheme;
}

export class EscControls {
  private held = new Set<string>();
  private tapped = new Set<string>();
  private mouseButtons = 0;
  private mouseTapped = 0;
  private lookX = 0;
  private lookY = 0;
  private wheel = 0;
  private target: HTMLElement | null = null;
  scheme: Scheme = "clavier";
  /** Pendant les menus, le jeu n'écoute plus */
  paused = false;
  /** Sensibilités (1 : normale) et axe vertical inversé */
  mouseSens = 1;
  touchSens = 1;
  invert = false;
  /** L'écran tactile : le stick, la vue qui glisse, les boutons tenus et ceux qui basculent */
  readonly touch = {
    sx: 0,
    sy: 0,
    run: false,
    lookX: 0,
    lookY: 0,
    fire: false,
    ads: false,
    crouch: false,
    taps: 0,
  };
  /** La souris est-elle prise par le jeu ? Ses mouvements bruts (sans l'accélération du système) ? */
  locked = false;
  raw = false;
  private lockedAt = 0;
  /** La taille moyenne des derniers mouvements (pour reconnaître un saut parasite) */
  private recent = 0;
  onLockChange?: (locked: boolean) => void;
  private padPrev: boolean[] = [];

  constructor() {
    window.addEventListener("keydown", this.onDown);
    window.addEventListener("keyup", this.onUp);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("pointerlockchange", this.onLock);
  }

  attach(el: HTMLElement) {
    this.target = el;
    el.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("mousemove", this.onMouseMove);
    el.addEventListener("wheel", this.onWheel, { passive: false });
    el.addEventListener("contextmenu", this.onContext);
  }

  dispose() {
    window.removeEventListener("keydown", this.onDown);
    window.removeEventListener("keyup", this.onUp);
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("pointerlockchange", this.onLock);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("mousemove", this.onMouseMove);
    this.target?.removeEventListener("mousedown", this.onMouseDown);
    this.target?.removeEventListener("wheel", this.onWheel);
    this.target?.removeEventListener("contextmenu", this.onContext);
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /**
   * Prendre la souris (au clic dans le jeu). On demande les mouvements bruts de la souris, sans l'accélération du
   * système (sous Windows, « améliorer la précision du pointeur » fait tourner plus loin un geste rapide qu'un geste lent
   * de même longueur) : le même geste tourne toujours du même angle. Là où le navigateur ne sait pas le faire, on prend
   * la souris quand même, telle que le système la donne.
   */
  lock() {
    const el = this.target;
    if (!el || document.pointerLockElement === el) return;
    const plain = () => {
      try {
        const p = el.requestPointerLock() as unknown as Promise<void> | undefined;
        p?.catch?.(() => {});
      } catch {
        // refusé (trop tôt après une sortie) : on réessaiera au prochain clic
      }
    };
    try {
      const request = el.requestPointerLock as unknown as (o?: { unadjustedMovement?: boolean }) => Promise<void> | undefined;
      const p = request.call(el, { unadjustedMovement: true });
      if (p && typeof p.then === "function") {
        this.raw = true;
        p.catch((err: unknown) => {
          // Pas de mouvements bruts ici (système ou navigateur) : la souris telle que le système la donne
          this.raw = false;
          if ((err as { name?: string } | null)?.name === "NotSupportedError") plain();
        });
      } else this.raw = false;
    } catch {
      this.raw = false;
      plain();
    }
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  private onLock = () => {
    this.locked = document.pointerLockElement === this.target && this.target !== null;
    this.lockedAt = performance.now();
    this.recent = 0;
    if (!this.locked) {
      this.mouseButtons = 0;
      this.held.clear();
    }
    this.onLockChange?.(this.locked);
  };

  private onContext = (e: Event) => e.preventDefault();

  private onMouseDown = (e: MouseEvent) => {
    if (this.paused) return;
    if (!this.locked) {
      this.lock();
      return;
    }
    e.preventDefault();
    this.scheme = "clavier";
    const bit = e.button === 0 ? 1 : e.button === 2 ? 2 : 0;
    this.mouseButtons |= bit;
    this.mouseTapped |= bit;
  };

  private onMouseUp = (e: MouseEvent) => {
    const bit = e.button === 0 ? 1 : e.button === 2 ? 2 : 0;
    this.mouseButtons &= ~bit;
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.locked || this.paused) return;
    const dx = e.movementX;
    const dy = e.movementY;
    // Juste après la prise de la souris, certains navigateurs envoient le saut du curseur jusqu'au centre : on l'ignore
    if (performance.now() - this.lockedAt < 60) return;
    const size = Math.max(Math.abs(dx), Math.abs(dy));
    // Sans mouvements bruts, un navigateur glisse parfois un saut parasite énorme, tombé de nulle part (la souris était
    // presque immobile l'instant d'avant) : seulement celui-là est écarté. Un geste vif, lui, compte en entier.
    if (!this.raw && size > 250 && size > 12 * Math.max(this.recent, 8)) return;
    this.recent = this.recent * 0.6 + size * 0.4;
    this.lookX += dx;
    this.lookY += dy;
  };

  private onWheel = (e: WheelEvent) => {
    if (!this.locked) return;
    e.preventDefault();
    if (Math.abs(e.deltaY) > 2) this.wheel += 1;
  };

  private onDown = (e: KeyboardEvent) => {
    if (this.paused || !ALL_CODES.has(e.code)) return;
    const el = document.activeElement;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
    e.preventDefault();
    this.scheme = "clavier";
    this.held.add(e.code);
    this.tapped.add(e.code);
  };

  private onUp = (e: KeyboardEvent) => {
    this.held.delete(e.code);
  };

  private onBlur = () => {
    this.held.clear();
    this.mouseButtons = 0;
  };

  private on(a: Action) {
    return KEYS[a].some((c) => this.held.has(c) || this.tapped.has(c));
  }

  private tap(a: Action) {
    return KEYS[a].some((c) => this.tapped.has(c));
  }

  /** Un bouton du téléphone vient d'être touché */
  touchTap(bit: number) {
    this.scheme = "tactile";
    this.touch.taps |= bit;
  }

  /** Ce que veut le joueur pour ce pas ; la vue tournée depuis la dernière lecture */
  read(): PadRead {
    const k = 0.0022 * this.mouseSens;
    let dyaw = -this.lookX * k;
    let dpitch = -this.lookY * k * (this.invert ? -1 : 1);
    this.lookX = 0;
    this.lookY = 0;
    // Au doigt : la vue glisse avec le pouce
    const tk = 0.0055 * this.touchSens;
    if (this.touch.lookX !== 0 || this.touch.lookY !== 0) {
      dyaw -= this.touch.lookX * tk;
      dpitch -= this.touch.lookY * tk * (this.invert ? -1 : 1);
      this.touch.lookX = 0;
      this.touch.lookY = 0;
    }
    let mx = (this.on("right") ? 1 : 0) - (this.on("left") ? 1 : 0);
    let mz = (this.on("fwd") ? 1 : 0) - (this.on("back") ? 1 : 0);
    let b = 0;
    if (this.on("jump")) b |= B.jump;
    if (this.on("sprint")) b |= B.sprint;
    if (this.on("crouch")) b |= B.crouch;
    if (this.tap("reload")) b |= B.reload;
    if (this.tap("grenade")) b |= B.grenade;
    if (this.tap("melee")) b |= B.melee;
    if (this.tap("swap") || this.wheel > 0) b |= B.swap;
    if (this.tap("slot1")) b |= B.slot1;
    if (this.tap("slot2")) b |= B.slot2;
    if (this.tap("spot") || this.mouseButtons & 4) b |= B.spot;
    if ((this.mouseButtons | this.mouseTapped) & 1) b |= B.fire;
    if (this.mouseButtons & 2) b |= B.ads;
    this.wheel = 0;
    this.mouseTapped = 0;

    // La manette : stick gauche pour avancer, droit pour viser, gâchettes pour viser et tirer
    const gp = [...(navigator.getGamepads?.() ?? [])].find((p) => p && p.connected) ?? null;
    if (gp) {
      const ax = (i: number) => {
        const v = gp.axes[i] ?? 0;
        return Math.abs(v) < 0.15 ? 0 : v;
      };
      const pb = (i: number) => Boolean(gp.buttons[i]?.pressed);
      const edge = (i: number) => {
        const was = this.padPrev[i] ?? false;
        this.padPrev[i] = pb(i);
        return pb(i) && !was;
      };
      if (Math.hypot(ax(0), ax(1)) > 0 || Math.hypot(ax(2), ax(3)) > 0 || gp.buttons.some((x) => x.pressed)) this.scheme = "manette";
      if (this.scheme === "manette") {
        mx = ax(0);
        mz = -ax(1);
        dyaw -= ax(2) * 0.045 * this.mouseSens;
        dpitch -= ax(3) * 0.032 * this.mouseSens * (this.invert ? -1 : 1);
        if ((gp.buttons[7]?.value ?? 0) > 0.4) b |= B.fire;
        if ((gp.buttons[6]?.value ?? 0) > 0.4) b |= B.ads;
        if (pb(0)) b |= B.jump;
        if (pb(1)) b |= B.crouch;
        if (pb(10)) b |= B.sprint;
        if (edge(2)) b |= B.reload;
        if (edge(3)) b |= B.swap;
        if (edge(5)) b |= B.grenade;
        if (edge(4) || edge(11)) b |= B.melee;
        if (edge(12)) b |= B.spot;
      }
    }

    // Le téléphone : le stick (poussé loin, on court) et les boutons
    const t = this.touch;
    if (Math.hypot(t.sx, t.sy) > 0.05) {
      mx = t.sx;
      mz = -t.sy;
      this.scheme = "tactile";
      if (t.run) b |= B.sprint;
    }
    if (t.fire) b |= B.fire;
    if (t.ads) b |= B.ads;
    if (t.crouch) b |= B.crouch;
    b |= t.taps;
    t.taps = 0;
    const l = Math.hypot(mx, mz);
    if (l > 1) {
      mx /= l;
      mz /= l;
    }
    const board = this.on("board");
    this.tapped.clear();
    if (this.paused) return { mx: 0, mz: 0, dyaw: 0, dpitch: 0, b: 0, board: false, scheme: this.scheme };
    return { mx, mz, dyaw, dpitch, b, board, scheme: this.scheme };
  }
}
