// Une page réservée au développement : les footballeurs de près, dans chaque posture, sous l'angle qu'on veut, pour régler
// leurs volumes et leurs gestes. /dev/poses?angle=20&dist=9&haut=1.6&t=1.2&poses=repos,course,fete0
// angle : d'où on regarde (0 : de face, 180 : de dos), dist et haut : la caméra, t : le temps laissé aux gestes.

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { Act } from "../../shared/games/crampons/model.ts";
import { Footballers, type FootballerView, type Kit } from "./scene/footballers.ts";
import { themeFor } from "./scene/stadium.ts";

const KITS: [Kit, Kit] = [
  { shirt: "#d6322e", sleeves: "#ffffff", shorts: "#ffffff", socks: "#d6322e" },
  { shirt: "#2b2b33", sleeves: "#e8792b", shorts: "#2b2b33", socks: "#e8792b", pattern: "rayures", accent: "#e8792b" },
];
const KEEPERS: [Kit, Kit] = [
  { shirt: "#55c26c", sleeves: "#55c26c", shorts: "#143a24", socks: "#55c26c" },
  { shirt: "#f08a3c", sleeves: "#f08a3c", shorts: "#3a2412", socks: "#f08a3c" },
];

/** Chaque posture : ce que le joueur fait, et s'il garde le but */
const POSES: Record<string, { view: Partial<FootballerView>; keeper?: boolean }> = {
  repos: { view: {} },
  course: { view: { v: 6 } },
  sprint: { view: { v: 9.5 } },
  armee: { view: { act: "kick", kickT: 0.05 } },
  frappe: { view: { act: "kick", kickT: 0.13 } },
  suite: { view: { act: "kick", kickT: 0.2 } },
  fete0: { view: { cheer: true, joy: 0 } },
  fete1: { view: { cheer: true, joy: 1 } },
  fete2: { view: { cheer: true, joy: 2 } },
  fete3: { view: { cheer: true, joy: 3 } },
  fetecourse: { view: { cheer: true, joy: 0, v: 6 } },
  triste: { view: { sad: true } },
  tristecourse: { view: { sad: true, v: 3 } },
  gardien: { view: {}, keeper: true },
  gardienpas: { view: { v: 3, gait: 0 }, keeper: true },
  gardienrecule: { view: { v: 3, gait: -1 }, keeper: true },
  capte: { view: { act: "hold" }, keeper: true },
  plongeon: { view: { act: "dive", dirX: 1 }, keeper: true },
  touche: { view: { act: "throw" } },
  tacle: { view: { act: "tackle" } },
  glisse: { view: { act: "slide" } },
  tete: { view: { act: "header" } },
  sol: { view: { act: "down" } },
  proteste: { view: { protest: true } },
};

export function DevPoses() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const names = (params.get("poses") ?? "repos,course,fete0,fete1,fete2,fete3,triste,capte").split(",").filter((n) => POSES[n]);
    const angle = (Number(params.get("angle") ?? 20) * Math.PI) / 180;
    const dist = Number(params.get("dist") ?? 9);
    const height = Number(params.get("haut") ?? 1.6);
    const time = Number(params.get("t") ?? 1.2);
    const gap = Number(params.get("ecart") ?? 2.2);
    const renderer = new THREE.WebGLRenderer({ canvas: canvas.current!, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight, false);
    const theme = themeFor("soir", "clair");
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = theme.exposure;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#7aa0c8");
    scene.add(new THREE.HemisphereLight("#ffffff", "#6f9a5f", theme.hemi));
    const sun = new THREE.DirectionalLight(theme.sunColor, theme.sun);
    sun.position.set(-20, 30, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -16;
    sc.right = sc.top = 16;
    scene.add(sun);
    const rim = new THREE.DirectionalLight("#cfe0ff", theme.rim);
    rim.position.set(20, 10, -20);
    scene.add(rim);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: "#3f8f45", roughness: 0.9 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // La moitié gauche avec le premier maillot, la droite avec le second
    const count = names.length;
    const crowd = new Footballers(
      scene,
      count,
      KITS,
      KEEPERS,
      names.map((n) => Boolean(POSES[n]!.keeper)),
      names.map((_, i) => [7, 10, 4, 9, 11, 1, 5, 8][i % 8]!),
      true,
      Number(params.get("graine") ?? 3),
    );
    const views: FootballerView[] = names.map((n, i) => ({
      x: (i - (count - 1) / 2) * gap,
      z: 0,
      h: Math.PI / 2,
      v: 0,
      act: "none" as Act,
      team: i < count / 2 ? 0 : 1,
      keeper: Boolean(POSES[n]!.keeper),
      dirX: 0,
      dirZ: 0,
      cheer: false,
      off: false,
      ...POSES[n]!.view,
    }));
    const frames = Math.round(time * 60);
    for (let f = 0; f <= frames; f++) crowd.update(1 / 60, f / 60, views);
    const camera = new THREE.PerspectiveCamera(Number(params.get("fov") ?? 26), innerWidth / innerHeight, 0.1, 300);
    camera.position.set(Math.sin(angle) * dist, height, Math.cos(angle) * dist);
    camera.lookAt(0, Number(params.get("vise") ?? 1.05), 0);
    renderer.render(scene, camera);
    (window as unknown as { __posesReady: boolean }).__posesReady = true;
    return () => {
      crowd.dispose();
      renderer.dispose();
    };
  }, []);
  return <canvas ref={canvas} style={{ position: "fixed", inset: 0, width: "100%", height: "100%", display: "block" }} />;
}
