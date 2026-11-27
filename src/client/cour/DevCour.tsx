// La page de travail de La Cour des Grands (seulement en développement) : une partie jouée dans la page, sans serveur,
// avec la vraie interface. ?ep=soleil (une épreuve seule) &n=24 (candidats) &vite=2 (le temps accéléré) &spectateur=1
// &campagne=soleil (un chapitre) &court=1 (cinématiques courtes)

import { useEffect, useMemo, useRef, useState } from "react";
import { seededAvatar } from "../../shared/avatar.ts";
import { CHAPTER_BY_ID } from "../../shared/games/cour/campaign.ts";
import { DEFAULT_CONFIG, mergeConfig } from "../../shared/games/cour/config.ts";
import type { EpreuveId } from "../../shared/games/cour/epreuves.ts";
import { botLook, DEFAULT_LOOK } from "../../shared/games/cour/looks.ts";
import { computeRanks, createMatch, matchInput, matchView, skipCinematic, tickMatch, type Hooks } from "../../shared/games/cour/match.ts";
import { CROWD_NAMES } from "../../shared/games/cour/names.ts";
import type { Candidate, CourClientMessage, CourRoomView } from "../../shared/games/cour/net.ts";
import { useSession } from "../stores/session.ts";
import { CourGame } from "./CourGame.tsx";
import type { CourListeners } from "./useCourRoom.ts";
import "./cour.css";

export function DevCour() {
  const user = useSession((s) => s.user);
  const q = new URLSearchParams(location.search);
  const ep = q.get("ep") as EpreuveId | null;
  const chapter = q.get("campagne") ? CHAPTER_BY_ID.get(q.get("campagne")!) : undefined;
  const n = chapter ? chapter.candidates : Number(q.get("n") ?? 24);
  const speed = Number(q.get("vite") ?? 1);
  const watching = Boolean(q.get("spectateur"));
  const me = watching ? null : "moi";
  const listeners = useRef<CourListeners>({});
  const clock = useRef(Date.now());
  const sim = useMemo(() => {
    const roster: Candidate[] = Array.from({ length: n }, (_, k) => {
      if (k === 0 && me)
        return {
          id: "moi",
          name: user?.pseudo ?? "Moi",
          avatar: user?.avatar ?? seededAvatar("moi"),
          photo: 0,
          userId: user?.id ?? "u-moi",
          look: DEFAULT_LOOK,
        };
      const name = chapter && k === 1 ? "Gaspard" : CROWD_NAMES[k % CROWD_NAMES.length]!;
      return { id: `c${k}`, name, avatar: seededAvatar(`${name}-${k}`), photo: 0, userId: null, look: botLook(k * 7) };
    });
    const only = chapter?.ep ?? ep ?? "";
    const cfg = mergeConfig(DEFAULT_CONFIG, { only, cinema: !q.get("court"), botLevel: chapter?.level ?? "moyen" });
    const m = createMatch(
      cfg,
      roster.map((c) => ({ id: c.id, human: c.userId !== null, level: cfg.botLevel })),
      Number(q.get("seed") ?? Date.now() % 100000),
      clock.current,
      only ? { program: [only], ...(chapter ? { keep: chapter.keep } : {}) } : {},
    );
    return { roster, m };
    // Une seule partie par page
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const hooks: Hooks = { auto: (id) => id !== "moi", live: (id) => id === "moi" };
  const [, setTick] = useState(0);
  const serverNow = () => clock.current;

  useEffect(() => {
    let last = performance.now();
    const id = setInterval(() => {
      const t = performance.now();
      const step = (t - last) * speed;
      last = t;
      clock.current += step;
      tickMatch(sim.m, clock.current, Math.min(0.12, step / 1000), hooks, me ? ["moi"] : []);
      if (sim.m.phase === "over" && !sim.m.ranks) sim.m.ranks = computeRanks(sim.m);
      listeners.current.onMatch?.(matchView(sim.m, clock.current));
      setTick((x) => (x + 1) % 1_000_000);
    }, 50);
    (window as unknown as Record<string, unknown>).__cour = sim;
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = (msg: CourClientMessage) => {
    if (msg.t === "in" && me) matchInput(sim.m, me, msg.i, clock.current, hooks);
    if (msg.t === "skip" && me) skipCinematic(sim.m, me);
  };
  const mv = matchView(sim.m, clock.current);
  const over = sim.m.phase === "over";
  const room: CourRoomView = {
    code: "DEV1",
    game: "cour",
    status: over ? "finished" : "playing",
    settings: { visibility: "private", maxPlayers: 8, cour: sim.m.cfg },
    seats: me
      ? [
          {
            id: "moi",
            kind: "human",
            userId: user?.id ?? "u-moi",
            name: user?.pseudo ?? "Moi",
            avatar: sim.roster[0]!.avatar,
            photo: 0,
            connected: true,
            autoplay: false,
            isHost: true,
            admin: false,
            look: DEFAULT_LOOK,
          },
        ]
      : [],
    spectators: [],
    hostId: user?.id ?? "u-moi",
    you: { userId: user?.id ?? "u-moi", seatId: me, isHost: true, isAdmin: true },
    roster: sim.roster,
    match: mv,
    gate: null,
    serverNow: clock.current,
    rematch: [],
    results: null,
    quick: false,
    campaign: chapter ? { chapter: chapter.id, score: null, stars: null } : null,
  };
  return (
    <CourGame
      room={room}
      send={send}
      serverNow={serverNow}
      listeners={listeners}
      stars={null}
      onLeave={() => (location.href = "/")}
      onOpenChat={() => {}}
      unread={0}
      onShowLobby={() => {}}
    />
  );
}
