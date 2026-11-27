// Les étoiles de Bolides, dans le système commun du site (src/shared/stars.ts) : une carte par coupe du championnat
// (la salle donne ses étoiles d'après la place au classement de la coupe) et une par contre-la-montre, circuits en
// miroir compris (les seuils sont les temps des fantômes de bronze, d'argent et d'or).

import type { StarGame, StarMap } from "../../stars.ts";
import { CUP_IDS, CUPS, chronoKey, cupKey } from "./campaign.ts";
import type { BaseTrackId, TrackId } from "./track.ts";

/**
 * Les circuits et leurs noms, recopiés : ce fichier est lu par l'accueil et le profil (les succès d'étoiles), qui ne
 * doivent pas charger la géométrie des circuits. Un test vérifie qu'ils suivent track.ts.
 */
export const STAR_TRACKS: readonly [BaseTrackId, string][] = [
  ["port", "Le Port"],
  ["vignes", "Les Vignes"],
  ["col", "Le Col"],
  ["dunes", "Les Dunes"],
  ["lagon", "Le Lagon"],
  ["volcan", "Le Volcan"],
  ["ville", "La Ville"],
  ["foire", "La Fête foraine"],
  ["potager", "Le Potager"],
  ["foret", "La Forêt"],
];
const TRACK_IDS = STAR_TRACKS.map(([id]) => id);
const NAMES = new Map<string, string>(STAR_TRACKS);

/**
 * Les temps des fantômes sur trois tours (ms) : bronze, argent, or. Écrits ici pour ne pas refaire les soixante
 * courses simulées partout où l'on montre des étoiles ; un test vérifie qu'ils suivent toujours ghost.ts.
 */
export const CHRONO_GOALS: Record<TrackId, readonly [number, number, number]> = {
  port: [178250, 161900, 137767],
  "port-miroir": [179750, 161967, 136350],
  vignes: [163350, 146200, 124317],
  "vignes-miroir": [162417, 146300, 136233],
  col: [172783, 150800, 128650],
  "col-miroir": [170583, 150783, 128800],
  dunes: [195050, 173600, 150917],
  "dunes-miroir": [195483, 176900, 150833],
  lagon: [187700, 167367, 144700],
  "lagon-miroir": [190367, 168750, 146633],
  volcan: [183500, 165050, 138683],
  "volcan-miroir": [181750, 167917, 138917],
  ville: [189750, 181083, 152100],
  "ville-miroir": [192867, 175200, 151717],
  foire: [160700, 145033, 129333],
  "foire-miroir": [162367, 143633, 125817],
  potager: [189700, 172367, 149517],
  "potager-miroir": [194583, 172217, 145733],
  foret: [178650, 161233, 136767],
  "foret-miroir": [179000, 161267, 138733],
};

const CHRONO_IDS: TrackId[] = TRACK_IDS.flatMap((id) => [id, `${id}-miroir` as TrackId]);

const trackName = (id: TrackId) => `${NAMES.get(id.replace("-miroir", ""))}${id.endsWith("-miroir") ? " en miroir" : ""}`;

const cupMaps: StarMap[] = CUP_IDS.map((id) => ({
  id: cupKey(id),
  name: CUPS[id].name,
  // La place au classement de la coupe : troisième, deuxième, premier (la salle donne les étoiles elle-même)
  rule: { better: "lower", goals: [3, 2, 1], unit: "points" },
}));

const chronoMaps: StarMap[] = CHRONO_IDS.map((id) => ({
  id: chronoKey(id),
  name: `${trackName(id)}, contre-la-montre`,
  rule: { better: "lower", goals: CHRONO_GOALS[id], unit: "time" },
}));

export const BOLIDES_STARS: StarGame = {
  game: "bolides",
  name: "Bolides",
  maps: [...cupMaps, ...chronoMaps],
  groups: [
    { id: "championnat", name: "le championnat", maps: cupMaps.map((m) => m.id) },
    { id: "chrono", name: "le contre-la-montre", maps: TRACK_IDS.map((id) => chronoKey(id)) },
    { id: "miroir", name: "le contre-la-montre en miroir", maps: TRACK_IDS.map((id) => chronoKey(`${id}-miroir`)) },
  ],
  milestones: [10, 30],
};
