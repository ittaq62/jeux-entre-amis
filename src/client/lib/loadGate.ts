// Le chargement de tous avant le départ, côté joueur (voir shared/loadGate.ts) : dire « chargé » au serveur une fois
// son jeu prêt (et le redire, au cas où le message se perdrait dans une coupure), et suivre le compte à rebours.

import { useEffect, useState } from "react";
import { gatePassed, stillLoading, type LoadGate } from "../../shared/loadGate.ts";

/** Le temps qu'on attend avant de redire « chargé » si le serveur ne l'a pas noté */
const AGAIN_MS = 2500;

/** Son jeu est prêt : on le dit au serveur tant qu'il nous attend (`me` : son siège, ou null pour un spectateur) */
export function useLoadedSignal(
  gate: LoadGate | null | undefined,
  me: string | null,
  ready: boolean,
  send: (msg: { t: "loaded"; gate: number }) => void,
) {
  const waitingForMe = Boolean(ready && gate && me !== null && stillLoading(gate).includes(me) && !gate.loaded.includes(me));
  const id = gate?.id ?? 0;
  useEffect(() => {
    if (!waitingForMe) return;
    const tell = () => send({ t: "loaded", gate: id });
    tell();
    const again = window.setInterval(tell, AGAIN_MS);
    return () => window.clearInterval(again);
  }, [waitingForMe, id, send]);
}

/** Où en est le départ, à l'heure du serveur : passé, ou le compte à rebours, ou le temps qu'on attend encore au plus */
export interface GateClock {
  /** La partie tourne (pas de chargement, ou compte à rebours fini) */
  passed: boolean;
  /** Les secondes du compte à rebours (3, 2, 1), ou null avant qu'il parte */
  countdown: number | null;
  /** Les secondes qu'on attendra encore les retardataires, au plus */
  left: number | null;
}

export function gateClock(gate: LoadGate | null | undefined, serverNow: number): GateClock {
  if (gatePassed(gate, serverNow)) return { passed: true, countdown: null, left: null };
  const g = gate!;
  if (g.goAt !== null) return { passed: false, countdown: Math.max(1, Math.ceil((g.goAt - serverNow) / 1000)), left: null };
  return { passed: false, countdown: null, left: Math.max(0, Math.ceil((g.until - serverNow) / 1000)) };
}

/** Le même, qui se tient à jour (quatre fois par seconde tant que la partie n'est pas partie) */
export function useGateClock(gate: LoadGate | null | undefined, serverOffset: number): GateClock {
  const [now, setNow] = useState(() => Date.now());
  const clock = gateClock(gate, now + serverOffset);
  useEffect(() => {
    if (clock.passed) return;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [clock.passed]);
  return clock;
}
