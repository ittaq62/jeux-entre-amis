// Les titres de fin de course : un petit mot pour celui qui a le plus tiré, dérapé, encaissé… Trois au plus, un par
// pilote, et les joueurs passent avant les bots.

export interface TitleStats {
  boxes: number;
  hitsGiven: number;
  hitsTaken: number;
  turbos: number;
  walls: number;
}

export interface RaceTitle {
  id: string;
  title: string;
  detail: string;
}

const KINDS: { key: keyof TitleStats; min: number; title: string; unit: [string, string] }[] = [
  { key: "hitsGiven", min: 2, title: "Fine gâchette", unit: ["touche", "touches"] },
  { key: "turbos", min: 6, title: "Roi du dérapage", unit: ["mini-turbo", "mini-turbos"] },
  { key: "hitsTaken", min: 3, title: "Cible préférée", unit: ["coup reçu", "coups reçus"] },
  { key: "walls", min: 4, title: "Ami des murs", unit: ["choc", "chocs"] },
  { key: "boxes", min: 8, title: "Pilleur de caisses", unit: ["caisse", "caisses"] },
];

export function raceTitles(racers: { id: string; human: boolean; stats: TitleStats }[], max = 3): RaceTitle[] {
  const titled = new Set<string>();
  const won: (RaceTitle & { human: boolean })[] = [];
  for (const kind of KINDS) {
    // Le meilleur de cette catégorie qui n'a pas encore de titre ; à égalité, un joueur plutôt qu'un bot
    const best = racers
      .filter((r) => !titled.has(r.id) && r.stats[kind.key] >= kind.min)
      .sort((a, b) => b.stats[kind.key] - a.stats[kind.key] || Number(b.human) - Number(a.human))[0];
    if (!best) continue;
    titled.add(best.id);
    const n = best.stats[kind.key];
    won.push({ id: best.id, human: best.human, title: kind.title, detail: `${n} ${kind.unit[n > 1 ? 1 : 0]}` });
  }
  return won
    .sort((a, b) => Number(b.human) - Number(a.human))
    .slice(0, max)
    .map(({ id, title, detail }) => ({ id, title, detail }));
}
