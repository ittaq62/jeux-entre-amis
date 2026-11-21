import { createElement, useCallback, useEffect, useRef, useState } from "react";
import { ACHIEVEMENT_BY_ID } from "../../shared/achievements.ts";
import type { MinigolfClientMessage, MinigolfRoomView, MinigolfServerMessage } from "../../shared/games/minigolf/net.ts";
import { SOCKET_REPLACED, type ChatMessage } from "../../shared/protocol.ts";
import { Chip } from "../components/Chip.tsx";
import { announceSeatChanges } from "../game/AwayNote.tsx";
import { arrivalQuery } from "../lib/arrival.ts";
import { api, ApiError } from "../lib/api.ts";
import { LiveSocket, REPLACED_MESSAGE, type SocketStatus } from "../lib/socket.ts";
import { play } from "../lib/sound.ts";
import { toast } from "../lib/toast.ts";
import { useSession } from "../stores/session.ts";

/** Ce que la partie écoute directement, sans passer par React */
export interface GolfListeners {
  /** Un autre joueur vise (sa flèche) ; p < 0 : il ne vise plus */
  onAim?: (id: string, a: number, p: number) => void;
}

/** Connexion à une table de minigolf : le salon, la partie, le chat. */
export function useMinigolfRoom(code: string) {
  const me = useSession((s) => s.user);
  const [view, setView] = useState<MinigolfRoomView | null>(null);
  const [status, setStatus] = useState<SocketStatus>("connecting");
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [fatal, setFatal] = useState<string | null>(null);
  const [serverOffset, setServerOffset] = useState(0);
  const offsetRef = useRef(0);
  const socket = useRef<LiveSocket<MinigolfServerMessage, MinigolfClientMessage> | null>(null);
  const viewRef = useRef<MinigolfRoomView | null>(null);
  const listeners = useRef<GolfListeners>({});

  const onRoom = useCallback((next: MinigolfRoomView) => {
    const prev = viewRef.current;
    viewRef.current = next;
    setView(next);
    // L'écart d'horloge avec le serveur : le plus grand vu récemment (celui du message le moins retardé en route)
    const off = next.serverNow - Date.now();
    offsetRef.current = prev ? Math.max(off, offsetRef.current - 50) : off;
    setServerOffset(offsetRef.current);
    announceSeatChanges(prev, next, next.you.userId);
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
        socket.current = new LiveSocket<MinigolfServerMessage, MinigolfClientMessage>(`/rooms/${code}/ws`, {
          fatalCodes: [4003, 4004, SOCKET_REPLACED],
          firstQuery: arrivalQuery(code),
          onStatus: setStatus,
          onMessage: (msg) => {
            switch (msg.t) {
              case "room":
                onRoom(msg.room);
                break;
              case "aim":
                listeners.current.onAim?.(msg.id, msg.a, msg.p);
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
  }, [code, onRoom]);

  const send = useCallback((msg: MinigolfClientMessage) => socket.current?.send(msg), []);
  /** L'heure du serveur, maintenant */
  const serverNow = useCallback(() => Date.now() + offsetRef.current, []);
  return { view, status, chat, fatal, send, serverOffset, serverNow, me, listeners };
}
