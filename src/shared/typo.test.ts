import { describe, expect, it } from "vitest";
import { DECKS } from "./games/capitale/board.ts";
import { fr, NBSP } from "./typo.ts";

describe("la typographie française à l'affichage", () => {
  it("une espace insécable avant « : ; ! ? », dans les guillemets, entre un nombre et ₣ ou %", () => {
    expect(fr("Stationnement gênant : amende de 30.")).toBe(`Stationnement gênant${NBSP}: amende de 30.`);
    expect(fr("Tu l'achètes ? Oui ! Bon ; d'accord")).toBe(`Tu l'achètes${NBSP}? Oui${NBSP}! Bon${NBSP}; d'accord`);
    expect(fr("le « Monopole »")).toBe(`le «${NBSP}Monopole${NBSP}»`);
    expect(fr("payez 525 ₣ et 50 %")).toBe(`payez 525${NBSP}₣ et 50${NBSP}%`);
  });

  it("ne touche ni un texte déjà juste, ni l'heure, ni une adresse", () => {
    expect(fr(`Déjà${NBSP}: bon`)).toBe(`Déjà${NBSP}: bon`);
    expect(fr("à 18:30, https://exemple.fr/a?b=1")).toBe("à 18:30, https://exemple.fr/a?b=1");
  });

  it("aucune carte de Capitale ne garde une espace ordinaire avant « : » une fois affichée", () => {
    for (const card of [...DECKS.hasard, ...DECKS.courrier]) expect(fr(card.text)).not.toMatch(/ [:;!?]/);
  });
});
