// L'album côté serveur : ouvrir un paquet, revendre ses doubles, acheter une carte précise.
// Le tirage se fait ici, jamais sur l'appareil du joueur, et chaque mouvement de points est vérifié dans la requête qui l'enregistre.

import {
  CARD_BY_ID,
  CARDS,
  drawPack,
  FAMILIES,
  familyBonus,
  PACK_PRICE,
  RARITY,
  type AlbumResponse,
  type CardFamily,
  type PackResponse,
} from "../shared/cards.ts";
import { BALANCE } from "./shop.ts";

/** Un nombre au hasard entre 0 et 1, impossible à prévoir */
function secureRandom(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32;
}

interface Progress {
  packs: number;
  sinceEpic: number;
  sinceLegend: number;
}

async function readAlbum(db: D1Database, userId: string): Promise<{ album: AlbumResponse; progress: Progress }> {
  const [bal, cards, prog] = await db.batch<Record<string, number & string>>([
    db.prepare(`SELECT ${BALANCE} AS balance`).bind(userId),
    db.prepare("SELECT card, count FROM user_cards WHERE user_id = ?").bind(userId),
    db.prepare("SELECT packs, since_epic, since_legend FROM card_progress WHERE user_id = ?").bind(userId),
  ]);
  const row = prog!.results[0] as unknown as { packs: number; since_epic: number; since_legend: number } | undefined;
  const owned: Record<string, number> = {};
  for (const c of cards!.results as unknown as { card: string; count: number }[]) owned[c.card] = c.count;
  const packs = row?.packs ?? 0;
  return {
    album: { balance: Math.max(0, (bal!.results[0] as unknown as { balance: number }).balance), owned, packs },
    progress: { packs, sinceEpic: row?.since_epic ?? 0, sinceLegend: row?.since_legend ?? 0 },
  };
}

export async function albumState(db: D1Database, userId: string): Promise<AlbumResponse> {
  return (await readAlbum(db, userId)).album;
}

const familyDone = (family: CardFamily, owned: Record<string, number>) =>
  CARDS.filter((c) => c.family === family).every((c) => (owned[c.id] ?? 0) > 0);

/** Le bonus des familles que ces cartes viennent de compléter (une seule fois, même si deux requêtes se croisent) */
async function rewardFamilies(
  db: D1Database,
  userId: string,
  before: Record<string, number>,
  after: Record<string, number>,
): Promise<CardFamily[]> {
  const done = FAMILIES.map((f) => f.id).filter((f) => !familyDone(f, before) && familyDone(f, after));
  if (done.length === 0) return [];
  await db.batch(
    done.map((f) =>
      db
        .prepare("INSERT OR IGNORE INTO point_ledger (user_id, reason, delta, at) VALUES (?, ?, ?, ?)")
        .bind(userId, `famille:${f}`, familyBonus(f), Date.now()),
    ),
  );
  return done;
}

const addCard = (db: D1Database, userId: string, card: string, tag: string, now: number) =>
  db
    .prepare(
      `INSERT INTO user_cards (user_id, card, count, sell, first_at)
       SELECT ?1, ?2, 1, ?3, ?4 WHERE EXISTS (SELECT 1 FROM point_ledger WHERE user_id = ?1 AND reason = ?5)
       ON CONFLICT(user_id, card) DO UPDATE SET count = count + 1`,
    )
    .bind(userId, card, RARITY[CARD_BY_ID.get(card)!.rarity].sell, now, tag);

const missing = (price: number, balance: number) => {
  const n = price - balance;
  return { error: `Il te manque ${n} point${n > 1 ? "s" : ""}.` };
};

