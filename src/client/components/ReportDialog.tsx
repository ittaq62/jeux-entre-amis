import { useEffect, useMemo, useState, type FormEvent } from "react";
import { TABLE_NAMES } from "../../shared/protocol.ts";
import {
  describeDevice,
  deviceLine,
  REPORT_MAX,
  REPORT_MIN,
  type ReportContext,
  type ReportDevice,
  type ReportKind,
} from "../../shared/report.ts";
import { api, ApiError } from "../lib/api.ts";
import { useReport } from "../stores/report.ts";
import { Modal, Options } from "./ui.tsx";

const KINDS: { value: ReportKind; label: string }[] = [
  { value: "bug", label: "Un bug" },
  { value: "problem", label: "Un problème" },
  { value: "idea", label: "Une idée" },
];

const PROMPTS: Record<ReportKind | "", string> = {
  "": "Choisis d'abord ce que tu signales.",
  bug: "Ce qui s'est passé, et ce que tu attendais à la place…",
  problem: "Ce qui t'a gêné pendant la partie…",
  idea: "Ce qui rendrait le jeu meilleur…",
};

/** Ouverte depuis une page du site (le menu du compte), hors d'une partie */
const SITE_PROMPTS: Record<ReportKind | "", string> = {
  ...PROMPTS,
  problem: "Ce qui t'a gêné sur le site…",
  idea: "Ce qui rendrait le site meilleur…",
};

/** Ce que le navigateur dit de l'appareil, au moment d'ouvrir la fenêtre */
function readDevice(): ReportDevice {
  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  return {
    ...describeDevice({ ua: nav.userAgent, touchPoints: nav.maxTouchPoints ?? 0, mobile: nav.userAgentData?.mobile }),
    screen: { w: window.screen.width, h: window.screen.height },
    view: { w: window.innerWidth, h: window.innerHeight },
  };
}

/** « UNO classique, table ABCD, tournée WXYZ » */
function whereLine(context: ReportContext): string {
  const what = context.variant ?? (context.game ? TABLE_NAMES[context.game] : null);
  return [what, context.code && `table ${context.code}`, context.tour && `tournée ${context.tour}`].filter(Boolean).join(", ");
}

/** La fenêtre « Signaler un problème », ouverte depuis une partie, sa fin, une tournée, ou le menu du compte. */
export function ReportDialog() {
  const context = useReport((s) => s.context);
  const close = useReport((s) => s.close);
  const [kind, setKind] = useState<ReportKind | "">("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  // Fermée sans envoyer, elle garde le brouillon ; après un envoi, elle repart de zéro
  useEffect(() => {
    if (!context || !sent) return;
    setSent(false);
    setKind("");
    setMessage("");
  }, [context]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setError(null), [context]);
  const device = useMemo(() => (context ? readDevice() : null), [context]);

  const length = message.trim().length;
  const ready = kind !== "" && length >= REPORT_MIN && length <= REPORT_MAX;

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!context || !device || !ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/reports", { kind, message, context, device, version: __SITE_VERSION__ });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "L'envoi n'a pas marché. Réessaie dans un instant.");
    }
    setBusy(false);
  }

  return (
    <Modal open={context !== null} onClose={close} title={sent ? "Merci !" : "Signaler un problème"}>
      {sent ? (
        <div className="report-thanks">
          <p>
            Ton signalement est bien arrivé. L'administrateur du site le lira, et s'en servira pour corriger ou améliorer{" "}
            {context?.game ? "le jeu" : "le site"}.
          </p>
          <button className="btn btn-primary" onClick={close} autoFocus>
            Fermer
          </button>
        </div>
      ) : (
        context &&
        device && (
          <form className="report-form" onSubmit={send}>
            <Options label="Ce que tu signales" value={kind} options={KINDS} onChange={setKind} disabled={busy} />
            <label className="field">
              <span className="visually-hidden">Explication</span>
              <textarea
                className="input report-text"
                value={message}
                maxLength={REPORT_MAX}
                rows={5}
                disabled={busy}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={(context.game ? PROMPTS : SITE_PROMPTS)[kind]}
              />
            </label>
            <p className="report-joined">
              Joint : {whereLine(context) || "la page"} · {deviceLine(device)} · version du site. Rien d'autre.
            </p>
            {error && <p className="error-text report-error">{error}</p>}
            <div className="report-foot">
              <span className="hint num">
                {length < REPORT_MIN ? `${REPORT_MIN} caractères au moins` : `${message.length} / ${REPORT_MAX}`}
              </span>
              <span className="row-actions">
                <button type="button" className="btn btn-ghost" onClick={close}>
                  Annuler
                </button>
                <button className="btn btn-primary" disabled={!ready || busy}>
                  {busy ? <span className="spinner" /> : "Envoyer"}
                </button>
              </span>
            </div>
          </form>
        )
      )}
    </Modal>
  );
}
