import { bindingText, loadSettings, type CulbuteSettings } from "./bindings.ts";

/** Comment on joue : la règle en deux phrases, puis les commandes (celles réglées sur cet appareil), à la manette et au doigt */
export function HowToPlay({ compact = false, settings }: { compact?: boolean; settings?: CulbuteSettings }) {
  const s = settings ?? loadSettings();
  const move = [bindingText(s, "left"), bindingText(s, "right"), bindingText(s, "up"), bindingText(s, "down")];
  const rows = [
    { keys: move.join(" · "), what: "Se déplacer (et diriger les coups)" },
    { keys: bindingText(s, "attack"), what: "Frapper (tenir : coup chargé)" },
    { keys: bindingText(s, "special"), what: "Spécial (haut + Spécial : remonter)" },
    { keys: bindingText(s, "jump"), what: `Sauter, deux fois${s.upJumps ? " (la touche Haut aussi)" : ""}` },
    { keys: bindingText(s, "shield"), what: "Garde (+ direction : esquive)" },
    { keys: bindingText(s, "grab"), what: "Saisir (aussi : Frapper pendant la garde), puis une direction pour projeter" },
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
            en l'air, on tombe plus vite ; debout sur une planche, vers le bas, on passe au travers.
          </p>
          <p className="hint">
            À la manette : stick gauche, A pour sauter, X pour frapper, B pour le spécial, la gâchette haute droite pour saisir, une autre
            gâchette pour la garde. Au doigt : le pouce gauche se pose n'importe où pour diriger, à droite Frapper, Spécial et Saut ; pose
            le pouce sur Frapper et Spécial à la fois pour te protéger (avec une direction : une esquive).
          </p>
        </>
      )}
    </div>
  );
}
