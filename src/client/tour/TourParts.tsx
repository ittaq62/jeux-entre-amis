import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { GAME_NAMES, type GameId } from "../../shared/protocol.ts";
import {
  findVariant,
  teamScores,
  TOUR_TEAM_COLORS,
  TOUR_TEAMS,
  voteNeed,
  type TourClientMessage,
  type TourGameView,
  type TourMemberView,
  type TourView,
} from "../../shared/tour.ts";
import { PlayerName } from "../components/AdminBadge.tsx";
import { Avatar } from "../components/Avatar.tsx";
import { Icon } from "../components/Icon.tsx";
import { play } from "../lib/sound.ts";
import { usePrefs } from "../stores/prefs.ts";

/** Le nom des règles jouées à un jeu (variante), ou rien si elles sont inconnues */
export function rulesName(game: GameId, variant: string | null | undefined): string | null {
  return findVariant(game, variant)?.name ?? null;
}

/** L'affiche d'un jeu de la tournée : une illustration encadrée, entièrement dans son cadre, et le nom du jeu */
export function GameTicket({
  game,
  size = "md",
  lit = false,
  chosen = false,
  dim = false,
  off = false,
}: {
  game: GameId;
  size?: "sm" | "md" | "lg";
  lit?: boolean;
  chosen?: boolean;
  dim?: boolean;
  /** N'accueille pas tout le monde : le tirage l'écarte */
  off?: boolean;
}) {
  return (
    <span
      className={`game-ticket is-${game} size-${size} ${lit ? "is-lit" : ""} ${chosen ? "is-chosen" : ""} ${dim ? "is-dim" : ""} ${off ? "is-off" : ""}`}
      aria-label={GAME_NAMES[game]}
    >
      <span className="ticket-art" aria-hidden="true">
        <svg viewBox="0 0 100 72">
          {game === "uno" ? (
            <UnoArt />
          ) : game === "bricks" ? (
            <BricksArt />
          ) : game === "capitale" ? (
            <CapitaleArt />
          ) : game === "meche" ? (
            <MecheArt />
          ) : game === "bolides" ? (
            <BolidesArt />
          ) : game === "crampons" ? (
            <CramponsArt />
          ) : (
            <NavalArt />
          )}
        </svg>
      </span>
      <span className="ticket-name">{GAME_NAMES[game]}</span>
    </span>
  );
}

/** Un ballon qui file au fond des filets */
function CramponsArt() {
  return (
    <>
      <ellipse cx="42" cy="64" rx="24" ry="3.4" fill="rgba(0,0,0,0.25)" />
      {/* Le but : les poteaux, la barre et le filet */}
      <path d="M66 22H92M66 30H92M66 38H92M66 46H92M66 54H92M70 18V60M78 18V60M86 18V60" stroke="#fbf5e6" strokeWidth="0.9" opacity="0.4" />
      <path d="M64 61V16H94V61" fill="none" stroke="#fbf5e6" strokeWidth="3.2" strokeLinejoin="round" />
      {/* La traînée du ballon */}
      <path d="M4 31H17M1 40H15M5 49H17" stroke="#fbf5e6" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
      {/* Le ballon : un pentagone noir au centre, ses voisins coupés par le bord */}
      <circle cx="37" cy="40" r="16" fill="#fbf5e6" />
      <path d="M37 33L43.7 37.9L41.1 45.7H32.9L30.3 37.9Z" fill="#1b1b1e" />
      <path
        d="M37 33V25.4M43.7 37.9L51.2 35.6M41.1 45.7L45.7 52.1M32.9 45.7L28.3 52.1M30.3 37.9L22.8 35.6"
        stroke="#1b1b1e"
        strokeWidth="1.3"
      />
      <path d="M33.4 24.4L37 25.4L40.6 24.4L39.6 24.1H34.4Z" fill="#1b1b1e" />
      <path d="M51.2 35.6L52.8 40L52.6 44.1L49.6 43.6L48.5 38.6Z" fill="#1b1b1e" />
      <path d="M45.7 52.1L42.6 55.6L46.3 53.9Z" fill="#1b1b1e" />
      <path d="M28.3 52.1L31.4 55.6L27.7 53.9Z" fill="#1b1b1e" />
      <path d="M22.8 35.6L21.2 40L21.4 44.1L24.4 43.6L25.5 38.6Z" fill="#1b1b1e" />
      <circle cx="37" cy="40" r="16" fill="none" stroke="#1b1b1e" strokeWidth="1.4" />
    </>
  );
}

