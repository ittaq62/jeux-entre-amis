// L'illustration du bowling sur l'accueil : une image du jeu lui-même (la salle du quartier, un joueur en pleine
// glissade, la boule qui part et les quilles au bout de la piste), et par-dessus ce qui vit : les néons qui respirent,
// un reflet qui glisse sur le vernis. Deux cadrages : large pour les tablettes et les téléphones, haut pour
// l'ordinateur (le navigateur ne charge que le sien).

import "./bowlingPreview.css";

const TALL_FROM = "(min-width: 821px)";

export function BowlingPreview() {
  return (
    <div className="bw-preview" aria-hidden="true">
      <picture>
        <source media={TALL_FROM} srcSet="/bowling-affiche-haute.webp" />
        <img src="/bowling-affiche-large.webp" alt="" loading="lazy" decoding="async" />
      </picture>
      <span className="bw-preview-glow" />
      <span className="bw-preview-shine" />
    </div>
  );
}
