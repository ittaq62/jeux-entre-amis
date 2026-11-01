import { create } from "zustand";
import { api } from "../lib/api.ts";
import { LiveSocket, type SocketStatus } from "../lib/socket.ts";
import { play } from "../lib/sound.ts";
import { toast } from "../lib/toast.ts";
import { useSession } from "./session.ts";
import type {
  FriendEntry,
  HubClientMessage,
  HubServerMessage,
  PresenceRoom,
  PublicUser,
  RoomSummary,
  TableGame,
} from "../../shared/protocol.ts";

/** Une invitation reçue : elle reste à l'écran jusqu'à la réponse, deux minutes au plus */
export interface ReceivedInvite {
  from: PublicUser;
  code: string;
  game: TableGame;
  at: number;
}

/** Une invitation envoyée à un ami, et sa réponse quand elle arrive */
export interface SentInvite {
  code: string;
  at: number;
  answer?: "yes" | "no";
}

export const INVITE_TTL_MS = 120_000;
/** Le temps avant de pouvoir relancer le même ami */
export const INVITE_AGAIN_MS = 20_000;

interface HubState {
  status: SocketStatus;
  online: Record<string, PresenceRoom | null>;
  lobby: RoomSummary[];
  friends: FriendEntry[];
  friendsLoaded: boolean;
  invites: ReceivedInvite[];
  sent: Record<string, SentInvite>;
  connect: () => void;
  disconnect: () => void;
  watchLobby: (on: boolean) => void;
  invite: (to: string, code: string) => void;
  answerInvite: (invite: ReceivedInvite, accepted: boolean) => void;
  refreshFriends: () => Promise<void>;
}

let socket: LiveSocket<HubServerMessage, HubClientMessage> | null = null;
let lobbyWatchers = 0;
let navigateTo: (path: string) => void = (path) => {
  location.href = path;
};

export function setHubNavigator(fn: (path: string) => void) {
  navigateTo = fn;
}

/** Une annonce n'apparaît qu'une fois, même si la connexion se refait. */
function alreadySeen(id: number): boolean {
  try {
    if (sessionStorage.getItem("annonce-vue") === String(id)) return true;
    sessionStorage.setItem("annonce-vue", String(id));
  } catch {
    // stockage indisponible : tant pis, on la remontre
  }
  return false;
}

/** Connexion permanente : amis en ligne, salons publics, invitations. */
export const useHub = create<HubState>((set, get) => ({
  status: "closed",
  online: {},
  lobby: [],
  friends: [],
  friendsLoaded: false,
  invites: [],
  sent: {},

  connect: () => {
    if (socket) return;
    socket = new LiveSocket<HubServerMessage, HubClientMessage>("/hub/ws", {
      onStatus: (status) => {
        set({ status });
        if (status === "open" && lobbyWatchers > 0) socket?.send({ t: "watchLobby", on: true });
      },
      onMessage: (msg) => {
        switch (msg.t) {
          case "presence":
            set({ online: msg.online });
            break;
          case "presenceUpdate": {
            const online = { ...get().online };
            if (msg.online) online[msg.userId] = msg.room;
            else delete online[msg.userId];
            set({ online });
            break;
          }
          case "lobby":
            set({ lobby: msg.rooms });
            break;
          case "friendsChanged": {
            const before = get().friends.filter((f) => f.status === "incoming").length;
            void get()
              .refreshFriends()
              .then(() => {
                const incoming = get().friends.filter((f) => f.status === "incoming");
                if (incoming.length > before) {
                  const last = incoming[incoming.length - 1]!;
                  play("pop");
                  toast({
                    title: `${last.user.pseudo} veut devenir ton ami`,
                    action: { label: "Voir", run: () => navigateTo("/amis") },
                  });
                }
              });
            break;
          }
          case "announce": {
            const a = msg.announcement;
            if (alreadySeen(a.id)) break;
            play("join");
            toast({ tone: "gold", title: `Message de ${a.from}`, body: a.text, duration: 20000 });
            break;
          }
          case "signedOut":
            toast({ tone: "danger", title: msg.reason, duration: 10000 });
            get().disconnect();
            useSession.setState({ user: null, pending: null });
            break;
          case "invite": {
            // Déjà assis à cette table : rien à faire
            if (location.pathname === `/salon/${msg.code}`) break;
            const invite: ReceivedInvite = { from: msg.from, code: msg.code, game: msg.game, at: Date.now() };
            set({ invites: [...get().invites.filter((i) => i.from.id !== msg.from.id), invite].slice(-3) });
            setTimeout(() => set({ invites: get().invites.filter((i) => i !== invite) }), INVITE_TTL_MS);
            play("join");
            break;
          }
          case "inviteReply": {
            const prev = get().sent[msg.from.id];
            if (!prev || prev.code !== msg.code) break;
            set({ sent: { ...get().sent, [msg.from.id]: { ...prev, answer: msg.accepted ? "yes" : "no" } } });
            if (msg.accepted) play("pop");
            toast({
              tone: msg.accepted ? "gold" : "default",
              title: msg.accepted ? `${msg.from.pseudo} arrive !` : `${msg.from.pseudo} ne peut pas venir pour l'instant`,
            });
            break;
          }
        }
      },
    });
    void get().refreshFriends();
  },

  disconnect: () => {
    socket?.close();
    socket = null;
    set({ status: "closed", online: {}, lobby: [], friends: [], friendsLoaded: false, invites: [], sent: {} });
  },

  watchLobby: (on) => {
    lobbyWatchers += on ? 1 : -1;
    socket?.send({ t: "watchLobby", on: lobbyWatchers > 0 });
  },

  invite: (to, code) => {
    socket?.send({ t: "invite", to, code });
    set({ sent: { ...get().sent, [to]: { code, at: Date.now() } } });
  },

  answerInvite: (invite, accepted) => {
    set({ invites: get().invites.filter((i) => i !== invite) });
    socket?.send({ t: "inviteReply", to: invite.from.id, code: invite.code, accepted });
    if (accepted) navigateTo(`/salon/${invite.code}`);
  },

  refreshFriends: async () => {
    try {
      const { friends } = await api.get<{ friends: FriendEntry[] }>("/friends");
      set({ friends, friendsLoaded: true });
    } catch {
      set({ friendsLoaded: true });
    }
  },
}));
