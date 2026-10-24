import { createElement, useCallback, useEffect, useRef, useState } from "react";
import { ACHIEVEMENT_BY_ID } from "../../shared/achievements.ts";
import type { ChatMessage, NavalClientMessage, NavalRoomView, NavalServerMessage } from "../../shared/protocol.ts";
import { Chip } from "../components/Chip.tsx";
import { announceSeatChanges } from "../game/AwayNote.tsx";
import type { EmoteBubble } from "../game/useRoom.ts";
import { api, ApiError } from "../lib/api.ts";
import { LiveSocket, type SocketStatus } from "../lib/socket.ts";
import { play, vibrate } from "../lib/sound.ts";
import { toast } from "../lib/toast.ts";
import { usePrefs } from "../stores/prefs.ts";
import { useSession } from "../stores/session.ts";
import { playNavalEvents, resetNavalFx } from "./fx.ts";

let emoteSeq = 0;

/** Connexion à une table de bataille navale : vue de la partie, chat, réactions, effets. */
export function useNavalRoom(code: string) {
  const me = useSession((s) => s.user);
  const [view, setView] = useState<NavalRoomView | null>(null);
  const [status, setStatus] = useState<SocketStatus>("connecting");
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [emotes, setEmotes] = useState<EmoteBubble[]>([]);
  const [fatal, setFatal] = useState<string | null>(null);
  const [serverOffset, setServerOffset] = useState(0);
  const socket = useRef<LiveSocket<NavalServerMessage, NavalClientMessage> | null>(null);
  const viewRef = useRef<NavalRoomView | null>(null);

  const onRoom = useCallback((next: NavalRoomView, events: Parameters<typeof playNavalEvents>[0]) => {
    const prev = viewRef.current;
    viewRef.current = next;
    setView(next);
    announceSeatChanges(prev, next, next.you.userId);
    setServerOffset(next.serverNow - Date.now());
    const seat = next.you.seatId;
    const g = next.naval;
    if (events.length > 0 && document.visibilityState === "visible") playNavalEvents(events, seat, usePrefs.getState().reducedEffects);
    if (!g || !seat) return;
    if (g.phase === "battle" && g.turn === seat && (prev?.naval?.turn !== seat || prev?.naval?.phase !== "battle")) {
      play("sonar", { delay: 650, volume: 0.6 });
      vibrate([25, 40, 25]);
    }
    if (prev?.status === "playing" && next.status === "finished" && g.ranks) {
      play(g.ranks[seat] === 1 ? "win" : "lose", { delay: 1200 });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setFatal(null);
    setView(null);
    viewRef.current = null;
    resetNavalFx();
    api
      .get(`/rooms/${code}`)
      .then(() => {
        if (cancelled) return;
        socket.current = new LiveSocket<NavalServerMessage, NavalClientMessage>(`/rooms/${code}/ws`, {
          fatalCodes: [4003, 4004],
          onStatus: setStatus,
          onMessage: (msg) => {
            switch (msg.t) {
              case "room":
                onRoom(msg.room, msg.events);
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
                toast({ tone: "danger", title: msg.message, duration: 3000 });
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

  const send = useCallback((msg: NavalClientMessage) => socket.current?.send(msg), []);
  return { view, status, chat, emotes, fatal, send, serverOffset, me };
}
