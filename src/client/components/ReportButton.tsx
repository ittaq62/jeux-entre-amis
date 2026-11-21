import { lazy, Suspense, useEffect, useState } from "react";
import type { ReportContext } from "../../shared/report.ts";
import { useReport } from "../stores/report.ts";
import { useTourBridge } from "../tour/bridge.ts";
import { Icon } from "./Icon.tsx";

const ReportDialog = lazy(() => import("./ReportDialog.tsx").then((m) => ({ default: m.ReportDialog })));

/**
 * « Signaler un problème » : il ouvre la fenêtre de signalement. Sous les boutons des écrans de fin (`look` « link »), ou
 * comme une ligne des menus de partie (`look` « menu », `onOpen` referme le menu). Dans une tournée, le code de la
 * tournée part avec celui de la table.
 */
export function ReportButton({
  tour,
  look = "link",
  onOpen,
  className,
  ...context
}: Omit<ReportContext, "tour"> & { tour?: string | null; look?: "link" | "menu" | "icon"; onOpen?: () => void; className?: string }) {
  const bridge = useTourBridge();
  const open = useReport((s) => s.open);
  const go = () => {
    onOpen?.();
    open({ ...context, tour: tour ?? bridge?.code ?? null });
  };
  if (look === "icon") {
    // Une barre d'outils en partie (Crampons) : le drapeau seul, nommé pour les lecteurs d'écran et au survol
    return (
      <button type="button" className={className} onClick={go} aria-label="Signaler un problème" title="Signaler un problème">
        <Icon name="flag" size={18} />
      </button>
    );
  }
  if (look === "menu") {
    return (
      <button type="button" className="menu-item" onClick={go}>
        <Icon name="flag" size={18} /> Signaler un problème
      </button>
    );
  }
  return (
    <button type="button" className="report-link" onClick={go}>
      <Icon name="flag" size={15} />
      Signaler un problème
    </button>
  );
}

/** La fenêtre, chargée la première fois qu'on l'ouvre, puis gardée : elle survit à la fin d'une table */
export function ReportHost() {
  const opened = useReport((s) => s.context !== null);
  const [needed, setNeeded] = useState(false);
  useEffect(() => {
    if (opened) setNeeded(true);
  }, [opened]);
  if (!needed) return null;
  return (
    <Suspense fallback={null}>
      <ReportDialog />
    </Suspense>
  );
}
