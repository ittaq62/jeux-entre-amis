// Page de travail (seulement en développement) : un service de Toque ! joué sur l'appareil, avec le vrai écran de jeu
// et une petite cuisine-serveur dans la page (le même pas, les mêmes commis, les mêmes envois serrés qu'en ligne).
// /dev/toque?k=bistrot&bots=1&niveau=moyen  (deux : deux chefs à soi ; duel ; spectateur : seulement des commis ;
// coup : coup de feu ; vu : sans la cinématique d'arrivée ; court=30 : un service de 30 s ; graine=12)
// En console, `__tq` donne le monde (`w`) et la vue de la table (`room`). Le retard du réseau se règle comme en ligne
// (localStorage tqLag, tqJitter).

import { useEffect, useRef, useState } from "react";
import { seededAvatar } from "../../shared/avatar.ts";
import { botInput, isBotLevel, newBotTable, newBrain, type BotBrain, type BotLevel } from "../../shared/games/toque/bot.ts";
import { isKitchenId, type KitchenId } from "../../shared/games/toque/kitchens.ts";
import { botLook, DEFAULT_LOOK } from "../../shared/games/toque/looks.ts";
import {
  DEFAULT_CONFIG,
  packInputs,
  packWorld,
  SAMPLE_STRIDE,
  type ToqueClientMessage,
  type ToqueConfig,
  type ToqueOwner,
  type ToqueResult,
  type ToqueRoomView,
  type ToqueSeatView,
} from "../../shared/games/toque/net.ts";
import {
  createWorld,
  FPS,
  OVER_S,
  starsOf,
  starThresholds,
  step,
  type Input,
  type ToqueEvent,
  type World,
} from "../../shared/games/toque/sim.ts";
import { useSession } from "../stores/session.ts";
import { markArrivalSeen } from "./Cinematic.tsx";
import { savedLook } from "./LookPicker.tsx";
import { ToqueGame } from "./ToqueGame.tsx";
import type { ToqueListeners } from "./useToqueRoom.ts";
import "./toque.css";

const NAMES = ["Toi", "Lulu", "Dédé", "Fanfan", "Jojo", "Mimile"];
const NO_INPUT: Input = { x: 0, y: 0, held: 0, pressed: 0 };

function seat(i: number, human: boolean, team: 0 | 1, me: { name: string; avatar: ToqueSeatView["avatar"] } | null): ToqueSeatView {
  return {
    id: human ? "moi" : `bot-${i}`,
    kind: human ? "human" : "bot",
    userId: human ? "moi" : null,
    name: human ? (me?.name ?? NAMES[0]!) : NAMES[i]!,
    avatar: human && me ? me.avatar : seededAvatar(`dev-${i}`),
    photo: 0,
    connected: true,
    autoplay: false,
    isHost: human,
    admin: false,
    team,
    look: human ? (savedLook() ?? DEFAULT_LOOK) : botLook(i * 13 + 5),
  };
}

