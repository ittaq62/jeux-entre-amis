import { motion } from "motion/react";
import { useEffect, type ReactNode } from "react";
import type { TourMemberView, TourTitle } from "../../shared/tour.ts";
import { Avatar } from "../components/Avatar.tsx";
import { play } from "../lib/sound.ts";
import { usePrefs } from "../stores/prefs.ts";

/** La couleur de chaque médaille, et le dessin en son centre */
const MEDALS: Record<string, { color: string; art: ReactNode }> = {
  collector: {
    color: "#e2bd6e",
    art: (
      <>
        <path d="M15 9h18v8c0 6-4 10.5-9 10.5S15 23 15 17z" />
        <path d="M15 12H9.5v2.5c0 4 3 6.5 6.5 6.5M33 12h5.5v2.5c0 4-3 6.5-6.5 6.5" fill="none" stroke="currentColor" strokeWidth={2.8} />
        <rect x={21} y={27} width={6} height={6} />
        <rect x={15.5} y={33} width={17} height={5.5} rx={1.6} />
      </>
    ),
  },
  "plus-four": {
    color: "#e0463c",
    art: (
      <g transform="rotate(-9 24 24)">
        <rect x={12.5} y={7} width={23} height={34} rx={4} />
        <text x={24} y={29.5} textAnchor="middle" fontSize={15} fontWeight={800} fill="var(--medal)">
          +4
        </text>
      </g>
    ),
  },
  mason: {
    color: "#e08a3c",
    art: (
      <>
        <rect x={8} y={12} width={15} height={7} rx={1.2} />
        <rect x={25} y={12} width={15} height={7} rx={1.2} />
        <rect x={8} y={21} width={7} height={7} rx={1.2} />
        <rect x={17} y={21} width={15} height={7} rx={1.2} />
        <rect x={34} y={21} width={6} height={7} rx={1.2} />
        <rect x={8} y={30} width={15} height={7} rx={1.2} />
        <rect x={25} y={30} width={15} height={7} rx={1.2} />
      </>
    ),
  },
  wrecker: {
    color: "#9b6bff",
    art: (
      <>
        <circle cx={21} cy={29} r={12} />
        <circle cx={16.5} cy={24.5} r={3} fill="var(--medal)" opacity={0.45} />
        <rect x={25.5} y={13.5} width={8} height={6} rx={1.5} transform="rotate(45 29.5 16.5)" />
        <path d="M31.5 13c1.5-3.5 5-4.5 7-2.5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" />
        <path d="M40.5 4l1.2 3.3 3.3 1.2-3.3 1.2-1.2 3.3-1.2-3.3-3.3-1.2 3.3-1.2z" />
      </>
    ),
  },
  tycoon: {
    color: "#2fa864",
    art: (
      <>
        <path d="M17.5 7h13l-3.5 6.5h-6z" />
        <path d="M20.5 15.5h7C35 18.5 40 25.5 40 32c0 6.5-6 9-16 9S8 38.5 8 32c0-6.5 5-13.5 12.5-16.5z" />
        <rect x={19} y={13} width={10} height={2.6} rx={1.3} />
        <text x={24} y={36} textAnchor="middle" fontSize={15} fontWeight={800} fill="var(--medal)">
          ₣
        </text>
      </>
    ),
  },
  builder: {
    color: "#2aa3c0",
    art: (
      <>
        <path d="M17 40V9l9-3v34z" />
        <path d="M28 40V17h10v23z" />
        <path d="M9 40V25h6v15z" />
        <g fill="var(--medal)">
          <rect x={19.5} y={13} width={2.5} height={3} />
          <rect x={19.5} y={20} width={2.5} height={3} />
          <rect x={19.5} y={27} width={2.5} height={3} />
          <rect x={31} y={21} width={4} height={3} />
          <rect x={31} y={28} width={4} height={3} />
        </g>
      </>
    ),
  },
  admiral: {
    color: "#3f7fd8",
    art: (
      <>
        <circle cx={24} cy={24} r={15} fill="none" stroke="currentColor" strokeWidth={3} />
        <circle cx={24} cy={24} r={8.5} fill="none" stroke="currentColor" strokeWidth={3} />
        <circle cx={24} cy={24} r={3.4} />
        <path d="M24 4v8M24 36v8M4 24h8M36 24h8" stroke="currentColor" strokeWidth={2.6} />
      </>
    ),
  },
  metronome: {
    color: "#d65a9c",
    art: (
      <>
        <path d="M14 41l6-33h8l6 33z" />
        <path d="M24 35L33 11" stroke="var(--medal)" strokeWidth={4.5} strokeLinecap="round" />
        <path d="M24 35L33 11" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
        <rect x={27} y={18} width={6} height={4} rx={1} transform="rotate(21 30 20)" />
      </>
    ),
  },
  brave: {
    color: "#ef6a5a",
    art: <path d="M24 40C11 31 6.5 23.5 9.5 16.5 12.5 10 20 9.5 24 15.5 28 9.5 35.5 10 38.5 16.5 41.5 23.5 37 31 24 40z" />,
  },
};

