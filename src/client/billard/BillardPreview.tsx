// L'illustration du billard sur l'accueil : une image du jeu lui-même (la table sous sa lampe, la queue qui vise, les
// billes), et par-dessus ce qui vit : la lumière de la lampe qui respire, un reflet qui glisse sur le vernis. Deux
// cadrages : large pour les tablettes et les téléphones, haut pour l'ordinateur (le navigateur ne charge que le sien).

import "./billardPreview.css";

const TALL_FROM = "(min-width: 821px)";

export function BillardPreview() {
  return (
    <div className="bl-preview" aria-hidden="true">
      <picture>
        <source media={TALL_FROM} srcSet="/billard-affiche-haute.webp" />
        <img src="/billard-affiche-large.webp" alt="" loading="lazy" decoding="async" />
      </picture>
      <span className="bl-preview-glow" />
      <span className="bl-preview-shine" />
    </div>
  );
}
