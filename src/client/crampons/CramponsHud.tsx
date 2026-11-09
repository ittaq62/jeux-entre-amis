// L'affichage autour du match : le rappel des touches, qui change selon qu'on a le ballon, le mini-terrain, et l'aide.

import { useEffect, useRef } from "react";
import { HALF_L, HALF_W } from "../../shared/games/crampons/pitch.ts";
import type { Scheme } from "./controls.ts";

interface Hint {
  keys: string[];
  label: string;
}

const ATTACK: Record<Scheme, Hint[]> = {
  fleches: [
    { keys: ["Espace"], label: "Passe" },
    { keys: ["C"], label: "Tir" },
    { keys: ["X"], label: "En profondeur" },
    { keys: ["V"], label: "Lob, centre" },
    { keys: ["Maj"], label: "Sprint" },
  ],
  zqsd: [
    { keys: ["J"], label: "Passe" },
    { keys: ["K"], label: "Tir" },
    { keys: ["I"], label: "En profondeur" },
    { keys: ["L"], label: "Lob, centre" },
    { keys: ["Maj"], label: "Sprint" },
  ],
  souris: [
    { keys: ["Clic gauche"], label: "Passe" },
    { keys: ["Clic droit"], label: "Tir" },
    { keys: ["Molette"], label: "Lob, centre" },
    { keys: ["Maj"], label: "Sprint" },
  ],
  manette: [
    { keys: ["A"], label: "Passe" },
    { keys: ["B"], label: "Tir" },
    { keys: ["Y"], label: "En profondeur" },
    { keys: ["X"], label: "Lob, centre" },
    { keys: ["RB"], label: "Sprint" },
  ],
  tactile: [],
};

const DEFEND: Record<Scheme, Hint[]> = {
  fleches: [
    { keys: ["Espace"], label: "Presser, tacler" },
    { keys: ["C"], label: "Tacle glissé" },
    { keys: ["E"], label: "Changer de joueur" },
    { keys: ["Maj"], label: "Sprint" },
  ],
  zqsd: [
    { keys: ["J"], label: "Presser, tacler" },
    { keys: ["K"], label: "Tacle glissé" },
    { keys: ["U"], label: "Changer de joueur" },
    { keys: ["Maj"], label: "Sprint" },
  ],
  souris: [
    { keys: ["Clic gauche"], label: "Presser, tacler" },
    { keys: ["Clic droit"], label: "Tacle glissé" },
    { keys: ["E"], label: "Changer de joueur" },
    { keys: ["Maj"], label: "Sprint" },
  ],
  manette: [
    { keys: ["A"], label: "Presser, tacler" },
    { keys: ["B"], label: "Tacle glissé" },
    { keys: ["LB"], label: "Changer de joueur" },
    { keys: ["RB"], label: "Sprint" },
  ],
  tactile: [],
};

/** La touche à presser pour jouer une remise en jeu, selon la façon de jouer */
export function mainKey(scheme: Scheme): string {
  return scheme === "souris" ? "Clic gauche" : scheme === "zqsd" ? "J" : scheme === "manette" ? "A" : "Espace";
}

export function KeyHints({ scheme, defending }: { scheme: Scheme; defending: boolean }) {
  const list = (defending ? DEFEND : ATTACK)[scheme];
  if (list.length === 0) return null;
  return (
    <ul className="cr-hints" aria-hidden="true">
      {list.map((h) => (
        <li key={h.label}>
          {h.keys.map((k) => (
            <kbd key={k}>{k}</kbd>
          ))}
          <span>{h.label}</span>
        </li>
      ))}
    </ul>
  );
}

/** Le mini-terrain : tout le monde d'un seul coup d'œil */
export function Radar({ data, ballX, ballZ, colors }: { data: number[]; ballX: number; ballZ: number; colors: [string, string] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const g = c?.getContext("2d");
    if (!c || !g) return;
    const w = c.width;
    const h = c.height;
    const X = (x: number) => (x / (HALF_L * 2) + 0.5) * w;
    const Z = (z: number) => (z / (HALF_W * 2) + 0.5) * h;
    g.clearRect(0, 0, w, h);
    g.strokeStyle = "rgba(255,255,255,0.55)";
    g.lineWidth = 1.5;
    g.strokeRect(1, 1, w - 2, h - 2);
    g.beginPath();
    g.moveTo(w / 2, 0);
    g.lineTo(w / 2, h);
    g.stroke();
    g.beginPath();
    g.arc(w / 2, h / 2, h * 0.14, 0, Math.PI * 2);
    g.stroke();
    const boxW = (16.5 / (HALF_L * 2)) * w;
    const boxH = (40.3 / (HALF_W * 2)) * h;
    g.strokeRect(1, (h - boxH) / 2, boxW, boxH);
    g.strokeRect(w - boxW - 1, (h - boxH) / 2, boxW, boxH);
    for (let i = 0; i + 2 < data.length; i += 3) {
      const code = data[i + 2]!;
      const me = code >= 2;
      g.fillStyle = colors[code % 2]!;
      g.beginPath();
      g.arc(X(data[i]!), Z(data[i + 1]!), me ? 6 : 4, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = me ? 2.5 : 1;
      g.strokeStyle = me ? "#ffe066" : "rgba(0,0,0,0.6)";
      g.stroke();
    }
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.arc(X(ballX), Z(ballZ), 3.4, 0, Math.PI * 2);
    g.fill();
  }, [data, ballX, ballZ, colors]);
  return <canvas ref={ref} className="cr-radar" width={260} height={168} aria-hidden="true" />;
}

const ROWS: { label: string; note?: string; keys: string[][] }[] = [
  { label: "Se déplacer", keys: [["Flèches"], ["Z", "Q", "S", "D"]] },
  { label: "Passe", note: "ou presser sans le ballon", keys: [["Espace"], ["Clic gauche"]] },
  { label: "Tir", note: "tiens pour frapper fort, ou tacle glissé", keys: [["C"], ["Clic droit"]] },
  { label: "Sprint", keys: [["Maj"]] },
  { label: "Changer de joueur", keys: [["E"]] },
  { label: "Passe en profondeur", keys: [["X"]] },
  { label: "Lob ou centre", keys: [["V"], ["Molette"]] },
];

/** L'aide, affichée au premier match et accessible à tout moment */
export function HowTo({ touch, onClose }: { touch: boolean; onClose: () => void }) {
  return (
    <div className="cr-howto" role="dialog" aria-label="Comment jouer">
      <div className="cr-howto-card panel">
        <h2>Comment jouer</h2>
        {touch ? (
          <p>
            Le stick à gauche pour courir, le bouton jaune pour sprinter. À droite : passe, tir, passe en profondeur et lob. Sans le ballon,
            les boutons deviennent presser, tacle glissé et changer de joueur. Plus tu tiens un bouton, plus le geste est fort.
          </p>
        ) : (
          <>
            <table>
              <tbody>
                {ROWS.map((r) => (
                  <tr key={r.label}>
                    <th scope="row">
                      {r.label}
                      {r.note && <small>{r.note}</small>}
                    </th>
                    <td>
                      {r.keys.map((group, i) => (
                        <span key={i} className="cr-howto-keys">
                          {i > 0 && <em>ou</em>}
                          {group.map((k) => (
                            <kbd key={k}>{k}</kbd>
                          ))}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="hint">À la souris, ta passe ou ton tir part vers le curseur. Au clavier, vers la direction que tu tiens.</p>
          </>
        )}
        <button className="btn btn-primary" onClick={onClose}>
          C'est parti
        </button>
      </div>
    </div>
  );
}
