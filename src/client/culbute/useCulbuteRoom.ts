import { createElement, useCallback, useEffect, useRef, useState } from "react";
import { ACHIEVEMENT_BY_ID } from "../../shared/achievements.ts";
import type { FightEvent } from "../../shared/games/culbute/model.ts";
import type { CulbuteClientMessage, CulbuteRoomView, CulbuteServerMessage } from "../../shared/games/culbute/net.ts";
import type { CulbuteTick } from "../../shared/games/culbute/view.ts";
import { SOCKET_REPLACED, type ChatMessage } from "../../shared/protocol.ts";
import { Chip } from "../components/Chip.tsx";
import { announceSeatChanges } from "../game/AwayNote.tsx";
import { arrivalQuery } from "../lib/arrival.ts";
import { api, ApiError } from "../lib/api.ts";
import { LiveSocket, REPLACED_MESSAGE, type SocketStatus } from "../lib/socket.ts";
import { play } from "../lib/sound.ts";
import { toast } from "../lib/toast.ts";
import { useSession } from "../stores/session.ts";

/** Ce que le combat écoute directement, sans passer par React */
export interface FightListeners {
  onTick?: (now: number, tick: CulbuteTick) => void;
  onRoom?: (room: CulbuteRoomView, events: FightEvent[]) => void;
}

/** De combien l'écart d'horloge retenu s'oublie, en ms par ms (20 ms par seconde) */
const OFFSET_FORGET = 0.02;

/** Connexion à une table de Culbute : le salon, le combat, le chat. */
export function useCulbuteRoom(code: string) {
  const me = useSession((s) => s.user);
  const [view, setView] = useState<CulbuteRoomView | null>(null);
  const [status, setStatus] = useState<SocketStatus>("connecting");
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [fatal, setFatal] = useState<string | null>(null);
  const [serverOffset, setServerOffset] = useState(0);
  const offsetRef = useRef<{ off: number; at: number } | null>(null);
  const socket = useRef<LiveSocket<CulbuteServerMessage, CulbuteClientMessage> | null>(null);
  const viewRef = useRef<CulbuteRoomView | null>(null);
  const listeners = useRef<FightListeners>({});

  // L'écart d'horloge avec le serveur : le plus grand vu récemment, celui du message le moins retardé en route (il
  // s'oublie doucement). Le dernier seul ne suffisait pas : traité en retard, sur l'appareil lent qui finit de charger,
  // il laissait l'écran de chargement quelques secondes par-dessus le compte à rebours du combat.
  const sampleClock = useCallback((serverNow: number) => {
    const at = Date.now();
    const last = offsetRef.current;
    const off = last ? Math.max(serverNow - at, last.off - (at - last.at) * OFFSET_FORGET) : serverNow - at;
    offsetRef.current = { off, at };
    setServerOffset((prev) => (Math.abs(prev - off) >= 10 ? off : prev));
  }, []);

  const onRoom = useCallback(
    (next: CulbuteRoomView, events: FightEvent[]) => {
      const prev = viewRef.current;
      viewRef.current = next;
      listeners.current.onRoom?.(next, events);
      setView(next);
      sampleClock(next.serverNow);
      announceSeatChanges(prev, next, next.you.userId);
    },
    [sampleClock],
  );

  useEffect(() => {
    let cancelled = false;
    setFatal(null);
    setView(null);
    viewRef.current = null;
    api
      .get(`/rooms/${code}`)
      .then(() => {
        if (cancelled) return;
        socket.current = new LiveSocket<CulbuteServerMessage, CulbuteClientMessage>(`/rooms/${code}/ws`, {
          fatalCodes: [4003, 4004, SOCKET_REPLACED],
          firstQuery: arrivalQuery(code),
          onStatus: setStatus,
          onMessage: (msg) => {
            switch (msg.t) {
              case "room":
                onRoom(msg.room, msg.events);
                break;
              case "tick":
                sampleClock(msg.now);
                listeners.current.onTick?.(msg.now, msg);
                break;
              case "chat":
                if (msg.reset) setChat(msg.messages);
                else {
                  setChat((prev) => [...prev, ...msg.messages].slice(-120));
                  if (msg.messages.some((m) => !m.system && m.userId !== useSession.getState().user?.id)) play("chat");
                }
                break;
              case "emote":
                play("pop", { volume: 0.7 });
                break;
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
              case "replaced":
                setFatal(REPLACED_MESSAGE);
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
  }, [code, onRoom, sampleClock]);

  const send = useCallback((msg: CulbuteClientMessage) => socket.current?.send(msg), []);
  return { view, status, chat, fatal, send, serverOffset, me, listeners };
}
