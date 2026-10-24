import { describe, expect, it } from "vitest";
import { botPlacement } from "./bot.ts";
import {
  attackOf,
  COLS,
  dropped,
  emptyGrid,
  fits,
  GARBAGE,
  gridFromString,
  gridToString,
  landings,
  newBag,
  newBoard,
  place,
  PIECES,
  reachable,
  rotated,
  ROWS,
  spawn,
  takePiece,
  tSpin,
  withGarbage,
  type Active,
  type Grid,
  type Placement,
  type PlayerBoard,
} from "./engine.ts";

/** Plateau dessiné ligne par ligne depuis le fond : « X » pour une brique, « . » pour une case vide. */
function grid(...bottomUp: string[]): Grid {
  const g = emptyGrid();
  bottomUp.forEach((row, i) => {
    const y = ROWS - 1 - i;
    [...row].forEach((c, x) => (g[y * COLS + x] = c === "X" ? GARBAGE : 0));
  });
  return g;
}

function boardWith(g: Grid, current: Placement["type"]): PlayerBoard {
  const b = newBoard(7);
  b.grid = g;
  b.current = current;
  return b;
}

const drop = (b: PlayerBoard, a: Active, extra: Partial<Placement> = {}) => {
  const d = dropped(b.grid, a);
  return place(b, { type: a.type, x: d.x, y: d.y, rot: d.rot, hold: false, lastRotation: false, kick: 0, ...extra }, 0, {
    hold: true,
    strict: true,
  });
};

describe("pièces et sac", () => {
  it("un sac contient les 7 pièces, chacune une fois", () => {
    const bag = newBag(123);
    const first = Array.from({ length: 7 }, () => takePiece(bag));
    expect([...first].sort()).toEqual([...PIECES].sort());
    const second = Array.from({ length: 7 }, () => takePiece(bag));
    expect([...second].sort()).toEqual([...PIECES].sort());
  });

  it("même graine, même suite de pièces pour tout le monde", () => {
    const a = newBag(42);
    const b = newBag(42);
    expect(Array.from({ length: 30 }, () => takePiece(a))).toEqual(Array.from({ length: 30 }, () => takePiece(b)));
  });

  it("chaque pièce apparaît dans la zone cachée, au milieu", () => {
    for (const t of PIECES) expect(fits(emptyGrid(), spawn(t))).toBe(true);
  });

  it("la barre tourne autour de son centre et se cale contre le mur", () => {
    const g = emptyGrid();
    const r = rotated(g, { type: "I", rot: 0, x: 3, y: 10 }, 1)!;
    expect(r.piece).toEqual({ type: "I", rot: 1, x: 3, y: 10 });
    // Collée au mur gauche en vertical, elle doit être repoussée pour se coucher
    const wall = rotated(g, { type: "I", rot: 3, x: -1, y: 10 }, 1)!;
    expect(fits(g, wall.piece)).toBe(true);
    expect(wall.kick).toBeGreaterThan(0);
  });

  it("le plateau voyage en texte et revient à l'identique", () => {
    const g = grid("XXXX.XXXXX", "..X.......");
    expect(gridFromString(gridToString(g))).toEqual(g);
  });
});

