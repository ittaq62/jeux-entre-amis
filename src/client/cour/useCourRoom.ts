import { createElement, useCallback, useEffect, useRef, useState } from "react";
import { ACHIEVEMENT_BY_ID } from "../../shared/achievements.ts";
import type { MatchView } from "../../shared/games/cour/match.ts";
import type { CourClientMessage, CourRoomView, CourServerMessage } from "../../shared/games/cour/net.ts";
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

/** Ce que la partie écoute directement, sans passer par React (plusieurs fois par seconde) */
export interface CourListeners {
  onMatch?: (m: MatchView) => void;
  onEmote?: (seatId: string | null, emote: string) => void;
}

/** Connexion à une table de La Cour des Grands : le salon, la partie, le chat. */
export function useCourRoom(code: string) {
  const me = useSession((s) => s.user);
  const [view, setView] = useState<CourRoomView | null>(null);
  const [status, setStatus] = useState<SocketStatus>("connecting");
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [fatal, setFatal] = useState<string | null>(null);
  const [stars, setStars] = useState<StarAwardResult | null>(null);
  const [serverOffset, setServerOffset] = useState(0);
  const offsetRef = useRef(0);
  const socket = useRef<LiveSocket<CourServerMessage, CourClientMessage> | null>(null);
  const viewRef = useRef<CourRoomView | null>(null);
  const listeners = useRef<CourListeners>({});
  const lastPhase = useRef("");

  const clock = useCallback((serverNow: number) => {
    const off = serverNow - Date.now();
    offsetRef.current = viewRef.current ? Math.max(off, offsetRef.current - 50) : off;
    setServerOffset(offsetRef.current);
  }, []);

  const onRoom = useCallback(
    (next: CourRoomView) => {
      const prev = viewRef.current;
      viewRef.current = next;
      setView(next);
      clock(next.serverNow);
      if (next.match) listeners.current.onMatch?.(next.match);
      announceSeatChanges(prev, next, next.you.userId);
    },
    [clock],
  );

  /** La partie qui bouge : la scène la reçoit tout de suite ; React seulement quand l'étape change */
  const onMatch = useCallback((m: MatchView, now: number) => {
    listeners.current.onMatch?.(m);
    const v = viewRef.current;
    if (!v) return;
    const phase = `${m.phase}:${m.round}:${m.cands.filter((c) => c.alive).length}`;
    const next = { ...v, match: m, serverNow: now };
    viewRef.current = next;
    if (phase !== lastPhase.current) {
      lastPhase.current = phase;
      setView(next);
    }
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
        socket.current = new LiveSocket<CourServerMessage, CourClientMessage>(`/rooms/${code}/ws`, {
          fatalCodes: [4003, 4004, SOCKET_REPLACED],
          firstQuery: arrivalQuery(code),
          onStatus: setStatus,
          onMessage: (msg) => {
            switch (msg.t) {
              case "room":
                onRoom(msg.room);
                break;
              case "match":
                onMatch(msg.match, msg.now);
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
              case "stars":
                setStars(msg.result);
                useStarsStore.getState().apply(msg.result);
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
  }, [code, onRoom, onMatch]);

  const send = useCallback((msg: CourClientMessage) => socket.current?.send(msg), []);
  const serverNow = useCallback(() => Date.now() + offsetRef.current, []);
  return { view, viewRef, status, chat, fatal, send, serverOffset, serverNow, me, listeners, stars };
}
