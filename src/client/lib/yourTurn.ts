// « À toi ! » quand l'onglet est caché : le joueur doit jouer, mais il regarde ailleurs. Le titre de l'onglet le dit,
// l'icône de l'onglet porte une pastille, celle de l'application installée aussi (si le navigateur le permet), et un
// son discret l'accueille à son retour s'il n'a toujours pas joué. Rien ne change tant que l'onglet est visible.

import { useEffect } from "react";
import { play } from "./sound.ts";

/** Le titre de l'onglet, marqué : « (À toi !) La Tablée… » (une marque déjà là est remplacée, pas empilée) */
export function flaggedTitle(base: string, label: string): string {
  return `(${label}) ${base.replace(/^\([^)]*\)\s*/, "")}`;
}

/** Ce dont l'alerte a besoin de la page : de quoi la tester sans navigateur */
export interface TurnAlertPage {
  doc: {
    title: string;
    visibilityState: DocumentVisibilityState;
    querySelector(sel: string): { href: string } | null;
    addEventListener(type: "visibilitychange", fn: () => void): void;
    removeEventListener(type: "visibilitychange", fn: () => void): void;
  };
  setBadge?: () => void;
  clearBadge?: () => void;
  /** L'icône avec sa pastille, à partir de l'icône du site (null : on garde l'icône telle quelle) */
  dotIcon?: (href: string) => Promise<string | null>;
  /** Le son discret du retour */
  chime: () => void;
}

/** Démarre l'alerte (c'est au joueur) ; la fonction rendue l'arrête et remet tout comme avant */
export function startTurnAlert(page: TurnAlertPage, label: string): () => void {
  const { doc } = page;
  let flagged = false;
  let baseTitle = "";
  let titleSet = "";
  let icon: { href: string } | null = null;
  let iconHref = "";
  let stopped = false;

  const flag = () => {
    if (flagged) return;
    flagged = true;
    baseTitle = doc.title;
    titleSet = flaggedTitle(baseTitle, label);
    doc.title = titleSet;
    page.setBadge?.();
    icon = doc.querySelector('link[rel="icon"]');
    if (icon && page.dotIcon) {
      iconHref = icon.href;
      void page.dotIcon(iconHref).then((url) => {
        if (url && flagged && !stopped && icon) icon.href = url;
      });
    }
  };
  const unflag = () => {
    if (!flagged) return;
    flagged = false;
    // Un autre a pu changer le titre entre-temps (une invitation) : on ne remet le nôtre que s'il est toujours là
    if (doc.title === titleSet) doc.title = baseTitle;
    page.clearBadge?.();
    if (icon && iconHref) icon.href = iconHref;
  };
  const onVisibility = () => {
    if (doc.visibilityState === "hidden") return flag();
    // De retour alors que c'est toujours à lui : on le lui rappelle doucement
    if (flagged) page.chime();
    unflag();
  };

  if (doc.visibilityState === "hidden") flag();
  doc.addEventListener("visibilitychange", onVisibility);
  return () => {
    stopped = true;
    doc.removeEventListener("visibilitychange", onVisibility);
    unflag();
  };
}

const ICON_SIZE = 64;
let dotIconUrl: Promise<string | null> | null = null;

/** L'icône du site avec une pastille rouge dans le coin : dessinée une fois, gardée ensuite */
function iconWithDot(href: string): Promise<string | null> {
  dotIconUrl ??= new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = ICON_SIZE;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, ICON_SIZE, ICON_SIZE);
        ctx.beginPath();
        ctx.arc(ICON_SIZE * 0.76, ICON_SIZE * 0.24, ICON_SIZE * 0.22, 0, Math.PI * 2);
        ctx.fillStyle = "#e0463c";
        ctx.fill();
        ctx.lineWidth = ICON_SIZE * 0.05;
        ctx.strokeStyle = "#fbf5e6";
        ctx.stroke();
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = () => resolve(null);
      img.src = href;
    } catch {
      resolve(null);
    }
  });
  return dotIconUrl;
}

type BadgeNavigator = Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };

/**
 * Signale « À toi ! » tant que `active` (c'est au joueur de jouer) et que l'onglet est caché. Au retour sur l'onglet,
 * si c'est toujours à lui, un son discret ; dès que ce n'est plus à lui ou qu'il revient, tout redevient comme avant.
 */
export function useYourTurnAlert(active: boolean, label = "À toi !") {
  useEffect(() => {
    if (!active) return;
    const nav = navigator as BadgeNavigator;
    return startTurnAlert(
      {
        doc: document as unknown as TurnAlertPage["doc"],
        setBadge: () => void nav.setAppBadge?.().catch(() => {}),
        clearBadge: () => void nav.clearAppBadge?.().catch(() => {}),
        dotIcon: iconWithDot,
        chime: () => play("yourTurn", { volume: 0.5 }),
      },
      label,
    );
  }, [active, label]);
}
