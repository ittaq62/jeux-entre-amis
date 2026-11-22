// L'affiche du minigolf sur l'accueil (page de travail seulement : /dev/minigolf?affiche) : un Habitué, celui de Culbute,
// qui joue au minigolf, un putter dans les mains. On reprend son personnage tel quel et on lui donne une posture de golfeur
// (les pieds écartés, le buste penché, les deux mains sur la poignée, les yeux sur la balle) ; le putter suit ses mains.

import * as THREE from "three";
import { HABITUES, type Palette } from "../../shared/games/culbute/fighters.ts";
import type { HabitueId } from "../../shared/games/culbute/model.ts";
import { headCanvas } from "../bolides/scene/faces.ts";
import { FighterModel } from "../culbute/scene/fighter.ts";

type V3 = [number, number, number];

/** La posture, dans le repère du personnage : il regarde vers +z, sa main droite est du côté -x */
export interface GolferPose {
  crouch: number;
  lean: number;
  twist: number;
  hands: [V3, V3];
  feet: [V3, V3];
  headTilt: number;
  /** Où pointe sa tête : penchée vers la balle, tournée vers le trou */
  headPitch: number;
  headTurn: number;
  /** La tête du putter, au sol */
  club: V3;
}

/** Ce que le personnage attend de la partie (il ne fait ici que se tenir debout) */
const STILL = {
  x: 0,
  y: 0,
  face: 1 as const,
  state: "stand" as const,
  move: "",
  mt: 0,
  dmg: 0,
  stocks: 3,
  score: 0,
  flags: 0,
  shield: 50,
  item: "" as const,
  charge: 0,
  t: 0,
  kb: 0,
  slot: 0,
  ground: 0,
  me: false,
};

interface Inside {
  pose: (f: unknown, t: number) => unknown;
  arms: { hand: THREE.Mesh }[];
  body: THREE.Group;
  head: THREE.Group;
  prop: THREE.Group;
  marker: THREE.Group;
  yaw: number;
}

export interface Golfer {
  /** À poser dans la scène : il regarde vers +z de ce groupe */
  holder: THREE.Group;
  pose: GolferPose;
  update(dt: number, time: number): void;
}

/** Un putter : la poignée, le manche, la tête en laiton */
function putter(): { group: THREE.Group; length: number } {
  const g = new THREE.Group();
  const length = 0.82;
  const metal = new THREE.MeshStandardMaterial({ color: 0xd7dbe0, metalness: 0.9, roughness: 0.25 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, length, 10), metal);
  shaft.position.y = length / 2;
  const grip = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.017, 0.24, 12),
    new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.7 }),
  );
  grip.position.y = length - 0.1;
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.17, 0.045, 0.055),
    new THREE.MeshStandardMaterial({ color: 0xd6a640, metalness: 0.85, roughness: 0.3 }),
  );
  head.position.set(0.02, 0.0, 0);
  g.add(shaft, grip, head);
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  return { group: g, length };
}

export function golfer(style: HabitueId, palette: Palette, pose: GolferPose): Golfer {
  const info = HABITUES[style];
  const model = new FighterModel({
    slot: 0,
    name: info.name,
    avatar: info.avatar,
    style,
    palette,
    color: "#ffffff",
    me: false,
    bot: true,
    outfit: style,
  });
  const inside = model as unknown as Inside;
  inside.marker.visible = false;
  inside.prop.visible = false;
  model.group.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  void headCanvas(info.avatar).then((c) => model.setHead(c));
  const holder = new THREE.Group();
  // Le personnage se tourne de trois quarts vers la caméra de Culbute ; on le remet face à +z
  const inner = new THREE.Group();
  inner.add(model.group);
  holder.add(inner);
  const club = putter();
  const g: Golfer = {
    holder,
    pose,
    update(dt, time) {
      const p = g.pose;
      inside.pose = () => ({
        pose: {
          crouch: p.crouch,
          lean: p.lean,
          twist: p.twist,
          spinX: 0,
          spinY: 0,
          liftY: 0,
          hands: p.hands,
          feet: p.feet,
          headTilt: p.headTilt,
        },
        strike: 0,
        charging: false,
      });
      model.update(dt, STILL as never, time);
      inside.prop.visible = false;
      inner.rotation.y = -inside.yaw;
      inside.head.rotation.x += p.headPitch;
      inside.head.rotation.y = p.headTurn;
      // Le putter : de sa tête, posée au sol, jusqu'entre les deux mains
      holder.updateMatrixWorld(true);
      if (!club.group.parent && holder.parent) holder.parent.add(club.group);
      const a = inside.arms[0]!.hand.getWorldPosition(new THREE.Vector3());
      const b = inside.arms[1]!.hand.getWorldPosition(new THREE.Vector3());
      const grip = a.add(b).multiplyScalar(0.5);
      const head = inside.body.localToWorld(new THREE.Vector3(...p.club));
      const dir = grip.clone().sub(head);
      const len = dir.length();
      club.group.position.copy(head);
      club.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      // Le putter garde sa longueur : il s'arrête aux mains, quelle que soit la posture
      club.group.scale.setScalar(Math.max(0.6, len / (club.length - 0.06)));
      // La face du putter, tournée vers où va la balle (la gauche du joueur)
      const left = inside.body.localToWorld(new THREE.Vector3(1, 0, 0)).sub(inside.body.localToWorld(new THREE.Vector3()));
      const along = new THREE.Vector3(1, 0, 0).applyQuaternion(club.group.quaternion);
      const twist = Math.atan2(along.clone().cross(left).dot(dir), along.dot(left));
      club.group.rotateY(twist);
    },
  };
  return g;
}