/** Un kart lancé, et le drapeau à damier */
function BolidesArt() {
  return (
    <>
      <ellipse cx="46" cy="64" rx="31" ry="3.6" fill="rgba(0,0,0,0.25)" />
      <rect x="80" y="8" width="2.2" height="32" fill="#fbf5e6" />
      <g transform="translate(82.2 9) scale(0.75)">
        <rect width="20" height="13" fill="#fbf5e6" />
        <rect width="5" height="4.33" fill="#1a1a1a" />
        <rect x="10" width="5" height="4.33" fill="#1a1a1a" />
        <rect x="5" y="4.33" width="5" height="4.33" fill="#1a1a1a" />
        <rect x="15" y="4.33" width="5" height="4.33" fill="#1a1a1a" />
        <rect y="8.66" width="5" height="4.33" fill="#1a1a1a" />
        <rect x="10" y="8.66" width="5" height="4.33" fill="#1a1a1a" />
      </g>
      {/* Le kart vu de dos : ses pneus, sa coque, le casque à bandes du pilote, son aileron et ses flammes */}
      <path d="M31 56c1-11 6-18 15-18s14 7 15 18z" fill="#c9352c" />
      <path d="M38.5 28c0-6.2 3.1-9.5 7.5-9.5s7.5 3.3 7.5 9.5c0 4.4-3.1 8.5-7.5 8.5s-7.5-4.1-7.5-8.5z" fill="#ffc83d" />
      <path d="M43.6 18.9v17M48.4 18.9v17" stroke="#d8362c" strokeWidth="1.8" />
      <rect x="19" y="43" width="14" height="21" rx="4.5" fill="#1b1b1e" />
      <rect x="59" y="43" width="14" height="21" rx="4.5" fill="#1b1b1e" />
      <rect x="17" y="35" width="58" height="8" rx="2.4" fill="#e2483d" stroke="#fbf5e6" strokeWidth="1.5" />
      <path d="M40 54c-2.6 4.4-.6 8 1.6 11 2.2-3 4.2-6.6 1.6-11zM48.8 54c-2.6 4.4-.6 8 1.6 11 2.2-3 4.2-6.6 1.6-11z" fill="#ffb43a" />
      <path d="M3 34h10M1 42h11M5 50h8" stroke="#fbf5e6" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
    </>
  );
}

/** Un pétard et sa mèche qui brûle */
function MecheArt() {
  return (
    <>
      <ellipse cx="50" cy="62" rx="30" ry="4" fill="rgba(0,0,0,0.25)" />
      <g transform="rotate(-14 46 44)">
        <rect x="20" y="33" width="52" height="20" rx="4" fill="#c63a2e" stroke="#fbf5e6" strokeWidth="2" />
        <rect x="29" y="33" width="5" height="20" fill="#7d211a" />
        <rect x="58" y="33" width="5" height="20" fill="#7d211a" />
      </g>
      <path d="M72 30c6-4 9-11 15-13" fill="none" stroke="#e6c78f" strokeWidth="3" strokeLinecap="round" />
      <circle cx="88" cy="16" r="7" fill="#ff9a3c" opacity="0.45" />
      <circle cx="88" cy="16" r="3.6" fill="#ffd36b" />
      <circle cx="88" cy="16" r="1.6" fill="#fff6d6" />
    </>
  );
}