const FALLBACK = { color: "#e2bd6e", art: <circle cx={24} cy={24} r={11} /> };

/** Délai avant la première médaille : le podium a fini de monter */
const FIRST_MS = 1300;
const STEP_MS = 420;

/** Les trophées de fin de tournée : une médaille par exploit, remise l'une après l'autre. */
export function TourTrophies({ titles, members, meId }: { titles: TourTitle[]; members: TourMemberView[]; meId: string }) {
  const reduced = usePrefs((s) => s.reducedEffects);

  // Un petit son à chaque remise, plus fort quand c'est la sienne
  useEffect(() => {
    if (reduced) return;
    const timers = titles.map((t, i) =>
      setTimeout(() => play(t.userId === meId ? "achievement" : "pop", { volume: t.userId === meId ? 0.8 : 0.5 }), FIRST_MS + i * STEP_MS),
    );
    return () => timers.forEach(clearTimeout);
  }, [titles, meId, reduced]);

  return (
    <section className="tour-trophies" aria-label="Les trophées de la tournée">
      <h2 className="tour-trophies-title">Les trophées</h2>
      <div className="tour-trophies-list">
        {titles.map((t, i) => {
          const medal = MEDALS[t.id] ?? FALLBACK;
          const member = members.find((m) => m.userId === t.userId);
          const mine = t.userId === meId;
          return (
            <motion.article
              key={t.id}
              className={`trophy ${mine ? "is-mine" : ""}`}
              style={{ ["--medal" as string]: medal.color, ["--shine-delay" as string]: `${(FIRST_MS + i * STEP_MS + 350) / 1000}s` }}
              initial={reduced ? false : { opacity: 0, scale: 0.6, rotate: i % 2 ? 6 : -6, y: 24 }}
              animate={{ opacity: 1, scale: 1, rotate: 0, y: 0 }}
              transition={{ delay: (FIRST_MS + i * STEP_MS) / 1000, type: "spring", stiffness: 260, damping: 17 }}
            >
              {mine && <span className="trophy-me">C'est toi !</span>}
              <span className="trophy-medal" aria-hidden="true">
                <svg viewBox="0 0 48 48">{medal.art}</svg>
              </span>
              <h3 className="trophy-name">{t.label}</h3>
              <p className="trophy-stat">
                {t.stat ? (
                  <>
                    <strong className="num">{t.stat}</strong>
                    <span>{t.unit}</span>
                  </>
                ) : (
                  <span>{t.detail}</span>
                )}
              </p>
              <span className="trophy-who">
                {member && <Avatar avatar={member.avatar} userId={member.userId} photo={member.photo} size={28} />}
                <span>{t.name}</span>
              </span>
            </motion.article>
          );
        })}
      </div>
    </section>
  );
}
