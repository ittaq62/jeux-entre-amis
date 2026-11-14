import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SOCKET_REPLACED } from "../../shared/protocol.ts";
import { LiveSocket, type SocketStatus } from "./socket.ts";

/** Un WebSocket pour de faux : le test joue le serveur (ouvrir, envoyer un message, couper) */
class FakeWS {
  static OPEN = 1;
  static made: FakeWS[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  constructor(readonly url: string) {
    FakeWS.made.push(this);
  }
  send() {}
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(msg: unknown) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
  shut(code: number) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

/** Ce que la page écoute : l'onglet qui redevient visible, le réseau qui revient */
const listeners = new Map<string, () => void>();

beforeEach(() => {
  vi.useFakeTimers();
  FakeWS.made = [];
  listeners.clear();
  const on = (type: string, fn: () => void) => listeners.set(type, fn);
  vi.stubGlobal("WebSocket", FakeWS);
  vi.stubGlobal("location", { protocol: "http:", host: "localhost" });
  vi.stubGlobal("document", { visibilityState: "visible", addEventListener: on, removeEventListener: () => {} });
  vi.stubGlobal("window", { addEventListener: on, removeEventListener: () => {} });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function connect() {
  const messages: unknown[] = [];
  const statuses: SocketStatus[] = [];
  const socket = new LiveSocket<unknown, unknown>("/rooms/ABCD/ws", {
    fatalCodes: [4003, 4004, SOCKET_REPLACED],
    onMessage: (m) => messages.push(m),
    onStatus: (s) => statuses.push(s),
  });
  return { socket, messages, statuses };
}

describe("la connexion à une table", () => {
  it("remplacée par un autre appareil, elle ne revient pas toute seule, même quand l'onglet redevient visible", () => {
    const { socket, messages, statuses } = connect();
    const ws = FakeWS.made[0]!;
    ws.open();
    ws.receive({ t: "replaced" });
    ws.shut(SOCKET_REPLACED);
    expect(messages).toEqual([{ t: "replaced" }]);
    expect(statuses.at(-1)).toBe("closed");
    // Sans cela, les deux appareils se reprendraient la place chacun leur tour
    listeners.get("visibilitychange")!();
    listeners.get("online")!();
    vi.advanceTimersByTime(60_000);
    expect(FakeWS.made).toHaveLength(1);
    socket.close();
  });

  it("une coupure ordinaire : elle revient toute seule", () => {
    const { socket, statuses } = connect();
    FakeWS.made[0]!.open();
    FakeWS.made[0]!.shut(1006);
    expect(statuses.at(-1)).toBe("reconnecting");
    vi.advanceTimersByTime(7000);
    expect(FakeWS.made).toHaveLength(2);
    socket.close();
  });

  it("une connexion déjà quittée ne parle plus", () => {
    const { socket, messages } = connect();
    const first = FakeWS.made[0]!;
    first.open();
    first.shut(1006);
    vi.advanceTimersByTime(7000);
    const second = FakeWS.made[1]!;
    second.open();
    first.receive({ t: "replaced" });
    second.receive({ t: "room" });
    expect(messages).toEqual([{ t: "room" }]);
    socket.close();
  });
});
