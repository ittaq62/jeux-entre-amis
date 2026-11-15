// Un combattant de Culbute en 3D : un petit bonhomme à grosse tête (celle de l'avatar, ses cheveux et son chapeau),
// des bras et des jambes qui se plient vers des points visés, et l'accessoire de son style dans la main. Chaque coup
// a sa posture : il arme, frappe, puis revient ; le serveur dit où il en est, le dessin fait le reste.

import * as THREE from "three";
import { AVATAR_HAIR_COLORS, AVATAR_SKINS, type AvatarConfig } from "../../../shared/avatar.ts";
import type { Palette } from "../../../shared/games/culbute/fighters.ts";
import { moveDef } from "../../../shared/games/culbute/engine.ts";
import type { HabitueId, ItemKind } from "../../../shared/games/culbute/model.ts";
import type { PoseId } from "../../../shared/games/culbute/moves.ts";
import { STYLES } from "../../../shared/games/culbute/styles.ts";
import { F_CREAM, F_FAST, F_INTANG } from "../../../shared/games/culbute/view.ts";
import { hairGeometry, hatGroup } from "../../bolides/scene/pilot.ts";
import type { RenderFighter } from "../runtime.ts";
import { accordionModel, itemModel, propModel, std, type Accordion, type Keep } from "./props.ts";

export interface FighterLook {
  slot: number;
  name: string;
  avatar: AvatarConfig;
  style: HabitueId;
  palette: Palette;
  /** La couleur du joueur (son repère, sa garde) */
  color: string;
  me: boolean;
  /** Une jupe (Ginette, Huguette, Simone) */
  skirt: boolean;
  /** La peau de sa tête, avec les traits de l'avatar (dessinée à part, elle arrive un peu après) */
  head?: HTMLCanvasElement | null;
}

type V3 = [number, number, number];

interface Pose {
  crouch: number;
  lean: number;
  twist: number;
  spinX: number;
  spinY: number;
  liftY: number;
  /** La main de l'accessoire (à droite), puis l'autre */
  hands: [V3, V3];
  feet: [V3, V3];
  headTilt: number;
}

const HEIGHT = 1.55;
const PIVOT = 0.72;
const HEAD_R = 0.34;
const HIPS_Y = 0.5;
const SHOULDER_Y = 0.92;
const SHOULDER_X = 0.25;
const UPPER = 0.26;
const FORE = 0.25;
const THIGH = 0.27;
const SHIN = 0.25;

const REST: Pose = {
  crouch: 0,
  lean: 0.05,
  twist: 0,
  spinX: 0,
  spinY: 0,
  liftY: 0,
  hands: [
    [-0.3, 0.55, 0.14],
    [0.3, 0.55, 0.14],
  ],
  feet: [
    [-0.12, 0, 0.05],
    [0.12, 0, -0.05],
  ],
  headTilt: 0,
};

const AIR: Pose = {
  ...REST,
  hands: [
    [-0.36, 0.88, 0.1],
    [0.36, 0.88, 0.1],
  ],
  feet: [
    [-0.12, 0.2, 0.14],
    [0.12, 0.08, -0.1],
  ],
};

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const lv = (a: V3, b: V3, k: number): V3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const ease = (k: number) => k * k * (3 - 2 * k);

function blend(a: Pose, b: Pose, k: number): Pose {
  return {
    crouch: lerp(a.crouch, b.crouch, k),
    lean: lerp(a.lean, b.lean, k),
    twist: lerp(a.twist, b.twist, k),
    spinX: lerp(a.spinX, b.spinX, k),
    spinY: lerp(a.spinY, b.spinY, k),
    liftY: lerp(a.liftY, b.liftY, k),
    hands: [lv(a.hands[0], b.hands[0], k), lv(a.hands[1], b.hands[1], k)],
    feet: [lv(a.feet[0], b.feet[0], k), lv(a.feet[1], b.feet[1], k)],
    headTilt: lerp(a.headTilt, b.headTilt, k),
  };
}

const with_ = (base: Pose, p: Partial<Pose>): Pose => ({ ...base, ...p });

