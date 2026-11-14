import { motion } from "motion/react";
import { useRef, type CSSProperties, type ReactNode } from "react";
import { bombInfo, type BombId } from "../../../shared/games/meche/bombs.ts";
import { BombArt } from "./BombArt.tsx";

// La fin de chaque bombe chez celui qui la tenait : elle lui saute dessus depuis le rebord de la table, puis chacune à
// sa façon (la fumée de la dynamite, les lambeaux du ballon, la neige, la crème, la sonnerie, l'essaim, les gerbes
// de couleurs, le nuage de gaz qui enfle et l'engloutit). Et au milieu de la table, en grand, son cri.

export interface Spot {
  x: number;
  y: number;
}

export interface BlastProps {
  bomb: BombId;
  /** Le centre de l'avatar de celui qui la reçoit, dans la scène */
  at: Spot;
  /** Le rebord de la table, d'où elle part */
  from: Spot;
  /** La taille de son avatar : tout se règle dessus, sur téléphone comme sur ordinateur */
  avatar: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)]!;

/** Une liste tirée au hasard une seule fois, à la naissance de l'effet */
function useOnce<T>(make: () => T): T {
  const ref = useRef<{ v: T } | null>(null);
  ref.current ??= { v: make() };
  return ref.current.v;
}

/** La bombe qui file du rebord jusqu'à lui, en grossissant */
function Flyer({
  bomb,
  from,
  width,
  duration = 0.32,
  end = 1.5,
  fade = true,
  to = { x: 0, y: 0 },
  p = 1,
}: {
  bomb: BombId;
  from: Spot;
  width: number;
  duration?: number;
  end?: number;
  fade?: boolean;
  to?: Spot;
  p?: number;
}) {
  return (
    <motion.div
      className="bomb-fly"
      style={{ width, marginLeft: -width / 2, marginTop: -width * 0.42, "--p": p } as CSSProperties}
      initial={{ x: from.x, y: from.y, scale: 0.8, opacity: 1 }}
      animate={{ x: to.x, y: to.y, scale: [0.8, 1, end], opacity: fade ? [1, 1, 0] : 1 }}
      transition={{ duration, times: [0, 0.6, 1], ease: "easeIn" }}
    >
      <BombArt id={bomb} />
    </motion.div>
  );
}

/** Une onde ronde qui s'élargit et s'efface */
function Ring({
  className,
  size,
  scale,
  delay,
  duration,
}: {
  className: string;
  size: number;
  scale: number;
  delay: number;
  duration: number;
}) {
  return (
    <motion.span
      className={`bomb-ring ${className}`}
      style={{ width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2 }}
      initial={{ scale: 0.15, opacity: 0.95 }}
      animate={{ scale, opacity: 0 }}
      transition={{ delay, duration, ease: "easeOut" }}
    />
  );
}

