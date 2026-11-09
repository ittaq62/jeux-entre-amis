// L'atelier des objets (uniquement en développement, sur /dev/objets) : on photographie chaque objet en 3D, et on en
// tire la planche d'images utilisée dans la case de la course. Le bouton enregistre la planche, à ranger dans
// src/client/bolides/items-atlas.webp.

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { ITEM_KINDS, type ItemKind } from "../../shared/games/bolides/items.ts";
import { ICON_POSE, ItemModels } from "./scene/itemModels.ts";
import { ATLAS_CELL, ATLAS_COLS, ATLAS_ROWS } from "./ItemIcon.tsx";

/** On dessine en grand, puis on réduit : des bords bien nets */
const RENDER = ATLAS_CELL * 3;
/** Le liseré clair autour de chaque objet, comme une vignette à coller */
const STICKER = Math.round(RENDER * 0.024);

function photograph(): HTMLCanvasElement {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(RENDER, RENDER, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
  scene.environmentIntensity = 0.42;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a90, 0.72));
  const key = new THREE.DirectionalLight(0xfff4e0, 1.75);
  key.position.set(-2.6, 4, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xbfe0ff, 1.5);
  rim.position.set(3.5, 1.6, -3);
  scene.add(rim);
  const camera = new THREE.OrthographicCamera(-0.74, 0.74, 0.74, -0.74, 0.1, 20);
  camera.position.set(0, 0, 6);
  camera.lookAt(0, 0, 0);
  const trash: { dispose: () => void }[] = [];
  const models = new ItemModels(
    (x) => {
      trash.push(x);
      return x;
    },
    { detail: 2, shadows: false, outline: 0.024, icon: true },
  );
  const out = document.createElement("canvas");
  out.width = ATLAS_COLS * ATLAS_CELL;
  out.height = ATLAS_ROWS * ATLAS_CELL;
  const g = out.getContext("2d")!;
  g.imageSmoothingQuality = "high";
  const cell = document.createElement("canvas");
  cell.width = cell.height = RENDER;
  const cg = cell.getContext("2d")!;
  // Le dessin en blanc uni : son contour, décalé tout autour, fait le liseré
  const tint = document.createElement("canvas");
  tint.width = tint.height = RENDER;
  const tg = tint.getContext("2d")!;
  ITEM_KINDS.forEach((kind: ItemKind, i) => {
    const pose = ICON_POSE[kind];
    const { root } = models.make(kind);
    root.rotation.set(pose.rot[0], pose.rot[1], pose.rot[2]);
    root.scale.setScalar(pose.scale);
    root.position.set(pose.x ?? 0, pose.y ?? 0, 0);
    scene.add(root);
    renderer.render(scene, camera);
    scene.remove(root);
    tg.globalCompositeOperation = "source-over";
    tg.clearRect(0, 0, RENDER, RENDER);
    tg.drawImage(renderer.domElement, 0, 0);
    tg.globalCompositeOperation = "source-in";
    tg.fillStyle = "#fffdf6";
    tg.fillRect(0, 0, RENDER, RENDER);
    cg.clearRect(0, 0, RENDER, RENDER);
    for (let a = 0; a < 32; a++) {
      const t = (a / 32) * Math.PI * 2;
      cg.drawImage(tint, Math.cos(t) * STICKER, Math.sin(t) * STICKER);
    }
    cg.drawImage(renderer.domElement, 0, 0);
    g.drawImage(cell, (i % ATLAS_COLS) * ATLAS_CELL, Math.floor(i / ATLAS_COLS) * ATLAS_CELL, ATLAS_CELL, ATLAS_CELL);
  });
  for (const d of trash) d.dispose();
  pmrem.dispose();
  renderer.dispose();
  return out;
}

export function DevItems() {
  const box = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState("");
  useEffect(() => {
    const atlas = photograph();
    box.current?.replaceChildren(atlas);
    const data = atlas.toDataURL("image/webp", 0.88);
    setUrl(data);
    (window as unknown as { __atlas?: string }).__atlas = data;
  }, []);
  return (
    <div style={{ background: "#38404d", minHeight: "100vh", padding: 12 }}>
      <a href={url} download="items-atlas.webp" style={{ color: "#fff" }}>
        Enregistrer la planche
      </a>
      <div ref={box} />
    </div>
  );
}