describe("lignes et attaques", () => {
  it("quatre lignes d'un coup envoient 4 lignes, plus 10 si le plateau est vidé", () => {
    const b = boardWith(grid("XXXXXXXXX.", "XXXXXXXXX.", "XXXXXXXXX.", "XXXXXXXXX."), "I");
    const res = drop(b, { type: "I", rot: 1, x: 7, y: 2 });
    expect(res.ok && res.lines).toBe(4);
    expect(res.ok && res.perfect).toBe(true);
    expect(res.ok && res.attack).toBe(14);
    // Avec une brique qui reste, pas de bonus
    const b2 = boardWith(grid("XXXXXXXXX.", "XXXXXXXXX.", "XXXXXXXXX.", "XXXXXXXXX.", "X........."), "I");
    const res2 = drop(b2, { type: "I", rot: 1, x: 7, y: 2 });
    expect(res2.ok && res2.attack).toBe(4);
  });

  it("barème : simple 0, double 1, triple 2, combos et enchaînements", () => {
    expect(attackOf({ lines: 1, spin: "none", combo: 0, b2b: false, perfect: false })).toBe(0);
    expect(attackOf({ lines: 2, spin: "none", combo: 0, b2b: false, perfect: false })).toBe(1);
    expect(attackOf({ lines: 3, spin: "none", combo: 0, b2b: false, perfect: false })).toBe(2);
    expect(attackOf({ lines: 2, spin: "full", combo: 0, b2b: false, perfect: false })).toBe(4);
    expect(attackOf({ lines: 4, spin: "none", combo: 0, b2b: true, perfect: false })).toBe(5);
    expect(attackOf({ lines: 1, spin: "none", combo: 4, b2b: false, perfect: false })).toBe(1);
  });

  it("un T glissé sous un surplomb par rotation est un T-spin double", () => {
    // Le trou en forme de T est couvert à gauche : on n'y entre qu'en tournant au dernier moment
    const g = grid("XX.XXXXXXX", "X...XXXXXX", "XX........");
    const b = boardWith(g, "T");
    const final: Active = { type: "T", rot: 2, x: 1, y: ROWS - 3 };
    expect(fits(g, final)).toBe(true);
    const reach = reachable(g, spawn("T"));
    const k = ((final.y + 4) * 32 + (final.x + 4)) * 4 + final.rot;
    expect(reach.seen.has(k)).toBe(true);
    expect(reach.byRotation.has(k)).toBe(true);
    expect(tSpin(g, final, true, 0)).toBe("full");
    const res = place(b, { type: "T", x: final.x, y: final.y, rot: 2, hold: false, lastRotation: true, kick: 0 }, 0, {
      hold: true,
      strict: true,
    });
    expect(res.ok && res.lines).toBe(2);
    expect(res.ok && res.spin).toBe("full");
    expect(res.ok && res.attack).toBe(4);
  });

  it("le serveur refuse une pièce en l'air, ailleurs que posée, ou qui n'est pas la bonne", () => {
    const b = boardWith(emptyGrid(), "T");
    expect(
      place(b, { type: "T", x: 3, y: 10, rot: 0, hold: false, lastRotation: false, kick: 0 }, 0, { hold: true, strict: true }).ok,
    ).toBe(false);
    expect(
      place(b, { type: "S", x: 3, y: 22, rot: 0, hold: false, lastRotation: false, kick: 0 }, 0, { hold: true, strict: true }).ok,
    ).toBe(false);
  });

  it("une case fermée de tous côtés est hors d'atteinte", () => {
    const g = grid("XXXX.XXXXX", "XXXXXXXXXX".replace(/X/g, "X"));
    // Ligne du dessus pleine : le trou du fond est inaccessible
    const b = boardWith(grid("XXXX.XXXXX", "XXXXXXXXXX", ".........."), "I");
    void g;
    const res = place(b, { type: "I", x: 2, y: ROWS - 4, rot: 1, hold: false, lastRotation: false, kick: 0 }, 0, {
      hold: true,
      strict: true,
    });
    expect(res.ok).toBe(false);
  });

  it("la réserve garde la pièce et donne la suivante", () => {
    const b = newBoard(9);
    const first = b.current;
    const next = b.bag.queue[0]!;
    const a = dropped(b.grid, spawn(next));
    const res = place(b, { type: next, x: a.x, y: a.y, rot: a.rot, hold: true, lastRotation: false, kick: 0 }, 0, {
      hold: true,
      strict: true,
    });
    expect(res.ok).toBe(true);
    expect(b.hold).toBe(first);
  });
});

