import { createElement, useCallback, useEffect, useRef, useState } from "react";
import { ACHIEVEMENT_BY_ID } from "../../shared/achievements.ts";
import type { BolidesEvent } from "../../shared/games/bolides/race.ts";
import type { KartNet } from "../../shared/games/bolides/view.ts";
import type { BolidesClientMessage, BolidesRoomView, BolidesServerMessage, ChatMessage } from "../../shared/protocol.ts";
import { Chip } from "../components/Chip.tsx";
import { announceSeatChanges } from "../game/AwayNote.tsx";
import type { EmoteBubble } from "../game/useRoom.ts";
import { api, ApiError } from "../lib/api.ts";
import { LiveSocket, type SocketStatus } from "../lib/socket.ts";
import { play } from "../lib/sound.ts";
import { toast } from "../lib/toast.ts";
import { useSession } from "../stores/session.ts";

let emoteSeq = 0;

/** Ce que la course écoute directement, sans passer par React : les positions et les évènements */
export interface RaceListeners {
  onTick?: (now: number, karts: KartNet[], ages?: number[]) => void;
  onEvents?: (events: BolidesEvent[]) => void;
}

/** Connexion à une table de Bolides : la vue de la course, les positions des karts, le chat, les réactions. */
export function useBolidesRoom(code: string) {
  const me = useSession((s) => s.user);
  const [view, setView] = useState<BolidesRoomView | null>(null);
  const [status, setStatus] = useState<SocketStatus>("connecting");
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [emotes, setEmotes] = useState<EmoteBubble[]>([]);
  const [fatal, setFatal] = useState<string | null>(null);
  const [serverOffset, setServerOffset] = useState(0);
  const socket = useRef<LiveSocket<BolidesServerMessage, BolidesClientMessage> | null>(null);
  const viewRef = useRef<BolidesRoomView | null>(null);
  const listeners = useRef<RaceListeners>({});

  const onRoom = useCallback((next: BolidesRoomView, events: BolidesEvent[]) => {
    const prev = viewRef.current;
    viewRef.current = next;
    // Les évènements d'abord : la course les joue avec ce qu'elle sait encore (un piège qui vient de disparaître…)
    if (events.length > 0) listeners.current.onEvents?.(events);
    setView(next);
    announceSeatChanges(prev, next, next.you.userId);
    setServerOffset(next.serverNow - Date.now());
  }, []);

  useEffect(() => {
    let cancelled = false;
    setFatal(null);
    setView(null);
    viewRef.current = null;
    api
      .get(`/rooms/${code}`)
      .then(() => {
        if (cancelled) return;
        socket.current = new LiveSocket<BolidesServerMessage, BolidesClientMessage>(`/rooms/${code}/ws`, {
          fatalCodes: [4003, 4004],
          onStatus: setStatus,
          onMessage: (msg) => {
            switch (msg.t) {
              case "room":
                onRoom(msg.room, msg.events);
                break;
              case "tick":
                listeners.current.onTick?.(msg.now, msg.k, msg.a);
                break;
              case "fx":
                listeners.current.onEvents?.(msg.events);
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
                    2200 + i * 1400,
                  );
                });
                break;
              }
              case "error":
                toast({ tone: "danger", title: msg.message, duration: 3200 });
                play("buzzer", { volume: 0.35 });
                break;
              case "kicked":
                setFatal("Tu as été exclu de ce salon.");
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
  }, [code, onRoom]);

  const send = useCallback((msg: BolidesClientMessage) => socket.current?.send(msg), []);
  return { view, status, chat, emotes, fatal, send, serverOffset, me, listeners };
}