/** Trois cartes en éventail, la rouge devant */
function UnoArt() {
  const card = (fill: string, angle: number, front = false) => (
    <g transform={`rotate(${angle} 50 70)`}>
      <rect x="38" y="16" width="24" height="36" rx="3.2" fill={fill} stroke="#fbf5e6" strokeWidth="2.2" />
      {front && <ellipse cx="50" cy="34" rx="7.2" ry="12" transform="rotate(28 50 34)" fill="#fbf5e6" />}
      {front && <ellipse cx="50" cy="34" rx="3.2" ry="6.4" transform="rotate(28 50 34)" fill={fill} />}
    </g>
  );
  return (
    <>
      <ellipse cx="50" cy="64" rx="30" ry="4" fill="rgba(0,0,0,0.22)" />
      {card("#2c7be5", -20)}
      {card("#2fa864", 20)}
      {card("#d43a2f", 0, true)}
    </>
  );
}

/** Une pile de briques laquées, et un T qui descend vers le trou qui l'attend */
const BRICK = 11;
const PITCH = 12.5;
const X0 = 13.25;
function Brick({ col, row, color, light }: { col: number; row: number; color: string; light: string }) {
  const x = X0 + col * PITCH;
  const y = 64 - (row + 1) * PITCH;
  return (
    <g>
      <rect x={x} y={y} width={BRICK} height={BRICK} rx="2.2" fill={color} />
      <rect x={x + 1.6} y={y + 1.4} width={BRICK - 3.2} height="2.6" rx="1.2" fill={light} opacity="0.55" />
    </g>
  );
}
function BricksArt() {
  const ruby = ["#b8323a", "#e86a6a"] as const;
  const ivory = ["#d9cfb4", "#fff8e6"] as const;
  const jade = ["#228a63", "#5fd3a2"] as const;
  const sapphire = ["#2c5fb8", "#7aa6f0"] as const;
  const gold = ["#d39a2c", "#ffd77a"] as const;
  const coral = ["#d9643f", "#ff9e78"] as const;
  const amethyst = ["#7d45b5", "#b68aea"] as const;
  // Le fond de pile, avec un trou en troisième colonne, et le haut de la pile sur les bords
  const stack: [number, number, readonly [string, string]][] = [
    [0, 0, ruby],
    [1, 0, gold],
    [3, 0, sapphire],
    [4, 0, ivory],
    [5, 0, amethyst],
    [0, 1, coral],
    [5, 1, sapphire],
  ];
  // Là où le T va se poser : son ombre en pointillés
  const ghost: [number, number][] = [
    [1, 1],
    [2, 1],
    [3, 1],
    [2, 0],
  ];
  const fall: [number, number][] = [
    [1, 3.3],
    [2, 3.3],
    [3, 3.3],
    [2, 2.3],
  ];
  return (
    <>
      {ghost.map(([c, r]) => (
        <rect
          key={`g${c}${r}`}
          x={X0 + c * PITCH + 0.6}
          y={64 - (r + 1) * PITCH + 0.6}
          width={BRICK - 1.2}
          height={BRICK - 1.2}
          rx="2"
          fill="none"
          stroke="rgba(95,211,162,0.55)"
          strokeWidth="1.1"
          strokeDasharray="2.2 1.6"
        />
      ))}
      {stack.map(([c, r, [color, light]]) => (
        <Brick key={`s${c}${r}`} col={c} row={r} color={color} light={light} />
      ))}
      {fall.map(([c, r]) => (
        <Brick key={`f${c}${r}`} col={c} row={r} color={jade[0]} light={jade[1]} />
      ))}
    </>
  );
}

