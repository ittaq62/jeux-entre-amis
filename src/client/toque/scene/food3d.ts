// Ce qu'on voit des aliments et des ustensiles : chaque aliment à chaque étape (entier, coupé, cuit, brûlé), les
// assiettes garnies, la marmite et sa soupe, la poêle, les fonds garnis (pizza, croque, tarte), l'extincteur. Des formes
// simples et franches, lisibles de haut, aux couleurs vives. Les formes et les matières sont faites une fois par scène
// (FoodKit) et partagées entre tous les objets qui se ressemblent.

import * as THREE from "three";
import { splitBaked, potDish, type FoodId } from "../../../shared/games/toque/food.ts";
import type { Item } from "../../../shared/games/toque/sim.ts";

type Mat = THREE.MeshStandardMaterial;

/** La clé de ce qu'on voit d'un objet : deux objets de même clé se dessinent pareil */
export function visualKey(it: Item): string {
  const p = it.p ?? 0;
  const cook = p >= 2 ? 2 : p >= 1 ? 1 : 0;
  switch (it.k) {
    case "food":
      return `f:${it.f}`;
    case "plate":
      return `p:${it.dirty ? "d" : "c"}:${it.n ?? 1}:${[...(it.c ?? [])].sort().join(",")}`;
    case "pot":
      return `m:${cook}:${(it.c ?? []).join(",")}`;
    case "pan":
      return `n:${(it.c ?? []).join(",")}`;
    case "base":
      return `b:${it.b}:${cook}:${[...(it.c ?? [])].sort().join(",")}`;
    case "ext":
      return "e";
  }
}

const SOUP_COLORS: Record<string, string> = {
  soupe_tomate: "#d8452e",
  soupe_oignon: "#a8692e",
  soupe_champi: "#d8c7a6",
  puree: "#f2dc9a",
  fondue: "#f2c94a",
  moules_k: "#e8a24a",
};

export class FoodKit {
  private geos = new Map<string, THREE.BufferGeometry>();
  private mats = new Map<string, Mat>();