/** Pour chaque posture d'attaque : bras armé, puis coup porté */
function keyPoses(pose: PoseId, base: Pose): [Pose, Pose] {
  const R = (x: number, y: number, z: number): V3 => [x, y, z];
  const L = base.hands[1];
  switch (pose) {
    case "jab":
      return [
        with_(base, { hands: [R(-0.25, 0.85, -0.05), L], twist: 0.3 }),
        with_(base, { hands: [R(-0.12, 0.85, 0.74), L], twist: -0.25, lean: 0.12 }),
      ];
    case "side":
      return [
        with_(base, { hands: [R(-0.35, 1.05, -0.35), L], twist: 0.6 }),
        with_(base, { hands: [R(-0.08, 0.8, 0.95), R(0.3, 0.6, -0.2)], twist: -0.5, lean: 0.25, feet: [R(-0.12, 0, 0.3), base.feet[1]] }),
      ];
    case "up":
      return [
        with_(base, { hands: [R(-0.3, 0.45, -0.15), L], crouch: 0.08 }),
        with_(base, { hands: [R(-0.05, 1.78, 0.12), R(0.3, 1.0, 0.1)], lean: -0.2 }),
      ];
    case "low":
      return [
        with_(base, { hands: [R(-0.3, 0.35, -0.25), L], crouch: 0.15 }),
        with_(base, { hands: [R(-0.15, 0.15, 0.9), L], crouch: 0.22, lean: 0.45, feet: [R(-0.12, 0, 0.35), R(0.12, 0, -0.3)] }),
      ];
    case "spin": {
      const out = with_(base, { hands: [R(-0.68, 0.78, 0), R(0.68, 0.78, 0)] });
      return [out, out];
    }
    case "airFwd":
      return [
        with_(base, { hands: [R(-0.3, 1.1, -0.3), L], twist: 0.5 }),
        with_(base, { hands: [R(-0.05, 0.75, 0.95), L], twist: -0.4, lean: 0.3 }),
      ];
    case "airUp":
      return [with_(base, { hands: [R(-0.2, 0.5, -0.3), L] }), with_(base, { hands: [R(0, 1.82, 0.02), R(0.25, 1.4, 0)], lean: -0.35 })];
    case "airDown":
      return [
        with_(base, { hands: [R(-0.2, 1.5, 0.1), L], lean: -0.1 }),
        with_(base, { hands: [R(-0.05, -0.25, 0.25), L], lean: 0.4, feet: [R(-0.12, 0.35, -0.1), R(0.12, 0.3, -0.15)] }),
      ];
    case "smashSide":
      return [
        with_(base, { hands: [R(-0.4, 1.05, -0.6), L], twist: 0.9, lean: -0.15, crouch: 0.08 }),
        with_(base, { hands: [R(-0.05, 0.85, 1.15), R(0.3, 0.6, -0.3)], twist: -0.6, lean: 0.35, feet: [R(-0.12, 0, 0.42), base.feet[1]] }),
      ];
    case "smashUp":
      return [
        with_(base, { hands: [R(-0.25, 0.25, 0.1), R(0.25, 0.25, 0.1)], crouch: 0.25 }),
        with_(base, { hands: [R(-0.05, 1.98, 0.1), R(0.15, 1.75, 0.1)], lean: -0.15, crouch: -0.08 }),
      ];
    case "smashDown":
      return [
        with_(base, { hands: [R(-0.2, 1.4, 0.2), L], crouch: 0.05 }),
        with_(base, { hands: [R(-0.1, 0.15, 0.95), L], crouch: 0.25, lean: 0.35, spinY: Math.PI }),
      ];
    case "throw":
      return [
        with_(base, { hands: [R(-0.3, 1.15, -0.4), L], twist: 0.5 }),
        with_(base, { hands: [R(-0.15, 1.0, 0.8), L], twist: -0.3, lean: 0.15 }),
      ];
    case "lob":
      return [with_(base, { hands: [R(-0.3, 0.3, -0.45), L], crouch: 0.12 }), with_(base, { hands: [R(-0.2, 0.9, 0.75), L], lean: 0.05 })];
    case "lunge":
      return [
        with_(base, { hands: [R(-0.3, 0.9, -0.1), L], crouch: 0.1 }),
        with_(base, { hands: [R(-0.08, 0.85, 0.95), R(0.3, 0.7, -0.3)], lean: 0.55 }),
      ];
    case "rise": {
      const up = with_(base, {
        hands: [R(-0.3, 1.72, 0.1), R(0.3, 1.72, 0.1)],
        feet: [R(-0.08, 0, 0), R(0.08, 0, 0)],
      });
      return [with_(base, { crouch: 0.15 }), up];
    }
    case "slam":
      return [
        with_(base, { hands: [R(-0.15, 1.82, -0.1), R(0.15, 1.82, -0.1)], lean: -0.2 }),
        with_(base, { hands: [R(-0.1, 0.35, 0.85), R(0.1, 0.35, 0.85)], crouch: 0.2, lean: 0.5 }),
      ];
    case "counter": {
      const guard = with_(base, { hands: [R(-0.1, 1.0, 0.45), R(0.25, 0.8, 0.3)], lean: -0.15, crouch: 0.08 });
      return [guard, guard];
    }
    case "sit":
    case "stomp":
      return [
        with_(base, { crouch: -0.1, feet: [R(-0.12, 0.35, 0.1), R(0.12, 0.35, 0.1)], hands: [R(-0.3, 1.2, 0), R(0.3, 1.2, 0)] }),
        with_(base, { crouch: 0.28, lean: 0.2 }),
      ];
    case "cast":
      return [with_(base, { hands: [R(-0.3, 1.0, -0.2), L] }), with_(base, { hands: [R(-0.1, 1.3, 0.85), L], lean: 0.1 })];
    case "blow":
      return [
        with_(base, { hands: [R(-0.35, 0.9, 0.1), R(0.35, 0.9, 0.1)] }),
        with_(base, { hands: [R(-0.12, 0.9, 0.55), R(0.12, 0.9, 0.55)], lean: 0.15 }),
      ];
    case "climb":
      return [with_(base, { hands: [R(-0.2, 0.1, 0.4), R(0.2, 0.1, 0.4)], crouch: 0.2 }), base];
    case "pickup":
      return [with_(base, { crouch: 0.15 }), with_(base, { hands: [R(-0.15, 0.1, 0.45), L], crouch: 0.3, lean: 0.6 })];
  }
}

