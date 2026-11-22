// Les commandes d'un combat : le clavier et la souris (réglables, voir bindings.ts), une manette, ou l'écran tactile
// (un stick sous le pouce gauche, trois boutons sous le droit, la garde en posant le pouce sur Frapper et Spécial à la fois).
// Une fois par image, tout devient une seule commande : le stick, les boutons tenus et ceux qu'on vient d'enfoncer.

import { ATK, FRT, GRB, JMP, NAR, SHD, SPC, UPJ, type Input } from "../../shared/games/culbute/model.ts";
import { CHARGE_DECIDE } from "../../shared/games/culbute/moves.ts";
import { ACTION_IDS, loadSettings, type ActionId, type CulbuteSettings } from "./bindings.ts";

export type Scheme = "clavier" | "manette" | "tactile";

const BITS: Partial<Record<ActionId, number>> = { attack: ATK, strong: FRT, special: SPC, jump: JMP, shield: SHD, grab: GRB, taunt: NAR };

/** Les appuis qui partent vers le curseur, quand on vise à la souris */
const AIMED = ATK | FRT | SPC | GRB;
/** Le curseur sur le combattant (à moins de tant de mètres de son milieu) : le coup sans direction */
export const AIM_NEUTRAL = 0.75;
/** Le milieu du combattant, au-dessus de ses pieds */
export const AIM_CENTER = 0.75;
/** Un appui visé attend au plus tant d'images que le combattant puisse le donner (la mémoire des appuis du combat) */
const AIM_WAIT = 6;

/** Un clic sur l'interface (boutons, menus, discussion) n'est pas un coup */
const UI = "button, a, input, textarea, select, label, summary, [role='dialog'], [role='menu'], .panel";

export class CulbuteControls {
  /** Les touches et boutons de souris enfoncés (`KeyW`, `Mouse0`…) */
  private held = new Set<string>();
  /** Ceux enfoncés depuis la dernière lecture : un appui très bref entre deux images compte quand même */
  private tapped = new Set<string>();
  private byCode = new Map<string, ActionId[]>();
  private padPrev = 0;
  private touchPrevHeld = 0;
  /** Au doigt, Frapper tenu : depuis combien d'images (-1 : pas tenu ; -2 : resté posé après la garde, ignoré jusqu'au
   * relâchement), et s'il est devenu le coup fort */
  private touchAtk = -1;
  private touchStrong = false;
  /** Le bouton de souris qui frappe, tenu : depuis combien d'images (-1 : pas tenu), s'il est devenu le coup fort, et un
   * clic relâché depuis la dernière lecture (le coup simple part au relâchement) */
  private clickCode = "";
  private clickFrames = -1;
  private clickStrong = false;
  private clickDone = false;
  private scheme: Scheme = "clavier";
  private settings: CulbuteSettings;
  /** Pendant que l'aide, le menu ou les réglages sont ouverts, le combat n'écoute plus */
  paused = false;
  /** Le curseur de la souris (coordonnées de la fenêtre) */
  private mouse: { x: number; y: number } | null = null;
  /** Images restantes pendant lesquelles le stick vise le curseur (un appui visé qui attend son tour) */
  private aimLeft = 0;
  /** Du milieu de son combattant au curseur, en mètres (posé par l'écran du combat) ; null : pas de combattant */
  aimFrom: ((clientX: number, clientY: number) => [number, number] | null) | null = null;
  /** Son combattant peut-il agir à cette image (l'appui visé part alors) ? */
  ready: () => boolean = () => true;
  readonly touch = { sx: 0, sy: 0, atk: false, spc: false, jmp: false, grb: false, taps: 0 };

  constructor(settings: CulbuteSettings = loadSettings()) {
    this.settings = settings;
    this.index();
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("contextmenu", this.onContextMenu);
    window.addEventListener("blur", this.onBlur);
  }

