import { Link } from "wouter";
import { JOINS_STARTED } from "../../shared/lateJoin.ts";
import type { PresenceRoom, RoomStatus, TableGame } from "../../shared/protocol.ts";
import { tableHref } from "../lib/arrival.ts";

/**
 * Les boutons d'une table vue d'ailleurs (l'accueil, la page des amis). Avant la partie : la rejoindre. Pendant :
 * « Regarder », qui n'assoit jamais personne, et « Rejoindre » seulement si l'hôte l'ouvre en cours de route et que
 * le jeu le permet. `canWatch` : faux pour une table fermée où l'on n'a aucun ami.
 */
export function TableLinks({
  code,
  game,
  status,
  lateJoin,
  canWatch = true,
  joinLabel = "Rejoindre",
}: {
  code: string;
  game: TableGame;
  status: RoomStatus;
  lateJoin?: boolean;
  canWatch?: boolean;
  joinLabel?: string;
}) {
  if (status !== "playing") {
    return (
      <Link href={tableHref(code)} className="btn btn-sm">
        {joinLabel}
      </Link>
    );
  }
  // Une table d'avant ce réglage ne dit rien : elle s'ouvre comme avant
  const open = lateJoin !== false;
  return (
    <>
      {open && JOINS_STARTED[game] && (
        <Link href={tableHref(code, "play")} className="btn btn-sm btn-primary">
          Rejoindre
        </Link>
      )}
      {canWatch || open ? (
        <Link href={tableHref(code, "watch")} className="btn btn-sm">
          Regarder
        </Link>
      ) : (
        <button className="btn btn-sm" disabled title="Fermée en cours de route : seuls les amis des joueurs la regardent">
          Fermée
        </button>
      )}
    </>
  );
}

/** Ce que dit une carte de table du réglage « Rejoindre en cours de route » */
export function lateJoinTag(lateJoin: boolean | undefined): string {
  return lateJoin === false ? "fermée en cours de route" : "ouverte en cours de route";
}

/**
 * Où est un ami en ligne : « en ligne », « à une table », « en pleine partie », « en tournée ». Avec `withCode`, le code
 * de la table ou de la tournée suit (« à la table ABCD »).
 */
export function presenceText(room: PresenceRoom | null | undefined, withCode = false): string {
  if (!room) return "en ligne";
  if (room.game === "tour") return withCode ? `en tournée, ${room.code}` : "en tournée";
  if (room.status === "playing") return withCode ? `en pleine partie, table ${room.code}` : "en pleine partie";
  return withCode ? `à la table ${room.code}` : "à une table";
}
