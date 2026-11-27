import { describe, expect, it } from "vitest";
import type { PublicTable } from "../shared/publicTable.ts";
import { extraHead, sharedTableCode, shareImage, shareTags, SITE_DESCRIPTION } from "./share.ts";

const ORIGIN = "https://jouer.latablee.workers.dev";
const table = (over: Partial<PublicTable> = {}): PublicTable => ({
  code: "ABCD",
  game: "bowling",
  kind: "table",
  hostName: "Léa",
  status: "lobby",
  humans: 2,
  bots: 0,
  maxPlayers: 4,
  freeSeats: 2,
  lateJoin: true,
  ...over,
});

describe("sharedTableCode", () => {
  it("lit le code d'une table partagée", () => {
    expect(sharedTableCode("/salon/ABCD")).toBe("ABCD");
    expect(sharedTableCode("/salon/abcd/")).toBe("ABCD");
    expect(sharedTableCode("/salon/ABC")).toBeNull();
    expect(sharedTableCode("/tournee/t_123")).toBeNull();
  });
});

describe("shareTags", () => {
  it("une table : qui attend, à quel jeu, la place qu'il reste, et l'image du jeu en adresse absolue", () => {
    const tags = shareTags("/salon/ABCD", ORIGIN, table());
    expect(tags.title).toBe("Léa t'attend pour une partie de Bowling");
    expect(tags.description).toBe("Table ABCD · 2 places libres. La Tablée, les jeux du soir, entre amis.");
    expect(tags.image).toBe(`${ORIGIN}/partage/bowling.jpg`);
    expect(tags.url).toBe(`${ORIGIN}/salon/ABCD`);
  });

  it("une tournée a l'image de la tournée", () => {
    const tags = shareTags("/salon/WXYZ", ORIGIN, table({ code: "WXYZ", game: "tour", kind: "tour" }));
    expect(tags.title).toBe("Léa t'invite à sa tournée");
    expect(tags.image).toBe(`${ORIGIN}/partage/tour.jpg`);
  });

  it("une table inconnue ou disparue : le site, jamais une erreur", () => {
    const tags = shareTags("/salon/ZZZZ", ORIGIN, null);
    expect(tags.description).toBe(SITE_DESCRIPTION);
    expect(tags.image).toBe(shareImage(ORIGIN, null));
    expect(tags.image).toBe(`${ORIGIN}/partage/site.jpg`);
  });

  it("la feuille d'une tournée finie", () => {
    expect(shareTags("/tournee/t_123", ORIGIN, null).image).toBe(`${ORIGIN}/partage/tour.jpg`);
  });

  it("la description générale ne parle plus d'un seul jeu", () => {
    expect(SITE_DESCRIPTION).not.toMatch(/UNO/);
  });
});

describe("extraHead", () => {
  it("échappe ce qui vient du pseudo de l'hôte", () => {
    const html = extraHead(shareTags("/salon/ABCD", ORIGIN, table({ hostName: 'Léa "<b>" & co' })));
    expect(html).toContain("Léa &quot;&lt;b&gt;&quot; &amp; co t&#39;attend".replace("&#39;", "'"));
    expect(html).not.toContain("<b>");
    expect(html).toContain('<meta name="twitter:image" content="https://jouer.latablee.workers.dev/partage/bowling.jpg" />');
    // La taille de l'image et twitter:card sont déjà dans index.html : pas de doublon
    expect(html).not.toContain("og:image:width");
  });
});