/** Un navire sur la houle */
/** Une parcelle de Capitale : trois maisons, un hôtel, et deux dés qui roulent au-dessus */
function CapitaleArt() {
  const house = (x: number) => (
    <path
      key={x}
      d={`M${x} 52 V42 L${x + 6} 36 L${x + 12} 42 V52 Z`}
      fill="#2fa864"
      stroke="#145c35"
      strokeWidth={1.2}
      strokeLinejoin="round"
    />
  );
  const pips = (cx: number, cy: number, spots: [number, number][]) =>
    spots.map(([dx, dy], k) => <circle key={k} cx={cx + dx} cy={cy + dy} r={1.25} fill="#1d1b18" />);
  return (
    <>
      {/* La parcelle */}
      <rect x={10} y={51} width={80} height={9} rx={2} fill="#e3ebd9" stroke="#9fb39a" strokeWidth={1} />
      {house(16)}
      {house(31)}
      {house(46)}
      {/* L'hôtel */}
      <path d="M62 52 V30 L73 25 L84 30 V52 Z" fill="#d6433a" stroke="#7d1d18" strokeWidth={1.2} strokeLinejoin="round" />
      {[34, 41].map((y) => [66, 71.5, 77].map((x) => <rect key={`${x}-${y}`} x={x} y={y} width={3} height={3.5} fill="#f1d595" />))}
      {/* Les dés */}
      <g transform="rotate(-14 24 18)">
        <rect x={17} y={11} width={14} height={14} rx={3} fill="#fbf7ee" stroke="#1d1b18" strokeWidth={0.8} />
        {pips(24, 18, [
          [-3.5, -3.5],
          [0, 0],
          [3.5, 3.5],
        ])}
      </g>
      <g transform="rotate(12 44 15)">
        <rect x={37} y={8} width={14} height={14} rx={3} fill="#fbf7ee" stroke="#1d1b18" strokeWidth={0.8} />
        {pips(44, 15, [
          [-3.5, -3.5],
          [3.5, -3.5],
          [-3.5, 3.5],
          [3.5, 3.5],
        ])}
      </g>
    </>
  );
}

function NavalArt() {
  const wave = (y: number, opacity: number) => (
    <path
      d={`M-4 ${y} q 6.25 -4 12.5 0 t 12.5 0 t 12.5 0 t 12.5 0 t 12.5 0 t 12.5 0 t 12.5 0 t 12.5 0 t 12.5 0`}
      fill="none"
      stroke={`rgba(200,238,255,${opacity})`}
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  );
  return (
    <>
      {/* Mât, cheminée et passerelle */}
      <line x1="44" y1="18" x2="44" y2="34" stroke="#e7ecee" strokeWidth="1.4" />
      <path d="M44 19 L52 21.5 L44 24 Z" fill="#d4453c" />
      <rect x="53" y="25" width="7" height="10" rx="1" fill="#d4453c" />
      <rect x="53" y="25" width="7" height="2.4" fill="#1d1b18" opacity="0.55" />
      <rect x="37" y="33" width="26" height="9" rx="1.6" fill="#e7ecee" />
      <rect x="40" y="36" width="3" height="2.6" rx="0.6" fill="#2f7aa0" />
      <rect x="45" y="36" width="3" height="2.6" rx="0.6" fill="#2f7aa0" />
      <rect x="50" y="36" width="3" height="2.6" rx="0.6" fill="#2f7aa0" />
      <rect x="55" y="36" width="3" height="2.6" rx="0.6" fill="#2f7aa0" />
      {/* La coque, la proue vers la droite */}
      <path d="M16 42 L86 42 L78 54 L22 54 Z" fill="#c9d3d6" />
      <path d="M19 49 L82.7 49 L78 54 L22 54 Z" fill="#7d8a8e" />
      {wave(55, 0.85)}
      {wave(62, 0.5)}
      {wave(68.5, 0.28)}
    </>
  );
}

/** Jeux joués jusqu'au bout */
export const playedGames = (view: TourView) => view.games.filter((g) => !g.aborted && g.results);

const playedLabel = (n: number) => (n === 1 ? "1 jeu joué" : `${n} jeux joués`);

