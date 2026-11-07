import { createElement, useCallback, useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { ACHIEVEMENT_BY_ID } from "../../shared/achievements.ts";
import type { MecheEvent, Refusal } from "../../shared/games/meche/engine.ts";
import type { ChatMessage, MecheClientMessage, MecheRoomView, MecheServerMessage } from "../../shared/protocol.ts";
import { Chip } from "../components/Chip.tsx";
import { announceSeatChanges } from "../game/AwayNote.tsx";
import type { EmoteBubble } from "../game/useRoom.ts";
import { api, ApiError } from "../lib/api.ts";
import { LiveSocket, type SocketStatus } from "../lib/socket.ts";
import { play } from "../lib/sound.ts";
import { toast } from "../lib/toast.ts";
import { useSession } from "../stores/session.ts";

let emoteSeq = 0;

/** Les événements reçus avec chaque vue, numérotés : la table les joue une seule fois, dans l'ordre */
export interface EventBatch {
  id: number;
  events: MecheEvent[];
}

/** Ce que tape celui qui tient la mèche : à part de la table, pour ne redessiner que le mot en train de s'écrire */
export const useTyping = create<{ id: string | null; text: string; turn: number }>(() => ({ id: null, text: "", turn: 0 }));

export interface RefusedWord {
  key: number;
  id: string;
  word: string;
  reason: Refusal;
  turn: number;
}

/** Connexion à une table de Mèche : vue de la partie, événements à animer, lettres tapées, chat, réactions. */
export function useMecheRoom(code: string) {
  const me = useSession((s) => s.user);
  const [view, setView] = useState<MecheRoomView | null>(null);
  const [batch, setBatch] = useState<EventBatch>({ id: 0, events: [] });
  const [refused, setRefused] = useState<RefusedWord | null>(null);
  const [status, setStatus] = useState<SocketStatus>("connecting");
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [emotes, setEmotes] = useState<EmoteBubble[]>([]);
  const [fatal, setFatal] = useState<string | null>(null);
  const [serverOffset, setServerOffset] = useState(0);
  const socket = useRef<LiveSocket<MecheServerMessage, MecheClientMessage> | null>(null);
  const viewRef = useRef<MecheRoomView | null>(null);
  const batchSeq = useRef(0);

  const onRoom = useCallback((next: MecheRoomView, events: MecheEvent[]) => {
    const prev = viewRef.current;
    viewRef.current = next;
    setView(next);
    if (events.length > 0) setBatch({ id: ++batchSeq.current, events });
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
        socket.current = new LiveSocket<MecheServerMessage, MecheClientMessage>(`/rooms/${code}/ws`, {
          fatalCodes: [4003, 4004],
          onStatus: setStatus,
          onMessage: (msg) => {
            switch (msg.t) {
              case "room":
                onRoom(msg.room, msg.events);
                break;
              case "typing":
                useTyping.setState({ id: msg.id, text: msg.text, turn: msg.turn });
                break;
              case "refused":
                setRefused({ key: Date.now(), id: msg.id, word: msg.word, reason: msg.reason, turn: msg.turn });
                useTyping.setState({ id: msg.id, text: "", turn: msg.turn });
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

  const send = useCallback((msg: MecheClientMessage) => socket.current?.send(msg), []);
  return { view, batch, refused, status, chat, emotes, fatal, send, serverOffset, me };
}
