// L'illustration de Toque ! sur l'accueil : une image du jeu lui-même (le bistrot en plein service, la brigade aux
// fourneaux, la marmite qui fume), et par-dessus ce qui vit : la vapeur qui monte, la lumière chaude qui vacille. Deux
// cadrages : large pour les tablettes et les téléphones, haut pour l'ordinateur (le navigateur ne charge que le sien).

import "./toquePreview.css";

const TALL_FROM = "(min-width: 821px)";

export function ToquePreview() {
  return (
    <div className="tq-preview" aria-hidden="true">
      <picture>
        <source media={TALL_FROM} srcSet="/toque-affiche-haute.webp" />
        <img src="/toque-affiche-large.webp" alt="" loading="lazy" decoding="async" />
      </picture>
      <span className="tq-preview-glow" />
      <span className="tq-preview-steam is-a" />
      <span className="tq-preview-steam is-b" />
      <span className="tq-preview-steam is-c" />
    </div>
  );
}
