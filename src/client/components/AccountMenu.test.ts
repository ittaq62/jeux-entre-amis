import { describe, expect, it } from "vitest";
import { REPORT_VARIANT_MAX } from "../../shared/report.ts";
import { pageName } from "./AccountMenu.tsx";

describe("pageName", () => {
  it("nomme les pages du site", () => {
    expect(pageName("/")).toBe("Page : Accueil");
    expect(pageName("/amis")).toBe("Page : Amis");
    expect(pageName("/compte")).toBe("Page : Mon compte");
    expect(pageName("/joueur/Voisine%20Rose")).toBe("Page : profil de Voisine Rose");
    expect(pageName("/tournee/t_abc")).toBe("Page : feuille d'une tournée");
  });

  it("garde l'adresse d'une page sans nom, sans dépasser la longueur permise", () => {
    expect(pageName("/inconnue")).toBe("Page : /inconnue");
    expect(pageName(`/${"x".repeat(200)}`).length).toBe(REPORT_VARIANT_MAX);
    expect(pageName(`/joueur/${"y".repeat(200)}`).length).toBe(REPORT_VARIANT_MAX);
  });
});
