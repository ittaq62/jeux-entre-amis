import { lazy, Suspense, useEffect, useState } from "react";
import type { ReportContext } from "../../shared/report.ts";
import { useReport } from "../stores/report.ts";
import { useTourBridge } from "../tour/bridge.ts";
import { Icon } from "./Icon.tsx";

const ReportDialog = lazy(() => import("./ReportDialog.tsx").then((m) => ({ default: m.ReportDialog })));

/**
 * Le petit bouton des écrans de fin, sous ceux de la partie : il ouvre la fenêtre « Signaler un problème ».
 * Dans une tournée, le code de la tournée part avec celui de la table.
 */
export function ReportButton({ tour, ...context }: Omit<ReportContext, "tour"> & { tour?: string | null }) {
  const bridge = useTourBridge();
  const open = useReport((s) => s.open);
  return (
    <button type="button" className="report-link" onClick={() => open({ ...context, tour: tour ?? bridge?.code ?? null })}>
      <Icon name="flag" size={14} />
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