export function BombBlast({ bomb, at, from, avatar }: BlastProps) {
  // Tout est posé par rapport à lui : le départ est donc relatif
  const rel = { x: from.x - at.x, y: from.y - at.y };
  const a = avatar;
  return (
    <motion.div
      className={`bomb-blast is-${bomb}`}
      style={{ left: at.x, top: at.y }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      aria-hidden="true"
    >
      {bomb === "dynamite" && <DynamiteFx from={rel} a={a} />}
      {bomb === "ballon" && <BalloonFx from={rel} a={a} />}
      {bomb === "neige" && <SnowFx from={rel} a={a} />}
      {bomb === "gateau" && <CakeFx from={rel} a={a} />}
      {bomb === "reveil" && <ClockFx from={rel} a={a} />}
      {bomb === "ruche" && <SwarmFx from={rel} a={a} />}
      {bomb === "fusee" && <FireworkFx from={rel} a={a} />}
      {bomb === "gaz" && <GasFx from={rel} a={a} />}
    </motion.div>
  );
}

interface FxProps {
  from: Spot;
  a: number;
}

/** La dynamite : une onde de choc, de la fumée */
function DynamiteFx({ from, a }: FxProps) {
  const k = a / 64;
  const puffs = useOnce(() =>
    Array.from({ length: 8 }, (_, i) => ({
      dx: Math.cos((i / 8) * Math.PI * 2 + Math.random()) * 60 * k,
      dy: Math.sin((i / 8) * Math.PI * 2 + Math.random()) * 44 * k - 40 * k,
      size: 54 * k * (0.7 + Math.random() * 0.6),
      delay: 0.12 + Math.random() * 0.18,
    })),
  );
  return (
    <>
      <Flyer bomb="dynamite" from={from} width={70 * k} />
      <Ring className="is-shock" size={90 * k} scale={3.2} delay={0.12} duration={0.7} />
      <Ring className="is-core" size={90 * k} scale={2} delay={0.16} duration={0.5} />
      {puffs.map((p, i) => (
        <motion.span
          key={i}
          className="bomb-smoke"
          style={{ width: p.size, height: p.size }}
          initial={{ x: 0, y: 0, scale: 0.3, opacity: 0 }}
          animate={{ x: p.dx, y: p.dy, scale: [0.3, 1, 1.5], opacity: [0, 0.85, 0] }}
          transition={{ delay: p.delay, duration: 1.3, ease: "easeOut" }}
        />
      ))}
    </>
  );
}

/** Le ballon : il gonfle encore en arrivant, éclate, et ses lambeaux volent en retombant */
function BalloonFx({ from, a }: FxProps) {
  const k = a / 64;
  const shreds = useOnce(() =>
    Array.from({ length: 13 }, (_, i) => {
      const ang = (i / 13) * Math.PI * 2 + rand(-0.2, 0.2);
      const dist = rand(55, 95) * k;
      return {
        dx: Math.cos(ang) * dist,
        dy: Math.sin(ang) * dist * 0.8,
        size: rand(7, 13) * k,
        rot: rand(-540, 540),
        color: pick(["#ff4d7d", "#e8335f", "#ff8fb0", "#c81d4e"]),
        shape: i % 3,
      };
    }),
  );
  return (
    <>
      <Flyer bomb="ballon" from={from} width={72 * k} end={1.35} duration={0.3} />
      <Ring className="is-pop" size={70 * k} scale={2.6} delay={0.28} duration={0.32} />
      {shreds.map((s, i) => (
        <motion.span
          key={i}
          className={`bomb-shred is-${s.shape}`}
          style={{ width: s.size, height: s.size * 0.7, background: s.color }}
          initial={{ x: 0, y: 0, rotate: 0, opacity: 0 }}
          animate={{ x: [0, s.dx, s.dx * 1.15], y: [0, s.dy - 10 * k, s.dy + 70 * k], rotate: s.rot, opacity: [0, 1, 1, 0] }}
          transition={{ delay: 0.3, duration: 1.15, times: [0, 0.3, 1], ease: "easeOut" }}
        />
      ))}
    </>
  );
}

/** La boule de neige : elle s'écrase en paquets de neige, des flocons retombent (le bloc de glace est sur l'avatar) */
function SnowFx({ from, a }: FxProps) {
  const k = a / 64;
  const chunks = useOnce(() =>
    Array.from({ length: 11 }, (_, i) => {
      const ang = (i / 11) * Math.PI * 2 + rand(-0.25, 0.25);
      const dist = rand(40, 78) * k;
      return { dx: Math.cos(ang) * dist, dy: Math.sin(ang) * dist * 0.75, size: rand(9, 18) * k };
    }),
  );
  const flakes = useOnce(() =>
    Array.from({ length: 14 }, () => ({
      x: rand(-70, 70) * k,
      y: rand(-80, -30) * k,
      size: rand(3, 6) * k,
      delay: rand(0.35, 1),
      sway: rand(-14, 14) * k,
    })),
  );
  return (
    <>
      <Flyer bomb="neige" from={from} width={64 * k} end={1.25} duration={0.3} p={0.85} />
      <Ring className="is-snow" size={a * 1.3} scale={1.9} delay={0.26} duration={0.55} />
      {chunks.map((c, i) => (
        <motion.span
          key={i}
          className="bomb-chunk is-snow"
          style={{ width: c.size, height: c.size }}
          initial={{ x: 0, y: 0, opacity: 0, scale: 0.6 }}
          animate={{ x: [0, c.dx, c.dx * 1.1], y: [0, c.dy, c.dy + 50 * k], opacity: [0, 1, 1, 0], scale: [0.6, 1, 0.8] }}
          transition={{ delay: 0.28, duration: 1.1, times: [0, 0.3, 1], ease: "easeOut" }}
        />
      ))}
      {flakes.map((f, i) => (
        <motion.span
          key={`f${i}`}
          className="bomb-chunk is-flake"
          style={{ width: f.size, height: f.size }}
          initial={{ x: f.x, y: f.y, opacity: 0 }}
          animate={{ x: [f.x, f.x + f.sway, f.x - f.sway / 2], y: [f.y, f.y + 50 * k, f.y + 100 * k], opacity: [0, 1, 0] }}
          transition={{ delay: f.delay, duration: 1.3, ease: "linear" }}
        />
      ))}
    </>
  );
}

/** Le gâteau : il s'écrase en pleine figure, la crème gicle tout autour (elle reste sur le visage un moment) */
function CakeFx({ from, a }: FxProps) {
  const k = a / 64;
  const w = 74 * k;
  const drops = useOnce(() =>
    Array.from({ length: 10 }, (_, i) => {
      const ang = -Math.PI / 2 + ((i - 4.5) / 9) * Math.PI * 1.5;
      const dist = rand(45, 85) * k;
      return {
        dx: Math.cos(ang) * dist,
        dy: Math.sin(ang) * dist,
        size: rand(8, 15) * k,
        color: i % 3 === 0 ? "#ffb3c9" : "#fff8f0",
      };
    }),
  );
  return (
    <>
      <motion.div
        className="bomb-fly"
        style={{ width: w, marginLeft: -w / 2, marginTop: -w * 0.42 }}
        initial={{ x: from.x, y: from.y, scale: 0.7, opacity: 1 }}
        animate={{
          x: [from.x, 0, 0, 0],
          y: [from.y, 0, 4 * k, 12 * k],
          scaleX: [0.7, 1, 1.55, 1.6],
          scaleY: [0.7, 1, 0.5, 0.42],
          opacity: [1, 1, 1, 0],
        }}
        transition={{ duration: 0.85, times: [0, 0.36, 0.5, 1], ease: "easeIn" }}
      >
        <BombArt id="gateau" />
      </motion.div>
      {drops.map((d, i) => (
        <motion.span
          key={i}
          className="bomb-chunk is-cream"
          style={{ width: d.size, height: d.size, background: d.color }}
          initial={{ x: 0, y: 0, opacity: 0, scale: 0.5 }}
          animate={{ x: [0, d.dx, d.dx * 1.08], y: [0, d.dy, d.dy + 40 * k], opacity: [0, 1, 1, 0], scale: [0.5, 1, 0.9] }}
          transition={{ delay: 0.3, duration: 1, times: [0, 0.35, 1], ease: "easeOut" }}
        />
      ))}
    </>
  );
}

/** Le réveil : il se pose sur sa tête et sonne à tout rompre, les ondes de la sonnerie de chaque côté */
function ClockFx({ from, a }: FxProps) {
  const k = a / 64;
  const w = 62 * k;
  const lift = -a * 0.78;
  return (
    <>
      <motion.div
        className="bomb-fly"
        style={{ width: w, marginLeft: -w / 2, marginTop: -w * 0.42 }}
        initial={{ x: from.x, y: from.y, scale: 0.8, opacity: 1 }}
        animate={{ x: [from.x, 0, 0, 0], y: [from.y, lift, lift, lift - 10 * k], scale: [0.8, 1.1, 1.1, 0.9], opacity: [1, 1, 1, 0] }}
        transition={{ duration: 1.65, times: [0, 0.2, 0.86, 1], ease: "easeOut" }}
      >
        <motion.div
          className="bomb-ringing"
          animate={{ rotate: [0, -14, 14] }}
          transition={{ delay: 0.32, duration: 0.07, repeat: 15, repeatType: "mirror" }}
        >
          <BombArt id="reveil" className="is-ringing" />
        </motion.div>
      </motion.div>
      {[0, 1, 2].map((i) =>
        [-1, 1].map((side) => (
          <motion.span
            key={`${i}${side}`}
            className={`bomb-wave ${side < 0 ? "is-left" : "is-right"}`}
            style={{ width: 26 * k, height: 34 * k, marginTop: -17 * k + lift, marginLeft: side * (w * 0.55 + i * 9 * k) - 13 * k }}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: [0, 1, 0], scale: [0.6, 1.15, 1.3] }}
            transition={{ delay: 0.32 + i * 0.12, duration: 0.42, repeat: 2, repeatDelay: 0 }}
          />
        )),
      )}
    </>
  );
}

