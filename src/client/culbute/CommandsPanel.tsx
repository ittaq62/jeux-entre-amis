// Les commandes : une disposition toute faite, ou chaque touche une par une (touche du clavier ou bouton de souris),
// enregistrées sur l'appareil, avec un retour aux touches de départ.

import { useEffect, useState } from "react";
import {
  ACTION_ROWS,
  assignBinding,
  clearBinding,
  defaultSettings,
  keyLabel,
  loadSettings,
  PRESETS,
  saveSettings,
  unbound,
  type ActionId,
  type CulbuteSettings,
} from "./bindings.ts";

export function CommandsPanel({
  touch,
  settings,
  onChange,
  onClose,
}: {
  /** Au doigt : on règle le saut au stick ; les touches restent réglables pour un clavier branché */
  touch: boolean;
  settings: CulbuteSettings;
  onChange: (s: CulbuteSettings) => void;
  onClose: () => void;
}) {
  const [capture, setCapture] = useState<{ action: ActionId; slot: number } | null>(null);

  const update = (next: CulbuteSettings) => {
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
      // Le clic gauche qui suit ne doit pas relancer la capture sur la case qu'il survole
      if (e.button === 0) {
        window.addEventListener("click", stop, { capture: true, once: true });
        setTimeout(() => window.removeEventListener("click", stop, true), 400);
      }
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

  const missing = unbound(settings);

  return (
    <div className="cb-help-backdrop" onClick={onClose}>
      <div className="panel panel-pad cb-commands" role="dialog" aria-label="Commandes" onClick={(e) => e.stopPropagation()}>
        <h2>Commandes</h2>

        {touch && (
          <section>
            <h3>Au doigt</h3>
            <label className="cb-check">
              <input type="checkbox" checked={settings.stickJump} onChange={(e) => update({ ...settings, stickJump: e.target.checked })} />
              <span>Sauter en poussant le stick vers le haut (le bouton Saut disparaît)</span>
            </label>
          </section>
        )}

        <section>
          <h3>Disposition</h3>
          <div className="cb-presets">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={settings.preset === p.id ? "is-on" : ""}
                onClick={() => update({ ...settings, preset: p.id, bindings: structuredClone(p.bindings) })}
              >
                <strong>{p.name}</strong>
                <small>{p.note}</small>
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3>Touches</h3>
          <p className="hint">Clique sur une case, puis appuie sur la touche ou le bouton de souris que tu veux (Échap pour annuler).</p>
          <table className="cb-bindings">
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
                          <button
                            type="button"
                            className={`cb-bind ${active ? "is-wait" : ""}`}
                            onClick={() => setCapture({ action: row.id, slot: Math.min(slot, list.length) })}
                          >
                            {active ? "Appuie…" : value ? keyLabel(value) : "—"}
                          </button>
                          {value && !active && (list.length > 1 || slot > 0) && (
                            <button
                              type="button"
                              className="cb-unbind"
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
          {missing.length > 0 && (
            <p className="cb-warn">
              Sans touche : {missing.map((id) => ACTION_ROWS.find((r) => r.id === id)!.label).join(", ")}. Donne-leur une touche pour
              pouvoir jouer.
            </p>
          )}
          <label className="cb-check">
            <input type="checkbox" checked={settings.upJumps} onChange={(e) => update({ ...settings, upJumps: e.target.checked })} />
            <span>La touche Haut fait aussi sauter</span>
          </label>
          <p className="hint">
            La manette marche toujours : stick gauche, A pour sauter, X pour frapper, B pour le spécial, la gâchette haute droite pour
            saisir, une autre gâchette pour la garde.
          </p>
        </section>

        <div className="cb-commands-actions">
          <button type="button" className="btn" onClick={() => update({ ...defaultSettings(), stickJump: settings.stickJump })}>
            Remettre les touches de départ
          </button>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

/** Au salon : un bouton qui ouvre les commandes */
export function CommandsButton() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<CulbuteSettings>(loadSettings);
  const touch = typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)").matches ?? false);
  return (
    <>
      <button type="button" className="btn btn-sm cb-commands-btn" onClick={() => (setSettings(loadSettings()), setOpen(true))}>
        Régler les commandes
      </button>
      {open && <CommandsPanel touch={touch} settings={settings} onChange={setSettings} onClose={() => setOpen(false)} />}
    </>
  );
}