/** Le déroulé d'un coup : quand il arme, quand il frappe, quand il revient */
function timeline(style: HabitueId, move: string): { first: number; last: number; frames: number; charge: number } | null {
  const def = moveDef(style, move);
  if (!def) return null;
  let first =
    def.hits.length > 0 ? Math.min(...def.hits.map((h) => h.from)) : (def.shoot?.at ?? def.push?.[0]?.from ?? Math.round(def.frames * 0.3));
  let last = def.hits.length > 0 ? Math.max(...def.hits.map((h) => h.to)) : first + 3;
  if (def.counter) {
    first = def.counter[0];
    last = def.counter[1];
  }
  return { first: Math.max(1, first), last, frames: def.frames, charge: def.charge?.at ?? -1 };
}

/** Les coups de Lucien où l'accordéon se déplie loin devant */
const STRETCH: Record<string, number> = { s: 0.9, as: 0.8, cs: 1.1, ps: 1.9 };

export class FighterModel {
  readonly group = new THREE.Group();
  private root = new THREE.Group();
  /** Le pivot des tours sur soi-même (roulade, culbute), au milieu du corps */
  private spinner = new THREE.Group();
  private body = new THREE.Group();
  private torso = new THREE.Group();
  private head = new THREE.Group();
  private arms: { upper: THREE.Mesh; fore: THREE.Mesh; elbow: THREE.Mesh; hand: THREE.Mesh; side: number }[] = [];
  private legs: { thigh: THREE.Mesh; shin: THREE.Mesh; knee: THREE.Mesh; foot: THREE.Mesh; side: number }[] = [];
  private prop: THREE.Group;
  private accordion: Accordion | null = null;
  private skull: THREE.Mesh;
  private mats: THREE.MeshStandardMaterial[] = [];
  private shieldBubble: THREE.Mesh;
  private cream: THREE.Mesh;
  private stars = new THREE.Group();
  private yarn: THREE.Mesh;
  private marker: THREE.Group;
  private held: { kind: ItemKind | ""; model: THREE.Object3D | null } = { kind: "", model: null };
  private keep: Keep;
  private flash = 0;
  private yaw = 0;
  private runPhase = 0;
  private lastX = 0;
  private lastY = 0;
  private vx = 0;
  private vy = 0;
  private landing = 0;
  private wasAir = false;
  private scale = 1;
  private disposables: { dispose: () => void }[] = [];
  readonly look: FighterLook;

