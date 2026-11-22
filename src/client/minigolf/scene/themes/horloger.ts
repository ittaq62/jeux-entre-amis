// L'Atelier d'horloger : le soir, sous la lampe de l'établi. La balle roule sur le chêne de l'établi, le laiton brossé,
// la tôle d'acier, le cuir, le feutre vert, l'émail du grand cadran ; les bordures sont des tubes de laiton. Autour :
// l'établi immense, ses outils, ses vis, ses montres ouvertes, des rouages qui tournent en s'engrenant ; au fond, le mur
// lambrissé, ses horloges et leurs balanciers, la fenêtre sur la nuit ; le tic-tac, et un carillon de temps en temps.

import * as THREE from "three";
import { heightAt, slideAmount, type Course, type MoverDef } from "../../../../shared/games/minigolf/course.ts";
import { sandTex, woodTex } from "../textures.ts";
import {
  boxMeters,
  canvasTex,
  feltMat,
  leafyBall,
  onCourse,
  planeMeters,
  plainKit,
  Scatter,
  shadows,
  surfaceMat,
  type Theme,
} from "./common.ts";

let made: Theme | null = null;

// ---------------------------------------------------------------------------
// Les textures
// ---------------------------------------------------------------------------

/** Un petit générateur pour les dessins (toujours le même) */
function noise(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/** Le laiton brossé : un jaune chaud, des rayures fines dans un seul sens, quelques rivets */
function brassTex(rivets: boolean): THREE.CanvasTexture {
  return canvasTex(256, (g, s) => {
    g.fillStyle = "#c9a04a";
    g.fillRect(0, 0, s, s);
    const rnd = noise(7);
    for (let k = 0; k < 1100; k++) {
      const v = rnd();
      g.fillStyle = v < 0.5 ? `rgba(255,232,170,${0.12 + rnd() * 0.15})` : `rgba(120,84,30,${0.1 + rnd() * 0.12})`;
      g.fillRect(rnd() * s, rnd() * s, 30 + rnd() * 90, 1);
    }
    if (rivets) {
      // Des plaques rivetées : un joint, une rangée de rivets
      g.fillStyle = "rgba(70,48,16,0.55)";
      g.fillRect(0, 0, s, 2);
      g.fillRect(0, 0, 2, s);
      for (let k = 0; k < 8; k++)
        for (const [x, y] of [
          [k * 32 + 16, 10],
          [10, k * 32 + 16],
        ] as const) {
          const grd = g.createRadialGradient(x - 1, y - 1, 0, x, y, 5);
          grd.addColorStop(0, "#fff0c0");
          grd.addColorStop(0.6, "#b88a38");
          grd.addColorStop(1, "rgba(60,40,10,0.8)");
          g.fillStyle = grd;
          g.beginPath();
          g.arc(x, y, 5, 0, Math.PI * 2);
          g.fill();
        }
    }
  });
}

/** La tôle d'acier larmée : des losanges en relief, en quinconce */
function treadTex(): THREE.CanvasTexture {
  return canvasTex(128, (g, s) => {
    g.fillStyle = "#8d949c";
    g.fillRect(0, 0, s, s);
    const rnd = noise(11);
    for (let k = 0; k < 400; k++) {
      g.fillStyle = `rgba(${rnd() < 0.5 ? "255,255,255" : "0,0,0"},${rnd() * 0.06})`;
      g.fillRect(rnd() * s, rnd() * s, 2 + rnd() * 6, 1);
    }
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        const cx = x * 32 + (y % 2) * 16 + 8;
        const cy = y * 32 + 16;
        g.save();
        g.translate(cx, cy);
        g.rotate(((x + y) % 2 ? 1 : -1) * 0.7);
        g.fillStyle = "#b9c0c8";
        g.fillRect(-10, -2.5, 20, 5);
        g.fillStyle = "rgba(30,34,40,0.6)";
        g.fillRect(-10, 2.5, 20, 1.5);
        g.restore();
      }
  });
}

