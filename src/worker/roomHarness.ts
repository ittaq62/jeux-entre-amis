// Un banc d'essai pour les salles (tables, tournée) hors du serveur : un faux état de Durable Object, de fausses
// connexions qui gardent ce qu'elles reçoivent, une fausse base (les amitiés) et un faux hub. Seulement pour les tests ;
// le module « cloudflare:workers » est remplacé par le fichier de test (vi.mock).

import type { PublicUser } from "../shared/protocol.ts";
import { encodeHeaderJson } from "./util.ts";

const OPEN = 1;
const CLOSED = 3;

/** Une connexion, des deux côtés : ce que la salle envoie, et la fermeture */
export class FakeSocket {
  readyState = OPEN;
  /** Les messages reçus, déjà lus */
  inbox: Record<string, unknown>[] = [];
  closedWith: number | null = null;
  tags: string[] = [];
  private attachment: unknown = null;
  /** L'autre bout de la paire (le navigateur), qui reçoit les mêmes messages */
  peer: FakeSocket | null = null;

  accept() {}
  send(text: string) {
    if (this.readyState !== OPEN) throw new Error("fermée");
    const msg = JSON.parse(text) as Record<string, unknown>;
    this.inbox.push(msg);
    this.peer?.inbox.push(msg);
  }
  close(code: number) {
    this.closedWith = code;
    this.readyState = CLOSED;
    if (this.peer) {
      this.peer.closedWith = code;
      this.peer.readyState = CLOSED;
    }
  }
  serializeAttachment(value: unknown) {
    this.attachment = structuredClone(value);
  }
  deserializeAttachment() {
    return this.attachment;
  }
  /** La dernière vue reçue (table ou tournée) */
  view<T = Record<string, unknown>>(): T {
    const last = [...this.inbox].reverse().find((m) => m.t === "room" || m.t === "tour");
    if (!last) throw new Error("aucune vue reçue");
    return (last.room ?? last.tour) as T;
  }
  errors(): string[] {
    return this.inbox.filter((m) => m.t === "error").map((m) => String(m.message));
  }
}

class FakePair {
  0 = new FakeSocket();
  1 = new FakeSocket();
  constructor() {
    this[1].peer = this[0];
  }
}

/** Une réponse comme celles du serveur, même pour une connexion acceptée (statut 101) */
class FakeResponse {
  status: number;
  webSocket: FakeSocket | null;
  constructor(
    public body: unknown,
    init: { status?: number; webSocket?: FakeSocket } = {},
  ) {
    this.status = init.status ?? 200;
    this.webSocket = init.webSocket ?? null;
  }
  async text() {
    return String(this.body ?? "");
  }
}

/** À appeler une fois par fichier de test, avant de créer une salle */
export function installWorkerGlobals() {
  const g = globalThis as Record<string, unknown>;
  g.WebSocketPair = FakePair;
  g.WebSocketRequestResponsePair = class {};
  g.Response = FakeResponse;
}

/** Ce que le Durable Object reçoit : son stockage, ses connexions */
export class FakeState {
  stored = new Map<string, unknown>();
  sockets: FakeSocket[] = [];
  ready: Promise<unknown> = Promise.resolve();
  storage = {
    get: async (key: string) => structuredClone(this.stored.get(key)),
    put: async (key: string, value: unknown) => void this.stored.set(key, structuredClone(value)),
    setAlarm: async () => {},
    deleteAlarm: async () => {},
    deleteAll: async () => this.stored.clear(),
  };
  setWebSocketAutoResponse() {}
  blockConcurrencyWhile(fn: () => Promise<unknown>) {
    this.ready = fn();
    return this.ready;
  }
  acceptWebSocket(ws: FakeSocket, tags: string[]) {
    ws.tags = tags;
    this.sockets.push(ws);
  }
  getWebSockets(tag?: string) {
    return this.sockets.filter((s) => s.readyState !== CLOSED && (!tag || s.tags.includes(tag)));
  }
}