/** Une balle plus pâle derrière celle qui roule : le mouvement, sur une image fixe */
function ghostBalls(scene: THREE.Scene, from: THREE.Vector3, dir: THREE.Vector3, r: number) {
  const out: THREE.Mesh[] = [];
  for (let i = 1; i <= 4; i++) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(r * (1 - i * 0.06), 20, 14),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22 - i * 0.045, depthWrite: false }),
    );
    m.position.copy(from).addScaledVector(dir, -i * r * 1.25);
    scene.add(m);
    out.push(m);
  }
  return out;
}

/**
 * La scène de l'affiche, au Jardin, devant la fontaine : Marcel vient de frapper, la balle file vers le pont de bois,
 * le château au fond. `__affiche` (en console) donne la caméra, le golfeur et sa posture, pour cadrer
 */
export function stageAffiche(rt: unknown, m: { players: { ball: [number, number, number]; cur: number }[] }) {
  const R = rt as {
    scene: { scene: THREE.Scene; camera: THREE.PerspectiveCamera; render: (t: number, dt: number) => void };
    updateCamera: (dt: number, now: number) => void;
    canShoot: () => boolean;
    setView: (v: unknown) => void;
  };
  const ball = new THREE.Vector3(0.02, 0.055, -4.75);
  m.players[0]!.cur = 1;
  m.players[0]!.ball = [ball.x, ball.y, ball.z];
  R.setView(structuredClone(m));
  R.canShoot = () => false;
  const g = golfer(
    "marcel",
    { top: "#2f6fae", bottom: "#8d939c", prop: "#3f7fd8", accent: "#f4efe2" },
    {
      crouch: 0.07,
      lean: 0.42,
      twist: 0.1,
      hands: [
        [0.06, 0.34, 0.27],
        [0.09, 0.42, 0.24],
      ],
      feet: [
        [-0.2, 0, 0.0],
        [0.18, 0, 0.02],
      ],
      headTilt: 0,
      headPitch: 0.12,
      headTurn: -0.15,
      club: [0.2, 0.025, 0.44],
    },
  );
  // Il est à gauche de la balle (vu du trou) et la regarde ; le trou est à sa gauche
  g.holder.position.set(ball.x - 0.52, 0, ball.z + 0.62);
  g.holder.rotation.y = Math.PI / 2;
  R.scene.scene.add(g.holder);
  const ghosts = ghostBalls(R.scene.scene, ball, new THREE.Vector3(0, 0, -1), 0.055);
  const cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 40 };
  // Les deux cadrages des images de l'accueil : large (1600 × 800, tablettes et téléphones) et haut (1000 × 1075, ordinateur)
  const wide = () => {
    cam.pos.set(2.15, 0.85, -2.55);
    cam.look.set(-0.35, 0.62, -5.45);
    cam.fov = 40;
    g.pose.headPitch = 0.12;
  };
  const tall = () => {
    cam.pos.set(1.75, 1.42, -1.45);
    cam.look.set(-0.55, 0.52, -5.15);
    cam.fov = 50;
    g.pose.headPitch = -0.1;
  };
  wide();
  R.updateCamera = () => {
    R.scene.camera.fov = cam.fov;
    R.scene.camera.updateProjectionMatrix();
    R.scene.camera.position.copy(cam.pos);
    R.scene.camera.lookAt(cam.look);
  };
  const render = R.scene.render.bind(R.scene);
  R.scene.render = (t, dt) => {
    g.update(dt, t);
    render(t, dt);
  };
  (window as unknown as { __affiche: unknown }).__affiche = { cam, golfer: g, ball, ghosts, wide, tall };
}
