// Une page réservée au développement (/dev/escarmouche) : une carte d'Escarmouche vue depuis des points fixes, avec des
// soldats posés, l'arme en main et des effets qui partent tout seuls, sans serveur ni bots. Elle sert à comparer le rendu
// avant et après un changement, aux mêmes endroits. ?carte=hameau|gare &vue=0..n &arme=fa &tel (qualité du téléphone)
// &soldat (gros plan sur un soldat).

import { useEffect, useRef, useState } from "react";
import { seededAvatar, type AvatarConfig } from "../../shared/avatar.ts";
import type { CamoId } from "../../shared/games/escarmouche/camos.ts";
import { getMap, isMapId, type MapId } from "../../shared/games/escarmouche/maps.ts";
import { WEAPON_IDS, type WeaponId } from "../../shared/games/escarmouche/weapons.ts";
import { useSession } from "../stores/session.ts";
import { EscScene } from "./scene/EscScene.ts";
import { TEAM_KITS } from "./scene/soldiers.ts";
import * as THREE from "three";

interface View {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  name: string;
}

const yawTo = (fx: number, fz: number, tx: number, tz: number) => Math.atan2(-(tx - fx), -(tz - fz));

/** Les points de vue de chaque carte */
const VIEWS: Record<MapId, View[]> = {
  hameau: [
    { name: "La base ouest, vers l'avenue", x: -40, y: 1.62, z: 1.5, yaw: yawTo(-40, 1.5, 0, 1), pitch: -0.02 },
    { name: "La place et la halle", x: -12, y: 1.62, z: -8, yaw: yawTo(-12, -8, 0, 0), pitch: 0.02 },
    { name: "De la fenêtre de la maison A", x: -19.5, y: 4.82, z: 9.9, yaw: yawTo(-19.5, 9.9, 0, 4), pitch: -0.12 },
    { name: "La rue haute", x: -30, y: 1.62, z: 18, yaw: yawTo(-30, 18, 0, 18), pitch: 0 },
  ],
  gare: [
    { name: "Le dépôt, vers les voies", x: -46, y: 1.62, z: -2, yaw: yawTo(-46, -2, 0, 0), pitch: -0.02 },
    { name: "Du haut de la passerelle", x: 0, y: 6.92, z: 18, yaw: yawTo(0, 18, 0, -10), pitch: -0.18 },
    { name: "Entre les wagons", x: -24, y: 1.62, z: 9, yaw: yawTo(-24, 9, 0, 9), pitch: 0 },
  ],
};

