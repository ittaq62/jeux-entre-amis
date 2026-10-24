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
