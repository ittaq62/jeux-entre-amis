import { describe, expect, it } from "vitest";
import {
  addDays,
  claimLogin,
  countsForStreak,
  dayNumber,
  LOGIN_LADDER,
  liveLogin,
  livePlay,
  MIN_GAME_MS,
  nextPlay,
  parisDay,
  weekBonus,
  weekDone,
  weekStart,
  type LoginState,
} from "./streak.ts";

const at = (iso: string) => Date.parse(iso);

describe("le jour à Paris", () => {
  it("change à minuit à Paris, pas à minuit UTC (hiver : UTC+1, été : UTC+2)", () => {
    expect(parisDay(at("2026-11-15T22:59:59.999Z"))).toBe("2026-11-15");
    expect(parisDay(at("2026-11-15T23:00:00.000Z"))).toBe("2026-11-16");
    expect(parisDay(at("2026-07-14T21:59:59.999Z"))).toBe("2026-07-14");
    expect(parisDay(at("2026-07-14T22:00:00.000Z"))).toBe("2026-07-15");
    // Le 31 décembre à 23 h 30 à Paris : encore 2026 ; à minuit, 2027
    expect(parisDay(at("2026-12-31T22:30:00Z"))).toBe("2026-12-31");
    expect(parisDay(at("2026-12-31T23:00:00Z"))).toBe("2027-01-01");
  });

  it("passage à l'heure d'été (29 mars 2026) : une journée de 23 heures", () => {
    expect(parisDay(at("2026-03-28T22:59:59Z"))).toBe("2026-03-28");
    expect(parisDay(at("2026-03-28T23:00:00Z"))).toBe("2026-03-29");
    // 1 h 59 en heure d'hiver, puis 3 h 00 en heure d'été : toujours le 29
    expect(parisDay(at("2026-03-29T00:59:59Z"))).toBe("2026-03-29");
    expect(parisDay(at("2026-03-29T01:00:00Z"))).toBe("2026-03-29");
    // Minuit du 30 tombe à 22 h UTC, plus à 23 h
    expect(parisDay(at("2026-03-29T21:59:59Z"))).toBe("2026-03-29");
    expect(parisDay(at("2026-03-29T22:00:00Z"))).toBe("2026-03-30");
  });

  it("retour à l'heure d'hiver (25 octobre 2026) : une journée de 25 heures", () => {
    expect(parisDay(at("2026-10-24T21:59:59Z"))).toBe("2026-10-24");
    expect(parisDay(at("2026-10-24T22:00:00Z"))).toBe("2026-10-25");
    // 2 h 30 deux fois de suite (été puis hiver) : le même jour
    expect(parisDay(at("2026-10-25T00:30:00Z"))).toBe("2026-10-25");
    expect(parisDay(at("2026-10-25T01:30:00Z"))).toBe("2026-10-25");
    expect(parisDay(at("2026-10-25T22:59:59Z"))).toBe("2026-10-25");
    expect(parisDay(at("2026-10-25T23:00:00Z"))).toBe("2026-10-26");
  });

  it("deux jours qui se suivent ont des numéros qui se suivent, heure d'été ou pas", () => {
    for (const day of ["2026-03-28", "2026-03-29", "2026-10-24", "2026-10-25", "2026-12-31", "2028-02-28", "2028-02-29"]) {
      expect(dayNumber(addDays(day, 1)) - dayNumber(day)).toBe(1);
    }
    expect(addDays("2026-03-29", 1)).toBe("2026-03-30");
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("la semaine commence le lundi", () => {
    expect(weekStart("2026-11-15")).toBe("2026-11-09"); // dimanche
    expect(weekStart("2026-11-16")).toBe("2026-11-16"); // lundi
    expect(weekStart("2026-11-11")).toBe("2026-11-09");
    expect(weekStart("2027-01-01")).toBe("2026-12-28"); // à cheval sur deux années
    expect(weekStart("2026-03-29")).toBe("2026-03-23"); // le dimanche du changement d'heure
    expect(weekStart("2026-10-26")).toBe("2026-10-26");
  });
});

/** Ouvre l'accueil jour après jour (une date par ouverture) et renvoie ce que chaque jour a rapporté */
function run(days: string[], start: LoginState | null = null) {
  let state = start;
  return days.map((day) => {
    const claim = claimLogin(state, day);
    if (claim) state = claim.state;
    return { claim, state };
  });
}

const week = (from: string, n = 7) => Array.from({ length: n }, (_, i) => addDays(from, i));

describe("la série de connexion", () => {
  it("un nouveau compte : premier jour du cycle, 5 points, pas encore de joker", () => {
    const claim = claimLogin(null, "2026-11-15")!;
    expect(claim).toEqual({
      state: { day: "2026-11-15", streak: 1, best: 1, jokers: 0 },
      reward: 5,
      cycleDay: 1,
      jokerUsed: false,
      jokerEarned: false,
      lost: 0,
    });
  });

  it("une seule fois par jour : le même jour ne rapporte plus rien", () => {
    const first = claimLogin(null, "2026-11-15")!;
    expect(claimLogin(first.state, "2026-11-15")).toBeNull();
    // Une horloge qui recule ne paie pas non plus
    expect(claimLogin(first.state, "2026-11-14")).toBeNull();
  });

  it("une semaine complète : 80 points, et un joker au 7e jour", () => {
    const res = run(week("2026-11-09"));
    expect(res.map((r) => r.claim!.reward)).toEqual([...LOGIN_LADDER]);
    expect(LOGIN_LADDER.reduce((a, b) => a + b, 0)).toBe(80);
    expect(res.map((r) => r.claim!.cycleDay)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(res[6]!.claim!.jokerEarned).toBe(true);
    expect(res[6]!.state).toEqual({ day: "2026-11-15", streak: 7, best: 7, jokers: 1 });
  });

  it("après le 7e jour, le cycle recommence ; un seul joker en réserve", () => {
    const res = run(week("2026-11-09", 14));
    expect(res[7]!.claim).toMatchObject({ reward: 5, cycleDay: 1 });
    expect(res[13]!.claim).toMatchObject({ cycleDay: 7, jokerEarned: false });
    expect(res[13]!.state).toMatchObject({ streak: 14, best: 14, jokers: 1 });
  });

  it("un jour raté sans joker : la série repart à 1", () => {
    const res = run(["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-13"]);
    expect(res[3]!.claim).toMatchObject({ reward: 5, cycleDay: 1, lost: 3, jokerUsed: false });
    expect(res[3]!.state).toEqual({ day: "2026-11-13", streak: 1, best: 3, jokers: 0 });
  });

  it("un jour raté avec un joker : la série continue, le joker est utilisé", () => {
    const start: LoginState = { day: "2026-11-15", streak: 7, best: 7, jokers: 1 };
    const [skip] = run(["2026-11-17"], start);
    expect(skip!.claim).toMatchObject({ reward: 5, cycleDay: 1, jokerUsed: true, lost: 0 });
    expect(skip!.state).toEqual({ day: "2026-11-17", streak: 8, best: 8, jokers: 0 });
    // Au milieu d'un cycle, la suite du cycle continue
    const mid = claimLogin({ day: "2026-11-12", streak: 4, best: 9, jokers: 1 }, "2026-11-14")!;
    expect(mid).toMatchObject({ reward: LOGIN_LADDER[4], cycleDay: 5, jokerUsed: true });
  });

  it("deux jours ratés : même avec un joker, la série repart (et le joker reste)", () => {
    const claim = claimLogin({ day: "2026-11-10", streak: 5, best: 5, jokers: 1 }, "2026-11-13")!;
    expect(claim).toMatchObject({ reward: 5, cycleDay: 1, lost: 5, jokerUsed: false });
    expect(claim.state).toEqual({ day: "2026-11-13", streak: 1, best: 5, jokers: 1 });
  });

  it("à minuit : 23 h 59 puis 0 h 00 à Paris font deux jours qui se suivent", () => {
    const before = parisDay(at("2026-11-15T22:59:59Z"));
    const after = parisDay(at("2026-11-15T23:00:01Z"));
    const res = run([before, after]);
    expect(res.map((r) => r.claim?.reward)).toEqual([5, 5]);
    expect(res[1]!.state!.streak).toBe(2);
  });

  it("le changement d'heure ne casse pas la série et ne compte pas un jour de trop", () => {
    // 23 h 30 à Paris le samedi, puis le soir de la journée de 23 heures, puis le lundi soir
    const spring = [at("2026-03-28T22:30:00Z"), at("2026-03-29T21:30:00Z"), at("2026-03-30T21:30:00Z")].map(parisDay);
    expect(spring).toEqual(["2026-03-28", "2026-03-29", "2026-03-30"]);
    expect(run(spring).map((r) => r.state!.streak)).toEqual([1, 2, 3]);
    // À l'automne : deux ouvertures dans la journée de 25 heures (à 0 h 10 et à 23 h 50) ne comptent qu'une fois
    const autumn = [at("2026-10-24T21:50:00Z"), at("2026-10-24T22:10:00Z"), at("2026-10-25T22:50:00Z"), at("2026-10-25T23:10:00Z")].map(
      parisDay,
    );
    expect(autumn).toEqual(["2026-10-24", "2026-10-25", "2026-10-25", "2026-10-26"]);
    const res = run(autumn);
    expect(res.map((r) => r.claim?.reward ?? null)).toEqual([5, 5, null, 10]);
    expect(res[3]!.state!.streak).toBe(3);
  });

  it("la série affichée : vivante aujourd'hui et hier, sauvable par un joker, sinon 0", () => {
    const s: LoginState = { day: "2026-11-13", streak: 4, best: 6, jokers: 0 };
    expect(liveLogin(s, "2026-11-13")).toBe(4);
    expect(liveLogin(s, "2026-11-14")).toBe(4);
    expect(liveLogin(s, "2026-11-15")).toBe(0);
    expect(liveLogin({ ...s, jokers: 1 }, "2026-11-15")).toBe(4);
    expect(liveLogin({ ...s, jokers: 1 }, "2026-11-16")).toBe(0);
    expect(liveLogin(null, "2026-11-15")).toBe(0);
  });
});

describe("les jours de jeu", () => {
  it("une partie par jour suffit ; deux le même jour ne comptent qu'une fois", () => {
    const d1 = nextPlay(null, "2026-11-13")!;
    expect(d1).toEqual({ day: "2026-11-13", streak: 1, best: 1 });
    expect(nextPlay(d1, "2026-11-13")).toBeNull();
    const d2 = nextPlay(d1, "2026-11-14")!;
    expect(d2).toEqual({ day: "2026-11-14", streak: 2, best: 2 });
    // Un jour sans partie : la série de jeu repart (pas de joker ici)
    expect(nextPlay(d2, "2026-11-16")).toEqual({ day: "2026-11-16", streak: 1, best: 2 });
    expect(livePlay(d2, "2026-11-15")).toBe(2);
    expect(livePlay(d2, "2026-11-16")).toBe(0);
  });

  it("ne comptent ni les bots, ni les absents, ni les parties abandonnées tout de suite", () => {
    const human = { userId: "u1", isBot: false };
    expect(countsForStreak(human, 0, MIN_GAME_MS)).toBe(true);
    expect(countsForStreak(human, 0, MIN_GAME_MS - 1)).toBe(false);
    expect(countsForStreak({ ...human, absent: true }, 0, 600_000)).toBe(false);
    expect(countsForStreak({ userId: null, isBot: true }, 0, 600_000)).toBe(false);
    expect(countsForStreak({ userId: "u1", isBot: true }, 0, 600_000)).toBe(false);
  });
});

describe("le défi de la semaine", () => {
  const ALL = ["uno", "naval", "bricks", "capitale", "meche", "bolides", "crampons"] as const;

  it("10 points par jeu, réussi quand chacun a été joué", () => {
    expect(weekBonus([...ALL])).toBe(70);
    expect(weekDone([...ALL], new Set(ALL))).toBe(true);
    expect(weekDone([...ALL], new Set(ALL.slice(1)))).toBe(false);
    expect(weekBonus(["uno", "naval"])).toBe(20);
  });

  it("pas de défi avec un seul jeu ouvert", () => {
    expect(weekBonus(["uno"])).toBe(0);
    expect(weekDone(["uno"], new Set(["uno"]))).toBe(false);
  });
});