  geo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
    let g = this.geos.get(key);
    if (!g) this.geos.set(key, (g = make()));
    return g;
  }

  mat(color: string, rough = 0.6, metal = 0, emissive?: string): Mat {
    const key = `${color}|${rough}|${metal}|${emissive ?? ""}`;
    let m = this.mats.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
      if (emissive) {
        m.emissive = new THREE.Color(emissive);
        m.emissiveIntensity = 0.6;
      }
      this.mats.set(key, m);
    }
    return m;
  }

  private add(g: THREE.Object3D, geo: THREE.BufferGeometry, mat: Mat, x = 0, y = 0, z = 0, s = 1): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.scale.setScalar(s);
    m.castShadow = true;
    g.add(m);
    return m;
  }

  private sphere(r: number, w = 14, h = 10) {
    return this.geo(`s${r}:${w}:${h}`, () => new THREE.SphereGeometry(r, w, h));
  }
  private box(x: number, y: number, z: number) {
    return this.geo(`b${x}:${y}:${z}`, () => new THREE.BoxGeometry(x, y, z));
  }
  private cyl(rt: number, rb: number, h: number, s = 18) {
    return this.geo(`c${rt}:${rb}:${h}:${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s));
  }

  /** Ce qui se pose sur une case, ou se tient en main */
  make(it: Item): THREE.Group {
    const g = new THREE.Group();
    switch (it.k) {
      case "food":
        this.food(g, it.f!, 1);
        break;
      case "plate":
        this.plate(g, it);
        break;
      case "pot":
        this.pot(g, it);
        break;
      case "pan":
        this.pan(g, it);
        break;
      case "base":
        this.base(g, it.b!, it.c ?? [], it.p ?? 0);
        break;
      case "ext":
        this.ext(g);
        break;
    }
    return g;
  }

  /** Un aliment (posé sur sa base, y = 0), à cette échelle */
  food(g: THREE.Group, f: FoodId | string, s: number) {
    const k = this;
    const R = (r: number) => r * s;
    switch (f) {
      case "tomate": {
        const t = k.add(g, k.sphere(0.13), k.mat("#e0392b", 0.35), 0, R(0.12), 0, s);
        t.scale.y = 0.85 * s;
        for (let i = 0; i < 5; i++) {
          const leaf = k.add(g, k.box(0.02, 0.012, 0.07), k.mat("#3f8a2e", 0.6), 0, R(0.225), 0, s);
          leaf.rotation.y = (i / 5) * Math.PI * 2;
          leaf.position.x = Math.cos((i / 5) * Math.PI * 2) * R(0.03);
          leaf.position.z = Math.sin((i / 5) * Math.PI * 2) * R(0.03);
        }
        break;
      }
      case "tomate_c":
        for (let i = 0; i < 4; i++) {
          const sl = k.add(g, k.cyl(0.09, 0.09, 0.03, 16), k.mat("#e8493a", 0.4), (i - 1.5) * R(0.055), R(0.06), 0, s);
          sl.rotation.z = Math.PI / 2 - 0.35;
          const inner = k.add(g, k.cyl(0.066, 0.066, 0.032, 12), k.mat("#f58a6a", 0.5), (i - 1.5) * R(0.055), R(0.06), 0, s);
          inner.rotation.z = Math.PI / 2 - 0.35;
        }
        break;
      case "laitue": {
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          const leaf = k.add(
            g,
            k.sphere(0.1, 10, 8),
            k.mat(i % 2 ? "#6cbf3c" : "#8fd456", 0.6),
            Math.cos(a) * R(0.06),
            R(0.1),
            Math.sin(a) * R(0.06),
            s,
          );
          leaf.scale.set(s, 0.75 * s, s * 0.8);
        }
        k.add(g, k.sphere(0.09, 10, 8), k.mat("#b9e27a", 0.6), 0, R(0.16), 0, s);
        break;
      }
      case "laitue_c":
        for (let i = 0; i < 10; i++) {
          const a = i * 2.39;
          const leaf = k.add(
            g,
            k.box(0.07, 0.018, 0.04),
            k.mat(i % 3 ? "#7ccc48" : "#a6dd6a", 0.6),
            Math.cos(a) * R(0.07),
            R(0.03 + (i % 3) * 0.018),
            Math.sin(a) * R(0.07),
            s,
          );
          leaf.rotation.y = a;
          leaf.rotation.z = (i % 2 ? 0.3 : -0.3) * s;
        }
        break;
      case "oignon": {
        const o = k.add(g, k.sphere(0.11), k.mat("#c08a4a", 0.45), 0, R(0.11), 0, s);
        o.scale.y = 1.05 * s;
        const tip = k.add(
          g,
          k.geo("cone-oignon", () => new THREE.ConeGeometry(0.035, 0.08, 8)),
          k.mat("#9a6a34", 0.5),
          0,
          R(0.24),
          0,
          s,
        );
        tip.rotation.z = 0.1;
        break;
      }
      case "oignon_c":
        for (let i = 0; i < 5; i++) {
          const ring = k.add(
            g,
            k.geo("ring-oignon", () => new THREE.TorusGeometry(0.05, 0.012, 6, 16)),
            k.mat("#f3ead4", 0.5),
            Math.cos(i * 1.3) * R(0.06),
            R(0.02 + i * 0.006),
            Math.sin(i * 1.3) * R(0.06),
            s,
          );
          ring.rotation.x = Math.PI / 2;
        }
        break;
      case "champi": {
        const cap = k.add(
          g,
          k.geo("cap", () => new THREE.SphereGeometry(0.11, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2)),
          k.mat("#e9e0cf", 0.55),
          0,
          R(0.1),
          0,
          s,
        );
        cap.scale.y = 0.75 * s;
        k.add(g, k.cyl(0.045, 0.055, 0.1, 10), k.mat("#f4eee2", 0.6), 0, R(0.05), 0, s);
        break;
      }
      case "champi_c":
        for (let i = 0; i < 5; i++) {
          const sl = k.add(
            g,
            k.geo("champi-slice", () => new THREE.CylinderGeometry(0.06, 0.06, 0.02, 12, 1, false, 0, Math.PI)),
            k.mat("#ece2cf", 0.6),
            (i - 2) * R(0.04),
            R(0.04),
            (i % 2) * R(0.03),
            s,
          );
          sl.rotation.x = Math.PI / 2;
          sl.rotation.z = 0.4;
        }
        break;
      case "patate": {
        const p = k.add(g, k.sphere(0.12), k.mat("#b98a52", 0.8), 0, R(0.09), 0, s);
        p.scale.set(1.25 * s, 0.75 * s, 0.95 * s);
        break;
      }
      case "patate_c":
        for (let i = 0; i < 9; i++) {
          const st = k.add(
            g,
            k.box(0.03, 0.03, 0.16),
            k.mat("#f2dca0", 0.7),
            ((i % 3) - 1) * R(0.04),
            R(0.02 + Math.floor(i / 3) * 0.03),
            0,
            s,
          );
          st.rotation.y = (i % 2 ? 0.2 : -0.2) * s;
        }
        break;
      case "frites":
        for (let i = 0; i < 11; i++) {
          const st = k.add(
            g,
            k.box(0.028, 0.028, 0.17),
            k.mat(i % 3 ? "#e8b440" : "#f2c65a", 0.45),
            ((i % 4) - 1.5) * R(0.035),
            R(0.02 + Math.floor(i / 4) * 0.028),
            (i % 2) * R(0.02),
            s,
          );
          st.rotation.y = ((i % 5) - 2) * 0.25;
        }
        break;
      case "fromage": {
        const w = k.add(
          g,
          k.geo("wedge", () => new THREE.CylinderGeometry(0.15, 0.15, 0.11, 3, 1, false, 0, Math.PI / 2.2)),
          k.mat("#f2c94a", 0.45),
          0,
          R(0.055),
          0,
          s,
        );
        w.rotation.y = 0.6;
        break;
      }
      case "fromage_c":
        for (let i = 0; i < 12; i++) {
          const sh = k.add(
            g,
            k.box(0.012, 0.012, 0.07),
            k.mat("#f4d35e", 0.5),
            Math.cos(i * 2.1) * R(0.06),
            R(0.012 + (i % 4) * 0.012),
            Math.sin(i * 2.1) * R(0.06),
            s,
          );
          sh.rotation.y = i * 0.9;
        }
        break;
      case "jambon": {
        const j = k.add(g, k.cyl(0.13, 0.13, 0.08, 20), k.mat("#e88a8a", 0.5), 0, R(0.04), 0, s);
        j.scale.z = 0.8 * s;
        k.add(g, k.cyl(0.135, 0.135, 0.07, 20), k.mat("#f6e4d8", 0.6), 0, R(0.04), 0, s * 1.0).scale.set(s, s, 0.8 * s);
        k.add(g, k.cyl(0.125, 0.125, 0.082, 20), k.mat("#e47f84", 0.5), 0, R(0.041), 0, s).scale.set(s, s, 0.78 * s);
        break;
      }
      case "jambon_c":
        for (let i = 0; i < 4; i++) {
          const sl = k.add(g, k.box(0.16, 0.014, 0.05), k.mat("#ec959a", 0.5), 0, R(0.01 + i * 0.016), (i - 1.5) * R(0.04), s);
          sl.rotation.y = (i - 1.5) * 0.15;
        }
        break;
      case "steak":
      case "steak_k": {
        const cooked = f === "steak_k";
        const st = k.add(g, k.cyl(0.13, 0.13, 0.05, 18), k.mat(cooked ? "#6b3a22" : "#b8323a", cooked ? 0.6 : 0.4), 0, R(0.03), 0, s);
        st.scale.z = 0.75 * s;
        if (cooked)
          for (let i = 0; i < 3; i++) k.add(g, k.box(0.2, 0.004, 0.014), k.mat("#2a160c", 0.8), 0, R(0.056), (i - 1) * R(0.04), s);
        else k.add(g, k.box(0.18, 0.004, 0.018), k.mat("#f0d4c8", 0.5), R(0.02), R(0.056), R(0.02), s).rotation.y = 0.5;
        break;
      }
      case "saucisse":
      case "saucisse_k": {
        const cooked = f === "saucisse_k";
        const body = k.add(
          g,
          k.geo("sausage", () => new THREE.CapsuleGeometry(0.045, 0.2, 6, 12)),
          k.mat(cooked ? "#8a4a26" : "#d98a8a", 0.45),
          0,
          R(0.05),
          0,
          s,
        );
        body.rotation.z = Math.PI / 2;
        break;
      }
      case "poisson": {
        const b = k.add(g, k.sphere(0.12, 16, 10), k.mat("#9db8c8", 0.3, 0.3), 0, R(0.07), 0, s);
        b.scale.set(1.5 * s, 0.6 * s, 0.6 * s);
        const tail = k.add(
          g,
          k.geo("tail", () => new THREE.ConeGeometry(0.07, 0.1, 4)),
          k.mat("#7f9db0", 0.35, 0.3),
          R(-0.21),
          R(0.07),
          0,
          s,
        );
        tail.rotation.z = Math.PI / 2;
        k.add(g, k.sphere(0.014, 8, 6), k.mat("#101214", 0.2), R(0.13), R(0.1), R(0.05), s);
        break;
      }
      case "poisson_c":
      case "poisson_f": {
        const fried = f === "poisson_f";
        const fil = k.add(g, k.box(0.2, 0.04, 0.09), k.mat(fried ? "#d99a3a" : "#f2d8cc", fried ? 0.75 : 0.5), 0, R(0.025), 0, s);
        fil.rotation.y = 0.2;
        break;
      }
      case "pateCrepe":
      case "pateTarte":
      case "patePizza": {
        if (f === "pateCrepe") {
          k.add(g, k.cyl(0.13, 0.09, 0.1, 18), k.mat("#e9e4d8", 0.3), 0, R(0.05), 0, s);
          k.add(g, k.cyl(0.115, 0.115, 0.01, 18), k.mat("#f2d48a", 0.4), 0, R(0.095), 0, s);
        } else {
          const ball = k.add(g, k.sphere(0.12), k.mat(f === "patePizza" ? "#f2e2b8" : "#ecd09a", 0.8), 0, R(0.08), 0, s);
          ball.scale.y = 0.7 * s;
        }
        break;
      }
      case "crepe": {
        const c = k.add(g, k.cyl(0.16, 0.16, 0.014, 22), k.mat("#e0a04a", 0.6), 0, R(0.012), 0, s);
        c.scale.z = s;
        for (let i = 0; i < 5; i++)
          k.add(g, k.cyl(0.02, 0.02, 0.002, 8), k.mat("#b8702c", 0.7), Math.cos(i * 2) * R(0.08), R(0.02), Math.sin(i * 2) * R(0.08), s);
        break;
      }
      case "pain": {
        const b = k.add(
          g,
          k.geo("baguette", () => new THREE.CapsuleGeometry(0.045, 0.26, 6, 12)),
          k.mat("#d49a4a", 0.7),
          0,
          R(0.05),
          0,
          s,
        );
        b.rotation.z = Math.PI / 2;
        for (let i = 0; i < 3; i++)
          k.add(g, k.box(0.012, 0.01, 0.05), k.mat("#f0d090", 0.7), (i - 1) * R(0.08), R(0.095), 0, s).rotation.y = 0.6;
        break;
      }
      case "sucre":
        for (let i = 0; i < 4; i++)
          k.add(g, k.box(0.06, 0.06, 0.06), k.mat("#fbfbf7", 0.3), ((i % 2) - 0.5) * R(0.07), R(0.03 + Math.floor(i / 2) * 0.06), 0, s);
        break;
      case "moules":
        for (let i = 0; i < 5; i++) {
          const m = k.add(
            g,
            k.sphere(0.06, 10, 8),
            k.mat("#25222e", 0.3, 0.2),
            Math.cos(i * 1.25) * R(0.07),
            R(0.035),
            Math.sin(i * 1.25) * R(0.07),
            s,
          );
          m.scale.set(1.5 * s, 0.6 * s, 0.85 * s);
          m.rotation.y = i;
        }
        break;
      case "pomme": {
        k.add(g, k.sphere(0.11), k.mat("#c83a2e", 0.35), 0, R(0.1), 0, s);
        k.add(g, k.cyl(0.008, 0.008, 0.06, 6), k.mat("#5a3a1a", 0.8), 0, R(0.22), 0, s);
        const leaf = k.add(g, k.box(0.05, 0.006, 0.025), k.mat("#4f9a34", 0.6), R(0.03), R(0.22), 0, s);
        leaf.rotation.z = 0.4;
        break;
      }
      case "pomme_c":
        for (let i = 0; i < 5; i++) {
          const sl = k.add(
            g,
            k.geo("apple-slice", () => new THREE.CylinderGeometry(0.08, 0.08, 0.02, 12, 1, false, 0, Math.PI)),
            k.mat("#f4e6b8", 0.6),
            (i - 2) * R(0.035),
            R(0.03),
            0,
            s,
          );
          sl.rotation.x = Math.PI / 2;
          sl.rotation.z = 0.3;
        }
        break;
      case "charbon": {
        for (let i = 0; i < 4; i++) {
          const c = k.add(
            g,
            k.geo("ico", () => new THREE.IcosahedronGeometry(0.07, 0)),
            k.mat("#1d1a18", 0.95),
            Math.cos(i * 1.7) * R(0.05),
            R(0.05),
            Math.sin(i * 1.7) * R(0.05),
            s,
          );
          c.rotation.set(i, i * 2, 0);
        }
        break;
      }
      default: {
        // Un plat de la marmite (soupe, purée, fondue, moules) servi : un bol
        const soup = SOUP_COLORS[f];
        if (soup) {
          k.add(g, k.cyl(0.13, 0.09, 0.08, 20), k.mat("#f4f1ea", 0.25), 0, R(0.04), 0, s);
          k.add(g, k.cyl(0.115, 0.115, 0.01, 20), k.mat(soup, 0.35), 0, R(0.078), 0, s);
          if (f === "moules_k")
            for (let i = 0; i < 4; i++)
              k.add(
                g,
                k.sphere(0.035, 8, 6),
                k.mat("#25222e", 0.3),
                Math.cos(i * 1.6) * R(0.05),
                R(0.088),
                Math.sin(i * 1.6) * R(0.05),
                s,
              ).scale.y = 0.5;
          if (f === "soupe_oignon") k.add(g, k.cyl(0.07, 0.07, 0.02, 12), k.mat("#e8b060", 0.6), 0, R(0.09), 0, s);
          break;
        }
        const baked = splitBaked(f);
        if (baked) this.base(g, baked.base, baked.toppings, 1, s);
      }
    }
  }

  /** Une assiette : propre (avec ce qu'on y a posé) ou sale, seule ou en pile */
  plate(g: THREE.Group, it: Item) {
    const n = Math.min(6, it.n ?? 1);
    const white = this.mat("#fbfaf6", 0.22);
    const rim = this.mat(it.dirty ? "#d8cbb0" : "#e9e3d4", 0.3);
    for (let i = 0; i < n; i++) {
      this.add(g, this.cyl(0.2, 0.15, 0.025, 26), white, 0, 0.012 + i * 0.03, 0);
      this.add(
        g,
        this.geo("rim", () => new THREE.TorusGeometry(0.185, 0.012, 6, 28)),
        rim,
        0,
        0.028 + i * 0.03,
        0,
      ).rotation.x = Math.PI / 2;
    }
    if (it.dirty) {
      for (let i = 0; i < 3; i++)
        this.add(
          g,
          this.cyl(0.04, 0.04, 0.004, 10),
          this.mat("#8a6a40", 0.9),
          Math.cos(i * 2.1) * 0.08,
          0.03 + (n - 1) * 0.03,
          Math.sin(i * 2.1) * 0.08,
        );
      return;
    }
    // Ce qu'il y a dessus, réparti
    const parts = it.c ?? [];
    parts.forEach((part, i) => {
      const sub = new THREE.Group();
      this.food(sub, part as FoodId, parts.length > 1 ? 0.72 : 0.9);
      if (parts.length > 1) {
        const a = (i / parts.length) * Math.PI * 2 + 0.6;
        sub.position.set(Math.cos(a) * 0.075, 0.03, Math.sin(a) * 0.075);
      } else sub.position.y = 0.03;
      g.add(sub);
    });
  }

  /** La marmite, et ce qui mijote dedans */
  pot(g: THREE.Group, it: Item) {
    const steel = this.mat("#b8bec6", 0.28, 0.85);
    const body = this.add(
      g,
      this.geo("pot", () => new THREE.CylinderGeometry(0.2, 0.18, 0.22, 24, 1, true)),
      steel,
      0,
      0.11,
      0,
    );
    (body.material as Mat).side = THREE.DoubleSide;
    this.add(g, this.cyl(0.18, 0.18, 0.02, 24), this.mat("#6a7078", 0.4, 0.8), 0, 0.01, 0);
    for (const s of [-1, 1]) this.add(g, this.box(0.06, 0.025, 0.04), this.mat("#2a2a2e", 0.5), s * 0.23, 0.17, 0);
    const c = it.c ?? [];
    if (c.length === 0) return;
    const p = it.p ?? 0;
    const dish = potDish(c);
    if (c[0] === "charbon") {
      this.add(g, this.cyl(0.18, 0.18, 0.02, 20), this.mat("#151210", 0.95), 0, 0.12, 0);
      return;
    }
    // Le niveau monte avec le nombre d'ingrédients ; cuit, c'est une soupe lisse de sa couleur
    const level = 0.05 + (c.length / 3) * 0.12;
    const color = p >= 1 && dish ? SOUP_COLORS[dish]! : "#c9a678";
    this.add(g, this.cyl(0.185, 0.185, 0.01, 22), this.mat(color, 0.3), 0, level, 0);
    if (p < 1)
      c.forEach((f, i) => {
        const sub = new THREE.Group();
        this.food(sub, f as FoodId, 0.55);
        sub.position.set(Math.cos(i * 2.1) * 0.08, level - 0.01, Math.sin(i * 2.1) * 0.08);
        g.add(sub);
      });
  }

  /** La poêle, et ce qui y cuit */
  pan(g: THREE.Group, it: Item) {
    const iron = this.mat("#2b2c30", 0.45, 0.6);
    this.add(g, this.cyl(0.2, 0.17, 0.05, 26), iron, 0, 0.025, 0);
    const handle = this.add(g, this.box(0.26, 0.03, 0.045), this.mat("#3a2a1e", 0.6), 0.32, 0.05, 0);
    handle.rotation.z = 0.12;
    const f = (it.c ?? [])[0];
    if (f) {
      const sub = new THREE.Group();
      this.food(sub, f as FoodId, 0.95);
      sub.position.y = 0.045;
      g.add(sub);
    }
  }

  /** Un fond garni : la pizza, le croque, la tarte (cru, cuit, brûlé) */
  base(g: THREE.Group, b: string, toppings: readonly string[], p: number, s = 1) {
    const burnt = p >= 2;
    const baked = p >= 1;
    if (b === "pizza") {
      this.add(g, this.cyl(0.2, 0.2, 0.025, 28), this.mat(burnt ? "#2a1d14" : baked ? "#e0a85a" : "#f2e2b8", 0.75), 0, 0.012 * s, 0, s);
      this.add(
        g,
        this.geo("crust", () => new THREE.TorusGeometry(0.19, 0.022, 8, 28)),
        this.mat(burnt ? "#1d140e" : baked ? "#c9823a" : "#ead3a0", 0.7),
        0,
        0.026 * s,
        0,
        s,
      ).rotation.x = Math.PI / 2;
      if (toppings.includes("tomate_c"))
        this.add(g, this.cyl(0.17, 0.17, 0.008, 24), this.mat(burnt ? "#3a1a10" : "#c8342a", 0.5), 0, 0.03 * s, 0, s);
      if (toppings.includes("fromage_c"))
        for (let i = 0; i < 7; i++)
          this.add(
            g,
            this.cyl(0.045, 0.05, 0.008, 10),
            this.mat(burnt ? "#2a2010" : baked ? "#f6d870" : "#fbf0c8", 0.5),
            Math.cos(i * 0.9) * 0.1 * s * (i % 2 ? 1 : 0.5),
            0.036 * s,
            Math.sin(i * 0.9) * 0.1 * s * (i % 2 ? 1 : 0.5),
            s,
          );
      if (toppings.includes("champi_c"))
        for (let i = 0; i < 5; i++)
          this.add(
            g,
            this.cyl(0.025, 0.025, 0.01, 8),
            this.mat("#e4d8c0", 0.6),
            Math.cos(i * 1.3 + 0.4) * 0.12 * s,
            0.042 * s,
            Math.sin(i * 1.3 + 0.4) * 0.12 * s,
            s,
          );
      if (toppings.includes("jambon_c"))
        for (let i = 0; i < 4; i++)
          this.add(
            g,
            this.box(0.06, 0.008, 0.03),
            this.mat("#ec959a", 0.5),
            Math.cos(i * 1.6) * 0.07 * s,
            0.044 * s,
            Math.sin(i * 1.6) * 0.07 * s,
            s,
          );
      return;
    }
    if (b === "croque") {
      const bread = this.mat(burnt ? "#2a1a10" : baked ? "#d89a4a" : "#f2e6c8", 0.8);
      this.add(g, this.box(0.24, 0.035, 0.2), bread, 0, 0.018 * s, 0, s);
      if (toppings.includes("jambon_c")) this.add(g, this.box(0.22, 0.012, 0.18), this.mat("#ec959a", 0.5), 0, 0.04 * s, 0, s);
      if (toppings.includes("fromage_c"))
        this.add(g, this.box(0.23, 0.01, 0.19), this.mat(baked ? "#f2c24a" : "#f6dd8a", 0.5), 0, 0.05 * s, 0, s);
      if (toppings.length === 2) this.add(g, this.box(0.24, 0.035, 0.2), bread, 0, 0.072 * s, 0, s);
      return;
    }
    // La tarte : un fond de pâte à bord, les lamelles de pomme en rosace, le sucre qui caramélise
    this.add(g, this.cyl(0.19, 0.17, 0.04, 26), this.mat(burnt ? "#2a1a10" : baked ? "#d6913e" : "#ecd3a0", 0.75), 0, 0.02 * s, 0, s);
    if (toppings.includes("pomme_c"))
      for (let i = 0; i < 10; i++) {
        const sl = this.add(
          g,
          this.box(0.09, 0.008, 0.035),
          this.mat(burnt ? "#3a2010" : baked ? "#e8b050" : "#f4e6b8", 0.5),
          Math.cos(i * 0.628) * 0.1 * s,
          0.045 * s,
          Math.sin(i * 0.628) * 0.1 * s,
          s,
        );
        sl.rotation.y = -i * 0.628;
      }
    if (toppings.includes("sucre"))
      this.add(g, this.cyl(0.05, 0.05, 0.01, 12), this.mat(baked ? "#c8782a" : "#fbfbf7", 0.3), 0, 0.05 * s, 0, s);
  }

  /** L'extincteur rouge, son manomètre et sa lance */
  ext(g: THREE.Group) {
    this.add(g, this.cyl(0.075, 0.075, 0.34, 16), this.mat("#d0302a", 0.35, 0.2), 0, 0.17, 0);
    this.add(g, this.sphere(0.075, 14, 8), this.mat("#d0302a", 0.35, 0.2), 0, 0.34, 0).scale.y = 0.6;
    this.add(g, this.box(0.05, 0.05, 0.08), this.mat("#2a2a2e", 0.5), 0, 0.4, 0.02);
    this.add(g, this.cyl(0.02, 0.02, 0.012, 10), this.mat("#f2f2ee", 0.3), 0.05, 0.3, 0.06).rotation.x = Math.PI / 2;
    const hose = this.add(g, this.cyl(0.012, 0.012, 0.18, 6), this.mat("#1c1c20", 0.6), 0.02, 0.36, 0.11);
    hose.rotation.x = 1.2;
  }

  dispose() {
    for (const g of this.geos.values()) g.dispose();
    for (const m of this.mats.values()) m.dispose();
    this.geos.clear();
    this.mats.clear();
  }
}
