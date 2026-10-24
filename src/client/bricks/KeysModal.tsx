import { useEffect, useState } from "react";
import { Check, Modal } from "../components/ui.tsx";
import { ACTION_LABELS, keyName, useControls } from "./controls.ts";
import type { InputAction } from "./local.ts";

type LayoutMap = Map<string, string>;

/** Touches réglables et maniement : on clique une action, on appuie sur la touche voulue. */
export function KeysModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { keys, das, arr, ghost, music, set, reset } = useControls();
  const [listening, setListening] = useState<InputAction | null>(null);
  const [layout, setLayout] = useState<LayoutMap | null>(null);

  // Le vrai nom des touches sur ce clavier (AZERTY compris), quand le navigateur sait le donner
  useEffect(() => {
    const kb = (navigator as unknown as { keyboard?: { getLayoutMap?: () => Promise<LayoutMap> } }).keyboard;
    kb?.getLayoutMap?.()
      .then(setLayout)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === "Escape") return setListening(null);
      // Une touche ne sert qu'à une action
      const next = Object.fromEntries(Object.entries(keys).map(([a, list]) => [a, list.filter((k) => k !== e.code)])) as Record<
        InputAction,
        string[]
      >;
      next[listening] = [e.code];
      set({ keys: next });
      setListening(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [listening, keys, set]);

  const label = (code: string) =>
    layout?.get(code)?.toUpperCase() && code.startsWith("Key") ? layout.get(code)!.toUpperCase() : keyName(code);

  return (
    <Modal open={open} onClose={onClose} title="Touches et réglages">
      <div className="keys-modal">
        <ul className="keys-list">
          {(Object.keys(ACTION_LABELS) as InputAction[]).map((a) => (
            <li key={a}>
              <span>{ACTION_LABELS[a]}</span>
              <button className={`btn btn-sm key-btn ${listening === a ? "is-listening" : ""}`} onClick={() => setListening(a)}>
                {listening === a ? "Appuie sur une touche…" : keys[a].map(label).join(" ou ") || "aucune"}
              </button>
            </li>
          ))}
        </ul>

        <div className="field">
          <span className="field-label">Délai avant répétition : {das} ms</span>
          <input type="range" min={50} max={250} step={1} value={das} onChange={(e) => set({ das: Number(e.target.value) })} />
        </div>
        <div className="field">
          <span className="field-label">Vitesse de répétition : {arr === 0 ? "instantanée" : `${arr} ms`}</span>
          <input type="range" min={0} max={60} step={1} value={arr} onChange={(e) => set({ arr: Number(e.target.value) })} />
        </div>

        <div className="rule-list">
          <div className="rule-row" onClick={() => set({ ghost: !ghost })}>
            <Check label="Pièce fantôme" checked={ghost} onChange={() => {}} />
            <span>
              <strong>Pièce fantôme</strong>
              <span className="hint">Montre où la pièce va tomber.</span>
            </span>
          </div>
          <div className="rule-row" onClick={() => set({ music: !music })}>
            <Check label="Musique" checked={music} onChange={() => {}} />
            <span>
              <strong>Musique</strong>
              <span className="hint">Elle accélère quand la pile monte trop haut.</span>
            </span>
          </div>
        </div>

        <button className="btn btn-ghost" onClick={reset}>
          Remettre les réglages d'origine
        </button>
      </div>
    </Modal>
  );
}