/** Un point d'une ellipse autour de lui */
const around = (ang: number, rx: number, ry: number): Spot => ({ x: Math.cos(ang) * rx, y: Math.sin(ang) * ry });

/** La ruche : l'essaim quitte le rebord, tourne autour de lui en piquant, puis se disperse */
function SwarmFx({ from, a }: FxProps) {
  const k = a / 64;
  const bees = useOnce(() =>
    Array.from({ length: 12 }, (_, i) => {
      const start = (i / 12) * Math.PI * 2;
      const rx = a * rand(0.55, 0.85);
      const ry = a * rand(0.45, 0.7);
      const mid = { x: from.x * 0.5 + rand(-40, 40) * k, y: from.y * 0.5 + rand(-40, 20) * k };
      const pts: Spot[] = [from, mid];
      for (let s = 0; s <= 8; s++) pts.push(around(start + (s / 8) * Math.PI * 2.4, rx, ry));
      const out = start + Math.PI * 2.4;
      pts.push(around(out, a * 2.4, a * 2));
      const rot = pts.map((_, j) => {
        const q = pts[Math.min(pts.length - 1, j + 1)]!;
        const r = pts[Math.max(0, j - 1)]!;
        return (Math.atan2(q.y - r.y, q.x - r.x) * 180) / Math.PI;
      });
      // Pas de demi-tour brusque : chaque angle part du précédent
      for (let j = 1; j < rot.length; j++) while (rot[j]! - rot[j - 1]! > 180) rot[j]! -= 360;
      for (let j = 1; j < rot.length; j++) while (rot[j]! - rot[j - 1]! < -180) rot[j]! += 360;
      return { pts, rot, delay: i * 0.035, dur: rand(1.7, 2) };
    }),
  );
  return (
    <>
      {bees.map((b, i) => (
        <motion.span
          key={i}
          className="bomb-bee"
          style={{ width: 16 * k, height: 12 * k, marginLeft: -8 * k, marginTop: -6 * k }}
          initial={{ x: from.x, y: from.y, opacity: 0 }}
          animate={{
            x: b.pts.map((p) => p.x),
            y: b.pts.map((p) => p.y),
            rotate: b.rot,
            opacity: [0, 1, ...b.pts.slice(3).map(() => 1), 0],
          }}
          transition={{ delay: b.delay, duration: b.dur, ease: "linear" }}
        >
          <svg viewBox="-8 -6 16 12">
            <ellipse cx="-1" cy="-3.6" rx="3.6" ry="2.4" fill="#fff" opacity="0.85" className="bee-wing" />
            <ellipse cx="0" cy="0" rx="5" ry="3.4" fill="#ffcc33" />
            <path d="M-1.6 -3.2v6.4M1.4 -3v6" stroke="#1c1610" strokeWidth="1.5" />
            <circle cx="4.6" cy="-0.3" r="1.8" fill="#1c1610" />
            <path d="M-5 0h-2.6" stroke="#1c1610" strokeWidth="1" />
          </svg>
        </motion.span>
      ))}
    </>
  );
}

