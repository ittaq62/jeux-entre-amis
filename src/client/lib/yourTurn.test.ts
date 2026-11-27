import { describe, expect, it } from "vitest";
import { flaggedTitle, startTurnAlert, type TurnAlertPage } from "./yourTurn.ts";

/** Une page factice : un titre, une icône, la visibilité qu'on change à la main */
function fakePage(hidden = false) {
  const listeners = new Set<() => void>();
  const icon = { href: "/icon.svg" };
  const calls: string[] = [];
  const doc = {
    title: "La Tablée",
    visibilityState: (hidden ? "hidden" : "visible") as DocumentVisibilityState,
    querySelector: () => icon,
    addEventListener: (_: "visibilitychange", fn: () => void) => void listeners.add(fn),
    removeEventListener: (_: "visibilitychange", fn: () => void) => void listeners.delete(fn),
  };
  const page: TurnAlertPage = {
    doc,
    setBadge: () => calls.push("badge"),
    clearBadge: () => calls.push("sans badge"),
    dotIcon: async () => "data:pastille",
    chime: () => calls.push("son"),
  };
  const show = (visible: boolean) => {
    doc.visibilityState = visible ? "visible" : "hidden";
    for (const fn of [...listeners]) fn();
  };
  return { page, doc, icon, calls, show, listeners };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("« À toi ! » quand l'onglet est caché", () => {
  it("le titre est marqué une seule fois, même s'il l'était déjà", () => {
    expect(flaggedTitle("La Tablée", "À toi !")).toBe("(À toi !) La Tablée");
    expect(flaggedTitle("(2) Invitation · La Tablée", "À toi !")).toBe("(À toi !) Invitation · La Tablée");
  });

  it("onglet visible : rien ne change ; caché : titre, pastille, icône ; au retour : un son et tout redevient comme avant", async () => {
    const { page, doc, icon, calls, show } = fakePage();
    const stop = startTurnAlert(page, "À toi !");
    expect(doc.title).toBe("La Tablée");
    show(false);
    await tick();
    expect(doc.title).toBe("(À toi !) La Tablée");
    expect(icon.href).toBe("data:pastille");
    expect(calls).toEqual(["badge"]);
    show(true);
    expect(doc.title).toBe("La Tablée");
    expect(icon.href).toBe("/icon.svg");
    expect(calls).toEqual(["badge", "son", "sans badge"]);
    stop();
  });

  it("le tour passe pendant que l'onglet est caché : tout se remet, sans son", async () => {
    const { page, doc, icon, calls, listeners } = fakePage(true);
    const stop = startTurnAlert(page, "La mèche !");
    await tick();
    expect(doc.title).toBe("(La mèche !) La Tablée");
    stop();
    expect(doc.title).toBe("La Tablée");
    expect(icon.href).toBe("/icon.svg");
    expect(calls).toEqual(["badge", "sans badge"]);
    expect(listeners.size).toBe(0);
  });

  it("un titre changé entre-temps par un autre (une invitation) n'est pas écrasé", () => {
    const { page, doc, show } = fakePage();
    const stop = startTurnAlert(page, "À toi !");
    show(false);
    doc.title = "(1) Invitation · La Tablée";
    show(true);
    expect(doc.title).toBe("(1) Invitation · La Tablée");
    stop();
  });
});
