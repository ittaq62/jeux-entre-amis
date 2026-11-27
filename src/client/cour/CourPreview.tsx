// L'illustration de La Cour des Grands sur l'accueil : une image du jeu lui-même (la foule figée devant le Tournesol
// géant, la cloche Carillon qui plane), et par-dessus ce qui vit : la lumière dorée qui respire, des confettis qui
// tombent. Deux cadrages : large pour les tablettes et les téléphones, haut pour l'ordinateur.

import "./courPreview.css";

const TALL_FROM = "(min-width: 821px)";

export function CourPreview() {
  return (
    <div className="cg-preview" aria-hidden="true">
      <picture>
        <source media={TALL_FROM} srcSet="/cour-affiche-haute.webp" />
        <img src="/cour-affiche-large.webp" alt="" loading="lazy" decoding="async" />
      </picture>
      <span className="cg-preview-glow" />
      <span className="cg-preview-confetti" />
    </div>
  );
}