export async function openPack(db: D1Database, userId: string): Promise<PackResponse | { error: string }> {
  const { album, progress } = await readAlbum(db, userId);
  if (album.balance < PACK_PRICE) return missing(PACK_PRICE, album.balance);
  const { cards, next } = drawPack(progress, new Set(Object.keys(album.owned)), secureRandom);
  const tag = `paquet:${crypto.randomUUID()}`;
  const now = Date.now();
  // Tout passe ou rien : le paiement n'a lieu que si le solde suffit et que personne n'a ouvert un autre paquet entre-temps
  const res = await db.batch([
    db
      .prepare(
        `INSERT INTO point_ledger (user_id, reason, delta, at)
         SELECT ?1, ?2, ?3, ?4 WHERE ${BALANCE} >= ?5 AND COALESCE((SELECT packs FROM card_progress WHERE user_id = ?1), 0) = ?6`,
      )
      .bind(userId, tag, -PACK_PRICE, now, PACK_PRICE, progress.packs),
    ...cards.map((card) => addCard(db, userId, card, tag, now)),
    db
      .prepare(
        `INSERT INTO card_progress (user_id, packs, since_epic, since_legend)
         SELECT ?1, ?2, ?3, ?4 WHERE EXISTS (SELECT 1 FROM point_ledger WHERE user_id = ?1 AND reason = ?5)
         ON CONFLICT(user_id) DO UPDATE SET packs = ?2, since_epic = ?3, since_legend = ?4`,
      )
      .bind(userId, progress.packs + 1, next.sinceEpic, next.sinceLegend, tag),
  ]);
  if (res[0]!.meta.changes === 0) return { error: "Un paquet est déjà en cours d'ouverture, réessaie." };
  const after = { ...album.owned };
  for (const c of cards) after[c] = (after[c] ?? 0) + 1;
  const completed = await rewardFamilies(db, userId, album.owned, after);
  return { ...(await albumState(db, userId)), cards: cards.map((id) => ({ id, isNew: !album.owned[id] })), completed };
}

/** Revend ses doubles : ceux d'une carte (un exemplaire), ou tous. On garde toujours au moins un exemplaire. */
export async function sellDoubles(db: D1Database, userId: string, card: string | null): Promise<AlbumResponse | { error: string }> {
  if (card !== null && !CARD_BY_ID.has(card)) return { error: "Cette carte n'existe pas." };
  const tag = `revente:${crypto.randomUUID()}`;
  const now = Date.now();
  const statements = card
    ? [
        db
          .prepare(
            `INSERT INTO point_ledger (user_id, reason, delta, at) SELECT user_id, ?1, sell, ?2 FROM user_cards WHERE user_id = ?3 AND card = ?4 AND count > 1`,
          )
          .bind(tag, now, userId, card),
        db.prepare("UPDATE user_cards SET count = count - 1 WHERE user_id = ? AND card = ? AND count > 1").bind(userId, card),
      ]
    : [
        db
          .prepare(
            `INSERT INTO point_ledger (user_id, reason, delta, at)
             SELECT user_id, ?1, SUM((count - 1) * sell), ?2 FROM user_cards WHERE user_id = ?3 AND count > 1 GROUP BY user_id`,
          )
          .bind(tag, now, userId),
        db.prepare("UPDATE user_cards SET count = 1 WHERE user_id = ? AND count > 1").bind(userId),
      ];
  await db.batch(statements);
  return albumState(db, userId);
}

/** Acheter directement une carte qu'on n'a pas : plus cher qu'au hasard d'un paquet, mais c'est celle qu'on veut */
export async function craftCard(
  db: D1Database,
  userId: string,
  card: string,
): Promise<(AlbumResponse & { completed: CardFamily[] }) | { error: string }> {
  const def = CARD_BY_ID.get(card);
  if (!def) return { error: "Cette carte n'existe pas." };
  const price = RARITY[def.rarity].craft;
  const { album } = await readAlbum(db, userId);
  if (album.owned[card]) return { error: "Tu as déjà cette carte." };
  if (album.balance < price) return missing(price, album.balance);
  const tag = `achat:${crypto.randomUUID()}`;
  const now = Date.now();
  const res = await db.batch([
    db
      .prepare(
        `INSERT INTO point_ledger (user_id, reason, delta, at)
         SELECT ?1, ?2, ?3, ?4 WHERE ${BALANCE} >= ?5 AND NOT EXISTS (SELECT 1 FROM user_cards WHERE user_id = ?1 AND card = ?6)`,
      )
      .bind(userId, tag, -price, now, price, card),
    addCard(db, userId, card, tag, now),
  ]);
  if (res[0]!.meta.changes === 0) return { error: "Achat impossible pour l'instant." };
  const completed = await rewardFamilies(db, userId, album.owned, { ...album.owned, [card]: 1 });
  return { ...(await albumState(db, userId)), completed };
}

const RANK = ["commune", "peu-commune", "rare", "epique", "legendaire"];

/** Ce qu'on montre de son album sur son profil : le nombre de cartes et les trois plus belles */
export async function albumSummary(db: D1Database, userId: string): Promise<{ count: number; best: string[] }> {
  const { results } = await db.prepare("SELECT card FROM user_cards WHERE user_id = ?").bind(userId).all<{ card: string }>();
  const ids = results.map((r) => r.card).filter((id) => CARD_BY_ID.has(id));
  const score = (id: string) => RANK.indexOf(CARD_BY_ID.get(id)!.rarity);
  return { count: ids.length, best: ids.sort((a, b) => score(b) - score(a)).slice(0, 3) };
}
