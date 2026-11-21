/** Comment on joue : la règle, puis les commandes à la souris, au doigt et au clavier */
export function HowToPlay({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`mg-howto ${compact ? "is-compact" : ""}`}>
      <p>
        <strong>Mets ta balle dans le trou en le moins de coups possible.</strong> Tout le monde joue en même temps, chacun sa balle : on
        voit celles des autres, un peu transparentes, et on passe au travers.
      </p>
      {!compact && (
        <>
          <ul className="mg-keys">
            <li>
              <kbd>Glisser en arrière</kbd>
              <span>
                Viser et doser, comme une fronde : on tire à l'opposé de là où va la balle, plus loin pour plus fort. On lâche pour frapper.
              </span>
            </li>
            <li>
              <kbd>Clic droit · deux doigts</kbd>
              <span>Tourner la caméra autour de sa balle (deux doigts écartés ou pincés : zoomer)</span>
            </li>
            <li>
              <kbd>Molette</kbd>
              <span>Zoomer</span>
            </li>
            <li>
              <kbd>← → ↑ ↓</kbd>
              <span>Tourner la caméra au clavier</span>
            </li>
            <li>
              <kbd>V</kbd>
              <span>Voir tout le trou d'en haut (ou le bouton « Vue du trou »)</span>
            </li>
          </ul>
          <p className="hint">
            Au plus le par + 5 coups par trou ; au-delà, ou si le temps est écoulé, on marque le par + 6. Une balle dans l'eau ou hors du
            parcours coûte un coup de pénalité et revient là d'où elle est partie. Quand la moitié des joueurs a fini, les autres ont encore
            20 secondes.
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
