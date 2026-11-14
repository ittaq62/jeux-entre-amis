import { describe, expect, it } from "vitest";
import {
  arrival,
  defaultLateJoin,
  intentFrom,
  intentQuery,
  lateJoinHint,
  lateJoinOf,
  maySit,
  needsFriendCheck,
  rememberWatcher,
  type ArrivalCase,
} from "./lateJoin.ts";

const base: ArrivalCase = {
  intent: null,
  seated: false,
  started: false,
  lateJoin: false,
  midGame: false,
  watcher: false,
  friend: false,
  room: true,
};
const at = (patch: Partial<ArrivalCase>) => arrival({ ...base, ...patch });

describe("l'intention dans l'adresse", () => {
  it("?regarder, ?jouer, ou rien", () => {
    expect(intentFrom("?regarder")).toBe("watch");
    expect(intentFrom("?jouer")).toBe("play");
    expect(intentFrom("")).toBeNull();
    expect(intentFrom("?autre=1")).toBeNull();
    expect(intentFrom(intentQuery("watch"))).toBe("watch");
    expect(intentFrom(intentQuery("play"))).toBe("play");
    expect(intentQuery(null)).toBe("");
  });
});

describe("arriver à une table", () => {
  it("« Regarder » ne fait jamais asseoir, avant comme pendant la partie", () => {
    expect(at({ intent: "watch" })).toBe("watch");
    expect(at({ intent: "watch", started: true, lateJoin: true, midGame: true })).toBe("watch");
  });

  it("qui a sa place la retrouve toujours, même porte fermée", () => {
    expect(at({ seated: true, started: true })).toBe("seat");
    expect(at({ seated: true, intent: "watch", started: true })).toBe("seat");
  });

  it("au salon, un lien assoit ; pas qui était venu regarder, sauf s'il demande à jouer", () => {
    expect(at({})).toBe("seat");
    expect(at({ room: false })).toBe("watch");
    expect(at({ watcher: true })).toBe("watch");
    expect(at({ watcher: true, intent: "play" })).toBe("seat");
  });

  it("partie lancée, porte fermée : seuls les amis des joueurs et ceux qui regardaient déjà entrent, pour regarder", () => {
    expect(at({ started: true })).toBe("deny");
    expect(at({ started: true, intent: "play" })).toBe("deny");
    expect(at({ started: true, friend: true, intent: "play", midGame: true })).toBe("watch");
    expect(at({ started: true, watcher: true })).toBe("watch");
  });

  it("partie lancée, porte ouverte : on regarde ; on joue seulement en le demandant, là où le jeu le permet", () => {
    expect(at({ started: true, lateJoin: true })).toBe("watch");
    expect(at({ started: true, lateJoin: true, intent: "play" })).toBe("watch");
    expect(at({ started: true, lateJoin: true, intent: "play", midGame: true })).toBe("seat");
    expect(at({ started: true, lateJoin: true, intent: "play", midGame: true, room: false })).toBe("watch");
  });

  it("l'amitié ne se vérifie que porte fermée, pour qui n'a ni place ni passé à la table", () => {
    expect(needsFriendCheck({ ...base, started: true })).toBe(true);
    expect(needsFriendCheck({ ...base, started: true, lateJoin: true })).toBe(false);
    expect(needsFriendCheck({ ...base, started: true, seated: true })).toBe(false);
    expect(needsFriendCheck({ ...base, started: true, watcher: true })).toBe(false);
    expect(needsFriendCheck(base)).toBe(false);
  });

  it("prendre une place : avant la partie, ou pendant si l'hôte et le jeu le permettent", () => {
    expect(maySit({ started: false, lateJoin: false, midGame: false })).toBe(true);
    expect(maySit({ started: true, lateJoin: true, midGame: false })).toBe(false);
    expect(maySit({ started: true, lateJoin: false, midGame: true })).toBe(false);
    expect(maySit({ started: true, lateJoin: true, midGame: true })).toBe(true);
  });
});

describe("le réglage", () => {
  it("fermé par défaut, ouvert pour une partie rapide ; une table d'avant le réglage prend le défaut", () => {
    expect(defaultLateJoin(false)).toBe(false);
    expect(defaultLateJoin(true)).toBe(true);
    expect(lateJoinOf({}, false)).toBe(false);
    expect(lateJoinOf({}, true)).toBe(true);
    expect(lateJoinOf({ lateJoin: true }, false)).toBe(true);
    expect(lateJoinOf({ lateJoin: false }, true)).toBe(false);
  });

  it("le salon dit ce que vaut l'option pour chaque jeu", () => {
    expect(lateJoinHint("uno", true)).toMatch(/UNO déjà lancée/);
    expect(lateJoinHint("crampons", true)).toMatch(/entrer sur le terrain/);
    expect(lateJoinHint("tour", true)).toMatch(/dès le prochain jeu/);
    expect(lateJoinHint("capitale", false)).toMatch(/amis d'un joueur/);
  });

  it("la liste des spectateurs ne grossit pas sans fin", () => {
    let list: string[] = [];
    for (let i = 0; i < 100; i++) list = rememberWatcher(list, `u${i}`);
    list = rememberWatcher(list, "u50");
    expect(list.length).toBe(80);
    expect(list.at(-1)).toBe("u50");
    expect(list.filter((id) => id === "u50").length).toBe(1);
  });
});
