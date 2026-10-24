import { useEffect, useState } from "react";

/** Secondes restantes jusqu'à une heure du serveur (null s'il n'y a rien à attendre). */
export function useCountdown(target: number | null, offset: number): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [target]);
  return target ? Math.max(0, Math.ceil((target - (now + offset)) / 1000)) : null;
}

export function formatClock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Un temps de solo, au centième : « 52,31 s » ou « 1 min 04,20 s » */
export function formatSprint(ms: number): string {
  const s = ms / 1000;
  return s >= 60
    ? `${Math.floor(s / 60)} min ${(s % 60).toFixed(2).padStart(5, "0").replace(".", ",")} s`
    : `${s.toFixed(2).replace(".", ",")} s`;
}