/** Le cuir du sous-main : un brun chaud, son grain, une couture */
function leatherTex(): THREE.CanvasTexture {
  return canvasTex(256, (g, s) => {
    g.fillStyle = "#7a4426";
    g.fillRect(0, 0, s, s);
    const rnd = noise(13);
    for (let k = 0; k < 3000; k++) {
      g.fillStyle = `rgba(${rnd() < 0.5 ? "40,18,8" : "160,100,60"},${rnd() * 0.18})`;
      const r = 1 + rnd() * 2.5;
      g.beginPath();
      g.arc(rnd() * s, rnd() * s, r, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/** Les nervures du caoutchouc des tapis roulants (en travers : horizontales, ou verticales si `across`) */
function beltTex(across = false): THREE.CanvasTexture {
  return canvasTex(64, (g, s) => {
    g.fillStyle = "#2c2c30";
    g.fillRect(0, 0, s, s);
    for (let k = 0; k < s; k += 16) {
      g.fillStyle = "#4a4a50";
      if (across) g.fillRect(k, 0, 6, s);
      else g.fillRect(0, k, s, 6);
      g.fillStyle = "#18181b";
      if (across) g.fillRect(k + 6, 0, 2, s);
      else g.fillRect(0, k + 6, s, 2);
    }
  });
}

/** Le lambris du mur : des panneaux de bois sombre encadrés */
function panelTex(): THREE.CanvasTexture {
  return canvasTex(256, (g, s) => {
    g.fillStyle = "#4a2e1c";
    g.fillRect(0, 0, s, s);
    const rnd = noise(17);
    for (let k = 0; k < 600; k++) {
      g.fillStyle = `rgba(${rnd() < 0.5 ? "20,10,4" : "120,80,50"},${rnd() * 0.12})`;
      g.fillRect(rnd() * s, rnd() * s, 1, 20 + rnd() * 60);
    }
    g.strokeStyle = "rgba(20,10,4,0.7)";
    g.lineWidth = 6;
    g.strokeRect(16, 16, s - 32, s - 32);
    g.strokeStyle = "rgba(160,110,70,0.35)";
    g.lineWidth = 2;
    g.strokeRect(22, 22, s - 44, s - 44);
  });
}

/** Une roue dentée vue de face : la jante, les rayons évidés, le moyeu (sur fond transparent) */
function gearFaceTex(spokes: number): THREE.CanvasTexture {
  return canvasTex(
    256,
    (g, s) => {
      const c = s / 2;
      const grd = g.createRadialGradient(c * 0.8, c * 0.8, 0, c, c, c);
      grd.addColorStop(0, "#f0cf7a");
      grd.addColorStop(1, "#a87a2a");
      g.fillStyle = grd;
      g.beginPath();
      g.arc(c, c, c - 2, 0, Math.PI * 2);
      g.fill();
      // Les évidements entre les rayons
      g.globalCompositeOperation = "destination-out";
      for (let k = 0; k < spokes; k++) {
        const a0 = (k / spokes) * Math.PI * 2 + 0.18;
        const a1 = ((k + 1) / spokes) * Math.PI * 2 - 0.18;
        g.beginPath();
        g.arc(c, c, c * 0.78, a0, a1);
        g.arc(c, c, c * 0.3, a1, a0, true);
        g.closePath();
        g.fill();
      }
      g.globalCompositeOperation = "source-over";
      // Des cercles gravés sur la jante et le moyeu
      g.strokeStyle = "rgba(90,60,20,0.6)";
      g.lineWidth = 2;
      for (const r of [0.86, 0.94, 0.22, 0.12]) {
        g.beginPath();
        g.arc(c, c, c * r, 0, Math.PI * 2);
        g.stroke();
      }
    },
    true,
  );
}

/** Le grand cadran émaillé : les chiffres romains, les minutes, un petit cadran des secondes */
function dialTex(): THREE.CanvasTexture {
  return canvasTex(1024, (g, s) => {
    const c = s / 2;
    const grd = g.createRadialGradient(c, c * 0.9, 0, c, c, c);
    grd.addColorStop(0, "#fbf6ea");
    grd.addColorStop(1, "#e9dfc8");
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
    // Les minutes et les heures
    g.strokeStyle = "#2a2420";
    for (let k = 0; k < 60; k++) {
      const a = (k / 60) * Math.PI * 2 - Math.PI / 2;
      const big = k % 5 === 0;
      g.lineWidth = big ? 9 : 3;
      const r0 = c * (big ? 0.8 : 0.85);
      const r1 = c * 0.9;
      g.beginPath();
      g.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
      g.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1);
      g.stroke();
    }
    g.lineWidth = 5;
    for (const r of [0.92, 0.78]) {
      g.beginPath();
      g.arc(c, c, c * r, 0, Math.PI * 2);
      g.stroke();
    }
    // Les chiffres romains, tournés vers le centre
    const roman = ["XII", "I", "II", "III", "IIII", "V", "VI", "VII", "VIII", "IX", "X", "XI"];
    g.fillStyle = "#1e1a16";
    g.font = `bold ${Math.round(s * 0.07)}px Georgia, 'Times New Roman', serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    roman.forEach((t, k) => {
      const a = (k / 12) * Math.PI * 2 - Math.PI / 2;
      g.save();
      g.translate(c + Math.cos(a) * c * 0.66, c + Math.sin(a) * c * 0.66);
      g.rotate(a + Math.PI / 2);
      g.fillText(t, 0, 0);
      g.restore();
    });
    // Le petit cadran des secondes, au-dessus de VI
    g.lineWidth = 3;
    g.beginPath();
    g.arc(c, c + c * 0.38, c * 0.12, 0, Math.PI * 2);
    g.stroke();
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      g.beginPath();
      g.moveTo(c + Math.cos(a) * c * 0.1, c + c * 0.38 + Math.sin(a) * c * 0.1);
      g.lineTo(c + Math.cos(a) * c * 0.12, c + c * 0.38 + Math.sin(a) * c * 0.12);
      g.stroke();
    }
    // Quelques fines craquelures dans l'émail
    const rnd = noise(5);
    g.strokeStyle = "rgba(120,100,70,0.18)";
    g.lineWidth = 1;
    for (let k = 0; k < 10; k++) {
      let x = rnd() * s;
      let y = rnd() * s;
      g.beginPath();
      g.moveTo(x, y);
      for (let j = 0; j < 8; j++) {
        x += (rnd() - 0.5) * 40;
        y += (rnd() - 0.5) * 40;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  });
}

/** Une roue dentée en relief (un disque, ses dents tout autour) : pour le décor */
function gearGeo(r: number, teeth: number, thick: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const n = teeth * 4;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = i % 4;
    const rr = k === 1 || k === 2 ? r : r * 0.88;
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  const holeR = r * 0.18;
  const hole = new THREE.Path();
  hole.absarc(0, 0, holeR, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thick,
    bevelEnabled: true,
    bevelSize: thick * 0.2,
    bevelThickness: thick * 0.2,
    bevelSegments: 1,
    curveSegments: 8,
  });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

// ---------------------------------------------------------------------------
// Le thème
// ---------------------------------------------------------------------------

interface Mats {
  brass: THREE.MeshStandardMaterial;
  polished: THREE.MeshStandardMaterial;
  steel: THREE.MeshStandardMaterial;
  blued: THREE.MeshStandardMaterial;
  darkWood: THREE.MeshStandardMaterial;
  oak: THREE.MeshStandardMaterial;
  enamel: THREE.MeshStandardMaterial;
  black: THREE.MeshStandardMaterial;
  red: THREE.MeshStandardMaterial;
}

export function horlogerTheme(): Theme {
  if (made) return made;
  const felt = feltMat(0x2e5a3c, 0.5, 0.0);
  const oak = surfaceMat(woodTex(), { color: 0xc8996a, roughness: 0.65 });
  const parquet = surfaceMat(woodTex(), { color: 0x9a7458, roughness: 0.6, scale: 0.55 });
  const bt = brassTex(true);
  bt.repeat.set(1 / 1.2, 1 / 1.2);
  const brassFloor = new THREE.MeshStandardMaterial({ map: bt, color: 0xffffff, roughness: 0.38, metalness: 0.8, envMapIntensity: 1.1 });
  const plain = brassTex(false);
  plain.repeat.set(1.5, 1.5);
  const brass = new THREE.MeshStandardMaterial({ map: plain, color: 0xffffff, roughness: 0.32, metalness: 0.85, envMapIntensity: 1.2 });
  const polished = new THREE.MeshStandardMaterial({ color: 0xe0bc6a, roughness: 0.26, metalness: 1, envMapIntensity: 1.3 });
  const tt = treadTex();
  tt.repeat.set(1 / 0.5, 1 / 0.5);
  const tread = new THREE.MeshStandardMaterial({ map: tt, roughness: 0.4, metalness: 0.75 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, roughness: 0.25, metalness: 0.95 });
  const blued = new THREE.MeshStandardMaterial({ color: 0x1c2a5a, roughness: 0.2, metalness: 0.9 });
  const lt = leatherTex();
  lt.repeat.set(1 / 1.2, 1 / 1.2);
  const leather = new THREE.MeshStandardMaterial({ map: lt, roughness: 0.7 });
  const btx = beltTex();
  btx.repeat.set(1 / 0.6, 1 / 0.6);
  const rubber = new THREE.MeshStandardMaterial({ map: btx, roughness: 0.85 });
  const sand = surfaceMat(sandTex(), { color: 0xe6be70, roughness: 1, scale: 0.6 });
  const darkWood = surfaceMat(woodTex(), { color: 0x6a3e22, roughness: 0.55 });
  const enamel = new THREE.MeshStandardMaterial({ color: 0xf4ede0, roughness: 0.3 });
  const black = new THREE.MeshStandardMaterial({ color: 0x18161a, roughness: 0.35, metalness: 0.4 });
  const red = new THREE.MeshStandardMaterial({ color: 0xb0302a, roughness: 0.4 });
  const gearBed = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.6, metalness: 0.5 });
  // Les bordures : des tubes de laiton satiné (un laiton trop poli renverrait la lampe en plein dans les yeux)
  const railBrass = new THREE.MeshStandardMaterial({ color: 0xc9a258, roughness: 0.42, metalness: 0.9, envMapIntensity: 1.0 });
  const m: Mats = { brass, polished, steel, blued, darkWood, oak, enamel, black, red };

  const post = (look: string | undefined, r: number, h: number): THREE.Object3D => {
    const g = new THREE.Group();
    if (look === "vis") {
      // Une vis géante plantée dans l'établi : sa tête bombée et sa fente
      const head = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), steel);
      head.scale.y = h / r;
      const slot = new THREE.Mesh(new THREE.BoxGeometry(r * 2.05, h * 0.5, r * 0.22), black);
      slot.position.y = h * 0.85;
      slot.rotation.y = r * 7;
      g.add(head, slot);
    } else if (look === "poids") {
      // Un poids d'horloge en forme de pomme de pin, en laiton, et son crochet
      const body = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.75, r, h * 0.75, 18), polished);
      body.position.y = h * 0.375;
      const top = new THREE.Mesh(new THREE.ConeGeometry(r * 0.75, h * 0.25, 18), polished);
      top.position.y = h * 0.875;
      const hook = new THREE.Mesh(new THREE.TorusGeometry(r * 0.25, r * 0.06, 6, 16), steel);
      hook.position.y = h + r * 0.2;
      g.add(body, top, hook);
      for (let k = 0; k < 4; k++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r * (0.95 - k * 0.06), r * 0.04, 6, 24), brass);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = h * (0.12 + k * 0.17);
        g.add(ring);
      }
    } else {
      const m2 = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 18), brass);
      m2.position.y = h / 2;
      g.add(m2);
    }
    shadows(g);
    return g;
  };

  const mover = (def: MoverDef, c: Course): THREE.Object3D | null => {
    const g = new THREE.Group();
    if (def.look === "dents") {
      // La couronne d'une roue : un anneau de laiton, ses dents, le moyeu d'acier
      let center: [number, number] = [0, 0];
      let r0 = 0.9;
      let r1 = 1.2;
      for (const p of def.parts) {
        if (p.k === "post") {
          center = [p.c[0], p.c[1]];
          const ground = heightAt(c, p.c[0], p.c[1]);
          const hub = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r * 1.1, p.y1 - ground, 20), steel);
          hub.position.set(p.c[0], ground + (p.y1 - ground) / 2, p.c[1]);
          const cap = new THREE.Mesh(new THREE.SphereGeometry(p.r * 0.7, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), polished);
          cap.position.set(p.c[0], p.y1, p.c[1]);
          const screw = new THREE.Mesh(new THREE.BoxGeometry(p.r * 1.2, 0.02, 0.03), black);
          screw.position.set(p.c[0], p.y1 + p.r * 0.62, p.c[1]);
          g.add(hub, cap, screw);
        }
      }
      for (const p of def.parts) {
        if (p.k !== "wall") continue;
        const ax = p.a[0] - center[0];
        const az = p.a[1] - center[1];
        r0 = Math.hypot(ax, az);
        r1 = Math.hypot(p.b[0] - center[0], p.b[1] - center[1]);
        const ground = heightAt(c, (p.a[0] + p.b[0]) / 2, (p.a[1] + p.b[1]) / 2);
        const len = r1 - r0;
        const tooth = new THREE.Mesh(new THREE.BoxGeometry(len, p.y1 - ground, p.t * 2.2), brass);
        tooth.position.set((p.a[0] + p.b[0]) / 2, ground + (p.y1 - ground) / 2, (p.a[1] + p.b[1]) / 2);
        tooth.rotation.y = -Math.atan2(az, ax);
        g.add(tooth);
      }
      const ground = heightAt(c, center[0], center[1]);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(r0 + 0.01, 0.035, 8, 64), polished);
      rim.rotation.x = Math.PI / 2;
      rim.position.set(center[0], ground + 0.035, center[1]);
      g.add(rim);
      void r1;
      shadows(g);
      return g;
    }
    if (def.look === "pendule") {
      // Un balancier : la tige d'acier depuis le pivot, la lentille de laiton gravée
      for (const p of def.parts) {
        if (p.k !== "cap" || def.motion.k !== "swing") continue;
        const a = new THREE.Vector3(...p.a);
        const b = new THREE.Vector3(...p.b);
        const mid = a.clone().add(b).multiplyScalar(0.5);
        const lens = new THREE.Mesh(new THREE.CylinderGeometry(p.r * 1.05, p.r * 1.05, a.distanceTo(b) + p.r * 0.4, 40), polished);
        lens.rotation.x = Math.PI / 2;
        lens.position.copy(mid);
        const face = new THREE.Mesh(new THREE.CircleGeometry(p.r * 0.8, 40), brass);
        face.position.copy(mid).add(new THREE.Vector3(0, 0, (a.distanceTo(b) + p.r * 0.4) / 2 + 0.002));
        const pivot = def.motion.c;
        const rodLen = pivot[1] - mid.y;
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, rodLen, 10), steel);
        rod.position.set(mid.x, mid.y + rodLen / 2, mid.z);
        const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 6), polished);
        nut.position.set(mid.x, mid.y + p.r * 1.1, mid.z);
        g.add(lens, face, rod, nut);
      }
      shadows(g);
      return g;
    }
    if (def.look === "porte") {
      // La porte du coucou : du bois sombre sculpté, une petite fenêtre, une poignée de laiton
      for (const p of def.parts) {
        if (p.k !== "wall") continue;
        const len = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]);
        const h = p.y1 - p.y0;
        const door = new THREE.Mesh(boxMeters(len, h, p.t * 2), darkWood);
        door.position.set((p.a[0] + p.b[0]) / 2, p.y0 + h / 2, (p.a[1] + p.b[1]) / 2);
        const pane = new THREE.Mesh(
          new THREE.PlaneGeometry(len * 0.4, h * 0.3),
          new THREE.MeshStandardMaterial({ color: 0xffd890, emissive: 0xffb050, emissiveIntensity: 0.6 }),
        );
        pane.position.set(door.position.x, p.y0 + h * 0.7, door.position.z + p.t + 0.002);
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), polished);
        knob.position.set(door.position.x + len * 0.32, p.y0 + h * 0.4, door.position.z + p.t + 0.02);
        g.add(door, pane, knob);
      }
      shadows(g);
      return g;
    }
    if (def.look === "piston") {
      // Un piston d'acier poli : la tige, la tête, ses bagues de laiton
      for (const p of def.parts) {
        if (p.k !== "wall") continue;
        const len = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]);
        const dir = new THREE.Vector3(p.b[0] - p.a[0], 0, p.b[1] - p.a[1]).normalize();
        const ground = heightAt(c, p.b[0], p.b[1]);
        const y = ground + (p.y1 - Math.max(0, ground)) * 0.5 + 0.01;
        // La tige est plus longue que sa partie qui frappe : elle reste dans son cylindre quand le piston sort
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(p.t * 0.55, p.t * 0.55, len + 1.4, 16), steel);
        rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        rod.position.set((p.a[0] + p.b[0]) / 2 - dir.x * 0.7, y, (p.a[1] + p.b[1]) / 2 - dir.z * 0.7);
        const head = new THREE.Mesh(new THREE.CylinderGeometry(p.t * 1.1, p.t * 1.1, 0.12, 20), polished);
        head.quaternion.copy(rod.quaternion);
        head.position.set(p.b[0] - dir.x * 0.06, y, p.b[1] - dir.z * 0.06);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(p.t * 1.12, 0.015, 6, 20), brass);
        ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
        ring.position.copy(head.position).addScaledVector(dir, -0.07);
        g.add(rod, head, ring);
      }
      shadows(g);
      return g;
    }
    if (def.look === "grande-aiguille" || def.look === "petite-aiguille") {
      // Une aiguille d'acier bleui, en fer de lance, et sa queue ronde ; un chapeau de laiton au centre
      const minute = def.look === "grande-aiguille";
      for (const p of def.parts) {
        if (p.k === "post") {
          const ground = heightAt(c, p.c[0], p.c[1]);
          const hub = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r * 1.15, p.y1 - ground, 24), polished);
          hub.position.set(p.c[0], ground + (p.y1 - ground) / 2, p.c[1]);
          g.add(hub);
          continue;
        }
        if (p.k !== "wall") continue;
        const ground = heightAt(c, p.b[0], p.b[1]);
        const len = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]);
        const w = p.t * 2.2;
        const shape = new THREE.Shape();
        // Le long de +x, de la queue (x = 0) à la pointe (x = len)
        const tail = minute ? 0.45 : 0.3;
        shape.moveTo(0, -w * 0.4);
        shape.lineTo(len * 0.78, -w * 0.5);
        shape.lineTo(len * 0.86, -w * 1.6);
        shape.lineTo(len, 0);
        shape.lineTo(len * 0.86, w * 1.6);
        shape.lineTo(len * 0.78, w * 0.5);
        shape.lineTo(0, w * 0.4);
        shape.lineTo(0, -w * 0.4);
        const hole = new THREE.Path();
        hole.absellipse(len * 0.86, 0, w * 0.6, w * 0.6, 0, Math.PI * 2, true);
        shape.holes.push(hole);
        const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: false, curveSegments: 10 });
        geo.rotateX(Math.PI / 2);
        const needle = new THREE.Mesh(geo, blued);
        needle.position.set(p.a[0], ground + (minute ? 0.12 : 0.08), p.a[1]);
        needle.rotation.y = -Math.atan2(p.b[1] - p.a[1], p.b[0] - p.a[0]);
        const counter = new THREE.Mesh(new THREE.CylinderGeometry(w * 1.6, w * 1.6, 0.04, 20), blued);
        const ux = (p.b[0] - p.a[0]) / len;
        const uz = (p.b[1] - p.a[1]) / len;
        counter.position.set(p.a[0] + ux * tail * 0.3, ground + (minute ? 0.1 : 0.06), p.a[1] + uz * tail * 0.3);
        g.add(needle, counter);
        // Le pied de l'aiguille, pour qu'elle balaie le cadran au ras de l'émail
        const skirt = new THREE.Mesh(new THREE.BoxGeometry(len * 0.95, minute ? 0.1 : 0.06, w * 0.5), blued);
        skirt.position.set((p.a[0] + p.b[0]) / 2, ground + (minute ? 0.07 : 0.05), (p.a[1] + p.b[1]) / 2);
        skirt.rotation.y = needle.rotation.y;
        g.add(skirt);
      }
      shadows(g);
      return g;
    }
    return null;
  };

  const kit = plainKit({
    felt,
    ground: (mat, look) => {
      if (look === "etabli") return oak;
      if (look === "parquet") return parquet;
      if (look === "laiton") return brassFloor;
      if (look === "engrenage") return gearBed;
      if (look === "tapis") return rubber;
      if (look === "acier") return tread;
      if (look === "cuir") return leather;
      if (look === "cadran") return enamel;
      if (look === "sablier" || mat === "sand") return sand;
      if (mat === "wood") return oak;
      if (mat === "metal") return brassFloor;
      return null;
    },
    side: darkWood,
    rail: () => ({ material: railBrass, extra: 0, widen: 0.012, round: true, tube: true }),
    wall: (look) => (look === "facade" ? darkWood : brass),
    post,
    mover,
    water: () => brass,
    flag: 0xb0302a,
  });

  made = {
    sky: {
      top: 0x2a2018,
      horizon: 0xc89a5a,
      bottom: 0x1a120c,
      sun: [-0.4, 0.82, 0.25],
      sunColor: 0xfff0dc,
      sunIntensity: 2.3,
      hemiSky: 0x8a8070,
      hemiGround: 0x2a1c12,
      hemiIntensity: 0.7,
      clouds: 0,
      cloudColor: 0xffffff,
      fog: 0x2a1e16,
      fogNear: 26,
      fogFar: 80,
      exposure: 1.02,
      grade: { warm: 0.02, sat: 1.0, vignette: 0.42 },
      bloom: 1.7,
    },
    kit,
    ambience: "horloger",
    tick: (t, decor) => {
      if (decor) workshopLife(decor, t);
    },
    decor: (c, rng) => workshopDecor(c, rng, m),
  };
  return made;
}

// ---------------------------------------------------------------------------
// La vie : les rouages qui tournent, les tapis qui défilent, les balanciers des horloges, le coucou qui sort
// ---------------------------------------------------------------------------

interface Life {
  spin: { o: THREE.Object3D; w: number; a0: number }[];
  belts: { tex: THREE.Texture; v: [number, number] }[];
  swing: { o: THREE.Object3D; amp: number; w: number; ph: number }[];
  birds: { o: THREE.Object3D; period: number; a0: number; out: number }[];
  motes: { pts: THREE.Points; base: Float32Array } | null;
}

function workshopLife(decor: THREE.Object3D, t: number) {
  const life = decor.userData.life as Life | undefined;
  if (!life) return;
  // Vu de dessus, un angle positif tourne de x vers z : en three.js, c'est une rotation négative autour de y
  for (const s of life.spin) s.o.rotation.y = -(s.a0 + s.w * t);
  for (const b of life.belts) b.tex.offset.set(-b.v[0] * t, b.v[1] * t);
  for (const s of life.swing) s.o.rotation.z = Math.sin(t * s.w + s.ph) * s.amp;
  for (const b of life.birds) {
    const k = slideAmount("piston", t / b.period + b.a0);
    b.o.position.z = b.out * k;
    b.o.visible = k > 0.02;
  }
  if (life.motes) {
    const p = life.motes.pts.geometry.attributes.position as THREE.BufferAttribute;
    const base = life.motes.base;
    for (let i = 0; i < p.count; i++) {
      const k = i * 3;
      p.setXYZ(
        i,
        base[k]! + Math.sin(t * 0.2 + i) * 0.3,
        base[k + 1]! + Math.sin(t * 0.13 + i * 1.7) * 0.25,
        base[k + 2]! + Math.cos(t * 0.17 + i) * 0.3,
      );
    }
    p.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
// Le décor
// ---------------------------------------------------------------------------

let roomMats: { bench: THREE.Material; panel: THREE.Material; glass: THREE.Material } | null = null;

function workshopDecor(c: Course, rng: () => number, m: Mats): THREE.Group {
  const g = new THREE.Group();
  const life: Life = { spin: [], belts: [], swing: [], birds: [], motes: null };
  g.userData.life = life;
  const above: THREE.Object3D[] = [];
  g.userData.hideAbove = above;
  const b = c.box;
  const base = c.outY;
  const cx = (b.x0 + b.x1) / 2;
  const cz = (b.z0 + b.z1) / 2;
  const farZ = b.z0 - 9;
  const frontZ = b.z1 + 12;
  const left = b.x0 - 28;
  const right = b.x1 + 28;

  if (!roomMats) {
    const pt = panelTex();
    pt.repeat.set(1 / 4, 1 / 4);
    roomMats = {
      bench: surfaceMat(woodTex(), { color: 0x6e5644, roughness: 0.72, scale: 3.5 }),
      panel: new THREE.MeshStandardMaterial({ map: pt, roughness: 0.7, side: THREE.DoubleSide }),
      glass: new THREE.MeshPhysicalMaterial({ color: 0xe8f4ff, roughness: 0.04, transparent: true, opacity: 0.22, depthWrite: false }),
    };
  }
  const rm = roomMats;

  // L'établi immense : son plateau de chêne, d'un mur à l'autre
  const W = right - left;
  const D = frontZ - farZ;
  const top = new THREE.Mesh(planeMeters(W, D), rm.bench);
  top.rotation.x = -Math.PI / 2;
  top.position.set((left + right) / 2, base, (farZ + frontZ) / 2);
  top.receiveShadow = true;
  g.add(top);
  const edge = new THREE.Mesh(boxMeters(W, 1.4, 0.6), m.darkWood);
  edge.position.set((left + right) / 2, base - 0.7, frontZ);
  g.add(edge);
  // Le mur du fond, lambrissé ; ses côtés ; tout se perd dans la pénombre
  const wall = new THREE.Mesh(planeMeters(W, 40), rm.panel);
  wall.position.set((left + right) / 2, base + 20, farZ);
  g.add(wall);
  for (const x of [left, right]) {
    const side = new THREE.Mesh(planeMeters(120, 40), rm.panel);
    side.position.set(x, base + 20, farZ + 60);
    side.rotation.y = x === left ? Math.PI / 2 : -Math.PI / 2;
    g.add(side);
  }

  // La fenêtre sur la nuit : un ciel bleu sombre, la lune, des étoiles, les toits
  const night = canvasTex(256, (gg, s) => {
    const sky = gg.createLinearGradient(0, 0, 0, s);
    sky.addColorStop(0, "#0b1330");
    sky.addColorStop(1, "#2a3a6a");
    gg.fillStyle = sky;
    gg.fillRect(0, 0, s, s);
    const rnd = noise(3);
    for (let k = 0; k < 90; k++) {
      gg.fillStyle = `rgba(255,255,240,${0.4 + rnd() * 0.6})`;
      gg.fillRect(rnd() * s, rnd() * s * 0.7, 1.5, 1.5);
    }
    gg.fillStyle = "#fff6d8";
    gg.beginPath();
    gg.arc(s * 0.72, s * 0.25, s * 0.07, 0, Math.PI * 2);
    gg.fill();
    gg.fillStyle = "#0a0c18";
    for (let k = 0; k < 7; k++) {
      const x = k * s * 0.16 - 10;
      const h = s * (0.12 + rnd() * 0.14);
      gg.fillRect(x, s - h, s * 0.14, h);
      gg.beginPath();
      gg.moveTo(x - 4, s - h);
      gg.lineTo(x + s * 0.07, s - h - s * 0.06);
      gg.lineTo(x + s * 0.14 + 4, s - h);
      gg.fill();
    }
  });
  const win = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 11),
    new THREE.MeshStandardMaterial({ map: night, emissive: 0xffffff, emissiveMap: night, emissiveIntensity: 0.8 }),
  );
  win.position.set(cx + 12, base + 11, farZ + 0.05);
  g.add(win);
  for (const [w, h, x, y] of [
    [9.8, 0.5, 0, 5.5],
    [9.8, 0.5, 0, -5.5],
    [0.5, 11.5, -4.7, 0],
    [0.5, 11.5, 4.7, 0],
    [0.25, 11, 0, 0],
    [9, 0.25, 0, 1],
  ] as const) {
    const bar = new THREE.Mesh(boxMeters(w, h, 0.4), m.darkWood);
    bar.position.set(cx + 12 + x, base + 11 + y, farZ + 0.2);
    g.add(bar);
  }

  // Les horloges du mur : leurs cadrans, leurs aiguilles, leurs balanciers qui battent
  const faceTex = dialTex();
  const faceMat = new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.35, emissive: 0x332a1a, emissiveIntensity: 0.25 });
  const clocks: [number, number, number][] = [
    [cx - 14, base + 13, 2.2],
    [cx - 4, base + 15, 2.8],
    [cx + 24, base + 12, 2.0],
    [cx - 24, base + 9, 1.8],
  ];
  clocks.forEach(([x, y, r], k) => {
    const clock = new THREE.Group();
    const caseBox = new THREE.Mesh(boxMeters(r * 2.5, r * 4.4, 1.2), m.darkWood);
    caseBox.position.set(0, -r * 1.1, 0.6);
    const face = new THREE.Mesh(new THREE.CircleGeometry(r, 48), faceMat);
    face.position.set(0, 0, 1.22);
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(r * 1.02, r * 0.06, 10, 48), m.polished);
    bezel.position.set(0, 0, 1.24);
    clock.add(caseBox, face, bezel);
    for (const [len, ang] of [
      [r * 0.82, rng() * 6],
      [r * 0.55, rng() * 6],
    ] as const) {
      const hand = new THREE.Mesh(new THREE.BoxGeometry(r * 0.05, len, 0.03), m.black);
      hand.geometry.translate(0, len / 2, 0);
      hand.position.set(0, 0, 1.27);
      hand.rotation.z = ang;
      clock.add(hand);
    }
    // Le balancier derrière sa vitre
    const swing = new THREE.Group();
    swing.position.set(0, -r * 1.2, 1.15);
    const rod = new THREE.Mesh(new THREE.BoxGeometry(0.08, r * 1.6, 0.04), m.polished);
    rod.position.y = -r * 0.8;
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.32, r * 0.32, 0.08, 32), m.polished);
    lens.rotation.x = Math.PI / 2;
    lens.position.y = -r * 1.6;
    swing.add(rod, lens);
    clock.add(swing);
    life.swing.push({ o: swing, amp: 0.16, w: Math.PI * (0.9 + k * 0.12), ph: k });
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(r * 2.1, r * 2.2), rm.glass);
    pane.position.set(0, -r * 2.1, 1.22);
    clock.add(pane);
    clock.position.set(x, y, farZ);
    shadows(clock, false);
    g.add(clock);
  });

  // Le grand rouage du mur : trois roues qui s'engrènent et tournent lentement
  const wallGears: [number, number, number, number][] = [
    [cx + 4, base + 6, 3.2, 0.12],
    [cx + 4 + 3.2 + 1.9, base + 6 + 0.6, 1.9, -0.12 * (3.2 / 1.9)],
    [cx + 4 - 3.2 - 1.2, base + 6 - 1.6, 1.2, -0.12 * (3.2 / 1.2)],
  ];
  for (const [x, y, r, w] of wallGears) {
    const gear = new THREE.Mesh(gearGeo(r, Math.round(r * 9), 0.3), m.brass);
    const holder = new THREE.Group();
    holder.position.set(x, y, farZ + 0.4);
    const spinner = new THREE.Group();
    spinner.add(gear);
    holder.add(spinner);
    // Sur le mur, la roue tourne autour de z : on l'anime comme une roue couchée, tournée face à nous
    holder.rotation.x = Math.PI / 2;
    life.spin.push({ o: spinner, w, a0: 0 });
    g.add(holder);
  }

  // La lampe de l'établi : son pied articulé, son abat-jour, l'ampoule qui brille
  const lamp = new THREE.Group();
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.9, 0.5, 32), m.black);
  foot.position.y = 0.25;
  const arm1 = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 7, 12), m.black);
  arm1.position.set(0.9, 3.6, 0);
  arm1.rotation.z = -0.25;
  const arm2 = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 6, 12), m.black);
  arm2.position.set(3.6, 7.3, 0);
  arm2.rotation.z = -1.2;
  const shade = new THREE.Mesh(
    new THREE.ConeGeometry(1.8, 2.2, 32, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x2e5a3c, roughness: 0.4, metalness: 0.5, side: THREE.DoubleSide }),
  );
  shade.position.set(6.4, 7.6, 0);
  shade.rotation.z = 0.5;
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.6, 20, 12),
    new THREE.MeshStandardMaterial({ color: 0xfff2c8, emissive: 0xffd890, emissiveIntensity: 3 }),
  );
  bulb.position.set(6.7, 7.0, 0);
  lamp.add(foot, arm1, arm2, shade, bulb);
  lamp.position.set(b.x0 - 10, base, cz - 2);
  shadows(lamp, false);
  g.add(lamp);
  above.push(arm2, shade, bulb);

  // Ce qui traîne sur l'établi, loin des pistes : des roues dentées, une montre ouverte, des vis, un ressort, un tournevis
  const taken: { x: number; z: number; r: number }[] = [];
  const place = (o: THREE.Object3D, r: number, rot = true): boolean => {
    for (let k = 0; k < 30; k++) {
      const side = rng() < 0.5 ? -1 : 1;
      const x = side < 0 ? b.x0 - 3 - r - rng() * 9 : b.x1 + 3 + r + rng() * 9;
      const z = b.z0 + rng() * (b.z1 - b.z0);
      if (onCourse(c, x, z, r + 1.2)) continue;
      if (taken.some((t) => Math.hypot(t.x - x, t.z - z) < t.r + r + 0.6)) continue;
      taken.push({ x, z, r });
      o.position.set(x, base, z);
      if (rot) o.rotation.y = rng() * Math.PI * 2;
      shadows(o);
      g.add(o);
      return true;
    }
    return false;
  };
  // Un train de trois roues couchées qui tournent en s'engrenant
  const train = new THREE.Group();
  const trainSpec: [number, number, number][] = [
    [0, 0, 2.2],
    [2.2 + 1.3, 0.4, 1.3],
    [-(2.2 + 0.9), -0.6, 0.9],
  ];
  trainSpec.forEach(([x, z, r], k) => {
    const gear = new THREE.Mesh(gearGeo(r, Math.round(r * 10), 0.25), k === 0 ? m.brass : m.steel);
    const spinner = new THREE.Group();
    spinner.position.set(x, 0.02, z);
    spinner.add(gear);
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.15, r * 0.15, 0.6, 16), m.polished);
    axle.position.set(x, 0.3, z);
    train.add(spinner, axle);
    life.spin.push({ o: spinner, w: (k === 0 ? 0.25 : -0.25 * (2.2 / r)) * 1, a0: k * 0.13 });
  });
  place(train, 4.8, false);
  // La montre de poche ouverte, et sa chaîne
  const watch = new THREE.Group();
  const caseM = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.45, 40), m.polished);
  caseM.position.y = 0.22;
  const wface = new THREE.Mesh(new THREE.CircleGeometry(1.22, 40), new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.3 }));
  wface.rotation.x = -Math.PI / 2;
  wface.position.y = 0.455;
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.12, 40), m.polished);
  lid.position.set(0, 0.06, 2.85);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 12), m.polished);
  crown.rotation.x = Math.PI / 2;
  crown.position.set(0, 0.22, -1.55);
  const bow = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.07, 8, 20), m.polished);
  bow.rotation.x = Math.PI / 2;
  bow.position.set(0, 0.22, -2.0);
  watch.add(caseM, wface, lid, crown, bow);
  for (let k = 0; k < 2; k++) {
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, k ? 0.7 : 1.0), m.blued);
    hand.position.set(0, 0.47, k ? -0.35 : -0.5);
    hand.rotation.y = k * 2.1;
    watch.add(hand);
  }
  const chain = new Scatter(new THREE.TorusGeometry(0.12, 0.035, 6, 12), m.polished);
  for (let k = 0; k < 26; k++)
    chain.add(Math.sin(k * 0.35) * 1.2, 0.04, -2.3 - k * 0.2, 1, k % 2 ? Math.PI / 2 : 0, undefined, Math.PI / 2);
  const cm = chain.build();
  if (cm) watch.add(cm);
  place(watch, 3.8);
  // Des vis géantes couchées
  for (let k = 0; k < 3; k++) {
    const screw = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 2.4, 14), m.steel);
    shaft.rotation.z = Math.PI / 2;
    shaft.position.y = 0.22;
    const thread = new THREE.Mesh(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(
          Array.from(
            { length: 40 },
            (_, i) => new THREE.Vector3(-1.1 + (i / 39) * 2.2, 0.22 + Math.cos(i * 1.3) * 0.24, Math.sin(i * 1.3) * 0.24),
          ),
        ),
        120,
        0.04,
        5,
        false,
      ),
      m.steel,
    );
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.25, 20), m.steel);
    head.rotation.z = Math.PI / 2;
    head.position.set(1.3, 0.5, 0);
    screw.add(shaft, thread, head);
    place(screw, 1.6);
  }
  // Un ressort à boudin couché
  const spring = new THREE.Mesh(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(
        Array.from(
          { length: 80 },
          (_, i) => new THREE.Vector3(-2 + (i / 79) * 4, 0.6 + Math.cos(i * 0.62) * 0.55, Math.sin(i * 0.62) * 0.55),
        ),
      ),
      320,
      0.07,
      6,
      false,
    ),
    m.blued,
  );
  const springHolder = new THREE.Group();
  springHolder.add(spring);
  place(springHolder, 2.4);
  // Un tournevis
  const driver = new THREE.Group();
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 2.6, 12), m.red);
  grip.rotation.z = Math.PI / 2;
  grip.position.set(-1.6, 0.5, 0);
  const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.6, 10), m.steel);
  blade.rotation.z = Math.PI / 2;
  blade.position.set(1.5, 0.5, 0);
  const tip = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.26), m.steel);
  tip.position.set(3.4, 0.5, 0);
  driver.add(grip, blade, tip);
  place(driver, 3.6);
  // Une pincette
  const tweezers = new THREE.Group();
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.08, 0.22), m.steel);
    leg.position.set(0, 0.1, s * 0.18);
    leg.rotation.y = s * 0.05;
    tweezers.add(leg);
  }
  place(tweezers, 2.2);
  // Des engrenages qui traînent, à plat
  const loose = new Scatter(gearGeo(1, 12, 0.12), m.brass);
  for (let k = 0; k < 8; k++) {
    for (let j = 0; j < 12; j++) {
      const side = rng() < 0.5 ? -1 : 1;
      const x = side < 0 ? b.x0 - 2.5 - rng() * 12 : b.x1 + 2.5 + rng() * 12;
      const z = b.z0 - 2 + rng() * (b.z1 - b.z0 + 4);
      const r = 0.3 + rng() * 0.6;
      if (onCourse(c, x, z, r + 0.6)) continue;
      if (taken.some((t) => Math.hypot(t.x - x, t.z - z) < t.r + r)) continue;
      loose.add(x, base + 0.02, z, [r, 1, r], rng() * 6);
      break;
    }
  }
  const lm = loose.build();
  if (lm) g.add(lm);

  // La poussière qui flotte dans la lumière de la lampe
  const n = 160;
  const mp = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    mp[i * 3] = b.x0 - 4 + rng() * (b.x1 - b.x0 + 8);
    mp[i * 3 + 1] = base + 0.4 + rng() * 5;
    mp[i * 3 + 2] = b.z0 - 4 + rng() * (b.z1 - b.z0 + 8);
  }
  const mg = new THREE.BufferGeometry();
  mg.setAttribute("position", new THREE.BufferAttribute(mp.slice(), 3));
  const dot = canvasTex(
    32,
    (gg, s) => {
      const grd = gg.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      grd.addColorStop(0, "rgba(255,230,180,1)");
      grd.addColorStop(1, "rgba(255,230,180,0)");
      gg.fillStyle = grd;
      gg.fillRect(0, 0, s, s);
    },
    true,
  );
  const motes = new THREE.Points(
    mg,
    new THREE.PointsMaterial({
      size: 0.04,
      map: dot,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  g.add(motes);
  life.motes = { pts: motes, base: mp };

  holeDecor(c, g, m, base, life, above);
  return g;
}

/** Ce que chaque trou demande */
function holeDecor(c: Course, g: THREE.Group, m: Mats, base: number, life: Life, above: THREE.Object3D[]) {
  const def = c.def;

  // Les faces des roues couchées : elles tournent avec leur plateau
  for (const t of def.tiles) {
    if (t.look !== "engrenage" || !t.flow || t.flow.k !== "spin") continue;
    const ring = t.rings[0]!;
    const gx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
    const gz = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    const r = Math.max(...ring.map((p) => Math.hypot(p[0] - gx, p[1] - gz)));
    const face = new THREE.Mesh(
      new THREE.CircleGeometry(r * 0.99, 64),
      new THREE.MeshStandardMaterial({ map: gearFaceTex(6), transparent: true, alphaTest: 0.5, roughness: 0.3, metalness: 0.85 }),
    );
    face.rotation.x = -Math.PI / 2;
    const spinner = new THREE.Group();
    spinner.position.set(gx, heightAt(c, gx, gz) + 0.004, gz);
    spinner.add(face);
    face.receiveShadow = true;
    g.add(spinner);
    const mv = def.movers.find((d) => d.motion.k === "spin" && Math.hypot(d.motion.c[0] - gx, d.motion.c[1] - gz) < 0.01);
    life.spin.push({ o: spinner, w: t.flow.w, a0: mv && mv.motion.k === "spin" ? (mv.motion.a0 ?? 0) : 0 });
  }

  // Les tapis roulants : leurs nervures qui défilent, leurs rouleaux aux deux bouts
  for (const t of def.tiles) {
    if (t.look !== "tapis" || !t.flow || t.flow.k !== "belt") continue;
    const ring = t.rings[0]!;
    const x0 = Math.min(...ring.map((p) => p[0]));
    const x1 = Math.max(...ring.map((p) => p[0]));
    const z0 = Math.min(...ring.map((p) => p[1]));
    const z1 = Math.max(...ring.map((p) => p[1]));
    const [vx, vz] = t.flow.v;
    const alongX = Math.abs(vx) > Math.abs(vz);
    const tex = beltTex(alongX);
    const w = x1 - x0;
    const d = z1 - z0;
    tex.repeat.set(w / 0.6, d / 0.6);
    const belt = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
    belt.rotation.x = -Math.PI / 2;
    belt.position.set((x0 + x1) / 2, heightAt(c, (x0 + x1) / 2, (z0 + z1) / 2) + 0.003, (z0 + z1) / 2);
    belt.receiveShadow = true;
    g.add(belt);
    // La texture avance d'un motif (0,6 m) par 0,6 m parcourus, dans le sens du tapis
    life.belts.push({ tex, v: [vx / 0.6, vz / 0.6] });
    // Des flèches peintes, pour qu'on voie le sens
    const arrows = new Scatter(
      new THREE.ConeGeometry(0.12, 0.3, 3).rotateX(Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xf0c030, roughness: 0.6 }),
      false,
    );
    const dirA = Math.atan2(vz, vx);
    const n = Math.max(2, Math.round((alongX ? w : d) / 1.2));
    for (let k = 0; k < n; k++) {
      const s = (k + 0.5) / n;
      const ax = alongX ? x0 + s * w : (x0 + x1) / 2;
      const az = alongX ? (z0 + z1) / 2 : z0 + s * d;
      arrows.add(ax, heightAt(c, ax, az) + 0.006, az, [1, 0.05, 1], -dirA + Math.PI / 2);
    }
    const am = arrows.build();
    if (am) g.add(am);
    for (const end of [0, 1]) {
      const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, alongX ? d : w, 16), m.steel);
      if (alongX) {
        roller.rotation.x = Math.PI / 2;
        roller.position.set(end ? x1 - 0.04 : x0 + 0.04, -0.05, (z0 + z1) / 2);
      } else {
        roller.rotation.z = Math.PI / 2;
        roller.position.set((x0 + x1) / 2, -0.05, end ? z1 - 0.04 : z0 + 0.04);
      }
      g.add(roller);
    }
  }

  // Les potences des pendules : deux montants de laiton et la traverse qui porte le pivot
  for (const mv of def.movers) {
    if (mv.look !== "pendule" || mv.motion.k !== "swing") continue;
    const [px, py, pz] = mv.motion.c;
    let l = px;
    let r = px;
    while (l > px - 8 && onCourse(c, l - 0.05, pz, 0)) l -= 0.05;
    while (r < px + 8 && onCourse(c, r + 0.05, pz, 0)) r += 0.05;
    l -= 0.95;
    r += 0.95;
    const frame = new THREE.Group();
    const beam = new THREE.Mesh(new THREE.BoxGeometry(r - l + 0.3, 0.22, 0.22), m.darkWood);
    beam.position.set((l + r) / 2, py + 0.1, pz);
    frame.add(beam);
    for (const x of [l, r]) {
      const h = py + 0.2 - base;
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.22, h, 0.22), m.darkWood);
      pole.position.set(x, base + h / 2, pz);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), m.polished);
      knob.position.set(x, py + 0.3, pz);
      frame.add(pole, knob);
    }
    const pivot = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.4, 16), m.polished);
    pivot.rotation.x = Math.PI / 2;
    pivot.position.set(px, py, pz);
    frame.add(pivot);
    shadows(frame);
    g.add(frame);
    above.push(beam);
  }

  // Les cylindres des pistons, hors de l'allée, et une bague de laiton où la tige traverse la bordure
  for (const mv of def.movers) {
    if (mv.look !== "piston") continue;
    for (const p of mv.parts) {
      if (p.k !== "wall") continue;
      const dir = new THREE.Vector3(p.b[0] - p.a[0], 0, p.b[1] - p.a[1]).normalize();
      const ground = heightAt(c, p.b[0], p.b[1]);
      const y = ground + (p.y1 - Math.max(0, ground)) * 0.5;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(p.t * 1.6, p.t * 1.6, 1.4, 20), m.brass);
      body.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      body.position.set(p.a[0] - dir.x * 0.4, y, p.a[1] - dir.z * 0.4);
      const capEnd = new THREE.Mesh(new THREE.CylinderGeometry(p.t * 1.75, p.t * 1.75, 0.12, 20), m.polished);
      capEnd.quaternion.copy(body.quaternion);
      capEnd.position.copy(body.position).addScaledVector(dir, -0.7);
      const collar = new THREE.Mesh(new THREE.TorusGeometry(p.t * 0.8, 0.03, 8, 20), m.polished);
      collar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
      collar.position.set(p.b[0], y, p.b[1]);
      const pipe = new THREE.Mesh(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3([
            capEnd.position.clone(),
            capEnd.position
              .clone()
              .addScaledVector(dir, -0.4)
              .setY(y + 0.3),
            capEnd.position
              .clone()
              .addScaledVector(dir, -0.8)
              .setY(base + 0.05),
          ]),
          16,
          0.04,
          6,
          false,
        ),
        m.polished,
      );
      const support = new THREE.Mesh(new THREE.BoxGeometry(0.3, y - base, 0.3), m.darkWood);
      support.position.set(body.position.x, base + (y - base) / 2 - 0.02, body.position.z);
      for (const o of [body, capEnd, collar, pipe, support]) g.add(o);
      shadows(body);
    }
  }

  for (const d of def.decos) {
    if (d.k === "cadran") {
      // L'émail du grand cadran, ses chiffres romains
      const r = d.s ?? 3;
      const dial = new THREE.Mesh(
        new THREE.CircleGeometry(r * 0.985, 96),
        new THREE.MeshStandardMaterial({ map: dialTex(), roughness: 0.25 }),
      );
      dial.rotation.x = -Math.PI / 2;
      dial.position.set(d.at[0], heightAt(c, d.at[0], d.at[1]) + 0.003, d.at[1]);
      dial.receiveShadow = true;
      g.add(dial);
    } else if (d.k === "coucou") {
      cuckoo(c, g, m, base, life, d.at);
    } else if (d.k === "sablier") {
      hourglass(c, g, m, base, d.at);
    } else if (d.k === "loupe") {
      // Une loupe d'horloger sur son pied, à côté de l'allée
      const loupe = new THREE.Group();
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.2, 10), m.black);
      stand.position.y = 1.1;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.07, 10, 40), m.polished);
      ring.position.set(0, 2.4, 0);
      ring.rotation.y = 0.6;
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.68, 40), roomMats!.glass);
      lens.position.copy(ring.position);
      lens.rotation.y = 0.6;
      const footL = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.12, 24), m.black);
      footL.position.y = 0.06;
      loupe.add(stand, ring, lens, footL);
      loupe.position.set(d.at[0], base, d.at[1]);
      shadows(loupe);
      g.add(loupe);
    }
  }

  // Le ressort : une spirale d'acier bleui sous une plaque de laiton, au ras de l'établi
  for (const p of def.pads) {
    if (p.look !== "ressort") continue;
    const y = heightAt(c, p.c[0], p.c[1]);
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(p.r * 0.9, p.r * 0.9, 0.012, 32), m.polished);
    plate.position.set(p.c[0], y + 0.008, p.c[1]);
    const coil = new THREE.Mesh(new THREE.TorusGeometry(p.r * 1.0, 0.018, 6, 40), m.blued);
    coil.rotation.x = Math.PI / 2;
    coil.position.set(p.c[0], y + 0.006, p.c[1]);
    g.add(plate, coil);
  }

  // Le sable du sablier : un liseré de laiton autour
  for (const t of def.tiles) {
    if (t.look !== "sablier") continue;
    const ring = t.rings[0]!;
    const pts = ring.map((p) => new THREE.Vector3(p[0], heightAt(c, p[0], p[1]) + 0.004, p[1]));
    pts.push(pts[0]!.clone());
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i]!;
      const e = pts[i + 1]!;
      const seg = new THREE.Mesh(new THREE.BoxGeometry(a.distanceTo(e), 0.008, 0.04), m.polished);
      seg.position.copy(a).add(e).multiplyScalar(0.5);
      seg.rotation.y = -Math.atan2(e.z - a.z, e.x - a.x);
      g.add(seg);
    }
  }
}

/** La maison du coucou : sa façade de bois sculpté, son toit, son cadran ; l'oiseau sort quand la porte se lève */
function cuckoo(c: Course, g: THREE.Group, m: Mats, base: number, life: Life, at: readonly [number, number]) {
  const house = new THREE.Group();
  const z = at[1];
  const W = 3.6;
  const facade = new THREE.Mesh(boxMeters(W, 2.6, 0.3), m.darkWood);
  facade.position.set(at[0], 0.5 + 1.3, z - 0.2);
  house.add(facade);
  // Le toit à deux pans, ses feuilles sculptées
  for (const s of [-1, 1]) {
    const roof = new THREE.Mesh(boxMeters(2.3, 0.14, 1.2), m.darkWood);
    roof.position.set(at[0] + s * 0.95, 3.5, z - 0.4);
    roof.rotation.z = -s * 0.55;
    house.add(roof);
  }
  const leaves = new Scatter(leafyBall(0, 0.3, 3), new THREE.MeshStandardMaterial({ color: 0x5a3418, roughness: 0.6 }));
  for (let k = 0; k < 9; k++) leaves.add(at[0] - 1.6 + k * 0.4, 3.0 + Math.sin(k) * 0.08, z - 0.03, [0.14, 0.09, 0.05], k);
  const lm = leaves.build();
  if (lm) house.add(lm);
  // Le cadran de la maison
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.55, 40), new THREE.MeshStandardMaterial({ map: dialTex(), roughness: 0.35 }));
  face.position.set(at[0], 1.7, z - 0.04);
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.57, 0.04, 8, 40), m.polished);
  bezel.position.copy(face.position);
  house.add(face, bezel);
  // La petite porte de l'oiseau, au-dessus du cadran, et l'oiseau sur son perchoir
  const hatch = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), new THREE.MeshStandardMaterial({ color: 0x120a06, roughness: 1 }));
  hatch.position.set(at[0], 2.6, z - 0.04);
  house.add(hatch);
  const bird = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), new THREE.MeshStandardMaterial({ color: 0x8a5a2a, roughness: 0.6 }));
  body.scale.set(1, 0.9, 1.4);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), body.material);
  head.position.set(0, 0.1, 0.17);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.12, 8), new THREE.MeshStandardMaterial({ color: 0xe8a020, roughness: 0.5 }));
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.09, 0.3);
  const perch = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.5), m.polished);
  perch.position.set(0, -0.15, -0.15);
  bird.add(body, head, beak, perch);
  const birdHolder = new THREE.Group();
  birdHolder.position.set(at[0], 2.6, z - 0.2);
  birdHolder.add(bird);
  house.add(birdHolder);
  for (const mv of c.def.movers)
    if (mv.look === "porte" && mv.motion.k === "slide")
      life.birds.push({ o: bird, period: mv.motion.period, a0: mv.motion.a0 ?? 0, out: 0.55 });
  // Les poids en pomme de pin et le balancier, qui pendent sous la maison, de part et d'autre de la porte
  for (const s of [-1, 1]) {
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.2, 6), m.polished);
    chain.position.set(at[0] + s * 1.35, 1.25, z + 0.3);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.5, 12), m.polished);
    cone.rotation.x = Math.PI;
    cone.position.set(at[0] + s * 1.35, 0.45, z + 0.3);
    house.add(chain, cone);
  }
  // (posée sur le sol à sa porte, qui peut être plus haut que zéro)
  house.position.y = base + Math.max(0, heightAt(c, at[0], at[1] - 0.05));
  shadows(house);
  g.add(house);
  void c;
}

/** Un grand sablier de verre posé à côté de l'allée, son sable qui coule */
function hourglass(c: Course, g: THREE.Group, m: Mats, base: number, at: readonly [number, number]) {
  let x = at[0];
  while (x < at[0] + 10 && onCourse(c, x, at[1], 0.8)) x += 0.1;
  x += 1.6;
  const glass = new THREE.Group();
  for (const s of [-1, 1]) {
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.3, 32), m.darkWood);
    plate.position.y = s > 0 ? 4.6 : 0.15;
    glass.add(plate);
  }
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 4.3, 10), m.darkWood);
    pillar.position.set(Math.cos(a) * 1.05, 2.4, Math.sin(a) * 1.05);
    glass.add(pillar);
  }
  const bulbGeo = new THREE.LatheGeometry(
    Array.from({ length: 24 }, (_, i) => {
      const t = i / 23;
      const y = 0.3 + t * 4.15;
      const r = 0.12 + 0.75 * Math.pow(Math.abs(Math.sin(t * Math.PI)), 0.8) * (Math.abs(t - 0.5) > 0.04 ? 1 : 0.2);
      return new THREE.Vector2(Math.max(0.08, r), y);
    }),
    32,
  );
  const bulb = new THREE.Mesh(bulbGeo, roomMats!.glass);
  glass.add(bulb);
  const sandMat = new THREE.MeshStandardMaterial({ color: 0xe6be70, roughness: 1 });
  const low = new THREE.Mesh(new THREE.ConeGeometry(0.7, 0.9, 28), sandMat);
  low.position.y = 0.75;
  const high = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.7, 28), sandMat);
  high.rotation.x = Math.PI;
  high.position.y = 2.75;
  const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 6), sandMat);
  stream.position.y = 1.9;
  glass.add(low, high, stream);
  glass.position.set(x, base, at[1]);
  shadows(glass);
  g.add(glass);
}
