import { createElement, useCallback, useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { ACHIEVEMENT_BY_ID } from "../../shared/achievements.ts";
import type { Active, GarbageChunk } from "../../shared/games/bricks/engine.ts";
import type { BricksFx, BricksPlayerView, BricksSnapshot } from "../../shared/games/bricks/view.ts";
import type { BricksClientMessage, BricksRoomView, BricksServerMessage, ChatMessage } from "../../shared/protocol.ts";
import { Chip } from "../components/Chip.tsx";
import { announceSeatChanges } from "../game/AwayNote.tsx";
import type { EmoteBubble } from "../game/useRoom.ts";
import { api, ApiError } from "../lib/api.ts";
import { LiveSocket, type SocketStatus } from "../lib/socket.ts";
import { play } from "../lib/sound.ts";
import { toast } from "../lib/toast.ts";
import { useSession } from "../stores/session.ts";

/** Pièces en vol des autres joueurs, relayées par le serveur plusieurs fois par seconde */
export const useLive = create<{ pieces: Record<string, Active | null>; set: (id: string, p: Active | null) => void; clear: () => void }>(
  (set) => ({
    pieces: {},
    set: (id, p) => set((s) => ({ pieces: { ...s.pieces, [id]: p } })),
    clear: () => set({ pieces: {} }),
  }),
);

/** Ce que la table de jeu veut entendre en direct (son propre plateau, les lignes grises, les effets) */
export interface BricksListeners {
  self?: (s: BricksSnapshot) => void;
  garbage?: (c: GarbageChunk) => void;
  board?: (p: BricksPlayerView, fx: BricksFx[]) => void;
}

let emoteSeq = 0;

/** Connexion à une table de Briques. */
export function useBricksRoom(code: string) {
  const me = useSession((s) => s.user);
  const [view, setView] = useState<BricksRoomView | null>(null);
  const [status, setStatus] = useState<SocketStatus>("connecting");
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [emotes, setEmotes] = useState<EmoteBubble[]>([]);
  const [fatal, setFatal] = useState<string | null>(null);
  const [serverOffset, setServerOffset] = useState(0);
  const socket = useRef<LiveSocket<BricksServerMessage, BricksClientMessage> | null>(null);
  const viewRef = useRef<BricksRoomView | null>(null);
  const listeners = useRef<BricksListeners>({});
  /** Dernier état exact reçu, pour la table qui s'ouvre après lui */
  const lastSnapshot = useRef<BricksSnapshot | null>(null);

  const onRoom = useCallback((next: BricksRoomView) => {
    const prev = viewRef.current;
    viewRef.current = next;
    setView(next);
    setServerOffset(next.serverNow - Date.now());
    announceSeatChanges(prev, next, next.you.userId);
    const seat = next.you.seatId;
    const g = next.bricks;
    if (seat && g && prev?.status === "playing" && next.status === "finished" && g.ranks && g.mode !== "sprint") {
      play(g.ranks[seat] === 1 ? "win" : "lose", { delay: 900 });
    }
  }, []);

  const onBoard = useCallback((player: BricksPlayerView, fx: BricksFx[]) => {
    const cur = viewRef.current;
    if (cur?.bricks) {
      const players = cur.bricks.players.map((p) => (p.id === player.id ? player : p));
      const next = { ...cur, bricks: { ...cur.bricks, players } };
      viewRef.current = next;
      setView(next);
    }
    listeners.current.board?.(player, fx);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setFatal(null);
    setView(null);
    viewRef.current = null;
    useLive.getState().clear();
    api
      .get(`/rooms/${code}`)
      .then(() => {
        if (cancelled) return;
        socket.current = new LiveSocket<BricksServerMessage, BricksClientMessage>(`/rooms/${code}/ws`, {
          fatalCodes: [4003, 4004],
          onStatus: setStatus,
          onMessage: (msg) => {
            switch (msg.t) {
              case "room":
                onRoom(msg.room);
                break;
              case "board":
                onBoard(msg.player, msg.fx);
                break;
              case "self":
                lastSnapshot.current = msg.snapshot;
                listeners.current.self?.(msg.snapshot);
                break;
              case "garbage":
                listeners.current.garbage?.(msg.chunk);
                break;
              case "live":
                useLive.getState().set(msg.id, msg.piece);
                break;
              case "fx":
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
                    1800 + i * 1400,
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
  }, [code, onRoom, onBoard]);

  const send = useCallback((msg: BricksClientMessage) => socket.current?.send(msg), []);
  return { view, status, chat, emotes, fatal, send, serverOffset, me, listeners, lastSnapshot };
}
