// Les réglages du joueur : choisir une disposition toute faite, ou changer chaque touche une par une.

import { useEffect, useState } from "react";
import {
  ACTION_ROWS,
  assignBinding,
  clearBinding,
  defaultSettings,
  keyLabel,
  PRESETS,
  saveSettings,
  type ActionId,
  type CramponsSettings,
  type Quality,
} from "./bindings.ts";

const QUALITIES: { id: Quality; label: string }[] = [
  { id: "auto", label: "Automatique" },
  { id: "haute", label: "Haute" },
  { id: "moyenne", label: "Moyenne" },
  { id: "basse", label: "Basse" },
];

export function SettingsPanel({
  settings,
  onChange,
  onClose,
}: {
  settings: CramponsSettings;
  onChange: (s: CramponsSettings) => void;
  onClose: () => void;
}) {
  const [capture, setCapture] = useState<{ action: ActionId; slot: number } | null>(null);

  const update = (next: CramponsSettings) => {
    saveSettings(next);
    onChange(next);
  };

  useEffect(() => {
    if (!capture) return;
    const stop = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const take = (code: string) => {
      update(assignBinding(settings, capture.action, capture.slot, code));
      setCapture(null);
    };
    const onKey = (e: KeyboardEvent) => {
      stop(e);
      if (e.code === "Escape") setCapture(null);
      else take(e.code);
    };
    const onMouse = (e: MouseEvent) => {
      stop(e);
      take(`Mouse${e.button}`);
    };
    // Écouté avant tout le reste : la touche choisie ne doit rien déclencher d'autre
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("mousedown", onMouse, true);
    window.addEventListener("contextmenu", stop, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("mousedown", onMouse, true);
      setTimeout(() => window.removeEventListener("contextmenu", stop, true), 50);
    };
    // Une seule capture à la fois : les réglages en cours sont ceux du moment où elle a commencé
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capture]);

  return (
    <div className="cr-howto" role="dialog" aria-label="Réglages">
      <div className="cr-settings panel">
        <h2>Réglages</h2>

        <section>
          <h3>Disposition</h3>
          <div className="cr-presets">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                className={settings.preset === p.id ? "is-on" : ""}
                onClick={() => update({ ...settings, preset: p.id, bindings: structuredClone(p.bindings), aim: p.aim })}
              >
                <strong>{p.name}</strong>
                <small>{p.note}</small>
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3>Touches</h3>
          <p className="hint">Clique sur une case, puis appuie sur la touche ou le bouton de souris que tu veux.</p>
          <table className="cr-bindings">
            <tbody>
              {ACTION_ROWS.map((row) => {
                const list = settings.bindings[row.id];
                return (
                  <tr key={row.id}>
                    <th scope="row">
                      {row.label}
                      {row.note && <small>{row.note}</small>}
                    </th>
                    {[0, 1].map((slot) => {
                      const active = capture?.action === row.id && capture.slot === slot;
                      const value = list[slot];
                      return (
                        <td key={slot}>
                          <button className={`cr-bind ${active ? "is-wait" : ""}`} onClick={() => setCapture({ action: row.id, slot })}>
                            {active ? "Appuie…" : value ? keyLabel(value) : "—"}
                          </button>
                          {value && slot === 1 && !active && (
                            <button
                              className="cr-unbind"
                              onClick={() => update(clearBinding(settings, row.id, slot))}
                              aria-label={`Retirer ${keyLabel(value)}`}
                            >
                              ×
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section>
          <h3>Viser</h3>
          <div className="cr-choice">
            <button className={settings.aim === "curseur" ? "is-on" : ""} onClick={() => update({ ...settings, aim: "curseur" })}>
              Avec le curseur
            </button>
            <button className={settings.aim === "direction" ? "is-on" : ""} onClick={() => update({ ...settings, aim: "direction" })}>
              Dans le sens de la course
            </button>
          </div>
        </section>

        <section>
          <h3>Qualité de l'image</h3>
          <div className="cr-choice">
            {QUALITIES.map((q) => (
              <button
                key={q.id}
                className={settings.quality === q.id ? "is-on" : ""}
                onClick={() => update({ ...settings, quality: q.id })}
              >
                {q.label}
              </button>
            ))}
          </div>
          <label className="cr-check">
            <input type="checkbox" checked={settings.commentary} onChange={(e) => update({ ...settings, commentary: e.target.checked })} />
            Le commentateur raconte le match (voix de ton navigateur)
          </label>
          <label className="cr-check">
            <input type="checkbox" checked={settings.showFps} onChange={(e) => update({ ...settings, showFps: e.target.checked })} />
            Afficher les images par seconde et le temps de réponse
          </label>
        </section>

        <div className="cr-settings-actions">
          <button className="btn" onClick={() => update(defaultSettings())}>
            Tout remettre par défaut
          </button>
          <button className="btn btn-primary" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
