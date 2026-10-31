import { createElement, useCallback, useEffect, useRef, useState } from "react";
import { ACHIEVEMENT_BY_ID } from "../../shared/achievements.ts";
import type { CapitaleEvent } from "../../shared/games/capitale/engine.ts";
import type { CapitaleClientMessage, CapitaleRoomView, CapitaleServerMessage, ChatMessage } from "../../shared/protocol.ts";
import { Chip } from "../components/Chip.tsx";
import { announceSeatChanges } from "../game/AwayNote.tsx";
import type { EmoteBubble } from "../game/useRoom.ts";
import { api, ApiError } from "../lib/api.ts";
import { LiveSocket, type SocketStatus } from "../lib/socket.ts";
import { play, vibrate } from "../lib/sound.ts";
import { toast } from "../lib/toast.ts";
import { useSession } from "../stores/session.ts";
import { playCapitaleEvents } from "./fx.ts";

let emoteSeq = 0;

/** Les événements reçus avec chaque vue, numérotés : la table les rejoue (pions, dés, billets) dans l'ordre */
export interface EventBatch {
  id: number;
  events: CapitaleEvent[];
}

/** Connexion à une table de Capitale : vue de la partie, événements à animer, chat, réactions. */
export function useCapitaleRoom(code: string) {
  const me = useSession((s) => s.user);
  const [view, setView] = useState<CapitaleRoomView | null>(null);
  const [batch, setBatch] = useState<EventBatch>({ id: 0, events: [] });
  const [status, setStatus] = useState<SocketStatus>("connecting");
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [emotes, setEmotes] = useState<EmoteBubble[]>([]);
  const [fatal, setFatal] = useState<string | null>(null);
  const [serverOffset, setServerOffset] = useState(0);
  const socket = useRef<LiveSocket<CapitaleServerMessage, CapitaleClientMessage> | null>(null);
  const viewRef = useRef<CapitaleRoomView | null>(null);
  const batchSeq = useRef(0);

  const onRoom = useCallback((next: CapitaleRoomView, events: CapitaleEvent[]) => {
    const prev = viewRef.current;
    viewRef.current = next;
    setView(next);
    if (events.length > 0) setBatch({ id: ++batchSeq.current, events });
    announceSeatChanges(prev, next, next.you.userId);
    setServerOffset(next.serverNow - Date.now());
    const seat = next.you.seatId;
    const g = next.capitale;
    if (events.length > 0 && document.visibilityState === "visible") playCapitaleEvents(events, seat);
    if (!g || !seat) return;
    // C'est à moi : un petit signal, une seule fois par décision
    if (g.actor === seat && prev?.capitale?.decision !== g.decision && prev?.capitale?.actor !== seat) {
      play("yourTurn", { delay: 400 });
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
    api
      .get(`/rooms/${code}`)
      .then(() => {
        if (cancelled) return;
        socket.current = new LiveSocket<CapitaleServerMessage, CapitaleClientMessage>(`/rooms/${code}/ws`, {
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

  const send = useCallback((msg: CapitaleClientMessage) => socket.current?.send(msg), []);
  return { view, batch, status, chat, emotes, fatal, send, serverOffset, me };
}
