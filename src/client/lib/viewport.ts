// La taille de l'écran, telle que les jeux doivent la croire.

import { useCallback, useEffect, useRef, useState } from "react";

/** Au-delà, ce n'est plus une barre de défilement : la page déborde */
const SCROLLBAR_MAX = 20;

/**
 * Sur téléphone, un contenu qui déborde fait dézoomer le navigateur : innerWidth annonce alors une page plus large que
 * l'écran, et un plateau calculé là-dessus sortirait sur les côtés. La largeur de mise en page, elle, reste la bonne.
 */
export function screenSize(): { w: number; h: number } {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const real = document.documentElement.clientWidth || w;
  if (w - real <= SCROLLBAR_MAX) return { w, h };
  return { w: real, h: Math.round((h * real) / w) };
}

export function useViewport() {
  const [size, setSize] = useState(screenSize);
  useEffect(() => {
    const onResize = () => setSize(screenSize());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return size;
}

/** La place qui reste vraiment dans un élément, à jour dès qu'il change de taille : un plateau s'y ajuste, rien ne déborde. */
export function useBoxSize<T extends HTMLElement>(): [(el: T | null) => void, { w: number; h: number }] {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: T | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el) return;
    const read = () =>
      setSize((prev) => (prev.w === el.clientWidth && prev.h === el.clientHeight ? prev : { w: el.clientWidth, h: el.clientHeight }));
    read();
    observer.current = new ResizeObserver(read);
    observer.current.observe(el);
  }, []);
  return [ref, size];
}
