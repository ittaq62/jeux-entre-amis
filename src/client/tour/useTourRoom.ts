import { createElement, useCallback, useEffect, useRef, useState } from "react";
import { ACHIEVEMENT_BY_ID } from "../../shared/achievements.ts";
import type { ChatMessage } from "../../shared/protocol.ts";
import type { TourClientMessage, TourServerMessage, TourView } from "../../shared/tour.ts";
import { Chip } from "../components/Chip.tsx";
import { api, ApiError } from "../lib/api.ts";
import { LiveSocket, type SocketStatus } from "../lib/socket.ts";
import { play } from "../lib/sound.ts";
import { toast } from "../lib/toast.ts";
import { useSession } from "../stores/session.ts";

/** Connexion au salon d'une tournée : la tournée, son chat, les succès débloqués à la fin. */
export function useTourRoom(code: string) {
  const me = useSession((s) => s.user);
  const [view, setView] = useState<TourView | null>(null);
  const [status, setStatus] = useState<SocketStatus>("connecting");
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [fatal, setFatal] = useState<string | null>(null);
  const [serverOffset, setServerOffset] = useState(0);
  const socket = useRef<LiveSocket<TourServerMessage, TourClientMessage> | null>(null);
  const viewRef = useRef<TourView | null>(null);

  const onTour = useCallback((next: TourView) => {
    const prev = viewRef.current;
    viewRef.current = next;
    setView(next);
    setServerOffset(next.serverNow - Date.now());
    if (!prev) return;
    const meId = useSession.getState().user?.id;
    if (prev.status !== "finished" && next.status === "finished") {
      // Le podium monte : la fanfare avec le premier, puis les applaudissements
      play("tourFanfare", { delay: 700 });
      play("tourApplause", { delay: 1300 });
    } else if (prev.current === null && next.current !== null) play("join");
    else if (next.status === "lobby" && next.members.length > prev.members.length) play("join", { volume: 0.6 });
    else if (next.status === prev.status) {
      // Un autre joueur est prêt, ou vote pour des règles (ses propres clics font déjà leur bruit)
      const ready = next.ready.some((id) => id !== meId && !prev.ready.includes(id));
      const before = prev.next?.votes ?? {};
      const voted = Object.entries(next.next?.votes ?? {}).some(([id, v]) => id !== meId && before[id] !== v);
      if (ready || voted) play("tourVote", { rate: 1.08 });
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
        socket.current = new LiveSocket<TourServerMessage, TourClientMessage>(`/rooms/${code}/ws`, {
          fatalCodes: [4003, 4004],
          onStatus: setStatus,
          onMessage: (msg) => {
            switch (msg.t) {
              case "tour":
                onTour(msg.tour);
                break;
              case "chat":
                if (msg.reset) setChat(msg.messages);
                else {
                  setChat((prev) => [...prev, ...msg.messages].slice(-150));
                  if (msg.messages.some((m) => !m.system && m.userId !== useSession.getState().user?.id)) play("chat");
                }
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
                    2600 + i * 1400,
                  );
                });
                break;
              }
              case "emote":
                break;
              case "error":
                toast({ tone: "danger", title: msg.message, duration: 3500 });
                play("buzzer", { volume: 0.35 });
                break;
              case "kicked":
                setFatal("Tu as été exclu de cette tournée.");
                break;
              case "closed":
                setFatal(msg.reason);
                break;
            }
          },
        });
      })
      .catch((err) => {
        if (!cancelled) setFatal(err instanceof ApiError ? err.message : "Tournée introuvable.");
      });
    return () => {
      cancelled = true;
      socket.current?.close();
      socket.current = null;
    };
  }, [code, onTour]);

  const send = useCallback((msg: TourClientMessage) => socket.current?.send(msg), []);
  return { view, status, chat, fatal, send, serverOffset, me };
}
