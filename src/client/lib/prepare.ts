// Tout préparer avant le départ (voir shared/loadGate.ts) : ce qui, sinon, se ferait à la première apparition de
// chaque chose, en pleine partie, et ferait sauter les premières images. Les textures partent vers la carte graphique,
// les shaders se compilent (en parallèle quand le navigateur le permet), puis quelques images de chauffe tournent
// derrière l'écran de chargement (la toute première image d'une scène coûte cher : les ombres, les tampons). Les polices
// et les sons se chargent à côté.

import type * as THREE from "three";

/** L'image suivante, ou un dixième de seconde au plus (un onglet caché ne dessine plus : on n'attend pas pour rien) */
export function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    requestAnimationFrame(() => finish());
    setTimeout(finish, 100);
  });
}

/** Cette promesse, ou rien au bout de ce délai (un son ou une police qui ne vient pas ne retient pas la partie) */
export function atMost<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([p, new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms))]);
}

/** Les polices de la page chargées (celles qu'on nomme, et toutes celles déjà demandées) */
export async function loadFonts(families: readonly string[] = [], ms = 4000) {
  if (typeof document === "undefined" || !document.fonts) return;
  await atMost(Promise.all([...families.map((f) => document.fonts.load(`16px "${f}"`)), document.fonts.ready]), ms);
}

export interface WarmOptions {
  /** Le nombre d'images de chauffe, après la compilation (4 par défaut) */
  frames?: number;
  /** Compiler aussi ce qui est caché pour l'instant (les effets, les objets qui n'apparaissent qu'en jeu) */
  hidden?: boolean;
  /** D'autres scènes dessinées par le même moteur (une interface par-dessus, l'arme en main…) */
  extra?: readonly (readonly [THREE.Object3D, THREE.Camera])[];
  /** Une image de chauffe : par défaut, la scène telle quelle ; un jeu qui a son propre rendu (des passes, une interface) donne le sien */
  render?: () => void;
  /** Où on en est, de 0 à 1 */
  onProgress?: (share: number) => void;
}

/**
 * Une scène three.js prête à jouer : ses textures envoyées, ses shaders compilés, et quelques images déjà dessinées. À
 * appeler pendant l'écran de chargement, une fois la scène construite.
 */
export async function warmThree(renderer: THREE.WebGLRenderer, scene: THREE.Object3D, camera: THREE.Camera, o: WarmOptions = {}) {
  const report = (share: number) => o.onProgress?.(Math.max(0, Math.min(1, share)));
  const roots: (readonly [THREE.Object3D, THREE.Camera])[] = [[scene, camera], ...(o.extra ?? [])];
  // Les textures, une à une (cachées ou non) : la carte graphique les reçoit maintenant plutôt qu'à leur première apparition
  const textures = new Set<THREE.Texture>();
  for (const [root] of roots)
    root.traverse((x) => {
      const mats = (x as THREE.Mesh).material;
      for (const m of Array.isArray(mats) ? mats : mats ? [mats] : [])
        for (const v of Object.values(m)) if ((v as THREE.Texture | null)?.isTexture) textures.add(v as THREE.Texture);
    });
  const background = (scene as THREE.Scene).background as THREE.Texture | null;
  if (background?.isTexture) textures.add(background);
  let k = 0;
  for (const t of textures) {
    renderer.initTexture(t);
    if (++k % 8 === 0) {
      report((k / textures.size) * 0.3);
      await nextFrame();
    }
  }
  report(0.3);
  // Les shaders : la compilation part d'un coup pour toutes les scènes (ce qui est caché est montré le seul temps de
  // cet appel, sans être dessiné), puis on attend que la carte graphique ait fini, sans geler la page quand le
  // navigateur sait compiler en parallèle
  const shown: THREE.Object3D[] = [];
  if (o.hidden !== false) {
    for (const [root] of roots)
      root.traverse((x) => {
        if (!x.visible) {
          x.visible = true;
          shown.push(x);
        }
      });
  }
  let compiling: Promise<unknown>[];
  try {
    compiling = roots.map(([root, cam]) => renderer.compileAsync(root, cam));
  } finally {
    for (const x of shown) x.visible = false;
  }
  let compiled = 0;
  await Promise.all(compiling.map((p) => p.then(() => report(0.3 + (++compiled / roots.length) * 0.4))));
  // Quelques vraies images, encore cachées par l'écran de chargement
  const frames = o.frames ?? 4;
  for (let i = 0; i < frames; i++) {
    if (o.render) o.render();
    else renderer.render(scene, camera);
    report(0.7 + ((i + 1) / frames) * 0.3);
    await nextFrame();
  }
  report(1);
}