  constructor(look: FighterLook) {
    this.look = look;
    this.keep = <T extends { dispose: () => void }>(x: T) => {
      this.disposables.push(x);
      return x;
    };
    const keep = this.keep;
    const st = STYLES[look.style];
    this.scale = st.hgt / HEIGHT;
    const mat = (c: THREE.ColorRepresentation, r = 0.75) => {
      const m = keep(std(c, r));
      this.mats.push(m);
      return m;
    };
    const skin = AVATAR_SKINS[look.avatar.skin] ?? AVATAR_SKINS[0]!;
    const top = mat(look.palette.top);
    const bottom = mat(look.palette.bottom);
    const skinMat = mat(skin, 0.65);
    const shoe = mat(0x23232a, 0.6);

    this.group.add(this.root);
    this.root.add(this.spinner);
    this.spinner.add(this.body);
    this.body.position.y = -PIVOT;
    this.body.add(this.torso);
    this.torso.position.y = HIPS_Y;
    // Le buste, une ceinture, et une jupe pour celles qui en portent
    const chest = new THREE.Mesh(keep(new THREE.CapsuleGeometry(0.24, 0.22, 6, 14)), top);
    chest.position.y = 0.26;
    chest.scale.set(1.05, 1, 0.82);
    chest.castShadow = true;
    this.torso.add(chest);
    const belt = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.235, 0.235, 0.06, 16)), mat(look.palette.accent, 0.6));
    belt.position.y = 0.08;
    belt.scale.set(1.05, 1, 0.82);
    this.torso.add(belt);
    if (look.skirt) {
      const skirt = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.22, 0.36, 0.34, 16, 1, true)), bottom);
      skirt.material.side = THREE.DoubleSide;
      skirt.position.y = -0.1;
      skirt.scale.z = 0.85;
      skirt.castShadow = true;
      this.torso.add(skirt);
    }

    // La tête : la peau de l'avatar (posée plus tard), les oreilles, les cheveux, le chapeau
    this.head.position.set(0, 0.7, 0.02);
    this.torso.add(this.head);
    this.skull = new THREE.Mesh(keep(new THREE.SphereGeometry(HEAD_R, 28, 18)), skinMat);
    this.skull.castShadow = true;
    this.head.add(this.skull);
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(keep(new THREE.SphereGeometry(HEAD_R * 0.24, 10, 8)), skinMat);
      ear.position.set(side * HEAD_R * 0.97, -HEAD_R * 0.05, -HEAD_R * 0.05);
      ear.scale.set(0.55, 1, 0.85);
      this.head.add(ear);
    }
    const hatCoversTop = [1, 2, 4, 5, 7].includes(look.avatar.hat);
    const hairGeo = hairGeometry(look.avatar.hair, hatCoversTop);
    if (hairGeo) {
      const hairMat = keep(
        new THREE.MeshStandardMaterial({
          color: AVATAR_HAIR_COLORS[look.avatar.hairColor] ?? AVATAR_HAIR_COLORS[0]!,
          roughness: 0.85,
          side: THREE.DoubleSide,
        }),
      );
      this.mats.push(hairMat);
      const hair = new THREE.Mesh(keep(hairGeo), hairMat);
      hair.castShadow = true;
      this.head.add(hair);
    }
    const hat = hatGroup(look.avatar.hat, keep, true);
    if (hat) this.head.add(hat);
    // La tarte en pleine figure
    this.cream = new THREE.Mesh(keep(new THREE.SphereGeometry(HEAD_R * 0.75, 14, 10)), keep(std(0xfffaf0, 0.5)));
    this.cream.position.set(0, -0.02, HEAD_R * 0.62);
    this.cream.scale.set(1.1, 0.9, 0.5);
    this.cream.visible = false;
    this.head.add(this.cream);
    // Les étoiles de la tête qui tourne
    const starMat = keep(new THREE.MeshBasicMaterial({ color: 0xffd84a, side: THREE.DoubleSide }));
    for (let i = 0; i < 3; i++) this.stars.add(new THREE.Mesh(keep(starShape(0.09)), starMat));
    this.stars.position.y = HEAD_R + 0.18;
    this.stars.visible = false;
    this.head.add(this.stars);

    // Bras et jambes : des os étirés entre les articulations
    for (const side of [-1, 1]) {
      const upper = bone(0.075, top, keep);
      const fore = bone(0.068, top, keep);
      const elbow = new THREE.Mesh(keep(new THREE.SphereGeometry(0.075, 10, 8)), top);
      const hand = new THREE.Mesh(keep(new THREE.SphereGeometry(0.085, 12, 8)), skinMat);
      hand.castShadow = true;
      this.body.add(upper, fore, elbow, hand);
      this.arms.push({ upper, fore, elbow, hand, side });
      const thigh = bone(0.095, bottom, keep);
      const shin = bone(0.085, bottom, keep);
      const knee = new THREE.Mesh(keep(new THREE.SphereGeometry(0.09, 10, 8)), bottom);
      const foot = new THREE.Mesh(keep(new THREE.SphereGeometry(0.11, 10, 8)), shoe);
      foot.scale.set(0.9, 0.65, 1.5);
      foot.castShadow = true;
      this.body.add(thigh, shin, knee, foot);
      this.legs.push({ thigh, shin, knee, foot, side });
    }

    // L'accessoire de son style
    this.prop = propModel(look.style, look.palette.prop, look.palette.accent, keep);
    this.body.add(this.prop);
    if (look.style === "lucien") {
      this.accordion = accordionModel(look.palette.prop, look.palette.accent, keep);
      this.body.add(this.accordion.group);
    }

    // La pelote qui le ligote (pris au lasso ou dans le tricot)
    this.yarn = new THREE.Mesh(keep(new THREE.TorusGeometry(0.34, 0.05, 6, 18)), keep(std(0xe86aa6, 0.95)));
    this.yarn.rotation.x = Math.PI / 2;
    this.yarn.position.y = 0.75;
    this.yarn.visible = false;
    this.body.add(this.yarn);

    // La garde : une bulle à la couleur du joueur
    this.shieldBubble = new THREE.Mesh(
      keep(new THREE.SphereGeometry(0.85, 24, 16)),
      keep(new THREE.MeshBasicMaterial({ color: look.color, transparent: true, opacity: 0.32, depthWrite: false })),
    );
    this.shieldBubble.position.y = 0.78;
    this.shieldBubble.visible = false;
    this.group.add(this.shieldBubble);

    // Son nom au-dessus de la tête, et un petit repère à sa couleur
    this.marker = nameTag(look.me ? "Toi" : look.name, look.color, keep);
    this.marker.position.y = HEIGHT + 0.55;
    this.group.add(this.marker);

    this.root.scale.setScalar(this.scale);
    if (look.style === "marcel") this.root.scale.set(this.scale * 1.12, this.scale, this.scale * 1.08);
    if (look.head) this.setHead(look.head);
  }

  /** La peau de la tête avec les traits de l'avatar */
  setHead(canvas: HTMLCanvasElement) {
    const tex = this.keep(new THREE.CanvasTexture(canvas));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mat = this.keep(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.65 }));
    this.mats.push(mat);
    this.skull.material = mat;
  }

  hit(power: number) {
    this.flash = 0.12 + power * 0.12;
  }

  private pose(f: RenderFighter, time: number): { pose: Pose; strike: number; charging: boolean } {
    const air = this.vy !== 0 && f.state !== "stand" && f.state !== "land" && f.state !== "shield" && f.state !== "shieldstun";
    const base = air && f.state !== "move" ? AIR : REST;
    let strike = 0;
    let charging = false;
    switch (f.state) {
      case "stand":
      case "respawn": {
        const speed = Math.abs(this.vx);
        if (speed < 0.6 || f.state === "respawn") {
          const breathe = Math.sin(time * 2.4) * 0.015;
          return { pose: with_(REST, { crouch: breathe + this.landing * 0.12 }), strike, charging };
        }
        const run = Math.min(1, speed / 7);
        const s = Math.sin(this.runPhase);
        const c = Math.cos(this.runPhase);
        return {
          pose: with_(REST, {
            lean: 0.08 + run * 0.18,
            crouch: Math.abs(c) * 0.04 * run,
            feet: [
              [-0.12, Math.max(0, c) * 0.18 * run, s * 0.34 * run],
              [0.12, Math.max(0, -c) * 0.18 * run, -s * 0.34 * run],
            ],
            hands: [
              [-0.3, 0.6, -s * 0.28 * run + 0.05],
              [0.3, 0.6, s * 0.28 * run + 0.05],
            ],
          }),
          strike,
          charging,
        };
      }
      case "squat":
        return { pose: with_(REST, { crouch: 0.16 }), strike, charging };
      case "land":
        return { pose: with_(REST, { crouch: 0.12 + this.landing * 0.06 }), strike, charging };
      case "air": {
        const rising = this.vy > 1;
        return {
          pose: rising
            ? with_(AIR, {
                feet: [
                  [-0.12, 0.32, 0.18],
                  [0.12, 0.12, -0.05],
                ],
              })
            : AIR,
          strike,
          charging,
        };
      }
      case "shield":
      case "shieldstun":
        return {
          pose: with_(REST, {
            crouch: 0.1,
            hands: [
              [0.05, 0.85, 0.32],
              [-0.05, 0.78, 0.3],
            ],
          }),
          strike,
          charging,
        };
      case "roll":
      case "tech":
        return {
          pose: with_(REST, { crouch: 0.32, spinX: ((f.t / (f.state === "roll" ? 26 : 20)) * Math.PI * 2) % (Math.PI * 2) }),
          strike,
          charging,
        };
      case "dodge":
        return { pose: with_(REST, { lean: -0.35, crouch: 0.05 }), strike, charging };
      case "airdodge":
        return { pose: with_(AIR, { spinY: (Math.min(1, f.t / 24) * Math.PI * 2) % (Math.PI * 2) }), strike, charging };
      case "hurt": {
        if (f.kb > 14)
          return {
            pose: with_(AIR, {
              spinX: time * 11,
              hands: [
                [-0.45, 1.1, -0.1],
                [0.45, 1.0, 0.1],
              ],
            }),
            strike,
            charging,
          };
        return {
          pose: with_(base, {
            lean: -0.4,
            hands: [
              [-0.42, 1.15, -0.1],
              [0.42, 1.1, -0.15],
            ],
            headTilt: -0.3,
          }),
          strike,
          charging,
        };
      }
      case "down":
        return { pose: with_(REST, { spinX: -Math.PI / 2, liftY: -0.5 }), strike, charging };
      case "helpless":
        return {
          pose: with_(AIR, {
            lean: -0.2,
            spinY: Math.sin(time * 3) * 0.3,
            hands: [
              [-0.4, 1.3, 0],
              [0.4, 1.3, 0],
            ],
          }),
          strike,
          charging,
        };
      case "dizzy":
        return {
          pose: with_(REST, { lean: Math.sin(time * 5) * 0.2, headTilt: Math.sin(time * 6) * 0.35, crouch: 0.05 }),
          strike,
          charging,
        };
      case "caught":
        return {
          pose: with_(REST, {
            lean: Math.sin(time * 14) * 0.08,
            hands: [
              [-0.22, 0.6, 0],
              [0.22, 0.6, 0],
            ],
          }),
          strike,
          charging,
        };
      case "ledge":
        return {
          pose: with_(AIR, {
            hands: [
              [-0.18, 1.3, 0.32],
              [0.18, 1.3, 0.32],
            ],
            feet: [
              [-0.12, 0, 0.1],
              [0.12, -0.05, 0.05],
            ],
            lean: 0.1,
          }),
          strike,
          charging,
        };
      case "move": {
        const def = moveDef(this.look.style, f.move);
        const tl = timeline(this.look.style, f.move);
        if (!def || !tl) return { pose: base, strike, charging };
        const moveBase = def.pose.startsWith("air") || def.pose === "rise" || def.pose === "stomp" ? AIR : REST;
        const [W, S] = keyPoses(def.pose, moveBase);
        let pose: Pose;
        const mt = f.mt;
        if (tl.charge >= 0 && Math.abs(mt - tl.charge) < 0.5 && f.charge > 0) {
          // La charge : il tremble, l'arme en arrière
          charging = true;
          const shake = Math.sin(time * 60) * 0.015;
          pose = with_(W, { twist: W.twist + shake * 4, crouch: W.crouch + 0.04 });
        } else if (mt < tl.first) pose = blend(moveBase, W, ease(Math.min(1, mt / tl.first)));
        else if (mt <= tl.last + 1) {
          strike = Math.min(1, (mt - tl.first + 1) / Math.max(1.5, (tl.last - tl.first + 1) * 0.5));
          pose = blend(W, S, ease(strike));
        } else pose = blend(S, moveBase, ease(Math.min(1, (mt - tl.last - 1) / Math.max(1, tl.frames - tl.last - 1))));
        if (def.pose === "spin" && mt >= tl.first - 2)
          pose = with_(pose, { spinY: ((mt - tl.first + 2) / (tl.last - tl.first + 4)) * Math.PI * 2 });
        if (def.pose === "rise" && mt >= tl.first) pose = with_(pose, { spinY: (mt - tl.first) * 0.55 });
        if (def.pose === "climb") pose = with_(pose, { liftY: -(1 - Math.min(1, mt / (tl.frames * 0.6))) * 1.1 });
        return { pose, strike: mt >= tl.first && mt <= tl.last + 6 ? Math.max(strike, 0.6) : strike, charging };
      }
      default:
        return { pose: base, strike, charging };
    }
  }

  update(dt: number, f: RenderFighter, time: number) {
    const visible = f.state !== "dead" && f.state !== "out";
    this.group.visible = visible;
    if (!visible) {
      this.lastX = f.x;
      this.lastY = f.y;
      return;
    }
    // Sa vitesse, d'après ses positions successives (lissée)
    if (dt > 0) {
      const vx = (f.x - this.lastX) / dt;
      const vy = (f.y - this.lastY) / dt;
      if (Math.abs(vx) < 40) this.vx += (vx - this.vx) * Math.min(1, dt * 14);
      if (Math.abs(vy) < 40) this.vy += (vy - this.vy) * Math.min(1, dt * 14);
    }
    this.lastX = f.x;
    this.lastY = f.y;
    const grounded = f.state === "stand" || f.state === "land" || f.state === "shield" || f.state === "squat";
    if (grounded) this.vy = 0;
    if (grounded && this.wasAir) this.landing = 1;
    this.wasAir = !grounded;
    this.landing = Math.max(0, this.landing - dt * 5);
    this.runPhase += Math.abs(this.vx) * dt * 2.3;

    const { pose, strike, charging } = this.pose(f, time);
    this.group.position.set(f.x, f.y, 0);
    // Tourné vers où il regarde, un peu de trois quarts vers nous
    const wanted = f.face * (Math.PI / 2 - 0.42);
    this.yaw += (wanted - this.yaw) * Math.min(1, dt * 18);
    this.root.rotation.set(0, this.yaw, 0);
    // Les tours sur soi-même : autour du milieu du corps
    this.spinner.position.y = PIVOT + pose.liftY;
    this.spinner.rotation.set(pose.spinX, pose.spinY, 0);
    this.torso.position.y = HIPS_Y - pose.crouch;
    this.torso.rotation.set(pose.lean, pose.twist, 0);
    this.head.rotation.set(-0.06 - pose.lean * 0.4, -f.face * 0.32, pose.headTilt);

    // Les bras : de l'épaule à la main visée, le coude vers l'extérieur et en arrière
    this.torso.updateMatrix();
    const shoulderL = new THREE.Vector3();
    for (let i = 0; i < 2; i++) {
      const arm = this.arms[i]!;
      const side = i === 0 ? -1 : 1;
      shoulderL.set(side * SHOULDER_X, SHOULDER_Y - HIPS_Y, 0).applyMatrix4(this.torso.matrix);
      const target = new THREE.Vector3(...pose.hands[i]!);
      target.y -= pose.crouch * 0.5;
      const elbow = ik(shoulderL, target, UPPER, FORE, new THREE.Vector3(side * 0.8, -0.4, -0.5));
      stretch(arm.upper, shoulderL, elbow);
      stretch(arm.fore, elbow, target);
      arm.elbow.position.copy(elbow);
      arm.hand.position.copy(target);
    }
    // Les jambes : de la hanche au pied visé, le genou vers l'avant
    for (let i = 0; i < 2; i++) {
      const leg = this.legs[i]!;
      const side = i === 0 ? -1 : 1;
      const hip = new THREE.Vector3(side * 0.12, HIPS_Y - pose.crouch, 0);
      const foot = new THREE.Vector3(...pose.feet[i]!);
      const knee = ik(hip, foot, THIGH, SHIN, new THREE.Vector3(0, 0.1, 1));
      stretch(leg.thigh, hip, knee);
      stretch(leg.shin, knee, foot);
      leg.knee.position.copy(knee);
      leg.foot.position.copy(foot).add(new THREE.Vector3(0, 0.04, 0.05));
    }

    // L'accessoire dans la main droite, le long de l'avant-bras ; un objet tenu le remplace
    const hand = this.arms[0]!.hand.position;
    const elbowP = this.arms[0]!.elbow.position;
    const along = new THREE.Vector3().subVectors(hand, elbowP).normalize();
    const holding = f.item !== "";
    this.setHeld(f.item);
    const shown = this.held.model ?? this.prop;
    this.prop.visible = !holding && !this.accordion;
    if (this.held.model) this.held.model.visible = holding;
    shown.position.copy(hand);
    shown.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), along);
    if (this.look.style === "ginette" && !holding) {
      // Le sac pend à son anse, sauf quand il frappe
      const hang = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0));
      if (strike < 0.3) shown.quaternion.slerp(hang, 0.85 - strike * 2);
    }
    if (this.accordion) {
      const a = this.accordion;
      a.group.visible = !holding;
      const left = this.arms[1]!.hand.position.clone();
      const right = hand.clone();
      const ext = (STRETCH[f.move] ?? 0) * (f.state === "move" ? strike : 0);
      const dir = new THREE.Vector3().subVectors(right, left);
      if (dir.lengthSq() < 0.01) dir.set(-1, 0, 0);
      dir.normalize();
      right.addScaledVector(dir, ext);
      a.left.position.copy(left);
      a.right.position.copy(right);
      const mid = left.clone().add(right).multiplyScalar(0.5);
      a.bellows.position.copy(mid);
      a.bellows.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
      a.left.quaternion.copy(a.bellows.quaternion);
      a.right.quaternion.copy(a.bellows.quaternion);
      a.bellows.scale.x = Math.max(0.08, left.distanceTo(right) - 0.1);
    }

    // La garde, la tarte, les étoiles, la laine
    const shielding = f.state === "shield" || f.state === "shieldstun";
    this.shieldBubble.visible = shielding;
    if (shielding) this.shieldBubble.scale.setScalar(0.45 + (0.55 * Math.max(0, f.shield)) / 50);
    this.cream.visible = (f.flags & F_CREAM) !== 0;
    this.stars.visible = f.state === "dizzy";
    if (this.stars.visible)
      this.stars.children.forEach((s, i) => {
        const a = time * 5 + (i * Math.PI * 2) / 3;
        s.position.set(Math.cos(a) * 0.32, Math.sin(time * 7 + i) * 0.03, Math.sin(a) * 0.32);
        s.rotation.set(0, -a, time * 4);
      });
    this.yarn.visible = f.state === "caught";
    if (this.yarn.visible) this.yarn.rotation.z = time * 3;

    // L'éclair d'un coup reçu, la charge qui monte, le café qui donne des ailes
    this.flash = Math.max(0, this.flash - dt);
    const glow = this.flash > 0 ? 0.9 : charging ? 0.25 + 0.2 * Math.sin(time * 30) : (f.flags & F_FAST) !== 0 ? 0.12 : 0;
    const glowColor = this.flash > 0 ? 0xffffff : charging ? 0xffc040 : 0x8fd3ff;
    for (const m of this.mats) {
      m.emissive.setHex(glowColor);
      m.emissiveIntensity = glow;
    }
    // Intouchable après son retour : il clignote
    const blink = (f.flags & F_INTANG) !== 0 && (f.state === "respawn" || f.state === "air" || f.state === "stand" || f.state === "land");
    this.root.visible = !blink || Math.floor(time * 12) % 2 === 0;
  }

  private setHeld(kind: ItemKind | "") {
    if (kind === this.held.kind) return;
    if (this.held.model) this.body.remove(this.held.model);
    this.held = { kind, model: kind ? itemModel(kind, this.keep) : null };
    if (this.held.model) {
      this.held.model.scale.setScalar(kind === "baguette" ? 1 : 0.8);
      this.body.add(this.held.model);
    }
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
  }
}

