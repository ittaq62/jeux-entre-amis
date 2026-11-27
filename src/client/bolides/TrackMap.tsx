import { useMemo } from "react";
import { getTrack, type TrackId } from "../../shared/games/bolides/track.ts";

/** Le tracé d'un circuit en petit, pour le choisir */
export function TrackMap({ id, className = "" }: { id: TrackId; className?: string }) {
  const path = useMemo(() => {
    const t = getTrack(id);
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < t.n; i++) {
      minX = Math.min(minX, t.x[i]!);
      maxX = Math.max(maxX, t.x[i]!);
      minZ = Math.min(minZ, t.z[i]!);
      maxZ = Math.max(maxZ, t.z[i]!);
    }
    const size = Math.max(maxX - minX, maxZ - minZ) + 20;
    const ox = (minX + maxX) / 2 - size / 2;
    const oz = (minZ + maxZ) / 2 - size / 2;
    const pts: string[] = [];
    for (let i = 0; i < t.n; i += 3)
      pts.push(`${(((t.x[i]! - ox) / size) * 100).toFixed(1)},${(((t.z[i]! - oz) / size) * 100).toFixed(1)}`);
    return { d: `M${pts.join("L")}Z`, sx: ((t.x[0]! - ox) / size) * 100, sz: ((t.z[0]! - oz) / size) * 100 };
  }, [id]);
  return (
    <svg className={`track-map ${className}`} viewBox="-4 -4 108 108" aria-hidden="true">
      <path d={path.d} className="track-map-edge" />
      <path d={path.d} className="track-map-road" />
      <circle cx={path.sx} cy={path.sz} r="4" className="track-map-start" />
    </svg>
  );
}
