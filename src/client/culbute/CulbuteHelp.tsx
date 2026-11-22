import { bindingText, loadSettings, type CulbuteSettings } from "./bindings.ts";

/** Comment on joue : la règle en deux phrases, puis les commandes (celles réglées sur cet appareil), à la manette et au doigt */
export function HowToPlay({ compact = false, settings }: { compact?: boolean; settings?: CulbuteSettings }) {
  const s = settings ?? loadSettings();
  const move = [bindingText(s, "left"), bindingText(s, "right"), bindingText(s, "up"), bindingText(s, "down")];
  const rows = [
    { keys: move.join(" · "), what: "Se déplacer (et diriger les coups)" },
    { keys: bindingText(s, "attack"), what: "Frapper, aussitôt (en courant : coup en courant ; vite plusieurs fois : ça enchaîne)" },
    { keys: bindingText(s, "strong"), what: "Coup fort, tout de suite (tenir pour le charger)" },
    { keys: bindingText(s, "special"), what: "Spécial (haut + Spécial : remonter)" },
    {
      keys: bindingText(s, "jump"),
      what: `Sauter, deux fois${s.upJumps ? " (la touche Haut aussi ; Haut avec un coup : le coup vers le haut)" : ""}`,
    },
    { keys: bindingText(s, "shield"), what: "Garde (+ direction : esquive ; levée juste avant le coup : parade)" },
    {
      keys: bindingText(s, "grab"),
      what: "Ramasser l'objet à ses pieds (ou attraper au vol), lancer celui qu'on tient ; sinon saisir (aussi : Frapper pendant la garde), puis une direction pour projeter",
    },
    { keys: bindingText(s, "taunt"), what: "Narguer (pour rire)" },
  ];
  return (
    <div className={`cb-howto ${compact ? "is-compact" : ""}`}>
      <p>
        <strong>Fais culbuter les autres hors de l'arène.</strong> Chaque coup reçu fait monter les pourcents ; plus ils sont hauts, plus on
        vole loin. On perd une vie en sortant des limites. Pour revenir : saute deux fois, puis le spécial vers le haut, et accroche-toi au
        rebord.
      </p>
      {!compact && (
        <>
          <ul className="cb-keys">
            {rows.map((k) => (
              <li key={k.what}>
                <kbd>{k.keys}</kbd>
                <span>{k.what}</span>
              </li>
            ))}
          </ul>
          <p className="hint">
            Les coups suivent la direction : de côté, vers le haut, vers le bas, ou sans rien. En l'air, ce sont d'autres coups. Vers le bas
            en l'air, on tombe plus vite ; debout sur une planche, vers le bas, on passe au travers. Saut et Frapper en même temps : un
            petit saut avec une attaque en l'air.
          </p>
          <p className="hint">
            La garde s'use et rétrécit ; levée au tout dernier moment, elle pare le coup (un tintement clair) et l'attaquant reste figé un
            instant : à toi de punir. Un même coup répété s'use aussi, il pousse moins : varie tes attaques. Éjecté, tiens la direction en
            travers de ta trajectoire (vers le haut, vers l'arène) : tu iras un peu moins loin.
          </p>
          <p className="hint">
            À la manette : stick gauche, A pour sauter, X pour frapper, le stick droit pour le coup fort, B pour le spécial, la gâchette
            haute droite pour saisir et ramasser, une autre gâchette pour la garde, Retour pour narguer. Au doigt : le pouce gauche se pose n'importe où
            pour diriger, à droite Frapper (garde le doigt dessus pour le coup fort), Spécial, Saut et Saisir (qui ramasse aussi les objets) ; pose le pouce sur Frapper et Spécial
            à la fois pour te protéger (avec une direction : une esquive).
          </p>
        </>
      )}
    </div>
  );
}
