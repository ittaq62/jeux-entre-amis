/** Comment on joue : la règle, puis les commandes à la souris, au doigt et au clavier */
export function HowToPlay({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`mg-howto ${compact ? "is-compact" : ""}`}>
      <p>
        <strong>Mets ta balle dans le trou en le moins de coups possible.</strong> On joue chacun son tour, un coup à la fois, pendant que
        les autres regardent ; au trou suivant, le meilleur du trou d'avant commence. Les balles se heurtent : on peut pousser celle d'un
        autre (poussée dans le trou, elle compte pour lui ; dehors, elle revient où elle était). L'hôte peut aussi faire jouer tout le monde
        en même temps : les balles se traversent alors.
      </p>
      {!compact && (
        <>
          <ul className="mg-keys">
            <li>
              <kbd>Glisser</kbd>
              <span>Tourner la vue autour de sa balle : on vise là où elle regarde (le pointillé montre la direction)</span>
            </li>
            <li>
              <kbd>Tirer sa balle vers soi</kbd>
              <span>
                Attraper sa balle (l'anneau) et la tirer vers soi pour doser la force, lâcher pour frapper. Un écart sur le côté affine la
                direction ; revenir au départ, Échap ou le clic droit annulent.
              </span>
            </li>
            <li>
              <kbd>Clic droit · deux doigts</kbd>
              <span>Tourner la vue (deux doigts écartés ou pincés : zoomer)</span>
            </li>
            <li className="is-keyboard">
              <kbd>Molette</kbd>
              <span>Zoomer</span>
            </li>
            <li className="is-keyboard">
              <kbd>← → ↑ ↓</kbd>
              <span>Tourner la vue au clavier (avec Maj : tout doucement)</span>
            </li>
            <li>
              <kbd>V</kbd>
              <span>Voir tout le trou d'en haut (ou le bouton « Vue du trou »)</span>
            </li>
          </ul>
          <p className="hint">
            Au plus le par + 5 coups par trou ; au-delà, on marque le par + 6. Chacun son tour, un coup qu'on ne joue pas à temps compte
            quand même ; deux tours laissés passer, un bot joue la balle jusqu'à ce qu'on reprenne la main. Une balle dans l'eau ou hors du
            parcours coûte un coup de pénalité et revient là d'où elle est partie. Tous en même temps, le trou a son temps, et quand la
            moitié des joueurs a fini, les autres ont encore 20 secondes.
          </p>
          <p className="hint">
            La balle tombe dans le trou seulement si elle passe assez lentement : trop vite, elle saute par-dessus ou frôle le bord et
            ressort. Les pentes la font tourner, le sable la freine, la glace la fait filer. Certains trous ont deux coupes : l'une ou
            l'autre compte.
          </p>
        </>
      )}
    </div>
  );
}
