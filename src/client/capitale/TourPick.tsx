import { useMemo } from "react";
import type { CapitaleClientMessage, CapitaleRoomView } from "../../shared/protocol.ts";
import { Avatar } from "../components/Avatar.tsx";
import { Icon } from "../components/Icon.tsx";
import { useCountdown } from "../lib/countdown.ts";
import { PAWN_COLORS } from "./boardUi.ts";
import { TokenPicker } from "./CapitaleLobby.tsx";
import { tokenThumbnails } from "./scene/tokens.ts";

// Dans une tournée, Capitale n'a pas de salon : juste avant la partie, chacun choisit son pion.
// Le compte à rebours part quand tout le monde est arrivé ; la partie démarre plus tôt si tous sont prêts.

function SeatToken({ color, token }: { color: string; token: string }) {
  const thumbs = useMemo(() => tokenThumbnails(color, 96), [color]);
  const src = thumbs[token as keyof typeof thumbs];
  return src ? <img src={src} alt="" width={44} height={44} /> : <span className="cap-pick-blank" />;
}

export function TourPick({
  room,
  send,
  serverOffset,
}: {
  room: CapitaleRoomView;
  send: (msg: CapitaleClientMessage) => void;
  serverOffset: number;
}) {
  const left = useCountdown(room.pickUntil ?? null, serverOffset);
  const index = room.seats.findIndex((s) => s.id === room.you.seatId);
  const mine = index >= 0 ? room.seats[index] : undefined;
  const ready = room.ready ?? [];
  const meReady = ready.includes(room.you.userId);
  return (
    <div className="felt center-screen tour-waiting">
      <div className="tour-waiting-card cap-pick">
        <h2>Capitale</h2>
        <p className="hint">{left !== null ? `La partie commence dans ${left} s` : "On attend que tout le monde arrive…"}</p>
        {mine && (
          <TokenPicker
            color={PAWN_COLORS[index % PAWN_COLORS.length]!}
            current={mine.token ?? "pion"}
            onPick={(token) => send({ t: "token", token })}
          />
        )}
        <ul className="cap-pick-seats">
          {room.seats.map((s, k) => (
            <li key={s.id} style={{ ["--pawn" as string]: PAWN_COLORS[k % PAWN_COLORS.length] }}>
              <SeatToken color={PAWN_COLORS[k % PAWN_COLORS.length]!} token={s.token ?? "pion"} />
              <Avatar avatar={s.avatar} userId={s.userId} photo={s.photo} size={26} />
              <span>{s.name}</span>
              {(s.kind === "bot" || (s.userId && ready.includes(s.userId))) && <Icon name="check" size={16} />}
            </li>
          ))}
        </ul>
        {mine && (
          <button className="btn btn-primary btn-lg" disabled={meReady} onClick={() => send({ t: "ready" })}>
            {meReady ? "Prêt : on attend les autres" : "Je suis prêt"}
          </button>
        )}
      </div>
    </div>
  );
}