/** Le feu d'artifice : la fusée file jusqu'au-dessus de lui et éclate en deux gerbes de couleurs */
function FireworkFx({ from, a }: FxProps) {
  const k = a / 64;
  const lift = -a * 0.55;
  const w = 40 * k;
  const peak = { x: from.x * 0.45, y: Math.min(from.y, 0) - 50 * k };
  const ang = (q: Spot, r: Spot) => (Math.atan2(r.y - q.y, r.x - q.x) * 180) / Math.PI + 90;
  const stars = useOnce(() => {
    const colors = ["#ff4d6d", "#ffd23f", "#4dd2ff", "#7cff6b", "#c77dff", "#ff9f1c"];
    const ring = (n: number, r: number, delay: number, offset: number) =>
      Array.from({ length: n }, (_, i) => {
        const t = (i / n) * Math.PI * 2 + offset;
        return { dx: Math.cos(t) * r, dy: Math.sin(t) * r, color: colors[(i + Math.round(offset * 3)) % colors.length]!, delay };
      });
    return [...ring(14, a * 1.15, 0.42, 0), ...ring(9, a * 0.62, 0.5, 0.35)];
  });
  return (
    <>
      <motion.div
        className="bomb-fly"
        style={{ width: w, marginLeft: -w / 2, marginTop: -w * 0.42 }}
        initial={{ x: from.x, y: from.y, opacity: 1 }}
        animate={{
          x: [from.x, peak.x, 0],
          y: [from.y, peak.y, lift],
          rotate: [ang(from, peak), ang(from, peak), ang(peak, { x: 0, y: lift })],
          opacity: [1, 1, 0],
        }}
        transition={{ duration: 0.44, times: [0, 0.5, 1], ease: "easeIn" }}
      >
        <BombArt id="fusee" />
      </motion.div>
      <motion.span
        className="bomb-ring is-bloom"
        style={{ width: a, height: a, marginLeft: -a / 2, marginTop: -a / 2 + lift }}
        initial={{ scale: 0.2, opacity: 0 }}
        animate={{ scale: [0.2, 1.4], opacity: [0, 1, 0] }}
        transition={{ delay: 0.42, duration: 0.45 }}
      />
      {stars.map((s, i) => (
        <motion.span
          key={i}
          className="bomb-star"
          style={{ width: 9 * k, height: 9 * k, marginLeft: -4.5 * k, marginTop: -4.5 * k + lift, background: s.color, color: s.color }}
          initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
          animate={{ x: [0, s.dx, s.dx * 1.05], y: [0, s.dy, s.dy + 34 * k], opacity: [0, 1, 1, 0], scale: [0.4, 1, 0.5] }}
          transition={{ delay: s.delay, duration: 1.2, times: [0, 0.35, 1], ease: "easeOut" }}
        />
      ))}
    </>
  );
}

