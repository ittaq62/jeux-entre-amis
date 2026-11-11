// L'atelier des cartes (uniquement en développement, sur /dev/cartes) : chaque sujet en 3D est photographié, et on en
// tire la planche d'images de l'album, à ranger dans src/client/cards/cards-atlas.webp.

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { AvatarConfig } from "../../shared/avatar.ts";
import type { SkinId, VehicleId } from "../../shared/games/bolides/garage.ts";
import type { ItemKind } from "../../shared/games/bolides/items.ts";
import { newKart } from "../../shared/games/bolides/physics.ts";
import { getTrack } from "../../shared/games/bolides/track.ts";
import type { TokenId } from "../../shared/games/capitale/tokens.ts";
import { CLUB_BY_ID, KEEPER_KITS } from "../../shared/games/crampons/clubs.ts";
import { GOAL_H, GOAL_HALF, HALF_L } from "../../shared/games/crampons/pitch.ts";
import { headCanvas } from "../bolides/scene/faces.ts";
import { ICON_POSE, ItemModels } from "../bolides/scene/itemModels.ts";
import { KartModel } from "../bolides/scene/kart.ts";
import { PilotModel, type PilotRig } from "../bolides/scene/pilot.ts";
import * as B from "../capitale/scene/buildings.ts";
import { tokenModel } from "../capitale/scene/tokens.ts";
import { ballTexture } from "../crampons/scene/CramponsScene.ts";
import { Footballers, type FootballerView, type Kit } from "../crampons/scene/footballers.ts";
import { buildGoal, netTexture } from "../crampons/scene/stadium.ts";
import { ATLAS_CELL, ATLAS_COLS, ATLAS_KEYS, ATLAS_ROWS } from "./atlasKeys.ts";

/** On dessine en grand, puis on réduit : des bords bien nets */
const RENDER = ATLAS_CELL * 3;

const face = (
  bg: number,
  skin: number,
  hair: number,
  hairColor: number,
  eyes: number,
  mouth: number,
  hat: number,
  extra: number,
): AvatarConfig => ({
  bg,
  skin,
  hair,
  hairColor,
  eyes,
  mouth,
  hat,
  extra,
});

// Les Habitués : fond, teint, coiffure, couleur, yeux, bouche, chapeau, accessoire
const PILOTS: Record<string, AvatarConfig> = {
  gaston: face(10, 0, 2, 4, 6, 7, 1, 0),
  marcel: face(9, 1, 0, 4, 4, 6, 4, 0),
  raymond: face(5, 0, 1, 4, 0, 3, 0, 1),
  lucien: face(3, 2, 1, 1, 7, 2, 0, 0),
  jacqueline: face(8, 0, 5, 4, 1, 4, 0, 1),
  fernand: face(2, 3, 1, 4, 4, 3, 5, 0),
  ginette: face(7, 0, 3, 2, 2, 4, 0, 0),
  josiane: face(1, 1, 7, 3, 0, 1, 0, 2),
  odette: face(4, 0, 5, 3, 1, 1, 0, 0),
  paulette: face(0, 2, 3, 4, 3, 1, 6, 0),
  huguette: face(11, 0, 5, 4, 6, 4, 0, 5),
  germaine: face(6, 4, 4, 4, 0, 3, 2, 4),
  simone: face(10, 3, 4, 0, 6, 3, 7, 2),
  patronne: face(2, 1, 5, 2, 5, 4, 3, 4),
};

const VEHICLE_LOOKS: Record<VehicleId, { skin: SkinId; color: string; driver: AvatarConfig }> = {
  kart: { skin: "usine", color: "#e2483d", driver: face(5, 0, 1, 1, 1, 1, 4, 0) },
  moto: { skin: "bandes", color: "#2f80ed", driver: face(0, 2, 7, 3, 2, 4, 0, 2) },
  buggy: { skin: "camo", color: "#c8892e", driver: face(3, 1, 3, 1, 0, 1, 7, 0) },
  bolide: { skin: "carbone", color: "#e2483d", driver: face(10, 3, 6, 5, 6, 4, 0, 2) },
  monstre: { skin: "flammes", color: "#f07a22", driver: face(9, 4, 0, 0, 6, 5, 8, 5) },
  tondeuse: { skin: "usine", color: "#3fa85a", driver: face(11, 0, 1, 4, 4, 6, 2, 1) },
  soucoupe: { skin: "galaxie", color: "#8a6cf0", driver: face(6, 6, 0, 0, 5, 1, 0, 0) },
};

