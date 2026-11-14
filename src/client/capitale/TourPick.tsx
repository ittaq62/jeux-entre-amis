import { useMemo } from "react";
import type { CapitaleClientMessage, CapitaleRoomView } from "../../shared/protocol.ts";
import { usePrefs } from "../stores/prefs.ts";
import { TablePick } from "../tour/TablePick.tsx";
import { PAWN_COLORS } from "./boardUi.ts";
import { TokenPicker } from "./CapitaleLobby.tsx";
import { tokenThumbnails } from "./scene/tokens.ts";

// Dans une tournée, Capitale n'a pas de salon : juste avant la partie, chacun choisit son pion dans la fenêtre commune
// à tous les jeux (voir TablePick). Chaque joueur y garde la couleur de son pion.

const pawnColor = (k: number) => PAWN_COLORS[k % PAWN_COLORS.length]!;

function SeatToken({ color, token }: { color: string; token: string }) {
  const thumbs = useMemo(() => tokenThumbnails(color, 96), [color]);
  const src = thumbs[token as keyof typeof thumbs];
  return src ? <img src={src} alt="" width={34} height={34} /> : <span className="table-pick-blank" />;
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
  const index = room.seats.findIndex((s) => s.id === room.you.seatId);
  const mine = index >= 0 ? room.seats[index] : undefined;
  const setPrefs = usePrefs((p) => p.set);
  return (
    <TablePick
      game="capitale"
      room={room}
      serverOffset={serverOffset}
      onReady={() => send({ t: "ready" })}
      seatColor={(_, k) => pawnColor(k)}
      seatLook={(s, k) => <SeatToken color={pawnColor(k)} token={s.token ?? "pion"} />}
    >
      {mine && (
        <TokenPicker
          color={pawnColor(index)}
          current={mine.token ?? "pion"}
          onPick={(token) => {
            setPrefs({ capitaleToken: token });
            send({ t: "token", token });
          }}
        />
      )}
    </TablePick>
  );
}
