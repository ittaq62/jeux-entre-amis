import { createElement, useCallback, useEffect, useRef, useState } from "react";
import { ACHIEVEMENT_BY_ID } from "../../shared/achievements.ts";
import type { ChatMessage, RoomClientMessage, RoomServerMessage, RoomView } from "../../shared/protocol.ts";
import type { UnoEvent } from "../../shared/games/uno/engine.ts";
import { Chip } from "../components/Chip.tsx";
import { api, ApiError } from "../lib/api.ts";
import { LiveSocket, type SocketStatus } from "../lib/socket.ts";
import { play, vibrate } from "../lib/sound.ts";
import { toast } from "../lib/toast.ts";
import { useSession } from "../stores/session.ts";
import { animateEvents } from "./animate.ts";
import { usePileExtras } from "./pileExtras.ts";

export interface EmoteBubble {
  id: number;
  seatId: string | null;
  userId: string;
  emote: string;
}

let emoteSeq = 0;

/** Connexion a un salon : file de messages animes, chat, reactions. */
export function useRoom(code: string) {
  const me = useSession((s) => s.user);
  const [view, setView] = useState<RoomView | null>(null);
  const [status, setStatus] = useState<SocketStatus>("connecting");
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [emotes, setEmotes] = useState<EmoteBubble[]>([]);
  const [fatal, setFatal] = useState<string | null>(null);
  const [serverOffset, setServerOffset] = useState(0);
  const socket = useRef<LiveSocket<RoomServerMessage, RoomClientMessage> | null>(null);
  const viewRef = useRef<RoomView | null>(null);
  const queue = useRef<{ room: RoomView; events: UnoEvent[] }[]>([]);
  const running = useRef(false);

  const commit = useCallback((prev: RoomView | null, next: RoomView) => {
    viewRef.current = next;
    setView(next);
    const seat = next.you.seatId;
    const g = next.uno;
    if (!g || !seat) return;
    if (g.phase === "playing" && g.turn === seat && prev?.uno?.turn !== seat) {
      play("yourTurn");
      vibrate([30, 40, 30]);
    }
    if (prev?.status === "playing" && next.status === "finished" && g.ranking) {
      play(g.ranking[0] === seat ? "win" : "lose");
    }
  }, []);

  const pump = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      while (queue.current.length > 0) {
        const item = queue.current.shift()!;
        const prev = viewRef.current;
        const animate = prev?.uno && item.events.length > 0 && document.visibilityState === "visible" && queue.current.length < 3;
        if (animate) {
          try {
            await animateEvents(item.events, prev, item.room);
          } catch (err) {
            console.error(err);
          }
        }
        usePileExtras.getState().reset();
        commit(prev, item.room);
      }
    } finally {
      running.current = false;
    }
  }, [commit]);

  useEffect(() => {
    let cancelled = false;
    setFatal(null);
    setView(null);
    viewRef.current = null;
    queue.current = [];
    api
      .get(`/rooms/${code}`)
      .then(() => {
        if (cancelled) return;
        socket.current = new LiveSocket<RoomServerMessage, RoomClientMessage>(`/rooms/${code}/ws`, {
          fatalCodes: [4003],
          onStatus: setStatus,
          onMessage: (msg) => {
            switch (msg.t) {
              case "room":
                setServerOffset(msg.room.serverNow - Date.now());
                queue.current.push({ room: msg.room, events: msg.events });
                void pump();
                break;
              case "chat":
                if (msg.reset) setChat(msg.messages);
                else {
                  setChat((prev) => [...prev, ...msg.messages].slice(-120));
                  if (msg.messages.some((m) => !m.system && m.userId !== useSession.getState().user?.id)) play("chat");
                }
                break;
              case "emote": {
                const id = ++emoteSeq;
                setEmotes((prev) => [...prev.slice(-12), { id, seatId: msg.seatId, userId: msg.userId, emote: msg.emote }]);
                setTimeout(() => setEmotes((prev) => prev.filter((e) => e.id !== id)), 2800);
                play("pop", { volume: 0.7 });
                break;
              }
              case "achievements": {
                const mine = msg.unlocks.find((u) => u.userId === useSession.getState().user?.id);
                mine?.ids.forEach((id, i) => {
                  const a = ACHIEVEMENT_BY_ID.get(id);
                  if (!a) return;
                  setTimeout(
                    () => {
                      play("achievement");
                      toast({
                        icon: createElement(Chip, { label: a.chip, tone: a.tone, size: 34 }),
                        tone: "gold",
                        title: `Succès débloqué : ${a.title}`,
                        body: a.description,
                        duration: 6000,
                      });
                    },
                    1800 + i * 1400,
                  );
                });
                break;
              }
              case "error":
                toast({ tone: "danger", title: msg.message, duration: 3000 });
                play("buzzer", { volume: 0.35 });
                break;
              case "kicked":
                setFatal("L'hôte t'a exclu de ce salon.");
                break;
              case "closed":
                setFatal(msg.reason);
                break;
            }
          },
        });
      })
      .catch((err) => {
        if (!cancelled) setFatal(err instanceof ApiError ? err.message : "Salon introuvable.");
      });
    return () => {
      cancelled = true;
      socket.current?.close();
      socket.current = null;
    };
  }, [code, pump]);

  const send = useCallback((msg: RoomClientMessage) => socket.current?.send(msg), []);

  return { view, status, chat, emotes, fatal, send, serverOffset, me };
}
