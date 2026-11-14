// Les dessins de la garde-robe se chargent à part, la première fois qu'un avatar à l'écran porte quelque chose : qui ne
// croise que des personnages sans rien ne les télécharge jamais. Le temps qu'ils arrivent, l'avatar se dessine tel
// qu'avant (son portrait de base), puis se complète tout seul.

import { useEffect, useSyncExternalStore } from "react";
import { hasWear, type AvatarConfig } from "../../shared/avatar.ts";

export type WearModule = typeof import("./AvatarWear.tsx");

let loaded: WearModule | null = null;
let loading: Promise<WearModule> | null = null;
const listeners = new Set<() => void>();

export function loadWear(): Promise<WearModule> {
  loading ??= import("./AvatarWear.tsx").then(
    (m) => {
      loaded = m;
      for (const l of listeners) l();
      return m;
    },
    (err: unknown) => {
      // Pas de réseau : on réessaiera au prochain avatar qui en a besoin
      loading = null;
      throw err;
    },
  );
  return loading;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const snapshot = () => loaded;

/** Les dessins, si cet avatar porte quelque chose et qu'ils sont arrivés (sinon null : on dessine le portrait de base) */
export function useWear(avatar: Pick<AvatarConfig, "wear">): WearModule | null {
  const needed = hasWear(avatar);
  const mod = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => {
    if (needed && !loaded) loadWear().catch(() => {});
  }, [needed]);
  return needed ? mod : null;
}

/** Avant de dessiner un avatar hors de l'écran (texture d'un jeu en 3D) : attendre ses dessins s'il en a besoin */
export async function ensureWear(avatar: Pick<AvatarConfig, "wear">): Promise<void> {
  if (hasWear(avatar) && !loaded) await loadWear().catch(() => {});
}
