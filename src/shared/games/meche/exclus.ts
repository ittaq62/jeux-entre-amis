// Mèche : ce que la liste de mots contient sans que ce soient des mots qu'on joue, et ce qu'un bot n'écrit pas tout
// seul à la table. Partagé par la salle (vérification des mots), les bots, et le script qui fabrique les listes
// (scripts/meche-mots.ts), pour qu'une liste refaite reste propre.

/**
 * Pas des mots : des symboles d'unités (préfixe et unité collés, kmol, dakat, ycd…), des abréviations (etc, janv…)
 * et des formes élidées qui ne s'écrivent qu'avec une apostrophe (lorsqu', jusqu'…). Refusés à tout le monde.
 */
export const NOT_WORDS = new Set(
  `acd akat alm alx amol arad asr ckat cmol dacd dakat dalm dalx damol darad dasr dkat dmol drad fkat fmol frad hkat hmol hrad
  kat kkat kmol krad mkat mmol mrad nkat nmol nrad pkat pmol ppa prad ycd ykat ylm ylx ymol yrad ysr zkat zmol zrad
  avr dec dpi env etc fevr janv juil nov oct
  jusqu lorsqu presqu puisqu quelqu quoiqu`.split(/\s+/),
);

/** Valables si un joueur les tape, mais un bot ne les écrit pas tout seul à la table */
export const RUDE_EXACT = new Set(
  `baise baises bite bites con cons conne connes cul culs gode godes pute putes viol viols violer violeur violeurs sexe sexes
  viole violee violees violes pedale pedales batard batards batarde batardes bitte bittes pine pines connerie conneries
  salaud salauds chiotte chiottes pisse pisses pisser garce garces cocu cocus cocue cocues foutu foutus foutue foutues`.split(/\s+/),
);
export const RUDE_PREFIX =
  `bander bandant bordel branl chatte chiasse chier chieu connard connasse couill cunnil encul enfoir fellation foutr gigolo
  inceste masturb merd nazi nichon niqu orgasm partouz pedoph penis porno prostitu putain salop sodom sperm suicid tarlouz vagin zob
  pissot pisseu`.split(/\s+/);
/** Au milieu d'un mot aussi : « emmerder », « démerder » */
const RUDE_INSIDE = ["merd"];

export const isRude = (w: string) =>
  RUDE_EXACT.has(w) || RUDE_PREFIX.some((p) => w.startsWith(p)) || RUDE_INSIDE.some((p) => w.includes(p));
