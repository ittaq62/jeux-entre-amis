import { describe, expect, it } from "vitest";
import { currentScore, frameDone, frameMarks, frameScores, freshRack, isSplit, maxPossible, type Rolls } from "./score.ts";

const strikes = (n: number): Rolls => Array.from({ length: n }, () => [10]);

describe("bowling : le compte des points", () => {
  it("la partie parfaite fait 300", () => {
    const rolls = [...strikes(9), [10, 10, 10]];
    expect(frameScores(rolls, 10)).toEqual([30, 60, 90, 120, 150, 180, 210, 240, 270, 300]);
  });

  it("toutes les boules dans la rigole font 0", () => {
    const rolls = Array.from({ length: 10 }, () => [0, 0]);
    expect(frameScores(rolls, 10)[9]).toBe(0);
  });

  it("un spare compte la boule suivante, un strike les deux suivantes", () => {
    // 7/ puis 5 2 : 15, puis 22 ; X puis 3 4 : 17, puis 24
    expect(
      frameScores(
        [
          [7, 3],
          [5, 2],
        ],
        10,
      ).slice(0, 2),
    ).toEqual([15, 22]);
    expect(frameScores([[10], [3, 4]], 10).slice(0, 2)).toEqual([17, 24]);
    // Deux strikes puis 4 : le premier vaut 24
    expect(frameScores([[10], [10], [4, 2]], 10).slice(0, 3)).toEqual([24, 40, 46]);
  });

  it("un strike attend ses deux boules avant d'être compté", () => {
    expect(frameScores([[10], [10]], 10).slice(0, 3)).toEqual([null, null, null]);
    expect(frameScores([[9, 0], [10]], 10).slice(0, 2)).toEqual([9, null]);
    expect(currentScore([[9, 0], [10]], 10)).toBe(9);
  });

  it("la partie classique d'exemple : 167", () => {
    const rolls: Rolls = [[10], [7, 3], [9, 0], [10], [0, 8], [8, 2], [0, 6], [10], [10], [10, 8, 1]];
    expect(frameScores(rolls, 10)).toEqual([20, 39, 48, 66, 74, 84, 90, 120, 148, 167]);
  });

  it("une partie courte : la dernière frame suit la règle de la dixième", () => {
    expect(frameScores([[10], [10], [10, 10, 10]], 3)).toEqual([30, 60, 90]);
    expect(
      frameScores(
        [
          [5, 5],
          [3, 4],
          [6, 4, 7],
        ],
        3,
      ),
    ).toEqual([13, 20, 37]);
  });

  it("la dernière frame : une boule de plus après un strike ou un spare, pas sinon", () => {
    expect(frameDone([10], true)).toBe(false);
    expect(frameDone([10, 3], true)).toBe(false);
    expect(frameDone([7, 3], true)).toBe(false);
    expect(frameDone([7, 2], true)).toBe(true);
    expect(frameDone([7, 3, 5], true)).toBe(true);
    expect(frameDone([10], false)).toBe(true);
    expect(freshRack([10], true)).toBe(true);
    expect(freshRack([10, 3], true)).toBe(false);
    expect(freshRack([10, 10], true)).toBe(true);
    expect(freshRack([6, 4], true)).toBe(true);
  });

  it("les marques de la feuille", () => {
    expect(frameMarks([10], false)).toEqual(["X"]);
    expect(frameMarks([7, 3], false)).toEqual(["7", "/"]);
    expect(frameMarks([0, 10], false)).toEqual(["–", "/"]);
    expect(frameMarks([9, 0], false)).toEqual(["9", "–"]);
    expect(frameMarks([10, 10, 10], true)).toEqual(["X", "X", "X"]);
    expect(frameMarks([10, 7, 3], true)).toEqual(["X", "7", "/"]);
    expect(frameMarks([8, 2, 10], true)).toEqual(["8", "/", "X"]);
  });

  it("le meilleur score encore possible", () => {
    expect(maxPossible([], 10)).toBe(300);
    expect(maxPossible([[9, 0]], 10)).toBe(279);
    expect(maxPossible([[10], [10], [10, 10, 10]], 3)).toBe(90);
  });
});

describe("bowling : les splits", () => {
  it("le 7-10, le 4-6, le 2-7 sont des splits", () => {
    expect(isSplit([7, 10])).toBe(true);
    expect(isSplit([4, 6])).toBe(true);
    expect(isSplit([2, 7])).toBe(true);
    expect(isSplit([4, 6, 7, 10])).toBe(true);
  });

  it("des quilles qui se tiennent, ou la quille de tête encore debout, n'en sont pas", () => {
    expect(isSplit([10])).toBe(false);
    expect(isSplit([3, 6, 10])).toBe(false);
    expect(isSplit([2, 8])).toBe(false);
    expect(isSplit([1, 7])).toBe(false);
    expect(isSplit([4, 7])).toBe(false);
  });
});
