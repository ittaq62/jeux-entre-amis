// L'affichage autour du match : le rappel des touches, qui change selon qu'on a le ballon, le mini-terrain, et l'aide.

import { useEffect, useRef } from "react";
import { HALF_L, HALF_W } from "../../shared/games/crampons/pitch.ts";
import { keyLabel, type ActionId, type Bindings, type TouchPad } from "./bindings.ts";
import type { Scheme } from "./controls.ts";

interface Hint {
  keys: string[];
  label: string;
}

const PAD_ATTACK: Hint[] = [
  { keys: ["A"], label: "Passe" },
  { keys: ["B"], label: "Tir" },
  { keys: ["Y"], label: "En profondeur" },
  { keys: ["X"], label: "Lob, centre" },
  { keys: ["RB"], label: "Sprint" },
];

const PAD_DEFEND: Hint[] = [
  { keys: ["A"], label: "Presser, tacler" },
  { keys: ["B"], label: "Tacle glissé" },
  { keys: ["LB"], label: "Changer de joueur" },
  { keys: ["RB"], label: "Sprint" },
];

const ATTACK: [ActionId, string][] = [
  ["shoot", "Tir"],
  ["pass", "Passe"],
  ["through", "En profondeur"],
  ["lob", "Lob, centre"],
  ["skill", "Crochet"],
  ["sprint", "Sprint"],
];

const DEFEND: [ActionId, string][] = [
  ["pass", "Presser, tacler"],
  ["shoot", "Tacle glissé"],
  ["swap", "Changer de joueur"],
  ["sprint", "Sprint"],
];

/** La touche à presser pour jouer une remise en jeu */
export function mainKey(scheme: Scheme, bindings: Bindings, shot: boolean): string {
  if (scheme === "manette") return shot ? "B" : "A";
  const list = shot ? bindings.shoot : bindings.pass;
  return list[0] ? keyLabel(list[0]) : "Passe";
}

export function KeyHints({ scheme, defending, bindings }: { scheme: Scheme; defending: boolean; bindings: Bindings }) {
  if (scheme === "tactile") return null;
  const list: Hint[] =
    scheme === "manette"
      ? defending
        ? PAD_DEFEND
        : PAD_ATTACK
      : (defending ? DEFEND : ATTACK)
          .filter(([id]) => bindings[id][0])
          .map(([id, label]) => ({ keys: [keyLabel(bindings[id][0]!)], label }));
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

/** L'aide, affichée au premier match et accessible à tout moment */
export function HowTo({
  touch,
  touchPad,
  bindings,
  onClose,
  onSettings,
}: {
  touch: boolean;
  touchPad: TouchPad;
  bindings: Bindings;
  onClose: () => void;
  onSettings: () => void;
}) {
  const label = (id: ActionId) => bindings[id].slice(0, 1).map(keyLabel);
  const moves = [bindings.up, bindings.left, bindings.down, bindings.right].map((b) => (b[0] ? keyLabel(b[0]) : "—"));
  const rows: { label: string; note?: string; keys: string[] }[] = [
    { label: "Se déplacer", keys: moves },
    { label: "Tir", note: "tiens pour frapper fort · sans le ballon : tacle glissé", keys: label("shoot") },
    { label: "Passe", note: "vers le joueur désigné en bleu · sans le ballon : presser et tacler", keys: label("pass") },
    { label: "Sprint", keys: label("sprint") },
    { label: "Passe en profondeur", keys: label("through") },
    { label: "Lob ou centre", keys: label("lob") },
    { label: "Crochet", note: "un coup d'accélération balle au pied, qui évite le tacle", keys: label("skill") },
    { label: "Changer de joueur", keys: label("swap") },
  ];
  return (
    <div className="cr-howto" role="dialog" aria-label="Comment jouer">
      <div className="cr-howto-card panel">
        <h2>Comment jouer</h2>
        {touch ? (
          <ul className="cr-howto-touch">
            <li>
              <b>Courir</b> : pose le pouce n'importe où en bas à gauche, le stick apparaît dessous. Pousse jusqu'au grand cercle pour
              sprinter.
            </li>
            {touchPad === "simple" ? (
              <li>
                <b>Passe</b> : appuie pour une passe vers le joueur entouré de bleu. Tiens-la puis lâche : passe en profondeur (un centre,
                sur un corner).
              </li>
            ) : (
              <li>
                <b>Passe</b>, <b>Profond.</b> (dans la course) et <b>Lob</b> (par-dessus, ou un centre). <b>Effet</b> et <b>Piqué</b>{" "}
                changent ton prochain tir.
              </li>
            )}
            <li>
              <b>Tir</b> : plus tu le tiens, plus tu frappes fort.
            </li>
            <li>
              <b>Sans le ballon</b> : <b>Presser</b> (tiens-le, ton joueur fonce sur le porteur et tacle), <b>Tacle</b> (glissé) et{" "}
              <b>Changer</b> de joueur.
            </li>
          </ul>
        ) : (
          <>
            <table>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label}>
                    <th scope="row">
                      {r.label}
                      {r.note && <small>{r.note}</small>}
                    </th>
                    <td>
                      <span className="cr-howto-keys">
                        {r.keys.map((k) => (
                          <kbd key={k}>{k}</kbd>
                        ))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="hint">
              Ta passe et ton tir partent vers la mire blanche. Le joueur entouré de bleu est celui qui recevra le ballon.
            </p>
          </>
        )}
        <div className="cr-settings-actions">
          {!touch && (
            <button className="btn" onClick={onSettings}>
              Changer mes touches
            </button>
          )}
          <button className="btn btn-primary" onClick={onClose}>
            C'est parti
          </button>
        </div>
      </div>
    </div>
  );
}
