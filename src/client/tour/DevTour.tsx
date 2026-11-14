// Une page réservée au développement : l'entracte et la fin d'une tournée, avec des parties inventées, pour régler l'affichage
// sans jouer une tournée entière. /dev/tournee?vue=fin&equipes=1&joueurs=8&titres=5&jeux=5
// Le tirage de l'entracte : &programme=7 (nombre de jeux au programme) &tire=bolides (le jeu qui sort) ; &invite=1 : on
// n'est pas l'hôte

import { useMemo, useState } from "react";
import { seededAvatar } from "../../shared/avatar.ts";
import type { GameId } from "../../shared/protocol.ts";
import { tourPoints, type TourGameView, type TourMemberView, type TourTitle, type TourView } from "../../shared/tour.ts";
import { TourFinale } from "./TourFinale.tsx";
import { TourIntermission } from "./TourIntermission.tsx";
import "./tour.css";

const NAMES = ["Quentin", "Gaston", "Ginette", "Marcel", "Josiane", "Raymond", "Huguette", "Lucien-Alexandre"];
const GAMES: GameId[] = ["uno", "bricks", "naval", "capitale", "meche", "bolides", "crampons"];

const TITLES: TourTitle[] = [
  { id: "collector", label: "Le collectionneur", userId: "u1", name: "Gaston", detail: "", stat: "3", unit: "jeux gagnés" },
  { id: "plus-four", label: "Le roi du +4", userId: "u0", name: "Quentin", detail: "", stat: "+8", unit: "cartes données à piocher" },
  { id: "mason", label: "Le maçon", userId: "u2", name: "Ginette", detail: "", stat: "24", unit: "lignes complétées" },
  { id: "admiral", label: "L'amiral", userId: "u3", name: "Marcel", detail: "", stat: "62 %", unit: "de tirs au but" },
  { id: "brave", label: "Le courageux", userId: "u4", name: "Josiane", detail: "", stat: "2×", unit: "dernier, et toujours là" },
];

function mockView(
  kind: "entracte" | "fin",
  teams: boolean,
  players: number,
  titles: number,
  played: number,
  program: GameId[],
  drawn: GameId,
  host: boolean,
): TourView {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647), seed / 2147483647);
  const members: TourMemberView[] = NAMES.slice(0, players).map((name, i) => ({
    userId: `u${i}`,
    kind: i === 0 ? "human" : "bot",
    name,
    avatar: seededAvatar(name),
    photo: 0,
    admin: false,
    connected: true,
    role: "player",
    team: teams ? ((i % 2) as 0 | 1) : null,
    points: 0,
    wins: 0,
    waiting: false,
    left: false,
    isHost: i === (host ? 0 : 1),
  }));
  const games: TourGameView[] = [];
  for (let k = 0; k < played; k++) {
    const order = members.map((m) => ({ m, r: rand() })).sort((a, b) => a.r - b.r);
    const results = order.map(({ m }, rank) => ({ userId: m.userId, name: m.name, rank: rank + 1, points: tourPoints(rank + 1) }));
    for (const r of results) {
      const m = members.find((x) => x.userId === r.userId)!;
      m.points += r.points;
      if (r.rank === 1) m.wins++;
    }
    games.push({
      index: k + 1,
      game: GAMES[k % GAMES.length]!,
      code: `J${k}`,
      startedAt: 0,
      endedAt: 1,
      players: members.map((m) => m.userId),
      results,
      aborted: false,
      variant: "base",
    });
  }
  const now = Date.now();
  return {
    code: "ABCD",
    game: "tour",
    status: kind === "fin" ? "finished" : "intermission",
    settings: {
      visibility: "private",
      maxPlayers: 8,
      games: program,
      end: { kind: "games", count: 5 },
      teams,
      once: false,
      botLevel: "normal",
      rules: "base",
      noEarlyUno: false,
    },
    hostId: host ? "u0" : "u1",
    members,
    spectators: [],
    you: { userId: "u0", isHost: host, isAdmin: false, member: true, role: "player" },
    games,
    current: null,
    next: kind === "fin" ? null : { game: drawn, at: now + 25_000, variant: "base", votes: {} },
    voters: ["u0"],
    ready: [],
    startedAt: now - 600_000,
    endsAt: null,
    finishAfterCurrent: false,
    titles: kind === "fin" ? TITLES.slice(0, titles).map((t, i) => ({ ...t, userId: `u${i % players}`, name: NAMES[i % players]! })) : null,
    notice: null,
    serverNow: now,
    quick: false,
  };
}

export function DevTour() {
  const params = new URLSearchParams(location.search);
  const kind = params.get("vue") === "fin" ? "fin" : "entracte";
  const teams = params.get("equipes") === "1";
  const players = Number(params.get("joueurs") ?? 6);
  const titles = Number(params.get("titres") ?? 5);
  const played = Number(params.get("jeux") ?? 3);
  // Le tirage : combien de jeux au programme (les premiers de la liste), et celui qui sort
  const programCount = Math.min(GAMES.length, Math.max(1, Number(params.get("programme") ?? 5)));
  const drawnParam = params.get("tire");
  const host = params.get("invite") !== "1";
  const [replay, setReplay] = useState(0);
  const view = useMemo(() => {
    const program = GAMES.slice(0, programCount);
    const drawn = program.find((g) => g === drawnParam) ?? program[Math.min(2, program.length - 1)]!;
    return mockView(kind, teams, players, titles, played, program, drawn, host);
  }, [kind, teams, players, titles, played, programCount, drawnParam, host]);
  const props = { view, send: () => {}, serverOffset: 0, unread: 0, onOpenChat: () => {}, onLeave: () => setReplay((n) => n + 1) };
  return kind === "fin" ? <TourFinale key={replay} {...props} /> : <TourIntermission key={replay} {...props} />;
}
