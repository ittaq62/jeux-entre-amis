// Un aperçu en trois dimensions qui tourne doucement : son soldat (sa tête de profil, la tenue, l'arme dans son
// camouflage), ou une arme seule. Pour la boutique (voir avant d'acheter) et le salon (son arsenal).

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { seededAvatar, type AvatarConfig } from "../../shared/avatar.ts";
import type { CamoId } from "../../shared/games/escarmouche/camos.ts";
import type { UniformId } from "../../shared/games/escarmouche/uniforms.ts";
import type { WeaponId } from "../../shared/games/escarmouche/weapons.ts";
import { useSession } from "../stores/session.ts";
import { buildGun } from "./scene/guns.ts";
import { SoldierModel } from "./scene/soldiers.ts";
import { skyTexture } from "./scene/textures.ts";

interface Props {
  /** Le soldat entier dans cette tenue, ou l'arme seule (tenue absente) */
  tenue?: UniformId;
  weapon: WeaponId;
  camo: CamoId;
  avatar?: AvatarConfig;
  band?: string;
  width?: number;
  height?: number;
}

export default function EscPreview3D({ tenue, weapon, camo, avatar, band = "#c8392d", width = 260, height = 300 }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const user = useSession((s) => s.user);
  const who = avatar ?? user?.avatar ?? seededAvatar("boutique");
  const whoKey = JSON.stringify(who);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const renderer = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const envSky = new THREE.Mesh(
      new THREE.SphereGeometry(10, 24, 12),
      new THREE.MeshBasicMaterial({ map: skyTexture("soir"), side: THREE.BackSide }),
    );
    envScene.add(envSky);
    const env = pmrem.fromScene(envScene, 0.02).texture;
    pmrem.dispose();
    envSky.geometry.dispose();
    (envSky.material as THREE.Material).dispose();
    scene.environment = env;
    scene.environmentIntensity = 0.8;
    scene.add(new THREE.HemisphereLight("#e8edf2", "#4a4236", 1.2));
    const key = new THREE.DirectionalLight("#fff0dc", 2.2);
    key.position.set(2, 3, 2.5);
    scene.add(key);
    const rim = new THREE.DirectionalLight("#9fc2ff", 1.2);
    rim.position.set(-2.5, 1.5, -2);
    scene.add(rim);
    const camera = new THREE.PerspectiveCamera(tenue ? 33 : 26, width / height, 0.05, 50);
    const turn = new THREE.Group();
    scene.add(turn);
    let soldier: SoldierModel | null = null;
    let gunGroup: THREE.Group | null = null;
    if (tenue) {
      soldier = new SoldierModel({ avatar: who, tenue, band, camo }, false);
      turn.add(soldier.root);
      camera.position.set(0, 1.0, 3.35);
      camera.lookAt(0, 0.9, 0);
    } else {
      const gun = buildGun(weapon, camo, false);
      const box = new THREE.Box3().setFromObject(gun.group);
      const center = box.getCenter(new THREE.Vector3());
      gun.group.position.sub(center);
      gunGroup = new THREE.Group();
      gunGroup.add(gun.group);
      gunGroup.rotation.z = 0.05;
      turn.add(gunGroup);
      const len = box.getSize(new THREE.Vector3()).length();
      camera.position.set(0, len * 0.18, len * 1.75);
      camera.lookAt(0, 0, 0);
    }
    let t = 0;
    let last = performance.now();
    const draw = () => {
      const now = performance.now();
      t += Math.min(0.05, (now - last) / 1000);
      last = now;
      turn.rotation.y = tenue ? Math.PI + Math.sin(t * 0.6) * 0.7 : -Math.PI / 2 + Math.sin(t * 0.5) * 0.9;
      soldier?.update(
        {
          x: 0,
          y: 0,
          z: 0,
          yaw: 0,
          pitch: -0.05,
          speed: 0,
          crouch: false,
          ground: true,
          sprint: false,
          ads: false,
          reload: false,
          alive: true,
          weapon,
          carrying: -1,
          shield: false,
        },
        0.016,
        null,
      );
      renderer.render(scene, camera);
    };
    let raf = 0;
    const loop = () => {
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    // La tête du personnage arrive un peu après (c'est un dessin) : quelques images de plus, même sans animation
    const timers = [0, 250, 800, 1600].map((ms) => window.setTimeout(draw, ms));
    return () => {
      cancelAnimationFrame(raf);
      timers.forEach((id) => window.clearTimeout(id));
      soldier?.dispose();
      gunGroup?.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      env.dispose();
      renderer.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenue, weapon, camo, whoKey, band, width, height]);

  return (
    <canvas
      ref={canvas}
      width={width}
      height={height}
      style={{ width, height, maxWidth: "100%", display: "block", margin: "0 auto" }}
      aria-hidden="true"
    />
  );
}
