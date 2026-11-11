import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import type { Card } from "../../shared/games/uno/cards.ts";
import type { UnoPlayerView } from "../../shared/games/uno/view.ts";
import type { SeatView } from "../../shared/protocol.ts";
import { AdminBadge } from "../components/AdminBadge.tsx";
import { Avatar } from "../components/Avatar.tsx";
import { CardBack, CardFace } from "../components/Card.tsx";
import { Icon } from "../components/Icon.tsx";
import { AwayNote } from "./AwayNote.tsx";
import { anchor } from "./fx.ts";
import { sortHand } from "./Hand.tsx";
import type { EmoteBubble } from "./useRoom.ts";

interface SeatProps {
  seat: SeatView;
  player: UnoPlayerView;
  isTurn: boolean;
  deadline: number | null;
  turnSeconds: number;
  serverOffset: number;
  showScore: boolean;
  emotes: EmoteBubble[];
  compact: boolean;
  vulnerable: boolean;
  onCatch?: () => void;
  mercyLimit: number | null;
  /** En équipe : la couleur de son équipe, et sa main s'il est notre coéquipier */
  teamColor?: string;
  partnerHand?: Card[];
}

export function Seat({
  seat,
  player,
  isTurn,
  deadline,
  turnSeconds,
  serverOffset,
  showScore,
  emotes,
  compact,
  vulnerable,
  onCatch,
  mercyLimit,
  teamColor,
  partnerHand,
}: SeatProps) {
  const size = compact ? 44 : 58;
  const fan = Math.min(player.count, compact ? 5 : 8);
  const danger = mercyLimit !== null && player.count >= mercyLimit - 5;
  return (
    <div
      className={`seat ${isTurn ? "is-turn" : ""} ${player.out ? "is-out" : ""} ${seat.connected ? "" : "is-offline"} ${teamColor ? "has-team" : ""} ${partnerHand ? "is-partner" : ""}`}
      style={teamColor ? { ["--team-color" as string]: teamColor } : undefined}
      ref={anchor(`seat-${seat.id}`)}
    >
      <div className="seat-avatar" style={{ width: size + 12, height: size + 12 }}>
        {isTurn && <TimerRing size={size + 12} deadline={deadline} total={turnSeconds} offset={serverOffset} />}
        <Avatar avatar={seat.avatar} userId={seat.userId} photo={seat.photo} size={size} title={seat.name} />
        {seat.kind === "bot" && (
          <span className="seat-tag" title="Bot">
            <Icon name="bot" size={12} />
          </span>
        )}
        {seat.autoplay && seat.kind === "human" && (
          <span className="seat-tag seat-tag-auto" title="Un bot joue à sa place">
            <Icon name="bot" size={12} />
          </span>
        )}
        {!seat.connected && (
          <span className="seat-tag seat-tag-off" title="Déconnecté">
            <Icon name="wifiOff" size={12} />
          </span>
        )}
        <AnimatePresence>
          {player.count === 1 && !player.out && (
            <motion.span
              className={`uno-badge ${player.declaredUno ? "" : "is-naked"}`}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
            >
              UNO
            </motion.span>
          )}
        </AnimatePresence>
        {player.rank && <span className="rank-badge num">{player.rank}</span>}
        {player.eliminated && <span className="rank-badge is-out">×</span>}
      </div>
      <div className="seat-plate">
        <span className="seat-plate-name">{seat.name}</span>
        {seat.admin && <AdminBadge />}
      </div>
      {partnerHand && <span className="seat-partner-tag">ton coéquipier</span>}
      <AwayNote seat={seat} serverOffset={serverOffset} compact={compact} />
      <div className="seat-meta">
        {partnerHand && !player.out ? (
          <PartnerHand hand={partnerHand} compact={compact} />
        ) : (
          !player.out && (
            <div
              className="seat-fan"
              aria-label={`${player.count} cartes`}
              style={{ width: (compact ? 14 : 18) + (fan - 1) * (compact ? 5 : 7) + 8 }}
            >
              {Array.from({ length: fan }, (_, i) => (
                <span
                  key={i}
                  className="seat-fan-card"
                  style={{ transform: `translateX(${(i - (fan - 1) / 2) * (compact ? 5 : 7)}px) rotate(${(i - (fan - 1) / 2) * 7}deg)` }}
                >
                  <CardBack width={compact ? 14 : 18} skin={seat.back ?? "classique"} />
                </span>
              ))}
            </div>
          )
        )}
        <span className={`seat-count num ${danger ? "is-danger" : ""}`}>
          {player.out ? (player.eliminated ? "éliminé" : "fini") : player.count}
        </span>
        {showScore && <span className="seat-score num">{player.score} pts</span>}
      </div>
      {vulnerable && onCatch && (
        <motion.button className="catch-btn" onClick={onCatch} initial={{ scale: 0 }} animate={{ scale: 1 }} whileTap={{ scale: 0.9 }}>
          Contre-UNO
        </motion.button>
      )}
      <AnimatePresence>
        {emotes.map((e) => (
          <motion.div
            key={e.id}
            className={`emote-bubble ${e.emote.length <= 2 ? "is-emoji" : ""}`}
            initial={{ y: 10, scale: 0.4, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: -16, opacity: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 22 }}
          >
            {e.emote}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/** La main de son coéquipier, face visible : les cartes se serrent pour tenir sous son siège */
function PartnerHand({ hand, compact }: { hand: Card[]; compact: boolean }) {
  const width = compact ? 20 : 28;
  const room = compact ? 120 : 190;
  const cards = sortHand(hand);
  const step = cards.length > 1 ? Math.min(width * 0.66, (room - width) / (cards.length - 1)) : 0;
  return (
    <div
      className="partner-hand"
      aria-label={`Sa main : ${cards.length} cartes`}
      style={{ width: width + step * Math.max(0, cards.length - 1), height: width * 1.4 }}
    >
      {cards.map((c, i) => (
        <span key={c.id} className="partner-card" style={{ left: i * step }}>
          <CardFace card={c} width={width} />
        </span>
      ))}
    </div>
  );
}

export function TimerRing({ size, deadline, total, offset }: { size: number; deadline: number | null; total: number; offset: number }) {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    if (!deadline) return;
    let frame = 0;
    const tick = () => {
      setNow(Date.now() + offset);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [deadline, offset]);
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  const left = deadline && total > 0 ? Math.max(0, Math.min(1, (deadline - now) / (total * 1000))) : 1;
  const color = left > 0.25 ? "var(--gold)" : "#d9473a";
  return (
    <svg className="timer-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="4" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - left)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}