/** Où en est la tournée, selon sa façon de finir */
export function progressLabel(view: TourView, now: number): string {
  const played = playedGames(view).length;
  const end = view.settings.end;
  const upcoming = view.status === "finished" ? played : played + (view.status === "playing" ? 0 : 1);
  // Chaque jeu une seule fois : la tournée ne peut pas dépasser le nombre de jeux cochés
  const cap = view.settings.once ? view.settings.games.length : Infinity;
  switch (end.kind) {
    case "games": {
      const total = Math.min(end.count, cap);
      return view.status === "finished" ? playedLabel(played) : `Jeu ${Math.max(1, Math.min(upcoming, total))} sur ${total}`;
    }
    case "score":
      return `Premier à ${end.target} points`;
    case "time": {
      if (view.status === "finished" || !view.endsAt) return `${end.minutes} minutes de jeu`;
      const left = Math.ceil((view.endsAt - now) / 60_000);
      return left > 0 ? `Encore ${left} min` : "Dernier jeu";
    }
    case "endless":
      if (view.status === "finished") return playedLabel(played);
      return cap < Infinity ? `Jeu ${Math.max(1, Math.min(upcoming, cap))} sur ${cap}` : `Jeu ${Math.max(1, upcoming)}, sans fin`;
  }
}

export interface Placed {
  member: TourMemberView;
  rank: number;
  /** Points gagnés au dernier jeu */
  gained: number | null;
}

/**
 * Classement de la tournée : points, puis jeux gagnés ; à égalité, même place. Avec « before », le classement
 * tel qu'il était avant le dernier jeu (pour animer les places qui changent).
 */
export function standingsOf(view: TourView, last: TourGameView | null, before = false): Placed[] {
  const playedIds = new Set(view.games.flatMap((g) => g.results?.map((r) => r.userId) ?? []));
  const earlier = (m: TourMemberView): TourMemberView => {
    const r = last?.results?.find((x) => x.userId === m.userId);
    return r ? { ...m, points: m.points - r.points, wins: m.wins - (r.rank === 1 ? 1 : 0) } : m;
  };
  const list = view.members
    .filter((m) => playedIds.has(m.userId) || (m.role === "player" && !m.left))
    .map((m) => (before ? earlier(m) : m))
    .sort((a, b) => b.points - a.points || b.wins - a.wins);
  let rank = 0;
  return list.map((member, i) => {
    const prev = list[i - 1];
    if (!prev || prev.points !== member.points || prev.wins !== member.wins) rank = i + 1;
    const gained = last?.results?.find((r) => r.userId === member.userId)?.points ?? null;
    return { member, rank, gained };
  });
}

