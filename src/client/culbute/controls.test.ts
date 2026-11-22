// Les commandes au doigt : Frapper relâché vite donne le coup simple, gardé il devient le coup fort ; la garde (Frapper
// et Spécial ensemble) ne laisse pas de coup derrière elle.
import { beforeAll, describe, expect, it } from "vitest";
import { ATK, FRT, SHD } from "../../shared/games/culbute/model.ts";
import { CHARGE_DECIDE } from "../../shared/games/culbute/moves.ts";
import { defaultSettings } from "./bindings.ts";

type Controls = import("./controls.ts").CulbuteControls;
let make: () => Controls;

beforeAll(async () => {
  const g = globalThis as unknown as Record<string, unknown>;
  g.window ??= { addEventListener() {}, removeEventListener() {} };
  g.navigator ??= {};
  g.Element ??= class {};
  g.HTMLElement ??= class {};
  g.HTMLInputElement ??= class {};
  g.HTMLTextAreaElement ??= class {};
  g.document ??= { activeElement: null };
  const { CulbuteControls } = await import("./controls.ts");
  make = () => new CulbuteControls(defaultSettings());
});

/** n lectures de suite : les boutons enfoncés à chacune */
const samples = (c: Controls, n: number) => Array.from({ length: n }, () => c.sample());

describe("Culbute, commandes au doigt", () => {
  it("Frapper relâché vite : le coup simple, au relâchement", () => {
    const c = make();
    c.touchButton("atk", true);
    expect(samples(c, 3).some((s) => s.pressed & (ATK | FRT))).toBe(false);
    c.touchButton("atk", false);
    expect(c.sample().pressed & ATK).toBe(ATK);
    expect(c.sample().pressed).toBe(0);
  });

  it("un appui si bref qu'il tient entre deux lectures compte quand même", () => {
    const c = make();
    c.touchButton("atk", true);
    c.touchButton("atk", false);
    expect(c.sample().pressed & ATK).toBe(ATK);
  });

  it("Frapper gardé : le coup fort, tenu tant que le doigt reste, et pas de coup simple au relâchement", () => {
    const c = make();
    c.touchButton("atk", true);
    const seen = samples(c, CHARGE_DECIDE + 10);
    expect(seen.filter((s) => s.pressed & FRT)).toHaveLength(1);
    expect(seen.at(-1)!.held & FRT).toBe(FRT);
    c.touchButton("atk", false);
    const after = c.sample();
    expect(after.pressed & ATK).toBe(0);
    expect(after.held & FRT).toBe(0);
  });

  it("la garde (Frapper et Spécial) ne laisse pas de coup quand on lève un doigt après l'autre", () => {
    const c = make();
    c.touchButton("atk", true);
    c.touchButton("spc", true);
    const guard = samples(c, 5);
    expect(guard.every((s) => s.held & SHD)).toBe(true);
    c.touchButton("spc", false);
    const rest = samples(c, CHARGE_DECIDE + 5);
    expect(rest.some((s) => s.pressed & (ATK | FRT))).toBe(false);
    c.touchButton("atk", false);
    expect(c.sample().pressed & (ATK | FRT)).toBe(0);
  });
});

/** Les gestes de la souris, tels que la fenêtre les donnerait */
type Mousy = { onMouseMove(e: unknown): void; onMouseDown(e: unknown): void; onMouseUp(e: unknown): void };
const mouse = (c: Controls) => c as unknown as Mousy;
const click = (c: Controls, button: number) => {
  mouse(c).onMouseDown({ button, target: null, preventDefault() {} });
  mouse(c).onMouseUp({ button, target: null, preventDefault() {} });
};

describe("Culbute, viser à la souris", () => {
  it("le coup part vers le curseur : au-dessus, vers le haut ; sur le combattant, sans direction", () => {
    const c = make();
    let aim: [number, number] = [0, 3];
    c.aimFrom = () => aim;
    mouse(c).onMouseMove({ clientX: 10, clientY: 10 });
    click(c, 0);
    const up = c.sample();
    expect(up.pressed & ATK).toBe(ATK);
    expect(up.y).toBeCloseTo(1, 5);
    expect(up.x).toBeCloseTo(0, 5);
    aim = [0.2, 0.3];
    click(c, 2);
    const self = c.sample();
    expect(self.x).toBe(0);
    expect(self.y).toBe(0);
  });

  it("les touches tenues déplacent toujours ; le coup visé ne vise que le temps de partir", () => {
    const c = make();
    c.aimFrom = () => [-4, 0];
    let ready = false;
    c.ready = () => ready;
    mouse(c).onMouseMove({ clientX: 10, clientY: 10 });
    // Droite tenue, clic à gauche : le stick vise à gauche tant que le combattant ne peut pas frapper
    (c as unknown as { onKeyDown(e: unknown): void }).onKeyDown({ code: "KeyD", preventDefault() {} });
    click(c, 0);
    expect(c.sample().x).toBeCloseTo(-1, 5);
    expect(c.sample().x).toBeCloseTo(-1, 5);
    // Il peut frapper : le coup part vers la gauche, puis la touche reprend la main
    ready = true;
    expect(c.sample().x).toBeCloseTo(-1, 5);
    expect(c.sample().x).toBe(1);
  });

  it("sans le réglage (les dispositions au clavier seul), les touches donnent la direction", () => {
    const c = new (make().constructor as new (s: ReturnType<typeof defaultSettings>) => Controls)({
      ...defaultSettings(),
      aimMouse: false,
    });
    c.aimFrom = () => [0, 3];
    mouse(c).onMouseMove({ clientX: 10, clientY: 10 });
    click(c, 0);
    const s = c.sample();
    expect(s.pressed & ATK).toBe(ATK);
    expect(s.y).toBe(0);
  });
});

describe("Culbute, le clic maintenu", () => {
  const down = (c: Controls, button = 0) => mouse(c).onMouseDown({ button, target: null, preventDefault() {} });
  const up = (c: Controls, button = 0) => mouse(c).onMouseUp({ button, target: null, preventDefault() {} });

  it("un clic bref : le coup simple, au relâchement", () => {
    const c = make();
    down(c);
    expect(samples(c, 3).some((s) => s.pressed & (ATK | FRT))).toBe(false);
    up(c);
    const s = c.sample();
    expect(s.pressed & ATK).toBe(ATK);
    expect(s.pressed & FRT).toBe(0);
    expect(c.sample().pressed).toBe(0);
  });

  it("le clic gardé un cinquième de seconde : le coup fort, chargé tant qu'on tient, et rien au relâchement", () => {
    const c = make();
    down(c);
    const seen = samples(c, CHARGE_DECIDE + 10);
    expect(seen.filter((s) => s.pressed & FRT)).toHaveLength(1);
    expect(seen.some((s) => s.pressed & ATK)).toBe(false);
    expect(seen.at(-1)!.held & FRT).toBe(FRT);
    up(c);
    const after = c.sample();
    expect(after.pressed & (ATK | FRT)).toBe(0);
    expect(after.held & FRT).toBe(0);
  });

  it("sans le réglage, le clic frappe dès l'appui", () => {
    const c = new (make().constructor as new (s: ReturnType<typeof defaultSettings>) => Controls)({
      ...defaultSettings(),
      holdStrong: false,
    });
    down(c);
    expect(c.sample().pressed & ATK).toBe(ATK);
    up(c);
  });
});