/** Les amitiés acceptées, dans les deux sens */
export function fakeEnv(friends: [string, string][] = []) {
  const hub = {
    rooms: new Map<string, unknown>(),
    upsertRoom: async (summary: { code: string }) => void hub.rooms.set(summary.code, summary),
    removeRoom: async () => {},
    setUserRoom: async () => {},
    allocateCode: async () => "ZZZZ",
    getRoom: async () => null,
  };
  const DB = {
    prepare(sql: string) {
      const statement = {
        args: [] as unknown[],
        bind(...args: unknown[]) {
          statement.args = args;
          return statement;
        },
        async all() {
          if (sql.includes("FROM friendships")) {
            const me = statement.args[0];
            const ids = friends.flatMap(([a, b]) => (a === me ? [b] : b === me ? [a] : []));
            return { results: ids.map((id) => ({ id })) };
          }
          return { results: [] };
        },
        async first() {
          return null;
        },
        async run() {
          return { meta: { changes: 0 } };
        },
      };
      return statement;
    },
  };
  // Les listes de mots de Mèche, en tout petit
  const words = "bateau\nchapeau\nchateau\nmaison\nmarteau\nraison\nsaison\n";
  const ASSETS = {
    async fetch(req: Request) {
      const text = new URL(req.url).pathname.endsWith("courants.txt") ? `=1\n${words}` : words;
      return {
        ok: true,
        status: 200,
        headers: { get: () => "text/plain; charset=utf-8" },
        arrayBuffer: async () => new TextEncoder().encode(text).buffer,
        text: async () => text,
      };
    },
  };
  return { HUB: { idFromName: () => "hub", get: () => hub }, DB, ASSETS, hub };
}

export function user(id: string, admin = false): PublicUser {
  return {
    id,
    pseudo: id[0]!.toUpperCase() + id.slice(1),
    avatar: {} as PublicUser["avatar"],
    photo: 0,
    ...(admin ? { admin: true as const } : {}),
  };
}

/** Une salle du serveur, vue de l'extérieur : arriver, parler, partir */
export interface RoomLike {
  fetch(request: Request): Promise<unknown>;
  webSocketMessage(ws: WebSocket, raw: string): Promise<void>;
  webSocketClose(ws: WebSocket): Promise<void>;
}

export class Bench<R extends RoomLike> {
  constructor(
    public room: R,
    public state: FakeState,
  ) {}

  /** Arrive par la connexion de la page : `query` est ce que l'adresse ajoute (« ?regarder », « ?jouer ») */
  async arrive(u: PublicUser, query = ""): Promise<{ ws: FakeSocket; refused: FakeSocket | null; status: number }> {
    const headers = new Map([
      ["upgrade", "websocket"],
      ["x-user", encodeHeaderJson(u)],
    ]);
    const request = {
      url: `https://jouer.test/api/rooms/ABCD/ws${query}`,
      headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
    };
    const before = new Set(this.state.sockets);
    const res = (await this.room.fetch(request as unknown as Request)) as FakeResponse;
    const accepted = this.state.sockets.find((s) => !before.has(s));
    // Une connexion refusée n'est jamais confiée à la salle : le navigateur lit « closed » puis la fermeture
    const refused = !accepted && res.status === 101 ? res.webSocket : null;
    return { ws: accepted ?? new FakeSocket(), refused, status: res.status };
  }

  send(ws: FakeSocket, msg: Record<string, unknown>) {
    return this.room.webSocketMessage(ws as unknown as WebSocket, JSON.stringify(msg));
  }

  /** La connexion tombe (écran éteint, réseau) */
  async drop(ws: FakeSocket) {
    ws.close(1006);
    await this.room.webSocketClose(ws as unknown as WebSocket);
  }

  /** L'état gardé par la salle, pour préparer un cas (fin de partie…) */
  data<T = Record<string, unknown>>(): T {
    return (this.room as unknown as { data: T }).data;
  }
}
