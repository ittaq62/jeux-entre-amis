// Ce qui a l'air solide l'est : sur chaque circuit (et son miroir), aucun morceau de décor ne se tient entre la route et
// le muret, à hauteur de kart, sauf ce qui se traverse et se voit comme tel (l'herbe, les fougères, les tremplins, les
// trampolines, la peinture au sol), ce qui bouge (la course sait quand ça touche), et les îlots, que la conduite connaît.
// On construit le vrai décor, avec un faux canvas (les textures ne partent jamais vers une carte graphique ici).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { getTrack, islandAt, locate, TRACK_IDS, type TrackId } from "../../../shared/games/bolides/track.ts";

const anything: unknown = new Proxy(function () {}, {
  get: (_t, k) => (k === Symbol.toPrimitive ? () => 1 : k === "then" ? undefined : anything),
  apply: () => anything,
  set: () => true,
});
beforeAll(() => {
  vi.stubGlobal("document", { createElement: () => anything });
});
afterAll(() => {
  vi.unstubAllGlobals();
});

const { buildWorld } = await import("./world.ts");
const { TrackLife } = await import("./life.ts");
const { Crossers } = await import("./features.ts");

/** Ce que l'objet (ou l'un de ceux qui le contiennent) déclare de lui sur la piste */
function kindOf(o: THREE.Object3D): string | undefined {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p.userData.onTrack) return p.userData.onTrack as string;
  return undefined;
}

/** Les morceaux de décor à hauteur de kart entre la route et le muret, et les « îlots » qui ne sont pas sur un îlot */
async function intruders(id: TrackId): Promise<string[]> {
  const t = getTrack(id);
  const world = await buildWorld(t, { phone: false, shadows: false, anisotropy: 1 }, async () => {});
  const keep = <T>(x: T) => x;
  const life = new TrackLife({ t, keep, heightAt: world.heightAt, shadows: false, phone: false });
  const crossers = new Crossers(t, t.def.theme, keep, false, world.heightAt);
  // Une image : ce qui bouge (la foule, les mouettes, les manèges) prend sa place
  const camera = new THREE.Vector3(0, 10, 0);
  world.update(1, camera, 1);
  life.update(1, camera);
  crossers.update(1);
  const root = new THREE.Group();
  root.add(world.group, life.group, crossers.group);
  root.updateMatrixWorld(true);
  const found = new Set<string>();
  const v = new THREE.Vector3();
  const m = new THREE.Matrix4();
  const inst = new THREE.Matrix4();
  const box = new THREE.Box3();
  // La recherche part du dernier point trouvé, seulement s'il est tout près (sinon elle chercherait au mauvais endroit)
  let hint = -1;
  let lastX = Infinity;
  let lastZ = Infinity;
  const where = (x: number, z: number) => {
    const at = locate(t, x, z, Math.hypot(x - lastX, z - lastZ) < 6 ? hint : -1);
    hint = at.i;
    lastX = x;
    lastZ = z;
    return at;
  };
  const probe = (o: THREE.Mesh, kind: string | undefined, x: number, y: number, z: number) => {
    const at = where(x, z);
    if (Math.abs(at.d) > t.wall - 0.3) return;
    const h = y - t.y[at.i]!;
    if (h < 0.25 || h > 1.9) return;
    if (kind === "solid" && islandAt(t, at.s, at.d, 0.8)) return;
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    const color = (mat as THREE.MeshLambertMaterial | undefined)?.color?.getHexString() ?? "?";
    const what = `${o.geometry.type}${o instanceof THREE.InstancedMesh ? ` ×${o.count}` : ""} (${(o.geometry as THREE.BufferGeometry).attributes.position!.count} sommets, ${(mat as THREE.Material).type}, ${(mat as THREE.MeshStandardMaterial).map ? "texture" : ""} ${(mat as THREE.Material).transparent ? "transp" : ""} d ${at.d.toFixed(1)})`;
    found.add(`${what} ${color}${kind ? ` (${kind})` : ""} à ${Math.round(at.s / 10) * 10} m, ${at.d < 0 ? "à gauche" : "à droite"}`);
  };
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !o.visible) return;
    const kind = kindOf(o);
    if (kind === "traversable" || kind === "moving") return;
    const geo = o.geometry as THREE.BufferGeometry;
    const pos = geo.attributes.position as THREE.BufferAttribute | undefined;
    if (!pos) return;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const step = Math.max(1, Math.floor(pos.count / 300));
    const n = o instanceof THREE.InstancedMesh ? o.count : 1;
    for (let k = 0; k < n; k++) {
      if (o instanceof THREE.InstancedMesh) {
        o.getMatrixAt(k, inst);
        m.multiplyMatrices(o.matrixWorld, inst);
      } else m.copy(o.matrixWorld);
      box.copy(geo.boundingBox!).applyMatrix4(m);
      const cx = (box.min.x + box.max.x) / 2;
      const cz = (box.min.z + box.max.z) / 2;
      const size = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
      const c = where(cx, cz);
      if (Math.abs(c.d) > t.wall + size / 2 + 2) continue;
      for (let i = 0; i < pos.count; i += step) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m);
        probe(o, kind, v.x, v.y, v.z);
      }
      // Un poteau ou un tuteur n'a de sommets qu'en haut et en bas : on regarde aussi son axe, à hauteur de kart
      if (size < 3)
        for (const y of [0.6, 1.2]) {
          const yy = t.y[c.i]! + y;
          if (yy > box.min.y && yy < box.max.y) probe(o, kind, cx, yy, cz);
        }
    }
  });
  world.dispose();
  return [...found];
}

describe("Bolides : le décor solide reste derrière le muret", () => {
  const ids = TRACK_IDS.flatMap((id) => [id, `${id}-miroir` as TrackId]);
  it.each(ids)(
    "%s : rien de solide là où roulent les karts",
    async (id) => {
      expect(await intruders(id)).toEqual([]);
    },
    60_000,
  );
});