  dispose() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("contextmenu", this.onContextMenu);
    window.removeEventListener("blur", this.onBlur);
  }

  get current(): Scheme {
    return this.scheme;
  }

  get stickJump(): boolean {
    return this.settings.stickJump;
  }

  /** Vise-t-on à la souris en ce moment (réglage, et le clavier et la souris comme façon de jouer) ? */
  get aiming(): boolean {
    return this.settings.aimMouse && this.scheme === "clavier" && this.mouse !== null;
  }

  /** Où vise le curseur, vu de son combattant : vers le haut, le bas, de côté, ou sur lui (null : on ne vise pas) */
  aimNow(): [number, number] | null {
    if (!this.aiming || !this.aimFrom || !this.mouse) return null;
    const v = this.aimFrom(this.mouse.x, this.mouse.y);
    if (!v) return null;
    const len = Math.hypot(v[0], v[1]);
    return len < AIM_NEUTRAL ? [0, 0] : [v[0] / len, v[1] / len];
  }

  setSettings(s: CulbuteSettings) {
    this.settings = s;
    this.index();
    this.held.clear();
    this.tapped.clear();
  }

  private index() {
    this.byCode.clear();
    for (const id of ACTION_IDS) {
      for (const code of this.settings.bindings[id]) {
        const list = this.byCode.get(code) ?? [];
        list.push(id);
        this.byCode.set(code, list);
      }
    }
  }

  private press(code: string) {
    this.scheme = "clavier";
    if (!this.held.has(code)) this.tapped.add(code);
    this.held.add(code);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.paused || !this.byCode.has(e.code)) return;
    const el = document.activeElement;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el instanceof HTMLElement && el.isContentEditable)) return;
    e.preventDefault();
    this.press(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.held.delete(e.code);
  };

  private onMouseDown = (e: MouseEvent) => {
    const code = `Mouse${e.button}`;
    if (this.paused || !this.byCode.has(code)) return;
    if (e.target instanceof Element && e.target.closest(UI)) return;
    // Pas de défilement automatique (molette) ni de sélection de texte pendant le combat
    e.preventDefault();
    // Le clic qui frappe, maintenu, devient le coup fort : on attend de savoir (voir sample)
    if (this.settings.holdStrong && this.byCode.get(code)?.includes("attack")) {
      this.scheme = "clavier";
      if (this.clickFrames < 0) {
        this.clickCode = code;
        this.clickFrames = 0;
        this.clickStrong = false;
      }
      return;
    }
    this.press(code);
  };

  private onMouseMove = (e: MouseEvent) => {
    this.mouse = { x: e.clientX, y: e.clientY };
  };

  private onMouseUp = (e: MouseEvent) => {
    const code = `Mouse${e.button}`;
    this.held.delete(code);
    if (code === this.clickCode && this.clickFrames >= 0) {
      // Relâché avant d'être devenu le coup fort : le coup simple
      if (!this.clickStrong) this.clickDone = true;
      this.clickFrames = -1;
      this.clickStrong = false;
    }
    // Les boutons de côté de la souris feraient revenir le navigateur en arrière
    if (!this.paused && this.byCode.has(code) && e.button >= 3) e.preventDefault();
  };

  /** Le clic droit sert au combat : pas de menu du navigateur, sauf sur l'interface */
  private onContextMenu = (e: MouseEvent) => {
    if (this.paused || !this.byCode.has("Mouse2")) return;
    if (e.target instanceof Element && e.target.closest(UI)) return;
    e.preventDefault();
  };

  private onBlur = () => {
    this.held.clear();
    this.clickFrames = -1;
    this.clickStrong = false;
    this.clickDone = false;
  };

  /** Un doigt sur un bouton de l'écran */
  touchButton(which: "atk" | "spc" | "jmp" | "grb", down: boolean) {
    this.scheme = "tactile";
    this.touch[which] = down;
    if (down) this.touch.taps |= which === "atk" ? ATK : which === "spc" ? SPC : which === "grb" ? GRB : JMP;
  }

  /** L'action est-elle tenue, ou vient-elle d'être enfoncée ? */
  private state(): { held: Set<ActionId>; tapped: Set<ActionId> } {
    const held = new Set<ActionId>();
    const tapped = new Set<ActionId>();
    for (const code of this.held) for (const id of this.byCode.get(code) ?? []) held.add(id);
    for (const code of this.tapped) for (const id of this.byCode.get(code) ?? []) tapped.add(id);
    return { held, tapped };
  }

  /** La commande de cette image */
  sample(): Input {
    if (this.paused) {
      this.tapped.clear();
      this.touch.taps = 0;
      return { x: 0, y: 0, held: 0, pressed: 0 };
    }
    const keys = this.state();
    this.tapped.clear();
    let x = (keys.held.has("right") ? 1 : 0) - (keys.held.has("left") ? 1 : 0);
    let y = (keys.held.has("up") ? 1 : 0) - (keys.held.has("down") ? 1 : 0);
    if (x !== 0 && y !== 0) {
      x *= Math.SQRT1_2;
      y *= Math.SQRT1_2;
    }
    let held = 0;
    let tapped = 0;
    for (const [id, bit] of Object.entries(BITS) as [ActionId, number][]) {
      if (keys.held.has(id)) held |= bit;
      if (keys.tapped.has(id)) tapped |= bit;
    }
    // La touche du haut fait sauter (un appui, un saut) ; enfoncée avec un coup, c'est le coup vers le haut (voir UPJ)
    if (this.settings.upJumps && keys.tapped.has("up")) tapped |= JMP | UPJ;

    // Le clic qui frappe : relâché vite, le coup simple (au relâchement) ; maintenu un cinquième de seconde, le coup fort,
    // chargé tant que le bouton reste enfoncé
    if (this.clickFrames >= 0) {
      this.clickFrames++;
      if (this.clickFrames >= CHARGE_DECIDE && !this.clickStrong) {
        this.clickStrong = true;
        tapped |= FRT;
      }
      if (this.clickStrong) held |= FRT;
    }
    if (this.clickDone) {
      tapped |= ATK;
      this.clickDone = false;
    }

    // Viser à la souris : le coup (le spécial, le lancer) part vers le curseur, pas vers les touches tenues ; s'il doit
    // attendre que son combattant puisse le donner, le stick vise jusque-là
    // (sauté en même temps, le coup part en l'air après l'élan : on vise jusque-là)
    if (tapped & AIMED && this.aiming) this.aimLeft = AIM_WAIT;
    if (this.aimLeft > 0) {
      const aim = this.aimNow();
      if (aim) [x, y] = aim;
      this.aimLeft = aim && (!this.ready() || tapped & JMP) ? this.aimLeft - 1 : 0;
    }

    // La manette : stick gauche ou croix, A ou Y pour sauter, X pour frapper, B pour le spécial, la gâchette haute droite
    // pour saisir, les autres gâchettes pour la garde, le petit bouton de gauche (Retour, Select) pour narguer, le stick
    // droit pour le coup fort (dans sa direction, tenu pour le charger)
    const gp = [...(navigator.getGamepads?.() ?? [])].find((p) => p && p.connected) ?? null;
    if (gp) {
      const pb = (i: number) => Boolean(gp.buttons[i]?.pressed);
      const ax = gp.axes[0] ?? 0;
      const ay = gp.axes[1] ?? 0;
      let pad = 0;
      if (pb(0) || pb(3)) pad |= JMP;
      if (pb(2)) pad |= ATK;
      if (pb(1)) pad |= SPC;
      if (pb(4) || pb(6) || pb(7)) pad |= SHD;
      if (pb(5)) pad |= GRB;
      if (pb(8)) pad |= NAR;
      if (Math.hypot(ax, ay) > 0.2) {
        x = ax;
        y = -ay;
        this.scheme = "manette";
      }
      if (pb(12) || pb(13) || pb(14) || pb(15)) {
        x = (pb(15) ? 1 : 0) - (pb(14) ? 1 : 0);
        y = (pb(12) ? 1 : 0) - (pb(13) ? 1 : 0);
        this.scheme = "manette";
      }
      const rx = gp.axes[2] ?? 0;
      const ry = gp.axes[3] ?? 0;
      if (Math.hypot(rx, ry) > 0.5) {
        x = rx;
        y = -ry;
        pad |= FRT;
      }
      if (pad) this.scheme = "manette";
      tapped |= pad & ~this.padPrev;
      held |= pad;
      this.padPrev = pad;
    }

    // L'écran tactile : Frapper et Spécial tenus ensemble font la garde
    const t = this.touch;
    if (Math.hypot(t.sx, t.sy) > 0.08) {
      x = t.sx;
      y = t.sy;
    }
    let touchHeld = (t.spc ? SPC : 0) | (t.jmp ? JMP : 0) | (t.grb ? GRB : 0);
    if (t.atk && t.spc) touchHeld = SHD | (t.jmp ? JMP : 0);
    const stickJump = this.settings.stickJump && t.sy > 0.65;
    if (stickJump) touchHeld |= JMP;
    // Frapper au doigt : relâché vite, le coup simple ; gardé un cinquième de seconde, le coup fort, qui se charge tant
    // que le doigt reste (posé avec Spécial, c'est la garde : pas de coup)
    let touchTaps = t.taps & ~ATK;
    if (t.atk && t.spc) {
      // La garde : le doigt qui reste sur Frapper quand on lève Spécial n'est pas un nouveau coup
      this.touchAtk = -2;
      this.touchStrong = false;
    } else if (t.atk) {
      // (encore le doigt de la garde : rien tant qu'il ne s'est pas levé)
      if (this.touchAtk !== -2) this.touchAtk++;
      if (this.touchAtk >= CHARGE_DECIDE && !this.touchStrong) {
        this.touchStrong = true;
        touchTaps |= FRT;
      }
      if (this.touchStrong) touchHeld |= FRT;
    } else {
      // Relâché (même un appui si bref qu'il tient entre deux images) : le coup simple
      if (this.touchAtk >= 0 || (this.touchAtk === -1 && t.taps & ATK)) {
        if (!this.touchStrong) touchTaps |= ATK;
      }
      this.touchAtk = -1;
      this.touchStrong = false;
    }
    if (touchHeld & SHD) touchTaps = (touchTaps & JMP) | SHD;
    touchTaps |= touchHeld & ~this.touchPrevHeld & (SHD | JMP);
    // Le saut au stick : comme la touche Haut, un coup en même temps donne le coup vers le haut
    if (stickJump && touchTaps & JMP && !t.jmp) touchTaps |= UPJ;
    this.touchPrevHeld = touchHeld;
    t.taps = 0;
    held |= touchHeld;
    tapped |= touchTaps;

    // Chaque façon de jouer compte ses propres appuis : relâcher Spécial en gardant Frapper (fin de la garde au doigt)
    // n'est pas un nouvel appui sur Frapper
    return { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)), held, pressed: tapped };
  }
}
