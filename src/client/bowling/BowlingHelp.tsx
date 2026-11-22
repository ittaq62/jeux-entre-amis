/** Comment on joue : la règle, puis le geste à la souris et au doigt */
export function HowToPlay({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`bw-howto ${compact ? "is-compact" : ""}`}>
      <p>
        <strong>Abats les dix quilles.</strong> Chacun lance à son tour, deux boules par frame. Un strike (tout d'un coup) vaut 10 plus tes
        deux boules suivantes, un spare (tout en deux boules) 10 plus la suivante. Le plus gros score gagne.
      </p>
      {!compact && (
        <>
          <ul className="bw-keys">
            <li>
              <kbd>Glisser en bas</kbd>
              <span>
                Te placer, à gauche ou à droite de l'élan (ou les flèches ← →). Tu pars du milieu ; à ta première boule suivante, tu
                retrouves ta place et ta visée.
              </span>
            </li>
            <li>
              <kbd>Glisser en haut</kbd>
              <span>Viser : la flèche sur la piste tourne (ou les touches Q et D)</span>
            </li>
            <li>
              <kbd>Appuyer sur la boule</kbd>
              <span>
                Puis <strong>reculer</strong> (ton bras part en arrière), <strong>pousser vers l'avant et lâcher</strong> : plus ton geste
                est vif, plus la boule va vite. S'il part de travers, la boule aussi : après le lancer, on te dit de quel côté.
              </span>
            </li>
            <li>
              <kbd>Coup de poignet</kbd>
              <span>
                Juste avant de lâcher, un petit coup de côté donne de l'effet : vers la gauche, la boule glisse puis courbe vers la gauche
                en fin de piste. Avec un bon angle dans la poche (entre la quille de tête et la 3, ou la 2 pour un gaucher), les quilles
                tombent mieux.
              </span>
            </li>
          </ul>
          <p className="hint">
            Le début de la piste est huilé : la boule y glisse sans courber, puis mord le bois sec sur les six derniers mètres. Une boule
            lente courbe plus qu'une boule rapide. Pendant que les autres lancent, parie sur leur boule (strike, il en reste, la cata) et
            envoie des réactions : elles s'affichent au-dessus de ton personnage, sur la banquette.
          </p>
        </>
      )}
    </div>
  );
}