/** Le gaz : la bonbonne arrive, et un nuage vert enfle jusqu'à l'engloutir, traîne, puis se dissipe */
function GasFx({ from, a }: FxProps) {
  const k = a / 64;
  const puffs = useOnce(() =>
    Array.from({ length: 9 }, (_, i) => {
      const ang = (i / 9) * Math.PI * 2 + rand(-0.3, 0.3);
      const r = i === 0 ? 0 : a * rand(0.28, 0.5);
      return {
        x: Math.cos(ang) * r,
        y: Math.sin(ang) * r * 0.8 - a * 0.08,
        size: a * rand(1.05, 1.45),
        drift: { x: rand(-12, 12) * k, y: rand(-16, -4) * k },
        delay: 0.26 + i * 0.045,
      };
    }),
  );
  const bubbles = useOnce(() =>
    Array.from({ length: 9 }, () => ({ x: rand(-0.6, 0.6) * a, size: rand(5, 10) * k, delay: rand(0.6, 1.7), rise: rand(0.7, 1.2) * a })),
  );
  return (
    <>
      <Flyer bomb="gaz" from={from} width={58 * k} end={1.1} duration={0.3} />
      {puffs.map((p, i) => (
        <motion.span
          key={i}
          className="bomb-cloud"
          style={{ width: p.size, height: p.size, marginLeft: -p.size / 2, marginTop: -p.size / 2 }}
          initial={{ x: p.x * 0.3, y: p.y * 0.3, scale: 0.12, opacity: 0 }}
          animate={{
            x: [p.x * 0.3, p.x, p.x + p.drift.x * 0.5, p.x + p.drift.x],
            y: [p.y * 0.3, p.y, p.y + p.drift.y * 0.5, p.y + p.drift.y],
            scale: [0.12, 1, 1.08, 1.35],
            opacity: [0, 0.94, 0.9, 0],
          }}
          transition={{ delay: p.delay, duration: 2.3, times: [0, 0.28, 0.72, 1], ease: "easeOut" }}
        />
      ))}
      {bubbles.map((b, i) => (
        <motion.span
          key={`b${i}`}
          className="bomb-chunk is-bubble"
          style={{ width: b.size, height: b.size }}
          initial={{ x: b.x, y: 0, opacity: 0 }}
          animate={{ x: [b.x, b.x + 6 * k, b.x - 4 * k], y: [0, -b.rise * 0.6, -b.rise], opacity: [0, 0.9, 0] }}
          transition={{ delay: b.delay, duration: 0.9, ease: "easeOut" }}
        />
      ))}
      {["kof", "kof !"].map((t, i) => (
        <motion.span
          key={t}
          className="bomb-cough"
          style={{ fontSize: Math.max(11, 15 * k), marginLeft: (i === 0 ? -0.5 : 0.15) * a }}
          initial={{ y: -a * 0.3, opacity: 0, scale: 0.6 }}
          animate={{ y: -a * 0.95, opacity: [0, 1, 1, 0], scale: 1 }}
          transition={{ delay: 0.95 + i * 0.4, duration: 0.9, ease: "easeOut" }}
        >
          {t}
        </motion.span>
      ))}
    </>
  );
}

