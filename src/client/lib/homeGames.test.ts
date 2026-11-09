import { describe, expect, it } from "vitest";
import { ALBUM_SEARCH, HOME_GAMES, matchesGame, searchWords } from "./homeGames.ts";

const find = (query: string) => HOME_GAMES.filter((g) => matchesGame(g, searchWords(query))).map((g) => g.id);
const everything = HOME_GAMES.map((g) => g.id);

describe("la recherche de jeux", () => {
  it("chaque jeu se trouve par son nom", () => {
    for (const game of HOME_GAMES) expect(find(game.name)).toContain(game.id);
  });

  it("sans rien de précis à chercher, tous les jeux restent affichés", () => {
    for (const query of ["", "   ", "jeu", "des jeux", "un jeu entre amis"]) expect(find(query)).toEqual(everything);
  });

  it("ni les majuscules ni les accents ne comptent", () => {
    for (const query of ["Mèche", "MECHE", "meche", "mêche"]) expect(find(query)).toEqual(["meche"]);
    expect(find("tournee")).toEqual(["tour"]);
  });

  it("on trouve par thème, au singulier comme au pluriel", () => {
    expect(find("cartes")).toEqual(["uno"]);
    expect(find("un jeu de cartes")).toEqual(["uno"]);
    expect(find("voitures")).toEqual(["bolides"]);
    expect(find("voiture")).toEqual(["bolides"]);
    expect(find("bateaux")).toEqual(["naval"]);
    expect(find("mots")).toEqual(["meche"]);
    expect(find("villes")).toEqual(["capitale"]);
    expect(find("tournoi")).toEqual(["tour"]);
    expect(find("deltaplane")).toEqual(["bolides"]);
  });

  it("on trouve par nombre de joueurs", () => {
    expect(find("8")).toEqual(["tour", "uno", "meche", "bolides"]);
    expect(find("à 8 joueurs")).toEqual(["tour", "uno", "meche", "bolides"]);
    expect(find("6 personnes")).toEqual(everything);
    expect(find("1 joueur")).toEqual(["bricks"]);
    expect(find("solo")).toEqual(["bricks"]);
    expect(find("9")).toEqual([]);
  });

  it("le début d'un mot suffit", () => {
    expect(find("bata")).toEqual(["naval"]);
    expect(find("bol")).toEqual(["bolides"]);
    expect(find("bri")).toEqual(["bricks"]);
    expect(find("cap")).toEqual(["capitale"]);
  });

  it("une faute de frappe passe", () => {
    expect(find("bataile")).toEqual(["naval"]);
    expect(find("navalle")).toEqual(["naval"]);
    expect(find("bloides")).toEqual(["bolides"]);
    expect(find("capitole")).toEqual(["capitale"]);
    expect(find("voitrue")).toEqual(["bolides"]);
  });

  it("tous les mots cherchés doivent correspondre", () => {
    expect(find("course 8")).toEqual(["bolides"]);
    expect(find("cartes voiture")).toEqual([]);
  });

  it("ce qui n'existe pas ne donne rien", () => {
    expect(find("zzz")).toEqual([]);
    expect(find("xylophone")).toEqual([]);
  });

  it("l'album se trouve aussi, mais il n'a pas de nombre de joueurs", () => {
    expect(matchesGame(ALBUM_SEARCH, searchWords("album"))).toBe(true);
    expect(matchesGame(ALBUM_SEARCH, searchWords("paquets"))).toBe(true);
    expect(matchesGame(ALBUM_SEARCH, searchWords("8"))).toBe(false);
    expect(matchesGame(ALBUM_SEARCH, searchWords("voiture"))).toBe(false);
  });
});
