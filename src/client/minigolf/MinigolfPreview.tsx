// L'illustration du minigolf sur l'accueil : une image du jeu lui-même, rendue par sa 3D (la page de travail
// /dev/minigolf?affiche) — au Jardin du château, devant la fontaine, Marcel, l'Habitué de Culbute, casquette et gilet
// tricoté, vient de frapper : la balle file vers le pont de bois, les jets d'eau, le drapeau et le château au fond. Par-
// dessus, un reflet doré qui passe. Deux cadrages, comme Culbute : large pour les tablettes et les téléphones, haut pour
// l'ordinateur (le navigateur ne charge que le sien).

import "./minigolfPreview.css";

const TALL_FROM = "(min-width: 821px)";

export function MinigolfPreview() {
  return (
    <div className="mg-preview" aria-hidden="true">
      <picture>
        <source media={TALL_FROM} srcSet="/minigolf-affiche-haute.webp" />
        <img src="/minigolf-affiche-large.webp" alt="" loading="lazy" decoding="async" />
      </picture>
      <span className="mg-preview-shine" />
    </div>
  );
}
