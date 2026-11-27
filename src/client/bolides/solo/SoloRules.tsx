// Le salon de Bolides, côté solo : le choix du mode (course libre, championnat, contre-la-montre), les coupes du
// championnat avec leurs étoiles, la grille des circuits avec les étoiles du contre-la-montre et les temps à battre.

import {
  CUP_IDS,
  CUPS,
  chronoKey,
  cupKey,
  cupOpen,
  EMPTY_PROGRESS,
  type BolidesProgress,
  type CupId,
} from "../../../shared/games/bolides/campaign.ts";
import type { RaceMode } from "../../../shared/games/bolides/race.ts";
import { mirrorOf, TRACK_IDS, TRACKS, type BaseTrackId, type TrackId } from "../../../shared/games/bolides/track.ts";
import { Icon } from "../../components/Icon.tsx";
import { TrackMap } from "../TrackMap.tsx";
import { raceTime, Stars } from "./Stars.tsx";
import "./solo.css";

/** La couleur de chaque coupe (son bandeau, son trophée) */
export const CUP_COLORS: Record<CupId, string> = { galet: "#7fd4c1", lanterne: "#f2a93b", comete: "#7d8cff", miroir: "#cfe3f2" };

const MODES: { value: RaceMode; label: string; hint: string }[] = [
  { value: "course", label: "Course libre", hint: "Entre amis, avec des bots si tu veux" },
  { value: "championnat", label: "Championnat", hint: "Seul, quatre coupes à ouvrir une à une" },
  { value: "chrono", label: "Contre-la-montre", hint: "Seul contre les fantômes" },
];

/** Toutes les étoiles d'un genre (« coupe: » ou « chrono: ») */
function starsOf(p: BolidesProgress, prefix: string): number {
  return Object.entries(p.stars).reduce((sum, [k, n]) => (k.startsWith(prefix) ? sum + n : sum), 0);
}