describe("lignes grises", () => {
  it("elles montent à la pose suivante sans ligne, seulement celles déjà vues", () => {
    const b = newBoard(5);
    b.pending = [
      { id: 1, lines: 2, hole: 3, from: "x" },
      { id: 2, lines: 3, hole: 7, from: "y" },
    ];
    const a = dropped(b.grid, spawn(b.current));
    const res = place(b, { type: a.type, x: a.x, y: a.y, rot: a.rot, hold: false, lastRotation: false, kick: 0 }, 1, {
      hold: true,
      strict: true,
    });
    expect(res.ok && res.garbageIn).toBe(2);
    expect(res.ok && res.garbageFrom).toBe("x");
    expect(b.pending.map((g) => g.id)).toEqual([2]);
    // Le trou est bien à la colonne 3
    expect(b.grid[(ROWS - 1) * COLS + 3]).toBe(0);
    expect(b.grid[(ROWS - 1) * COLS + 4]).toBe(GARBAGE);
  });

  it("faire des lignes annule d'abord ses propres lignes grises", () => {
    const b = boardWith(grid("XXXXXXXXX.", "XXXXXXXXX.", "XXXXXXXXX.", "XXXXXXXXX."), "I");
    b.pending = [{ id: 1, lines: 3, hole: 0, from: "x" }];
    const res = place(b, { type: "I", x: 7, y: ROWS - 4, rot: 1, hold: false, lastRotation: false, kick: 0 }, 1, {
      hold: true,
      strict: true,
    });
    // Quatre lignes + plateau vidé = 14, dont 3 annulées
    expect(res.ok && res.cancelled).toBe(3);
    expect(res.ok && res.sent).toBe(res.ok ? res.attack - 3 : -1);
    expect(b.pending).toEqual([]);
  });

  it("des lignes grises qui poussent la pile hors du plateau, c'est le K.O.", () => {
    const g = emptyGrid();
    g[0] = GARBAGE;
    expect(withGarbage(g, [1]).overflow).toBe(true);
  });
});

/** Deux bots s'affrontent jusqu'au K.O. ; renvoie l'indice du gagnant et le nombre de poses. */
function botDuel(levels: [Parameters<typeof botPlacement>[1], Parameters<typeof botPlacement>[1]], seed: number) {
  const boards = [newBoard(seed), newBoard(seed)];
  const rng = { rng: seed * 7 + 1 };
  let id = 0;
  for (let turn = 0; turn < 3000; turn++) {
    const i = turn % 2;
    const b = boards[i]!;
    const p = botPlacement(b, levels[i]!, true, rng);
    const res = place(b, p, id, { hold: true, strict: true });
    if (!res.ok) return { winner: 1 - i, turns: turn, invalid: res.error };
    if (res.topOut) return { winner: 1 - i, turns: turn, invalid: null };
    if (res.sent > 0) boards[1 - i]!.pending.push({ id: ++id, lines: res.sent, hole: (turn * 3) % COLS, from: String(i) });
  }
  return { winner: -1, turns: 3000, invalid: null };
}

describe("bots", () => {
  it("toutes les poses proposées sont valides et une partie se termine", () => {
    const r = botDuel(["confirme", "confirme"], 11);
    expect(r.invalid).toBeNull();
    expect(r.winner).not.toBe(-1);
  });

  it("l'expert bat l'apprenti presque à chaque fois", () => {
    let wins = 0;
    for (let s = 1; s <= 12; s++) {
      const r = botDuel(s % 2 ? ["expert", "apprenti"] : ["apprenti", "expert"], s);
      expect(r.invalid).toBeNull();
      if (r.winner === (s % 2 ? 0 : 1)) wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(10);
  });

  it("le confirmé bat l'apprenti le plus souvent", () => {
    let wins = 0;
    for (let s = 1; s <= 12; s++) {
      const r = botDuel(s % 2 ? ["confirme", "apprenti"] : ["apprenti", "confirme"], 100 + s);
      if (r.winner === (s % 2 ? 0 : 1)) wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(8);
  });

  it("chaque pose possible d'une pièce sur un plateau vide est posée au fond", () => {
    const all = landings(emptyGrid(), "T");
    expect(all.length).toBeGreaterThanOrEqual(30);
    expect(all.every(({ piece }) => !fits(emptyGrid(), { ...piece, y: piece.y + 1 }))).toBe(true);
  });
});