/** Au milieu de la table : la forme de l'éclat et son cri, propres à chaque bombe */
export function BombBurst({ bomb, at, width, line }: { bomb: BombId; at: Spot; width: number; line?: ReactNode }) {
  const word = bombInfo(bomb).word;
  // Les longs cris rapetissent pour tenir dans l'éclat
  const fit = Math.min(1, 6.2 / word.length);
  return (
    <motion.div
      className={`meche-burst bomb-burst is-${bomb}`}
      aria-live="polite"
      style={{ left: at.x, top: at.y, width, "--fit": fit } as CSSProperties}
      initial={{ scale: 0.3, rotate: -14 }}
      animate={{ scale: 1, rotate: -4 }}
      exit={{ opacity: 0, scale: 1.1 }}
      transition={{ type: "spring", stiffness: 520, damping: 16 }}
    >
      <svg viewBox="0 0 200 200" aria-hidden="true">
        {SHAPES[bomb]}
      </svg>
      <strong>{word}</strong>
      {line && <span>{line}</span>}
    </motion.div>
  );
}

/** Une étoile à `n` branches, de rayons `r1` (pointes) et `r2` (creux) */
function star(n: number, r1: number, r2: number, jitter = 0): string {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? r1 * (1 - jitter * ((i * 37) % 7) * 0.05) : r2;
    const t = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    pts.push(`${(100 + Math.cos(t) * r).toFixed(1)} ${(100 + Math.sin(t) * r).toFixed(1)}`);
  }
  return `M${pts.join("L")}Z`;
}

/** Un nuage : des bosses rondes tout autour */
function cloud(n: number, r: number, bump: number): string {
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const t0 = (i / n) * Math.PI * 2;
    const t1 = ((i + 1) / n) * Math.PI * 2;
    const tm = (t0 + t1) / 2;
    const p = (t: number, rr: number) => `${(100 + Math.cos(t) * rr).toFixed(1)} ${(100 + Math.sin(t) * rr).toFixed(1)}`;
    if (i === 0) pts.push(`M${p(t0, r)}`);
    pts.push(`Q${p(tm, r + bump)} ${p(t1, r)}`);
  }
  return `${pts.join("")}Z`;
}

