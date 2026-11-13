// L'illustration de Crampons sur l'accueil : une image du jeu lui-même, composée avec son moteur (DevAffiche) — un soir de
// match, la frappe du numéro 9 file en lucarne, le gardien s'envole. La 3D ne se charge qu'à table.

import "./crampons.css";

export function CramponsPreview() {
  return (
    <div className="crampons-preview">
      <img src="/crampons-apercu.webp" width={1200} height={900} alt="" loading="lazy" decoding="async" />
    </div>
  );
}
