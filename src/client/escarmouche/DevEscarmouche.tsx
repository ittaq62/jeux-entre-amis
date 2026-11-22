// Une page réservée au développement (/dev/escarmouche) : une carte d'Escarmouche vue depuis des points fixes, avec des
// soldats posés, l'arme en main et des effets qui partent tout seuls, sans serveur ni bots. Elle sert à comparer le rendu
// avant et après un changement, aux mêmes endroits. ?carte=hameau|gare &vue=0..n &arme=fa &tel (qualité du téléphone)
// &soldat (gros plan sur un soldat), &loin (les soldats à 25, 40 et 60 m).

import { useEffect, useRef, useState } from "react";
import { seededAvatar, type AvatarConfig } from "../../shared/avatar.ts";
import type { CamoId } from "../../shared/games/escarmouche/camos.ts";
import { isUniformId, type UniformId } from "../../shared/games/escarmouche/uniforms.ts";
import { getMap, isMapId, type MapId } from "../../shared/games/escarmouche/maps.ts";
import { isExtraId, isMuzzleId, WEAPON_IDS, type WeaponId } from "../../shared/games/escarmouche/weapons.ts";
import { useSession } from "../stores/session.ts";
import { EscScene } from "./scene/EscScene.ts";
import { TEAM_KITS } from "./scene/soldiers.ts";
import { buildGun, type Gear } from "./scene/guns.ts";
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
  port: [
    { name: "La base, vers le portique", x: -42, y: 1.62, z: 1, yaw: yawTo(-42, 1, 0, 0), pitch: 0.04 },
    { name: "Entre les conteneurs", x: -30, y: 1.62, z: 3, yaw: yawTo(-30, 3, 0, -2), pitch: 0.02 },
    { name: "Le quai, vers la mer", x: -20, y: 1.62, z: 25, yaw: yawTo(-20, 25, 10, 40), pitch: -0.02 },
    { name: "De la capitainerie", x: -27, y: 4.82, z: 18.5, yaw: yawTo(-27, 18.5, 0, 0), pitch: -0.12 },
  ],
  usine: [
    { name: "La base, vers la halle", x: -42, y: 1.62, z: 1.2, yaw: yawTo(-42, 1.2, 0, 0), pitch: 0 },
    { name: "Dans la halle", x: -10.6, y: 1.62, z: 0, yaw: yawTo(-10.6, 0, 4, 1), pitch: 0.06 },
    { name: "Sur la passerelle", x: -9, y: 5.12, z: 7, yaw: yawTo(-9, 7, 8, -4), pitch: -0.2 },
    { name: "Le parc des citernes", x: -40, y: 1.62, z: 17.5, yaw: yawTo(-40, 17.5, 0, 18), pitch: 0.05 },
    { name: "Le quai de chargement", x: -38, y: 1.62, z: -17.5, yaw: yawTo(-38, -17.5, -10, -20), pitch: 0.08 },
  ],
  desert: [
    { name: "La kasbah, vers la grand-rue", x: -42, y: 1.62, z: 1.5, yaw: yawTo(-42, 1.5, 0, 0), pitch: -0.02 },
    { name: "Le souk", x: -37, y: 1.62, z: 21.4, yaw: yawTo(-37, 21.4, 0, 21), pitch: 0 },
    { name: "Du toit d'une maison", x: -32, y: 4.82, z: 12.5, yaw: yawTo(-32, 12.5, 0, 0), pitch: -0.1 },
    { name: "La palmeraie", x: -37, y: 1.62, z: -17, yaw: yawTo(-37, -17, 0, -16), pitch: 0 },
    { name: "Le bassin de l'oasis", x: -9, y: 1.62, z: -2, yaw: yawTo(-9, -2, 4, 1), pitch: 0 },
  ],
  ruines: [
    { name: "La base ouest, vers l'avenue", x: -43, y: 1.62, z: 1.5, yaw: yawTo(-43, 1.5, 0, 0), pitch: -0.02 },
    { name: "L'avenue", x: -33, y: 1.62, z: -1, yaw: yawTo(-33, -1, 0, 2), pitch: 0 },
    { name: "De l'étage de l'immeuble A", x: -26, y: 4.82, z: 10.2, yaw: yawTo(-26, 10.2, 0, -4), pitch: -0.12 },
    { name: "Dans le grand magasin", x: -27.5, y: 1.62, z: -19, yaw: yawTo(-27.5, -19, -12, -19.5), pitch: 0 },
    { name: "La rue nord", x: -41, y: 1.62, z: 22, yaw: yawTo(-41, 22, 0, 22), pitch: 0 },
  ],
  col: [
    { name: "La base ouest, vers la ruine", x: -43, y: 1.7, z: 1.5, yaw: -Math.PI / 2, pitch: -0.02 },
    { name: "Devant le chalet", x: -18, y: 1.7, z: 6, yaw: Math.atan2(27 - 18, -(17.5 - 6)), pitch: 0.05 },
    { name: "Dans la ruine", x: -3.5, y: 1.7, z: -2, yaw: -Math.PI / 2 - 0.3, pitch: 0 },
    { name: "Sous la scierie", x: -24, y: 1.7, z: -14.5, yaw: Math.atan2(-(-20 + 24), -(-21 + 14.5)), pitch: -0.05 },
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
  // Les accessoires : ?acc=silencieux,poignee
  const acc = (params.get("acc") ?? "").split(",");
  const gear: Gear = { muzzle: acc.find(isMuzzleId) ?? "aucun", extra: acc.find(isExtraId) ?? "aucun" };
  const low = params.has("tel");
  const closeUp = params.has("soldat");
  const gallery = params.has("armes");
  const tenue: UniformId = isUniformId(params.get("tenue")) ? (params.get("tenue") as UniformId) : "perso";
  const views = VIEWS[map];

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const gm = getMap(map);
    const scene = new EscScene(c, gm, {
      quality: low ? "bas" : params.get("q") === "moyen" ? "moyen" : "haut",
      teams: true,
      night: params.has("nuit"),
    });
    const fit = () => scene.resize(window.innerWidth, window.innerHeight);
    fit();
    window.addEventListener("resize", fit);
    const v = views[view % views.length]!;
    // Trois soldats devant la caméra : deux Rouges, un Bleu
    const [fx, , fz] = [-Math.sin(v.yaw), 0, -Math.cos(v.yaw)];
    const rx = Math.cos(v.yaw);
    const rz = -Math.sin(v.yaw);
    // ?porte=hat:viking+outfit:cape|hat:toque|hair:afro+outfit:smoking : ce que porte chaque soldat (la garde-robe)
    const worn = (params.get("porte") ?? "").split("|");
    const avatars: AvatarConfig[] = [user?.avatar ?? seededAvatar("dev-1"), seededAvatar("dev-2"), seededAvatar("dev-3")].map((a, i) =>
      worn[i] ? { ...a, wear: Object.fromEntries(worn[i]!.split("+").map((kv) => kv.split(":") as [string, string])) } : a,
    );
    // ?loin : les trois soldats à 25, 40 et 60 m, pour juger s'ils se détachent du décor
    const far = params.has("loin");
    const spots = far
      ? [
          { d: 25, s: -2.5, team: 0, yaw: v.yaw + Math.PI * 0.8 },
          { d: 40, s: 2, team: 1, yaw: v.yaw + Math.PI + 0.3 },
          { d: 60, s: -1, team: 1, yaw: v.yaw - 0.4 },
        ]
      : closeUp
        ? [
            { d: 2.9, s: -0.95, team: 0, yaw: v.yaw + Math.PI + 0.35 },
            { d: 2.9, s: 0, team: 0, yaw: v.yaw + Math.PI },
            { d: 2.9, s: 0.95, team: 1, yaw: v.yaw + Math.PI - 0.35 },
          ]
        : [
            { d: 7, s: -2.5, team: 0, yaw: v.yaw + Math.PI * 0.8 },
            { d: 11, s: 2.2, team: 1, yaw: v.yaw + Math.PI + 0.3 },
            { d: 16, s: -0.5, team: 1, yaw: v.yaw - 0.4 },
          ];
    const tenues: UniformId[] =
      closeUp && params.get("tenues")
        ? (params.get("tenues")!.split(",").filter(isUniformId) as UniformId[]).concat(["treillis", "nuit", "perso"])
        : [tenue, "treillis", "nuit"];
    scene.setLocalLook(avatars[0]!, tenue);
    spots.forEach((p, i) => {
      scene.ensureSoldier(
        i,
        { avatar: avatars[i]!, tenue: tenues[i]!, band: TEAM_KITS[p.team as 0 | 1].band, camo, gear },
        i === 0 ? (user?.pseudo ?? "Soldat") : `Bot ${i}`,
        p.team ? "#3f7fd8" : "#d4453c",
      );
    });
    // La galerie : les douze armes alignées devant la caméra, sur trois rangs
    if (gallery) {
      WEAPON_IDS.forEach((id, k) => {
        const gun = buildGun(id, camo, low, gear);
        const col = k % 4;
        const row = Math.floor(k / 4);
        const d = 2.3;
        const side = (col - 1.5) * 1.12;
        gun.group.position.set(v.x + fx * d + rx * side, v.y + 0.42 - row * 0.4, v.z + fz * d + rz * side);
        gun.group.rotation.y = v.yaw - Math.PI / 2;
        scene.scene.add(gun.group);
      });
    }
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
            speed: i === 1 && !closeUp ? 4.5 : 0,
            crouch: i === 2 && !closeUp,
            slide: params.has("glisse") && i === 1,
            mantle: params.has("glisse") && i === 2,
            ground: true,
            sprint: false,
            ads: i === 0,
            reload: false,
            // ?mort : ils tombent et se relèvent en boucle ; ?mort=fixe : ils restent à terre
            alive: !params.has("mort") || (params.get("mort") !== "fixe" && t % 4 < 1),
            weapon: i === 1 ? "pm" : i === 2 && closeUp ? "pistolet" : weapon,
            carrying: -1,
            shield: false,
            fall: [
              { dx: Math.sin(p.yaw), dz: Math.cos(p.yaw), head: false, blast: false },
              { dx: -Math.sin(p.yaw), dz: -Math.cos(p.yaw), head: true, blast: false },
              { dx: Math.cos(p.yaw), dz: -Math.sin(p.yaw), head: false, blast: true },
            ][i % 3],
          },
          dt,
          true,
          null,
        );
      });
      const cy = closeUp ? 1.2 : v.y;
      scene.setView(v.x, cy, v.z, v.yaw, closeUp ? 0.0 : v.pitch, closeUp ? 50 : 78);
      scene.updateViewmodel({
        weapon,
        camo,
        gear,
        ads: params.has("epaule") ? 1 : 0,
        // &recharge : le rechargement en boucle ; &recharge=0.3 : figé à ce moment du geste (de même &sortie, l'arme qui remonte)
        reload: params.has("recharge") ? (params.get("recharge") ? Number(params.get("recharge")) : (t % 2.4) / 2.4) : -1,
        raise: params.has("sortie") ? (params.get("sortie") ? Number(params.get("sortie")) : Math.min(1, (t % 1.6) / 0.45)) : 1,
        kick: Math.max(0, 1 - ((t * 3) % 1) * 4) * (Math.floor(t) % 3 === 0 ? 1 : 0),
        bob: t * 2,
        bobAmp: 0.004,
        swayX: 0,
        swayY: 0,
        sprint: params.has("course") && Math.floor(t / 1.5) % 2 === 0,
        melee: -1,
        throwing: -1,
        alive: !closeUp && !gallery,
        scoped: false,
      });
      // Des effets qui partent tout seuls : une rafale vers le soldat bleu, une explosion de temps en temps
      if (!closeUp && Math.floor(t * 8) !== Math.floor((t - dt) * 8) && Math.floor(t) % 3 === 0) {
        const target = world(spots[1]!);
        const from = scene.viewMuzzle(shots.clone());
        scene.viewFlash(weapon);
        scene.ejectShell(weapon);
        scene.effects.glow(from, 8, 60);
        scene.effects.blood(new THREE.Vector3(target.x, 1.3, target.z));
        const kinds = ["metal", "stone", "wood", "dirt"] as const;
        scene.effects.impact(new THREE.Vector3(target.x + 1.2, 0.02, target.z), 1, 1, kinds[Math.floor(t) % 4]);
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
  }, [map, view, weapon, camo, low, closeUp, gallery, tenue, user, views]);

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
