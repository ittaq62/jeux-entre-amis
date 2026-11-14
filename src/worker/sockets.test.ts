import { describe, expect, it } from "vitest";
import { SOCKET_REPLACED } from "../shared/protocol.ts";
import { isLive, isReplaced, replaceOlder } from "./sockets.ts";

/** Une connexion de table, comme celles du serveur : son étiquette (à qui elle est), ce qu'elle a reçu, sa fermeture */
class FakeSocket {
  readyState = 1;
  sent: string[] = [];
  closedWith: number | null = null;
  constructor(private attachment: unknown) {}
  deserializeAttachment() {
    return this.attachment;
  }
  serializeAttachment(value: unknown) {
    this.attachment = structuredClone(value);
  }
  send(text: string) {
    if (this.readyState !== 1) throw new Error("fermée");
    this.sent.push(text);
  }
  close(code: number) {
    this.closedWith = code;
    this.readyState = 2;
  }
}

const socket = (userId: string) => new FakeSocket({ userId, user: { id: userId } }) as unknown as WebSocket & FakeSocket;

describe("un seul appareil par compte à une table", () => {
  it("la nouvelle connexion prend la place : les anciennes sont prévenues, ne comptent plus, puis sont fermées", () => {
    const phone = socket("a");
    const tab = socket("a");
    const computer = socket("a");
    expect(replaceOlder([phone, tab, computer], computer)).toBe(2);
    for (const old of [phone, tab]) {
      expect(old.sent).toEqual([JSON.stringify({ t: "replaced" })]);
      expect(old.closedWith).toBe(SOCKET_REPLACED);
      expect(isReplaced(old)).toBe(true);
      expect(isLive(old)).toBe(false);
      // Elle sait toujours à qui elle était
      expect((old.deserializeAttachment() as { userId: string }).userId).toBe("a");
    }
    expect(computer.sent).toEqual([]);
    expect(computer.closedWith).toBeNull();
    expect(isLive(computer)).toBe(true);
  });

  it("une connexion remplacée ne compte plus, même avant d'être tout à fait fermée", () => {
    const old = socket("a");
    old.serializeAttachment({ userId: "a", user: { id: "a" }, replaced: true });
    expect(old.readyState).toBe(1);
    expect(isLive(old)).toBe(false);
    // Et on ne la prévient pas deux fois
    expect(replaceOlder([old, socket("a")], socket("a"))).toBe(1);
    expect(old.sent).toEqual([]);
  });

  it("seul, on garde sa connexion ; une connexion déjà coupée ne fait pas d'erreur", () => {
    const alone = socket("a");
    expect(replaceOlder([alone], alone)).toBe(0);
    expect(isLive(alone)).toBe(true);
    const dead = socket("a");
    dead.readyState = 3;
    expect(() => replaceOlder([dead, alone], alone)).not.toThrow();
    expect(isReplaced(dead)).toBe(true);
    expect(isLive(dead)).toBe(false);
  });
});
