import { KEY_HELP } from "./controls.ts";

/** Comment on joue : la règle en deux phrases, puis les commandes au clavier, à la manette et au doigt */
export function HowToPlay({ compact = false }: { compact?: boolean }) {
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
            {KEY_HELP.map((k) => (
              <li key={k.keys}>
                <kbd>{k.keys}</kbd>
                <span>{k.what}</span>
              </li>
            ))}
          </ul>
          <p className="hint">
            Les coups suivent la direction : de côté, vers le haut, vers le bas, ou sans rien. En l'air, ce sont d'autres coups. Le stick
            vers le bas en l'air fait tomber plus vite ; sur une plateforme fine, un coup vers le bas la traverse.
          </p>
          <p className="hint">
            À la manette : stick gauche, A pour sauter, X pour frapper, B pour le spécial, une gâchette pour la garde. Au doigt : le pouce
            gauche se pose n'importe où pour diriger, à droite Frapper, Spécial et Saut ; pose le pouce sur Frapper et Spécial à la fois
            pour te protéger (avec une direction : une esquive).
          </p>
        </>
      )}
    </div>
  );
}
