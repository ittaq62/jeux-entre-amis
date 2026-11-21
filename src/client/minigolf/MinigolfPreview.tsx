// L'illustration du minigolf sur l'accueil : une image du jeu lui-même (le Jardin du château, rendu par sa 3D), et
// par-dessus, ce qui vit : la balle qui roule vers le trou et y tombe, le drapeau qui flotte. Deux cadrages, comme
// Culbute : large pour les tablettes et les téléphones, haut pour l'ordinateur (le navigateur ne charge que le sien).

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
