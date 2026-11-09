import { createElement, useCallback, useEffect, useRef, useState } from "react";
import { ACHIEVEMENT_BY_ID } from "../../shared/achievements.ts";
import type { MatchEvent } from "../../shared/games/crampons/model.ts";
import type { CramponsTick } from "../../shared/games/crampons/view.ts";
import type { ChatMessage, CramponsClientMessage, CramponsRoomView, CramponsServerMessage } from "../../shared/protocol.ts";
import { Chip } from "../components/Chip.tsx";
import { announceSeatChanges } from "../game/AwayNote.tsx";
import { api, ApiError } from "../lib/api.ts";
import { LiveSocket, type SocketStatus } from "../lib/socket.ts";
import { play } from "../lib/sound.ts";
import { toast } from "../lib/toast.ts";
import { useSession } from "../stores/session.ts";

/** Ce que le match écoute directement, sans passer par React */
export interface MatchListeners {
  onTick?: (now: number, tick: CramponsTick) => void;
  onEvents?: (events: MatchEvent[]) => void;
}

/** Connexion à une table de Crampons : la vue du match, les positions, le chat. */
export function useCramponsRoom(code: string) {
  const me = useSession((s) => s.user);
  const [view, setView] = useState<CramponsRoomView | null>(null);
  const [status, setStatus] = useState<SocketStatus>("connecting");
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [fatal, setFatal] = useState<string | null>(null);
  const socket = useRef<LiveSocket<CramponsServerMessage, CramponsClientMessage> | null>(null);
  const viewRef = useRef<CramponsRoomView | null>(null);
  const listeners = useRef<MatchListeners>({});

  const onRoom = useCallback((next: CramponsRoomView, events: MatchEvent[]) => {
    const prev = viewRef.current;
    viewRef.current = next;
    if (events.length > 0) listeners.current.onEvents?.(events);
    setView(next);
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
        socket.current = new LiveSocket<CramponsServerMessage, CramponsClientMessage>(`/rooms/${code}/ws`, {
          fatalCodes: [4003, 4004],
          onStatus: setStatus,
          onMessage: (msg) => {
            switch (msg.t) {
              case "room":
                onRoom(msg.room, msg.events);
                break;
              case "tick":
                listeners.current.onTick?.(msg.now, msg);
                if (msg.e.length > 0) listeners.current.onEvents?.(msg.e);
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

  const send = useCallback((msg: CramponsClientMessage) => socket.current?.send(msg), []);
  return { view, status, chat, fatal, send, me, listeners };
}
