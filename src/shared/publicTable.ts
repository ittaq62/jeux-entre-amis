// Ce qu'on peut dire d'une table à quelqu'un qui n'est pas encore connecté : la page de connexion ouverte par un lien
// d'invitation (« Lucie t'attend à sa table de UNO, 2 places libres »), et l'aperçu d'un lien envoyé dans une messagerie.
// Seulement le jeu, l'hôte et la place qu'il reste : ni les noms des autres joueurs, ni les règles, ni la discussion.

import type { RoomStatus, RoomSummary, TableGame } from "./protocol.ts";

export interface PublicTable {
  code: string;
  /** Le jeu, ou « tour » pour une tournée */
  game: TableGame;
  kind: "table" | "tour";
  hostName: string;
  status: RoomStatus;
  humans: number;
  bots: number;
  maxPlayers: number;
  /** Places qu'un nouveau venu peut prendre : libres, ou tenues par un bot qui la cède */
  freeSeats: number;
  /** Une partie lancée accepte qu'on la rejoigne en cours de route */
  lateJoin: boolean;
}

export function publicTable(s: RoomSummary): PublicTable {
  const free = Math.max(0, s.maxPlayers - s.humans - s.bots) + (s.game === "tour" || s.status !== "playing" ? s.bots : 0);
  return {
    code: s.code,
    game: s.game,
    kind: s.game === "tour" ? "tour" : "table",
    hostName: s.hostName,
    status: s.status,
    humans: s.humans,
    bots: s.bots,
    maxPlayers: s.maxPlayers,
    freeSeats: Math.max(0, Math.min(free, s.maxPlayers - s.humans)),
    lateJoin: Boolean(s.lateJoin),
  };
}
