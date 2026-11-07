// Le garage de développement : huit karts et leurs pilotes côte à côte, pour regarder de près les coiffures, les
// chapeaux, les visages et les animations (uniquement en développement, sur /dev/garage).
// Réglages dans l'adresse : ?set=0|1 (sans ou avec chapeaux), &pose=drive|drift|cheer|spin|trick, &cam=back|front|three

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { AVATAR_PARTS, type AvatarConfig } from "../../shared/avatar.ts";
import { newKart, SPIN_TIME } from "../../shared/games/bolides/physics.ts";
import { getTrack } from "../../shared/games/bolides/track.ts";
import { faceCanvas, headCanvas } from "./scene/faces.ts";
import { KART_COLORS, KartModel } from "./scene/kart.ts";

export function DevGarage() {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const q = new URLSearchParams(location.search);
    const set = Number(q.get("set") ?? 0);
    const pose = q.get("pose") ?? "drive";
    const cam = q.get("cam") ?? "three";
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x9fd0f0);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;
    scene.add(new THREE.HemisphereLight(0xdfefff, 0x5a6a3a, 1.35));
    const sun = new THREE.DirectionalLight(0xfff1d6, 1.9);
    sun.position.set(20, 40, 14);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20 });
    scene.add(sun);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshLambertMaterial({ color: 0x6f9a4a }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400);
    const fit = () => {
      renderer.setSize(el.clientWidth, el.clientHeight, false);
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
    };
    fit();
    const t = getTrack("port");
    const avatars: AvatarConfig[] = Array.from({ length: 8 }, (_, i) => ({
      bg: (i * 5) % AVATAR_PARTS.bg,
      skin: i % AVATAR_PARTS.skin,
      hair: set === 0 ? i : (i + 3) % AVATAR_PARTS.hair,
      hairColor: i % AVATAR_PARTS.hairColor,
      eyes: i % AVATAR_PARTS.eyes,
      mouth: (i * 3) % AVATAR_PARTS.mouth,
      hat: set === 0 ? 0 : i + 1,
      extra: set === 0 ? i % AVATAR_PARTS.extra : (i + 2) % AVATAR_PARTS.extra,
    }));
    let karts: KartModel[] = [];
    let frame = 0;
    let disposed = false;
    void Promise.all(avatars.map((a) => Promise.all([headCanvas(a), faceCanvas({ avatar: a, userId: null, photo: 0 }, 96)]))).then(
      (all) => {
        if (disposed) return;
        karts = all.map(([head, face], i) => {
          const m = new KartModel({ color: KART_COLORS[i]!, name: `Pilote ${i + 1}`, face, avatar: avatars[i]!, head, me: true }, true);
          scene.add(m.group);
          return m;
        });
        const start = performance.now();
        let last = start;
        const loop = (now: number) => {
          if (disposed) return;
          frame = requestAnimationFrame(loop);
          const dt = Math.min(0.05, (now - last) / 1000);
          last = now;
          const time = (now - start) / 1000;
          karts.forEach((m, i) => {
            const col = i % 4;
            const row = Math.floor(i / 4);
            const k = newKart(t, 0, 0, 0);
            Object.assign(k, { x: (col - 1.5) * 3.4, z: row * -5, y: 0, h: 0, v: pose === "cheer" ? 2 : 18, i: 0 });
            const steer = Math.sin(time * 1.6 + i) * 0.9;
            if (pose === "drift") Object.assign(k, { drift: i % 2 ? 1 : -1, charge: 0.4 + i * 0.3, slip: i % 2 ? -4 : 4 });
            if (pose === "spin") k.spin = SPIN_TIME - ((time * 0.8) % SPIN_TIME);
            if (pose === "trick") Object.assign(k, { air: 1.2 + Math.sin(time * 2) * 0.4, trick: Math.sin(time * 1.5) > 0 });
            m.update(k, dt, { steer: pose === "drift" ? (i % 2 ? 0.6 : -0.6) : steer, shield: false, done: pose === "cheer" }, time);
          });
          const look = new THREE.Vector3(0, 1, -2.5);
          const pos =
            cam === "front"
              ? new THREE.Vector3(0, 2.4, 9)
              : cam === "back"
                ? new THREE.Vector3(0, 3.2, -15)
                : new THREE.Vector3(-8.5, 5, 7.5);
          camera.position.copy(pos);
          camera.lookAt(look);
          renderer.render(scene, camera);
        };
        frame = requestAnimationFrame(loop);
      },
    );
    window.addEventListener("resize", fit);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", fit);
      for (const k of karts) k.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);
  return <div ref={box} style={{ position: "fixed", inset: 0 }} />;
}