const SHAPES: Record<BombId, ReactNode> = {
  dynamite: (
    <>
      <path
        d="M100 4l15 41 34-29-8 44 44-11-29 35 40 15-41 12 28 34-44-8 8 44-34-29-15 42-13-42-36 29 9-44-44 8 29-34-41-12 40-15-29-35 44 11-8-44 34 29z"
        fill="#f4a13a"
        stroke="#2a1a0e"
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <path
        d="M100 32l10 29 24-20-6 31 31-8-20 25 28 10-29 9 20 24-31-6 6 31-24-20-10 29-9-29-25 20 6-31-31 6 20-24-29-9 28-10-20-25 31 8-6-31 25 20z"
        fill="#ffe08a"
      />
    </>
  ),
  ballon: (
    <>
      <path d={star(11, 96, 52, 1)} fill="#ff5c8d" stroke="#5e0d26" strokeWidth="5" strokeLinejoin="round" />
      <path d={star(11, 70, 40, 1)} fill="#ffe1ec" />
    </>
  ),
  neige: (
    <>
      <path d={cloud(9, 74, 26)} fill="#f4fbff" stroke="#2f6a92" strokeWidth="5" strokeLinejoin="round" />
      <path d={cloud(9, 54, 16)} fill="#d6eefc" />
      {[0, 60, 120].map((r) => (
        <path
          key={r}
          d="M100 60v80M88 70l12 10 12-10M88 130l12-10 12 10"
          stroke="#ffffff"
          strokeWidth="5"
          fill="none"
          strokeLinecap="round"
          transform={`rotate(${r} 100 100)`}
          opacity="0.7"
        />
      ))}
    </>
  ),
  gateau: (
    <>
      <path
        d="M100 18c26 0 42 10 52 24 14 2 30 14 30 32 0 14-8 22-8 30 0 10 10 14 10 26 0 16-16 22-30 20-6 18-24 30-54 30-30 0-46-12-52-28-16 2-30-6-30-22 0-10 8-16 8-26s-10-16-10-30c0-18 16-30 32-32 10-14 26-24 52-24Z"
        fill="#fff8f0"
        stroke="#9c3a5c"
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <path d="M60 58c14-12 66-12 80 0 8 8 10 22 4 36-10-6-20 6-30 0s-22 8-34 0-22 4-26-6c-4-12-2-22 6-30Z" fill="#ffc6d6" />
      {[
        [70, 120, "#43c6ac"],
        [96, 136, "#ffd23f"],
        [124, 122, "#6a8dff"],
        [140, 140, "#ff5d8f"],
        [58, 140, "#ffd23f"],
      ].map(([x, y, c]) => (
        <rect
          key={`${x}`}
          x={x as number}
          y={y as number}
          width="12"
          height="5"
          rx="2.5"
          fill={c as string}
          transform={`rotate(${(x as number) % 70} ${x} ${y})`}
        />
      ))}
    </>
  ),
  reveil: (
    <>
      <circle cx="100" cy="100" r="74" fill="#ffd84d" stroke="#5e3b05" strokeWidth="5" />
      <circle cx="100" cy="100" r="54" fill="#fff3b0" />
      {Array.from({ length: 12 }, (_, i) => (
        <path key={i} d="M100 6v18" stroke="#5e3b05" strokeWidth="7" strokeLinecap="round" transform={`rotate(${i * 30 + 15} 100 100)`} />
      ))}
    </>
  ),
  ruche: (
    <>
      <path d="M100 10l78 45v90l-78 45-78-45V55Z" fill="#ffc933" stroke="#3a2208" strokeWidth="5" strokeLinejoin="round" />
      <path d="M100 34l57 33v66l-57 33-57-33V67Z" fill="#ffe28a" />
      {[
        [100, 72],
        [76, 86],
        [124, 86],
        [76, 114],
        [124, 114],
        [100, 128],
      ].map(([x, y]) => (
        <path
          key={`${x}-${y}`}
          d={`M${x} ${y - 9}l8 4.5v9l-8 4.5-8-4.5v-9Z`}
          fill="none"
          stroke="#e8a317"
          strokeWidth="2.4"
          opacity="0.7"
        />
      ))}
    </>
  ),
  fusee: (
    <>
      <path d={star(16, 98, 58)} fill="#c77dff" stroke="#2a1440" strokeWidth="5" strokeLinejoin="round" />
      <path d={star(16, 78, 46)} fill="#4dd2ff" />
      <path d={star(8, 58, 34)} fill="#ffd23f" />
      <circle cx="100" cy="100" r="30" fill="#fff6d6" />
    </>
  ),
  gaz: (
    <>
      <path d={cloud(8, 72, 30)} fill="#8fd14f" stroke="#244a12" strokeWidth="5" strokeLinejoin="round" />
      <path d={cloud(8, 52, 18)} fill="#c6ef8a" />
      <circle cx="58" cy="54" r="7" fill="#d9f7b0" stroke="#244a12" strokeWidth="2.5" />
      <circle cx="150" cy="150" r="9" fill="#d9f7b0" stroke="#244a12" strokeWidth="2.5" />
      <circle cx="160" cy="60" r="5" fill="#d9f7b0" stroke="#244a12" strokeWidth="2.5" />
    </>
  ),
};
