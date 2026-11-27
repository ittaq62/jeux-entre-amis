import { createElement, useCallback, useEffect, useRef, useState } from "react";
import { ACHIEVEMENT_BY_ID } from "../../shared/achievements.ts";
import type { ToqueClientMessage, ToqueRoomView, ToqueServerMessage, ToqueTick } from "../../shared/games/toque/net.ts";
import { SOCKET_REPLACED, type ChatMessage } from "../../shared/protocol.ts";
import type { StarAwardResult } from "../../shared/stars.ts";
import { Chip } from "../components/Chip.tsx";
import { announceSeatChanges } from "../game/AwayNote.tsx";
import { arrivalQuery } from "../lib/arrival.ts";
import { api, ApiError } from "../lib/api.ts";
import { LiveSocket, REPLACED_MESSAGE, type SocketStatus } from "../lib/socket.ts";
import { play } from "../lib/sound.ts";
import { toast } from "../lib/toast.ts";
import { useSession } from "../stores/session.ts";
import { useStarsStore } from "../stores/stars.ts";

/** Ce que le service écoute directement, sans passer par React (quinze fois par seconde) */
export interface ToqueListeners {
  onTick?: (now: number, tick: ToqueTick) => void;
  onEmote?: (seatId: string | null, emote: string) => void;
}

/** Connexion à une cuisine de Toque ! : le salon, le service, le chat, les étoiles. */
export function useToqueRoom(code: string) {
  const me = useSession((s) => s.user);
  const [view, setView] = useState<ToqueRoomView | null>(null);
  const [status, setStatus] = useState<SocketStatus>("connecting");
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [fatal, setFatal] = useState<string | null>(null);
  const [serverOffset, setServerOffset] = useState(0);
  const [stars, setStars] = useState<StarAwardResult | null>(null);
  const offsetRef = useRef(0);
  const socket = useRef<LiveSocket<ToqueServerMessage, ToqueClientMessage> | null>(null);
  const viewRef = useRef<ToqueRoomView | null>(null);
  const listeners = useRef<ToqueListeners>({});

  const onRoom = useCallback((next: ToqueRoomView) => {
    const prev = viewRef.current;
    viewRef.current = next;
    setView(next);
    const off = next.serverNow - Date.now();
    offsetRef.current = prev ? Math.max(off, offsetRef.current - 50) : off;
    setServerOffset(offsetRef.current);
    announceSeatChanges(prev, next, next.you.userId);
    // Un nouveau service : les étoiles du précédent s'effacent
    if (next.status === "playing" && prev?.status !== "playing") setStars(null);
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
        socket.current = new LiveSocket<ToqueServerMessage, ToqueClientMessage>(`/rooms/${code}/ws`, {
          fatalCodes: [4003, 4004, SOCKET_REPLACED],
          firstQuery: arrivalQuery(code),
          onStatus: setStatus,
          onMessage: (msg) => {
            switch (msg.t) {
              case "room":
                onRoom(msg.room);
                break;
              case "tick":
                listeners.current.onTick?.(msg.now, msg);
                break;
              case "stars":
                setStars(msg.result);
                useStarsStore.getState().apply(msg.result);
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
                listeners.current.onEmote?.(msg.seatId, msg.emote);
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
                    3200 + i * 1400,
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
  }, [code, onRoom]);

  const send = useCallback((msg: ToqueClientMessage) => socket.current?.send(msg), []);
  return { view, status, chat, fatal, send, serverOffset, me, listeners, stars };
}
