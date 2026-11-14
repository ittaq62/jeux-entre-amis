import { useMemo } from "react";
import { teamName } from "../../shared/games/capitale/board.ts";
import type { CapitaleClientMessage, CapitaleRoomView } from "../../shared/protocol.ts";
import { usePrefs } from "../stores/prefs.ts";
import { TablePick } from "../tour/TablePick.tsx";
import { TokenPicker } from "./CapitaleLobby.tsx";
import { MONOPOLY_RULE } from "./TeamRules.tsx";
import { tokenThumbnails } from "./scene/tokens.ts";
import { pawnColor, seatTeams, TeamMark, teamRulesText } from "./teamsUi.tsx";

// Dans une tournée, Capitale n'a pas de salon : juste avant la partie, chacun choisit son pion dans la fenêtre commune
// à tous les jeux (voir TablePick). Chaque joueur y garde la couleur de son pion ; en équipes, une teinte de son équipe,
// avec la forme de l'équipe, et un rappel de qui joue avec qui et des règles d'équipe.

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
  const mine = room.seats.find((s) => s.id === room.you.seatId);
  const setPrefs = usePrefs((p) => p.set);
  const ids = room.seats.map((s) => s.id);
  const teams = seatTeams(room.seats);
  const color = (id: string) => pawnColor(ids, teams, id);
  const crews = teams ? [...new Set(room.seats.map((s) => s.team!))].sort((a, b) => a - b) : [];
  const settings = room.settings.capitale;
  return (
    <TablePick
      game="capitale"
      room={room}
      serverOffset={serverOffset}
      onReady={() => send({ t: "ready" })}
      seatColor={(s) => color(s.id)}
      seatLook={(s) => (
        <>
          <SeatToken color={color(s.id)} token={s.token ?? "pion"} />
          {s.team !== undefined && teams && <TeamMark team={s.team} size={15} />}
        </>
      )}
    >
      {mine && (
        <TokenPicker
          color={color(mine.id)}
          current={mine.token ?? "pion"}
          onPick={(token) => {
            setPrefs({ capitaleToken: token });
            send({ t: "token", token });
          }}
        />
      )}
      {(teams || settings.monopoly) && (
        <div className="cap-pick-rules">
          {teams && (
            <p>
              <strong>En équipes :</strong>{" "}
              {crews.map((t, k) => (
                <span key={t}>
                  {k > 0 && " contre "}
                  <TeamMark team={t} size={13} /> {teamName(t)} (
                  {room.seats
                    .filter((s) => s.team === t)
                    .map((s) => (s.id === mine?.id ? "toi" : s.name))
                    .join(", ")}
                  )
                </span>
              ))}
              . {teamRulesText({ settings }).join(" ; ")}.
            </p>
          )}
          {settings.monopoly && (
            <p>
              <strong>Monopole :</strong> {MONOPOLY_RULE}
            </p>
          )}
        </div>
      )}
    </TablePick>
  );
}