/** Un os : un cylindre de longueur 1 le long de y, à étirer et orienter */
function bone(radius: number, mat: THREE.Material, keep: Keep): THREE.Mesh {
  const geo = keep(new THREE.CylinderGeometry(radius, radius * 0.9, 1, 8));
  geo.translate(0, 0.5, 0);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  return m;
}

const UP = new THREE.Vector3(0, 1, 0);

function stretch(m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  m.position.copy(a);
  m.quaternion.setFromUnitVectors(UP, dir.divideScalar(len || 1));
  m.scale.set(1, len, 1);
}

/** L'articulation du milieu (coude, genou) : deux os de longueurs données, plié du côté de `pole` */
function ik(a: THREE.Vector3, target: THREE.Vector3, l1: number, l2: number, pole: THREE.Vector3): THREE.Vector3 {
  const along = new THREE.Vector3().subVectors(target, a);
  let d = along.length();
  // Trop loin : le membre se tend (la main ne va pas plus loin que le bras)
  if (d > l1 + l2 - 0.005) {
    along.multiplyScalar((l1 + l2 - 0.005) / d);
    target.copy(a).add(along);
    d = l1 + l2 - 0.005;
  }
  along.normalize();
  const perp = pole.clone().addScaledVector(along, -pole.dot(along));
  if (perp.lengthSq() < 1e-6) perp.set(0, 0, 1);
  perp.normalize();
  const x = (l1 * l1 - l2 * l2 + d * d) / (2 * Math.max(d, 1e-3));
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  return a.clone().addScaledVector(along, x).addScaledVector(perp, h);
}

function starShape(r: number): THREE.ShapeGeometry {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    if (i === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  return new THREE.ShapeGeometry(s);
}

/** Le nom du combattant, sur une petite étiquette à sa couleur, toujours tournée vers nous */
function nameTag(text: string, color: string, keep: Keep): THREE.Group {
  const g = new THREE.Group();
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 72;
  const ctx = c.getContext("2d")!;
  ctx.font = "700 40px 'Libre Franklin Variable', system-ui, sans-serif";
  const w = Math.min(240, ctx.measureText(text).width + 36);
  ctx.fillStyle = "rgba(20, 18, 24, 0.72)";
  roundRect(ctx, (256 - w) / 2, 6, w, 48, 24);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(116, 54);
  ctx.lineTo(140, 54);
  ctx.lineTo(128, 70);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text.length > 12 ? `${text.slice(0, 11)}…` : text, 128, 31);
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  roundRect(ctx, (256 - w) / 2, 6, w, 48, 24);
  ctx.stroke();
  const tex = keep(new THREE.CanvasTexture(c));
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true })));
  sprite.scale.set(1.3, 0.366, 1);
  sprite.renderOrder = 10;
  g.add(sprite);
  return g;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