const BUST_RIG: PilotRig = {
  hips: new THREE.Vector3(0, 0, 0),
  pitch: 0,
  steer: { kind: "none", at: new THREE.Vector3(0, 0.46, 0.5), tilt: 0, half: 0.2 },
  legs: null,
};

const keep = <T,>(x: T) => x;

interface Shot {
  object: THREE.Object3D;
  /** D'où on regarde (la direction, à partir du sujet) */
  dir: THREE.Vector3;
  /** Plus grand : le sujet remplit plus l'image */
  zoom: number;
  /** Cadrage fixe, pour les portraits */
  look?: THREE.Vector3;
  distance?: number;
}

// Crampons : les joueurs du jeu, figés en plein geste, aux couleurs d'un club
const clubKit = (id: string): Kit => CLUB_BY_ID.get(id)!.home;
const BALL_R = 0.22;

function footBall(): THREE.Mesh {
  return new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 36, 24), new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.42 }));
}

/** Un joueur, la pose mise en place en rejouant quelques images (ou, pour une frappe, figée à un instant du geste) */
function footballer(kit: Kit, seed: number, shirt: number, view: Partial<FootballerView>, keeper = false, time = 1) {
  const group = new THREE.Group();
  const kits: [Kit, Kit] = [kit, kit];
  const crowd = new Footballers(group as unknown as THREE.Scene, 1, kits, kits, [keeper], [shirt], true, seed);
  const full: FootballerView = {
    x: 0,
    z: 0,
    h: Math.PI / 2,
    v: 0,
    act: "none",
    team: 0,
    keeper,
    dirX: 0,
    dirZ: 0,
    cheer: false,
    off: false,
    ...view,
  };
  const frames = Math.round(time * 60);
  for (let f = 0; f <= frames; f++) crowd.update(1 / 60, f / 60, [full]);
  /** Un point devant le joueur, au-dessus et sur le côté de cette partie du corps */
  const near = (part: Parameters<Footballers["partAt"]>[1], ahead: number, up = 0, side = 0) => {
    const fx = Math.cos(full.h);
    const fz = Math.sin(full.h);
    return crowd.partAt(0, part).add(new THREE.Vector3(fx * ahead - fz * side, up, fz * ahead + fx * side));
  };
  return { group, near };
}

