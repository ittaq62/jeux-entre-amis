import { create } from "zustand";
import { api } from "../lib/api.ts";
import { LiveSocket, type SocketStatus } from "../lib/socket.ts";
import { play } from "../lib/sound.ts";
import { toast } from "../lib/toast.ts";
import type { FriendEntry, HubClientMessage, HubServerMessage, PresenceRoom, RoomSummary } from "../../shared/protocol.ts";

interface HubState {
  status: SocketStatus;
  online: Record<string, PresenceRoom | null>;
  lobby: RoomSummary[];
  friends: FriendEntry[];
  friendsLoaded: boolean;
  connect: () => void;
  disconnect: () => void;
  watchLobby: (on: boolean) => void;
  invite: (to: string, code: string) => void;
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

/** Connexion permanente : amis en ligne, salons publics, invitations. */
export const useHub = create<HubState>((set, get) => ({
  status: "closed",
  online: {},
  lobby: [],
  friends: [],
  friendsLoaded: false,

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
                    icon: "👋",
                    title: `${last.user.pseudo} veut devenir ton ami`,
                    action: { label: "Voir", run: () => navigateTo("/amis") },
                  });
                }
              });
            break;
          }
          case "invite":
            play("join");
            toast({
              icon: "🎴",
              tone: "gold",
              title: `${msg.from.pseudo} t'invite à jouer`,
              body: `Salon ${msg.code}`,
              duration: 12000,
              action: { label: "Rejoindre", run: () => navigateTo(`/salon/${msg.code}`) },
            });
            break;
        }
      },
    });
    void get().refreshFriends();
  },

  disconnect: () => {
    socket?.close();
    socket = null;
    set({ status: "closed", online: {}, lobby: [], friends: [], friendsLoaded: false });
  },

  watchLobby: (on) => {
    lobbyWatchers += on ? 1 : -1;
    socket?.send({ t: "watchLobby", on: lobbyWatchers > 0 });
  },

  invite: (to, code) => socket?.send({ t: "invite", to, code }),

  refreshFriends: async () => {
    try {
      const { friends } = await api.get<{ friends: FriendEntry[] }>("/friends");
      set({ friends, friendsLoaded: true });
    } catch {
      set({ friendsLoaded: true });
    }
  },
}));