export function DevEscarmouche() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const user = useSession((s) => s.user);
  const params = new URLSearchParams(window.location.search);
  const map: MapId = isMapId(params.get("carte")) ? (params.get("carte") as MapId) : "hameau";
  const [view, setView] = useState(Number(params.get("vue") ?? 0) || 0);
  const weapon = (WEAPON_IDS as string[]).includes(params.get("arme") ?? "") ? (params.get("arme") as WeaponId) : "fa";
  const camo = (params.get("camo") ?? "usine") as CamoId;
  const low = params.has("tel");
  const closeUp = params.has("soldat");
  const views = VIEWS[map];

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const gm = getMap(map);
    const scene = new EscScene(c, gm, { low, teams: true });
    const fit = () => scene.resize(window.innerWidth, window.innerHeight);
    fit();
    window.addEventListener("resize", fit);
    const v = views[view % views.length]!;
    // Trois soldats devant la caméra : deux Rouges, un Bleu
    const [fx, , fz] = [-Math.sin(v.yaw), 0, -Math.cos(v.yaw)];
    const rx = Math.cos(v.yaw);
    const rz = -Math.sin(v.yaw);
    const avatars: AvatarConfig[] = [user?.avatar ?? seededAvatar("dev-1"), seededAvatar("dev-2"), seededAvatar("dev-3")];
    const spots = closeUp
      ? [{ d: 2.6, s: 0, team: 0, yaw: v.yaw + Math.PI + 0.5 }]
      : [
          { d: 7, s: -2.5, team: 0, yaw: v.yaw + Math.PI * 0.8 },
          { d: 11, s: 2.2, team: 1, yaw: v.yaw + Math.PI + 0.3 },
          { d: 16, s: -0.5, team: 1, yaw: v.yaw - 0.4 },
        ];
    spots.forEach((p, i) => {
      scene.ensureSoldier(
        i,
        TEAM_KITS[p.team as 0 | 1],
        avatars[i]!,
        camo,
        i === 0 ? (user?.pseudo ?? "Soldat") : `Bot ${i}`,
        p.team ? "#3f7fd8" : "#d4453c",
      );
    });
    const world = (p: (typeof spots)[number]) => ({ x: v.x + fx * p.d + rx * p.s, z: v.z + fz * p.d + rz * p.s });
    let t = 0;
    let last = performance.now();
    const shots = new THREE.Vector3();
    const loop = () => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      t += dt;
      spots.forEach((p, i) => {
        const w = world(p);
        scene.updateSoldier(
          i,
          {
            x: w.x,
            y: closeUp ? 0 : 0,
            z: w.z,
            yaw: p.yaw,
            pitch: 0,
            speed: i === 1 ? 4.5 : 0,
            crouch: i === 2,
            ground: true,
            sprint: false,
            ads: i === 0,
            reload: false,
            alive: true,
            weapon: i === 1 ? "pm" : weapon,
            carrying: -1,
            shield: false,
          },
          dt,
          true,
          null,
        );
      });
      const cy = closeUp ? 1.35 : v.y;
      scene.setView(v.x, cy, v.z, v.yaw, closeUp ? -0.1 : v.pitch, 78);
      scene.updateViewmodel({
        weapon,
        camo,
        ads: 0,
        reload: -1,
        raise: 1,
        kick: Math.max(0, 1 - ((t * 3) % 1) * 4) * (Math.floor(t) % 3 === 0 ? 1 : 0),
        bob: t * 2,
        bobAmp: 0.004,
        swayX: 0,
        swayY: 0,
        sprint: false,
        melee: -1,
        throwing: -1,
        alive: !closeUp,
        scoped: false,
      });
      // Des effets qui partent tout seuls : une rafale vers le soldat bleu, une explosion de temps en temps
      if (!closeUp && Math.floor(t * 8) !== Math.floor((t - dt) * 8) && Math.floor(t) % 3 === 0) {
        const target = world(spots[1]!);
        const from = scene.viewMuzzle(shots.clone());
        scene.effects.tracer(from, new THREE.Vector3(target.x, 1.3, target.z), 1);
        scene.effects.flash(from, 0.32);
        scene.effects.blood(new THREE.Vector3(target.x, 1.3, target.z));
      }
      if (!closeUp && Math.floor(t / 4) !== Math.floor((t - dt) / 4)) {
        const b = world({ d: 20, s: 4, team: 0, yaw: 0 });
        scene.effects.explosion(new THREE.Vector3(b.x, 0.2, b.z));
      }
      scene.render(dt);
    };
    // Le panneau masqué ne fait pas tourner requestAnimationFrame : une minuterie suffit ici
    const id = window.setInterval(loop, 33);
    (window as unknown as { __escDev?: unknown }).__escDev = { scene, loop };
    return () => {
      window.clearInterval(id);
      window.removeEventListener("resize", fit);
      scene.dispose();
    };
  }, [map, view, weapon, camo, low, closeUp, user, views]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000" }}>
      <canvas ref={canvas} style={{ width: "100%", height: "100%", display: "block" }} />
      <div style={{ position: "absolute", top: 8, left: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
        {views.map((v, i) => (
          <button key={i} className="btn btn-sm" onClick={() => setView(i)} style={{ opacity: i === view ? 1 : 0.7 }}>
            {v.name}
          </button>
        ))}
      </div>
    </div>
  );
}