export function DevToque() {
  const q = useRef(new URLSearchParams(location.search)).current;
  const user = useSession((s) => s.user);
  const listeners = useRef<ToqueListeners>({});
  const [room, setRoom] = useState<ToqueRoomView | null>(null);
  const roomRef = useRef<ToqueRoomView | null>(null);
  const [round, setRound] = useState(0);
  const inbox = useRef<{ samples: { seq: number; input: Input }[]; lastSeq: number; ack: number; stamp: number; last: Input }>({
    samples: [],
    lastSeq: 0,
    ack: 0,
    stamp: 0,
    last: NO_INPUT,
  });

  useEffect(() => {
    const kitchen: KitchenId = isKitchenId(q.get("k")) ? (q.get("k") as KitchenId) : "bistrot";
    const level: BotLevel = isBotLevel(q.get("niveau")) ? (q.get("niveau") as BotLevel) : "moyen";
    const duel = q.has("duel");
    const watch = q.has("spectateur");
    const two = q.has("deux") && !duel && !watch;
    const bots = Math.max(watch ? 1 : 0, Math.min(3, Number(q.get("bots") ?? (two ? 0 : 1))));
    if (q.has("vu")) markArrivalSeen(kitchen);
    const cfg: ToqueConfig = {
      ...DEFAULT_CONFIG,
      mode: duel ? "duel" : "service",
      kitchen,
      botLevel: level,
      rush: q.has("coup"),
      solo: two ? "deux" : "commis",
    };
    const me = user ? { name: user.pseudo, avatar: user.avatar } : null;
    const seats: ToqueSeatView[] = [];
    if (!watch) seats.push(seat(0, true, 0, me));
    for (let i = 1; i <= bots; i++) seats.push(seat(i, false, duel ? ((seats.length % 2) as 0 | 1) : 0, null));
    if (duel && seats.every((s) => s.team === 0)) seats.push(seat(seats.length + 1, false, 1, null));
    const owners: ToqueOwner[] = seats.map((s) => ({
      seat: s.id,
      team: duel ? (s.team ?? 0) : 0,
      chefs: two ? 2 : 1,
      bot: s.kind === "bot",
    }));
    const seed = Number(q.get("graine") ?? Date.now() % 100000);
    const w: World = createWorld(kitchen, duel, owners, seed, { rush: cfg.rush });
    if (q.get("court")) w.end = w.service + Math.max(5, Number(q.get("court"))) * FPS;
    const view: ToqueRoomView = {
      code: "DEV",
      game: "toque",
      status: "playing",
      settings: { visibility: "private", maxPlayers: 4, toque: cfg },
      seats,
      spectators: [],
      hostId: "moi",
      you: { userId: "moi", seatId: watch ? null : "moi", isHost: true, isAdmin: false },
      teams: Object.fromEntries(seats.map((s) => [s.id, (s.team ?? 0) as 0 | 1])),
      toque: { config: cfg, kitchen, duel, owners, seed, goals: w.teams.map((t) => starThresholds(kitchen, t.chefs)), result: null },
      gate: null,
      serverNow: Date.now(),
      rematch: [],
      results: null,
      quick: false,
    };
    roomRef.current = view;
    setRoom(view);
    (window as unknown as { __tq: unknown }).__tq = { w, room: view };

    // La cuisine-serveur : 30 pas par seconde, un envoi tous les deux pas
    const brains = new Map<number, BotBrain>();
    const table = newBotTable();
    let lastInputs: Input[] = owners.map(() => NO_INPUT);
    let pending: ToqueEvent[] = [];
    let steps = 0;
    let acc = 0;
    let last = performance.now();
    let done = false;
    const box = inbox.current;
    box.samples = [];
    box.ack = 0;
    const inputs = (): Input[] =>
      owners.map((o, owner) => {
        if (o.seat === "moi") {
          const next = box.samples.shift();
          if (next) {
            box.ack = next.seq;
            box.last = next.input;
            return next.input;
          }
          return { ...box.last, pressed: 0 };
        }
        const slot = w.active[owner] ?? -1;
        if (slot < 0) return NO_INPUT;
        let brain = brains.get(slot);
        if (!brain) brains.set(slot, (brain = newBrain(slot, level, seed)));
        return botInput(w, slot, brain, table);
      });
    const send = () => {
      const tick = {
        w: packWorld(w),
        k: owners.map((o) => (o.seat === "moi" ? box.ack : 0)),
        c: owners.map((o) => (o.seat === "moi" ? box.stamp : 0)),
        u: packInputs(lastInputs),
        e: pending,
      };
      pending = [];
      listeners.current.onTick?.(Date.now(), JSON.parse(JSON.stringify(tick)));
    };
    const timer = window.setInterval(() => {
      if (done) return;
      const now = performance.now();
      acc += Math.min(now - last, 200);
      last = now;
      let n = 0;
      while (acc >= 1000 / FPS && n++ < 8) {
        acc -= 1000 / FPS;
        lastInputs = inputs();
        pending.push(...step(w, lastInputs));
        steps++;
        if (steps % 2 === 0) send();
        if (w.phase === 2 && w.frame >= w.end + Math.round(OVER_S * FPS)) {
          done = true;
          send();
          const teams = w.teams.map((t) => ({
            score: t.score,
            served: t.served,
            failed: t.failed,
            tips: t.tips,
            best: t.best,
            stars: duel ? 0 : starsOf(kitchen, t.chefs, t.score),
          }));
          const winner = duel ? (teams[0]!.score > teams[1]!.score ? 0 : teams[1]!.score > teams[0]!.score ? 1 : null) : null;
          const result: ToqueResult = { teams, winner, chefs: w.chefs.map((c) => ({ ...c.st, owner: c.owner })) };
          const next = { ...roomRef.current!, status: "finished" as const, toque: { ...roomRef.current!.toque!, result } };
          roomRef.current = next;
          setRoom(next);
          break;
        }
      }
    }, 16);
    return () => window.clearInterval(timer);
  }, [round]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = (msg: ToqueClientMessage) => {
    const box = inbox.current;
    if (msg.t === "in") {
      // Les commandes arrivent numérotées ; on ne garde que les nouvelles, comme la vraie cuisine
      for (let i = 0; i + SAMPLE_STRIDE <= msg.d.length; i += SAMPLE_STRIDE) {
        const seq = msg.s + i / SAMPLE_STRIDE;
        if (seq <= box.lastSeq) continue;
        box.lastSeq = seq;
        box.samples.push({ seq, input: { x: msg.d[i]!, y: msg.d[i + 1]!, held: msg.d[i + 2]!, pressed: msg.d[i + 3]! } });
      }
      box.stamp = msg.c;
    } else if (msg.t === "rematch" || msg.t === "settings") {
      box.lastSeq = 0;
      setRound((r) => r + 1);
    }
  };

  if (!room) return null;
  return (
    <ToqueGame
      key={round}
      room={room}
      send={send}
      listeners={listeners}
      onLeave={() => (location.href = "/")}
      onOpenChat={() => {}}
      unread={0}
      onShowLobby={() => setRound((r) => r + 1)}
      serverOffset={0}
      stars={null}
    />
  );
}