/** Un nombre qui défile jusqu'à sa nouvelle valeur */
function RollingNumber({ value, className }: { value: number; className?: string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    from.current = value;
    if (start === value) return;
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 900);
      setShown(Math.round(start + (value - start) * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className={className}>{shown}</span>;
}

/** Après un jeu : les « +10 » arrivent un à un (en ms), puis les barres grandissent et les lignes glissent à leur nouvelle place */
const GAIN_AT = 650;
const GAIN_STEP = 140;

/** Les points rapportés par le dernier jeu à chaque équipe */
function teamGains(view: TourView, last: TourGameView | null): [number, number] | null {
  if (!last?.results) return null;
  const out: [number, number] = [0, 0];
  for (const r of last.results) {
    const m = view.members.find((x) => x.userId === r.userId);
    if (m && m.team !== null) out[m.team] += r.points;
  }
  return out;
}

/** Ce que le dernier jeu a changé en haut du classement, à annoncer : une équipe ou un joueur passe devant, ou on grimpe soi-même */
function leadNews(view: TourView, last: TourGameView | null, meId: string): { text: string; color?: string } | null {
  if (!last?.results) return null;
  const before = standingsOf(view, last, true);
  const after = standingsOf(view, last);
  if (view.settings.teams) {
    const lead = ([r, b]: [number, number]) => (r === b ? null : r > b ? 0 : 1);
    const was = lead(teamScores(before.map((x) => x.member)));
    const now = lead(teamScores(after.map((x) => x.member)));
    if (now !== null && now !== was) return { text: `Les ${TOUR_TEAMS[now]} passent devant !`, color: TOUR_TEAM_COLORS[now] };
    if (now === null && was !== null) return { text: "Les deux équipes à égalité !" };
  }
  const first = after[0];
  const alone = first && after[1]?.rank !== 1;
  if (first && alone && before[0]?.member.userId !== first.member.userId)
    return { text: first.member.userId === meId ? "Tu prends la tête !" : `${first.member.name} prend la tête !` };
  const mine = (list: Placed[]) => list.find((x) => x.member.userId === meId)?.rank;
  const climbed = (mine(before) ?? 0) - (mine(after) ?? 0);
  if (climbed > 0) return { text: `Tu gagnes ${climbed} place${climbed > 1 ? "s" : ""} !` };
  return null;
}

export function Standings({
  view,
  last,
  meId,
  celebrate = false,
  teams = false,
}: {
  view: TourView;
  last: TourGameView | null;
  meId: string;
  /** Rejouer l'arrivée des points du dernier jeu */
  celebrate?: boolean;
  /** Le duel des deux équipes, au-dessus des joueurs */
  teams?: boolean;
}) {
  const reduced = usePrefs((s) => s.reducedEffects);
  const animate = celebrate && !reduced && Boolean(last?.results);
  const [before, setBefore] = useState(animate);
  const rows = standingsOf(view, last, before);
  const earlier = standingsOf(view, last, true);
  const gainCount = earlier.filter((r) => (r.gained ?? 0) > 0).length;
  const news = celebrate ? leadNews(view, last, meId) : null;

  useEffect(() => {
    if (!animate) return;
    const settle = GAIN_AT + gainCount * GAIN_STEP + 450;
    const timers = Array.from({ length: gainCount }, (_, i) =>
      setTimeout(() => play("tourChip", { rate: 0.94 + i * 0.07 }), GAIN_AT + i * GAIN_STEP),
    );
    timers.push(setTimeout(() => setBefore(false), settle));
    if (news) timers.push(setTimeout(() => play("tourReveal", { volume: 0.7 }), settle + 450));
    return () => timers.forEach(clearTimeout);
    // Une seule fois par jeu terminé
  }, [animate, last?.code]); // eslint-disable-line react-hooks/exhaustive-deps

  if (rows.length === 0) return <p className="hint">Personne n'a encore marqué.</p>;
  // Les barres se mesurent au premier : elles grandissent quand les points tombent
  const top = Math.max(1, ...rows.map((r) => r.member.points));
  const settled = celebrate && Boolean(last?.results) && !before;
  const wasRank = new Map(earlier.map((r) => [r.member.userId, r.rank]));
  let gainIndex = 0;
  return (
    <div className="standings">
      {teams && <TeamDuel members={rows.map((r) => r.member)} gains={teamGains(view, last)} animate={animate} />}
      <AnimatePresence>
        {settled && news && (
          <motion.p
            key={news.text}
            className="standings-news"
            style={news.color ? { ["--news" as string]: news.color } : undefined}
            initial={reduced ? false : { opacity: 0, scale: 0.7, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: reduced ? 0 : 0.4, type: "spring", stiffness: 380, damping: 18 }}
          >
            {news.text}
          </motion.p>
        )}
      </AnimatePresence>
      <ol className="tour-standings-list">
        {rows.map(({ member: m, rank, gained }) => {
          const popAt = (gained ?? 0) > 0 ? GAIN_AT + gainIndex++ * GAIN_STEP : 0;
          const move = settled ? (wasRank.get(m.userId) ?? rank) - rank : 0;
          const tags = [
            m.kind === "bot" && "bot",
            m.wins > 0 && `${m.wins} victoire${m.wins > 1 ? "s" : ""}`,
            m.left ? (m.kind === "bot" ? "a cédé sa place" : "parti") : !m.connected && "absent",
            m.waiting && !m.left && "au prochain jeu",
          ].filter(Boolean);
          return (
            <motion.li
              key={m.userId}
              layout={!reduced}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className={`standing-row ${rank === 1 ? "is-first" : ""} ${m.userId === meId ? "is-me" : ""} ${m.left ? "is-left" : ""} ${m.team !== null ? "is-team" : ""}`}
              style={m.team !== null ? { ["--team" as string]: TOUR_TEAM_COLORS[m.team] } : undefined}
            >
              <span className="standing-rank num">{rank}</span>
              <Avatar avatar={m.avatar} userId={m.userId} photo={m.photo} size={30} />
              <span className="standing-who">
                <span className="standing-name">
                  <strong>
                    <PlayerName name={m.name} admin={m.admin} suffix={m.userId === meId ? " (toi)" : undefined} />
                  </strong>
                  {tags.length > 0 && <span className="standing-tags">{tags.join(" · ")}</span>}
                </span>
                <span className="standing-bar" aria-hidden="true">
                  <i style={{ width: `${(m.points / top) * 100}%` }} />
                </span>
              </span>
              {move !== 0 && (
                <motion.span
                  className={`standing-move num ${move > 0 ? "is-up" : "is-down"}`}
                  initial={reduced ? false : { opacity: 0, scale: 0.4 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.35, type: "spring", stiffness: 500, damping: 16 }}
                  aria-label={move > 0 ? `gagne ${move} place${move > 1 ? "s" : ""}` : `perd ${-move} place${move < -1 ? "s" : ""}`}
                >
                  {move > 0 ? "▲" : "▼"}
                  {Math.abs(move)}
                </motion.span>
              )}
              {gained !== null && (
                <motion.span
                  className="standing-gain num"
                  initial={animate ? { opacity: 0, y: 12, scale: 0.5 } : false}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: popAt / 1000, type: "spring", stiffness: 460, damping: 17 }}
                >
                  +{gained}
                </motion.span>
              )}
              <RollingNumber className="standing-points num" value={m.points} />
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}

/** Le vote « prêt » : à la moitié des joueurs présents, c'est parti ; l'hôte, lui, a son bouton */
export function ReadyVote({
  view,
  send,
  action,
  hint,
}: {
  view: TourView;
  send: (msg: TourClientMessage) => void;
  /** Ce qui se passe quand assez de joueurs sont prêts, par exemple « la tournée part » */
  action: string;
  hint?: string;
}) {
  const me = view.you.userId;
  const canVote = view.voters.includes(me) && !view.you.isHost;
  const mine = view.ready.includes(me);
  const need = voteNeed(view.voters.length);
  const count = view.ready.length;
  const faces = view.ready.map((id) => view.members.find((m) => m.userId === id)).filter((m): m is TourMemberView => Boolean(m));
  // L'hôte a son bouton : il ne voit le vote qu'une fois que d'autres sont prêts, et sans autre votant que lui,
  // le vote n'a pas lieu d'être
  if (!view.voters.some((id) => id !== view.hostId) || (view.you.isHost && count === 0)) return null;
  return (
    <div className="ready-vote">
      <div className="ready-faces" aria-hidden="true">
        <AnimatePresence initial={false}>
          {faces.map((m) => (
            <motion.span
              key={m.userId}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 520, damping: 22 }}
            >
              <Avatar avatar={m.avatar} userId={m.userId} photo={m.photo} size={26} />
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
      <p className="ready-text">
        {count === 0
          ? need > 1
            ? `Dès que ${need} joueurs sont prêts, ${action}.`
            : `Dès qu'un joueur est prêt, ${action}.`
          : `${count} prêt${count > 1 ? "s" : ""} sur ${view.voters.length} : encore ${Math.max(0, need - count)} et ${action}.`}
        {hint && <span className="hint"> {hint}</span>}
      </p>
      {canVote && (
        <button
          className={`btn ready-btn ${mine ? "btn-primary is-ready" : ""}`}
          aria-pressed={mine}
          onClick={() => {
            play("click");
            send({ t: "ready", ready: !mine });
          }}
        >
          {mine ? (
            <>
              <Icon name="check" size={18} /> Prêt
            </>
          ) : (
            "Je suis prêt"
          )}
        </button>
      )}
    </div>
  );
}

/** Couper ou remettre la musique d'entracte (gardé sur cet appareil) */
export function MusicToggle() {
  const on = usePrefs((s) => s.tourMusic);
  const sound = usePrefs((s) => s.sound);
  const set = usePrefs((s) => s.set);
  if (!sound) return null;
  return (
    <button
      className="btn btn-ghost btn-icon"
      aria-pressed={on}
      aria-label={on ? "Couper la musique" : "Mettre la musique"}
      title={on ? "Couper la musique" : "Mettre la musique"}
      onClick={() => set({ tourMusic: !on })}
    >
      <Icon name={on ? "music" : "musicOff"} />
    </button>
  );
}

/**
 * Le duel des deux équipes : chacune son total qui défile, les points du dernier jeu qui tombent, et la corde qui penche
 * vers celle qui mène. `final` : la fin de la tournée, en grand.
 */
export function TeamDuel({
  members,
  gains = null,
  animate = false,
  final = false,
}: {
  members: TourMemberView[];
  gains?: [number, number] | null;
  animate?: boolean;
  final?: boolean;
}) {
  const [red, blue] = teamScores(members);
  const total = Math.max(1, red + blue);
  const lead = red === blue ? null : red > blue ? 0 : 1;
  const share = red + blue === 0 ? 50 : (red / total) * 100;
  const side = (t: 0 | 1) => (
    <div className={`duel-side side-${t} ${lead === t ? "is-leading" : ""}`} style={{ ["--team" as string]: TOUR_TEAM_COLORS[t] }}>
      <span className="duel-faces" aria-hidden="true">
        {members
          .filter((m) => m.team === t && !m.left)
          .slice(0, 4)
          .map((m) => (
            <Avatar key={m.userId} avatar={m.avatar} userId={m.userId} photo={m.photo} size={final ? 34 : 28} />
          ))}
      </span>
      <span className="duel-name">
        {lead === t && <Icon name="crown" size={final ? 20 : 16} />}
        {TOUR_TEAMS[t]}
      </span>
      <span className="duel-score">
        {gains && gains[t] > 0 && (
          <motion.span
            className="duel-gain num"
            initial={animate ? { opacity: 0, y: 10, scale: 0.5 } : false}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: GAIN_AT / 1000, type: "spring", stiffness: 420, damping: 15 }}
          >
            +{gains[t]}
          </motion.span>
        )}
        <RollingNumber className="duel-total num" value={t === 0 ? red : blue} />
      </span>
    </div>
  );
  return (
    <div className={`team-duel ${final ? "is-final" : ""}`} aria-label={`${TOUR_TEAMS[0]} ${red}, ${TOUR_TEAMS[1]} ${blue}`}>
      {side(0)}
      <span className="duel-vs" aria-hidden="true">
        contre
      </span>
      {side(1)}
      <div className="duel-bar" aria-hidden="true">
        <span className="duel-fill side-0" style={{ width: `${share}%` }} />
        <span className="duel-fill side-1" style={{ width: `${100 - share}%` }} />
        <i className="duel-knot" style={{ left: `${share}%` }} />
      </div>
    </div>
  );
}

/** Le haut des écrans de la tournée : retour, nom, progression, chat */
export function TourTop({
  view,
  now,
  unread,
  onOpenChat,
  onLeave,
}: {
  view: TourView;
  now: number;
  unread: number;
  onOpenChat: () => void;
  onLeave: () => void;
}) {
  return (
    <header className="page-top tour-top">
      <button className="btn btn-ghost btn-icon" onClick={onLeave} aria-label="Quitter la tournée">
        <Icon name="back" />
      </button>
      <div className="tour-top-title">
        <h1 className="page-title">La Tournée</h1>
        <span className="hint">
          {progressLabel(view, now)} · code <strong className="num">{view.code}</strong>
        </span>
      </div>
      <div className="page-top-actions">
        <MusicToggle />
        <button className="btn btn-ghost btn-icon chat-toggle" onClick={onOpenChat} aria-label="Discussion">
          <Icon name="chat" />
          {unread > 0 && <span className="badge">{unread}</span>}
        </button>
      </div>
    </header>
  );
}