export function ModePicker({
  mode,
  progress,
  disabled,
  onChange,
}: {
  mode: RaceMode;
  progress: BolidesProgress | null;
  disabled: boolean;
  onChange: (mode: RaceMode) => void;
}) {
  const p = progress ?? EMPTY_PROGRESS;
  const total: Record<RaceMode, string | null> = {
    course: null,
    championnat: `${starsOf(p, "coupe:")} / ${CUP_IDS.length * 3}`,
    chrono: `${starsOf(p, "chrono:")} / ${TRACK_IDS.length * 2 * 3}`,
  };
  return (
    <div className="bol-modes" role="radiogroup" aria-label="Mode de jeu">
      {MODES.map((m) => (
        <button
          key={m.value}
          type="button"
          role="radio"
          aria-checked={mode === m.value}
          className={`bol-mode ${mode === m.value ? "is-on" : ""}`}
          disabled={disabled}
          onClick={() => onChange(m.value)}
        >
          <strong>{m.label}</strong>
          <small>{m.hint}</small>
          {total[m.value] && (
            <span className="bol-mode-stars num">
              <Stars n={1} size={13} className="is-one" /> {total[m.value]}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/** Les quatre coupes : ouvertes ou non, leurs circuits, les étoiles gagnées */
export function CupGrid({
  value,
  progress,
  disabled,
  onChange,
}: {
  value: CupId;
  progress: BolidesProgress | null;
  disabled: boolean;
  onChange: (cup: CupId) => void;
}) {
  const p = progress ?? EMPTY_PROGRESS;
  return (
    <div className="bol-cups" role="radiogroup" aria-label="Coupe">
      {CUP_IDS.map((id) => {
        const cup = CUPS[id];
        const open = cupOpen(p, id);
        const stars = p.stars[cupKey(id)] ?? 0;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={value === id}
            className={`bol-cup ${value === id ? "is-on" : ""} ${open ? "" : "is-locked"}`}
            style={{ "--cup": CUP_COLORS[id] } as React.CSSProperties}
            disabled={disabled || !open}
            onClick={() => onChange(id)}
          >
            <span className="bol-cup-head">
              <CupBadge id={id} size={34} />
              <span className="bol-cup-name">
                <strong>{cup.name}</strong>
                <small>{cup.tagline}</small>
              </span>
            </span>
            <span className="bol-cup-maps">
              {cup.tracks.map((t) => (
                <TrackMap key={t} id={cup.mirror ? mirrorOf(t) : t} className="is-tiny" />
              ))}
            </span>
            <span className="bol-cup-foot">
              {open ? (
                <Stars n={stars} size={18} />
              ) : (
                <span className="bol-cup-lock">
                  <Icon name="lock" size={14} /> Podium de la {CUPS[cup.after!].name}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Le trophée d'une coupe, à ses couleurs */
export function CupBadge({ id, size = 40 }: { id: CupId; size?: number }) {
  return (
    <svg className="bol-cup-badge" viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" style={{ color: CUP_COLORS[id] }}>
      <path d="M14 8h20v8a10 10 0 0 1-20 0z" fill="currentColor" stroke="#2a1c11" strokeWidth="2" strokeLinejoin="round" />
      <path d="M14 11H8a6 6 0 0 0 7 8M34 11h6a6 6 0 0 1-7 8" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M21 26h6l1 8h-8z" fill="currentColor" stroke="#2a1c11" strokeWidth="2" strokeLinejoin="round" />
      <rect x="15" y="34" width="18" height="6" rx="2" fill="#2a1c11" />
    </svg>
  );
}

/**
 * La grille des circuits : le tracé, le nom, et les étoiles du contre-la-montre (de ce sens-là, selon `mirror`) ;
 * `random` ajoute « Au hasard » en tête
 */
export function TrackGrid({
  value,
  mirror,
  progress,
  random,
  disabled,
  onChange,
}: {
  value: TrackId | "hasard";
  mirror: boolean;
  progress: BolidesProgress | null;
  random: boolean;
  disabled: boolean;
  onChange: (track: BaseTrackId | "hasard") => void;
}) {
  const p = progress ?? EMPTY_PROGRESS;
  return (
    <div className="bol-tracks" role="radiogroup" aria-label="Circuit">
      {random && (
        <button
          type="button"
          role="radio"
          aria-checked={value === "hasard"}
          className={`bol-track is-random ${value === "hasard" ? "is-on" : ""}`}
          disabled={disabled}
          onClick={() => onChange("hasard")}
        >
          <span className="bol-track-dice" aria-hidden="true">
            ?
          </span>
          <strong>Au hasard</strong>
        </button>
      )}
      {TRACK_IDS.map((id) => {
        const shown: TrackId = mirror ? mirrorOf(id) : id;
        const stars = p.stars[chronoKey(shown)] ?? 0;
        const best = p.best[chronoKey(shown)];
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={value === id}
            className={`bol-track ${value === id ? "is-on" : ""}`}
            disabled={disabled}
            onClick={() => onChange(id)}
          >
            <TrackMap id={shown} className="is-small" />
            <strong>{TRACKS[id].name}</strong>
            <Stars n={stars} size={13} />
            {best !== undefined && <small className="num">{raceTime(best)}</small>}
          </button>
        );
      })}
    </div>
  );
}

/** Les temps à battre au contre-la-montre, et son record */
export function ChronoTargets({ targets, best }: { targets: { bronze: number; argent: number; or: number } | null; best?: number }) {
  if (!targets) return null;
  const rows = [
    { key: "bronze", name: "Fantôme de bronze", ms: targets.bronze },
    { key: "argent", name: "Fantôme d'argent", ms: targets.argent },
    { key: "or", name: "Fantôme d'or", ms: targets.or },
  ];
  return (
    <ul className="bol-targets">
      {rows.map((r, i) => (
        <li key={r.key} className={`is-${r.key} ${best !== undefined && best <= r.ms ? "is-beaten" : ""}`}>
          <Stars n={i + 1} size={12} />
          <span>{r.name}</span>
          <strong className="num">{raceTime(r.ms)}</strong>
        </li>
      ))}
      {best !== undefined && (
        <li className="is-best">
          <Icon name="check" size={14} />
          <span>Ton record</span>
          <strong className="num">{raceTime(best)}</strong>
        </li>
      )}
    </ul>
  );
}