function footShot(id: string): Shot {
  const holder = new THREE.Group();
  const ball = footBall();
  const at = (v: THREE.Vector3) => {
    ball.position.copy(v);
    holder.add(ball);
  };
  const player = (p: ReturnType<typeof footballer>) => {
    holder.add(p.group);
    return p;
  };
  const front = new THREE.Vector3(0.42, 0.2, 1).normalize();
  switch (id) {
    case "ballon": {
      ball.rotation.set(0.35, -0.95, 0.25);
      holder.add(ball);
      return { object: holder, dir: new THREE.Vector3(0.2, 0.3, 1).normalize(), zoom: 1.28 };
    }
    case "cages": {
      const goal = buildGoal(1, netTexture(), false).group;
      goal.position.x = -HALF_L;
      holder.add(goal);
      return { object: holder, dir: new THREE.Vector3(-1, 0.36, 0.5).normalize(), zoom: 1.24 };
    }
    case "remplacant": {
      player(footballer(clubKit("val-joli"), 31, 14, { sad: true, h: Math.PI / 2 + 0.35 }));
      return { object: holder, dir: front, zoom: 1.02 };
    }
    case "ailier": {
      player(footballer(clubKit("port-sale"), 7, 7, { v: 9.5, h: Math.PI * 0.7 }, false, 1.12));
      return { object: holder, dir: front, zoom: 1.02 };
    }
    case "gardien": {
      const p = player(footballer(KEEPER_KITS[0], 12, 1, { act: "hold", h: Math.PI / 2 + 0.1 }, true));
      at(p.near("handL", 0.16, -0.12).lerp(p.near("handR", 0.16, -0.12), 0.5));
      return { object: holder, dir: front, zoom: 1.02 };
    }
    case "tacle": {
      const p = player(footballer(clubKit("les-forges"), 4, 4, { act: "slide", h: Math.PI * 0.92 }));
      at(p.near("footR", 0.34, 0.12));
      return { object: holder, dir: front, zoom: 1.04 };
    }
    case "touche": {
      const p = player(footballer(clubKit("trois-clochers"), 23, 3, { act: "throw", h: Math.PI / 2 + 0.45 }));
      at(p.near("handL", -0.08, 0.24).lerp(p.near("handR", -0.08, 0.24), 0.5));
      return { object: holder, dir: front, zoom: 1.02 };
    }
    case "tete": {
      const p = player(footballer(clubKit("haute-combe"), 9, 9, { act: "header", h: Math.PI * 0.82 }));
      at(p.near("head", 0.34, 0.06));
      return { object: holder, dir: front, zoom: 1.04 };
    }
    case "frappe": {
      const p = player(footballer(clubKit("saint-ballon"), 10, 10, { act: "kick", kickT: 0.2, h: Math.PI }));
      at(p.near("footR", 0.55, 0.22));
      return { object: holder, dir: new THREE.Vector3(0.16, 0.16, 1).normalize(), zoom: 1.04 };
    }
    case "plongeon": {
      const p = player(footballer(KEEPER_KITS[1], 16, 16, { act: "dive", h: Math.PI / 2, dirX: -1, dirZ: 0 }, true, 0.6));
      at(
        p
          .near("handL", 0.1)
          .lerp(p.near("handR", 0.1), 0.5)
          .add(new THREE.Vector3(-0.42, 0.1, 0)),
      );
      return { object: holder, dir: new THREE.Vector3(0.12, 0.22, 1).normalize(), zoom: 1.06 };
    }
    case "celebration": {
      player(footballer(clubKit("mont-bidule"), 11, 11, { cheer: true, joy: 0, h: Math.PI / 2 + 0.25 }, false, 1.18));
      return { object: holder, dir: front, zoom: 1.02 };
    }
    case "gardien-buteur": {
      player(footballer(KEEPER_KITS[0], 41, 1, { cheer: true, joy: 2, h: Math.PI / 2 + 0.3 }, true, 1.05));
      return { object: holder, dir: front, zoom: 1.02 };
    }
    default: {
      // La lucarne : le ballon au ras de la barre, le gardien plonge en vain
      const goal = buildGoal(1, netTexture(), false).group;
      holder.add(goal);
      const p = player(
        footballer(KEEPER_KITS[1], 16, 1, { act: "dive", x: HALF_L - 0.7, z: 1.1, h: Math.PI, dirX: 0, dirZ: 1 }, true, 0.6),
      );
      void p;
      at(new THREE.Vector3(HALF_L + 0.4, GOAL_H - 0.32, GOAL_HALF - 0.36));
      // Cadrage fixe sur le coin du but : le gardien et le ballon en grand
      return {
        object: holder,
        dir: new THREE.Vector3(-1, 0.16, -0.3).normalize(),
        zoom: 1,
        look: new THREE.Vector3(HALF_L, 1.36, 2.35),
        distance: 8.7,
      };
    }
  }
}

