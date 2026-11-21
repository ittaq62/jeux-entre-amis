import { useMemo } from "react";
import { teamName } from "../../shared/games/capitale/board.ts";
import { DEFAULT_SETTINGS } from "../../shared/games/capitale/engine.ts";
import { applyDrawnRules } from "../../shared/randomRules.ts";
import type { CapitaleClientMessage, CapitaleRoomView } from "../../shared/protocol.ts";
import { usePrefs } from "../stores/prefs.ts";
import { tableDraw } from "../game/RandomRules.tsx";
import { TablePick } from "../tour/TablePick.tsx";
import { TokenPicker } from "./CapitaleLobby.tsx";
import { MONOPOLY_RULE } from "./TeamRules.tsx";
import { tokenThumbnails } from "./scene/tokens.ts";
import { pawnColor, seatTeams, TeamMark, teamRulesText } from "./teamsUi.tsx";

// L'annonce avant la partie (dans une tournée, où Capitale n'a pas de salon, et avant une revanche) : chacun choisit son
// pion dans la fenêtre commune à tous les jeux (voir TablePick). Chaque joueur y garde la couleur de son pion ; en
// équipes, une teinte de son équipe, avec la forme de l'équipe, les joueurs rangés par équipe et un rappel des règles
// d'équipe.

/** La première lettre en capitale : les règles d'équipe commencent une phrase */
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

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
  // Les règles telles qu'elles seront jouées (au hasard, celles du tirage)
  const settings = applyDrawnRules("capitale", room.settings.capitale, DEFAULT_SETTINGS, tableDraw(room));
  return (
    <TablePick
      game="capitale"
      room={room}
      serverOffset={serverOffset}
      onReady={() => send({ t: "ready" })}
      drawn={tableDraw(room)}
      teamName={teams ? teamName : undefined}
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
              <strong>En équipes :</strong> {capitalize(teamRulesText({ settings }).join(" ; "))}.
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