async function subject(key: string, items: ItemModels): Promise<Shot> {
  const [family, id] = key.split(":") as [string, string];
  const three4 = new THREE.Vector3(0.78, 0.62, 1).normalize();
  if (family === "pilot") {
    const avatar = PILOTS[id]!;
    const head = await headCanvas(avatar);
    const pilot = new PilotModel(avatar, head, "#f2c94c", keep, false, BUST_RIG);
    pilot.update({
      steer: 0,
      drift: 0,
      lean: 0,
      spinning: false,
      boosting: false,
      trick: false,
      celebrate: false,
      speed: 0,
      time: 0,
      dt: 1 / 60,
    });
    return {
      object: pilot.group,
      dir: new THREE.Vector3(0.28, 0.1, 1).normalize(),
      zoom: 1,
      look: new THREE.Vector3(0, 1.2, 0.04),
      distance: 2.95,
    };
  }
  if (family === "vehicle") {
    const v = id as VehicleId;
    const look = VEHICLE_LOOKS[v];
    const headTex = await headCanvas(look.driver);
    const kart = new KartModel(
      { color: look.color, name: "", face: null, avatar: look.driver, head: headTex, vehicle: v, skin: look.skin, me: true },
      false,
    );
    const k = newKart(getTrack("port"), 0, 0, 0);
    Object.assign(k, { x: 0, z: 0, y: 0, h: 0, v: 0 });
    for (let i = 0; i < 8; i++) kart.update(k, 1 / 60, { steer: 0.35, shield: false, done: false }, i / 60);
    const holder = new THREE.Group();
    holder.add(kart.group);
    holder.rotation.y = 2.5;
    // Cadrage fixe : autour du véhicule traînent des effets invisibles qui fausseraient un cadrage automatique
    return {
      object: holder,
      dir: new THREE.Vector3(0, 0.34, 1).normalize(),
      zoom: 1,
      look: new THREE.Vector3(0, 0.82, 0),
      distance: v === "monstre" ? 10.4 : 8.6,
    };
  }
  if (family === "token") return { object: tokenModel(id as TokenId, "#e2453c"), dir: three4, zoom: 1.04 };
  if (family === "foot") return footShot(id);
  if (family === "item") {
    const kind = id as ItemKind;
    const pose = ICON_POSE[kind];
    const { root } = items.make(kind);
    root.rotation.set(pose.rot[0], pose.rot[1], pose.rot[2]);
    return { object: root, dir: new THREE.Vector3(0, 0, 1), zoom: 1.1 };
  }
  const object =
    id === "maison"
      ? B.maison("rose", "#e2453c")
      : id === "immeuble"
        ? B.immeuble("ciel", "#2f80ed")
        : id === "parc"
          ? B.parc().group
          : id === "decharge"
            ? B.decharge().group
            : id === "gare"
              ? B.station("#e2453c")
              : id === "stade"
                ? B.stade("#2f80ed")
                : B.gratteCiel("bleu", "#e2bd6e", true);
  return { object, dir: new THREE.Vector3(0.75, 0.62, 1).normalize(), zoom: 1.08 };
}

async function photograph(): Promise<HTMLCanvasElement> {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(RENDER, RENDER, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.04;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
  scene.environmentIntensity = 0.5;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a70, 0.95));
  const key = new THREE.DirectionalLight(0xfff0dc, 2.1);
  key.position.set(-3, 5, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xbfe0ff, 1.5);
  rim.position.set(4, 2, -4);
  scene.add(rim);
  const items = new ItemModels(keep, { detail: 2, shadows: false, outline: 0.016, icon: true });
  const out = document.createElement("canvas");
  out.width = ATLAS_COLS * ATLAS_CELL;
  out.height = ATLAS_ROWS * ATLAS_CELL;
  const g = out.getContext("2d")!;
  g.imageSmoothingQuality = "high";
  for (const [i, key2] of ATLAS_KEYS.entries()) {
    const shot = await subject(key2, items);
    scene.add(shot.object);
    const camera = new THREE.PerspectiveCamera(26, 1, 0.01, 200);
    if (shot.look && shot.distance) {
      camera.position.copy(shot.look).addScaledVector(shot.dir, shot.distance);
      camera.lookAt(shot.look);
    } else {
      // Cadrage automatique : le sujet entier, centré
      shot.object.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(shot.object);
      const center = box.getCenter(new THREE.Vector3());
      const radius = box.getSize(new THREE.Vector3()).length() / 2;
      camera.position.copy(center).addScaledVector(shot.dir, radius / Math.sin((13 * Math.PI) / 180) / shot.zoom);
      camera.lookAt(center);
    }
    renderer.render(scene, camera);
    scene.remove(shot.object);
    g.drawImage(renderer.domElement, (i % ATLAS_COLS) * ATLAS_CELL, Math.floor(i / ATLAS_COLS) * ATLAS_CELL, ATLAS_CELL, ATLAS_CELL);
  }
  pmrem.dispose();
  renderer.dispose();
  return out;
}

export function DevCards() {
  const box = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState("");
  useEffect(() => {
    void photograph().then((atlas) => {
      box.current?.replaceChildren(atlas);
      atlas.style.width = "100%";
      const data = atlas.toDataURL("image/webp", 0.86);
      setUrl(data);
      (window as unknown as { __atlas?: string }).__atlas = data;
    });
  }, []);
  return (
    <div style={{ background: "#2e4a3d", minHeight: "100vh", padding: 12 }}>
      <a href={url} download="cards-atlas.webp" style={{ color: "#fff" }}>
        Enregistrer la planche
      </a>
      <div ref={box} />
    </div>
  );
}
