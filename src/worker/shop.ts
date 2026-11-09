// La boutique côté serveur : les points à dépenser, les achats, et ce qu'un joueur a le droit d'utiliser.

import { canUse, SHOP_BY_ID, type ShopResponse } from "../shared/shop.ts";

// Les points des jeux, pas ceux de la tournée : chaque jeu d'une tournée a déjà rapporté les siens
const EARNED = "(SELECT COALESCE(SUM(points), 0) FROM user_stats WHERE user_id = ?1 AND game <> 'tour')";
const SPENT = "(SELECT COALESCE(SUM(price), 0) FROM user_items WHERE user_id = ?1)";
// Les paquets de cartes, les doubles revendus, les familles complétées
const LEDGER = "(SELECT COALESCE(SUM(delta), 0) FROM point_ledger WHERE user_id = ?1)";

/** Les points qu'il reste à dépenser, dans une requête dont ?1 est le joueur */
export const BALANCE = `(${EARNED} - ${SPENT} + ${LEDGER})`;

export async function shopState(db: D1Database, userId: string): Promise<ShopResponse> {
  const [balance, owned] = await db.batch<{ balance?: number; item?: string }>([
    db.prepare(`SELECT ${BALANCE} AS balance`).bind(userId),
    db.prepare("SELECT item FROM user_items WHERE user_id = ?").bind(userId),
  ]);
  return {
    balance: Math.max(0, balance!.results[0]?.balance ?? 0),
    owned: owned!.results.map((r) => r.item!),
  };
}

/**
 * Le solde est vérifié dans la requête qui enregistre l'achat : deux achats lancés en même temps ne peuvent pas
 * dépenser deux fois les mêmes points. Un article qu'on a déjà ne se paie pas deux fois.
 */
export async function buyItem(db: D1Database, userId: string, itemId: string): Promise<ShopResponse | { error: string }> {
  const item = SHOP_BY_ID.get(itemId);
  if (!item || item.price === 0) return { error: "Cet article n'est pas à vendre." };
  const res = await db
    .prepare(
      `INSERT OR IGNORE INTO user_items (user_id, item, price, bought_at)
       SELECT ?1, ?2, ?3, ?4 WHERE ${BALANCE} >= ?3`,
    )
    .bind(userId, item.id, item.price, Date.now())
    .run();
  const state = await shopState(db, userId);
  if (res.meta.changes === 0 && !state.owned.includes(item.id)) {
    const missing = item.price - state.balance;
    return { error: `Il te manque ${missing} point${missing > 1 ? "s" : ""}.` };
  }
  return state;
}

export async function ownedItems(db: D1Database, userId: string): Promise<Set<string>> {
  try {
    const { results } = await db.prepare("SELECT item FROM user_items WHERE user_id = ?").bind(userId).all<{ item: string }>();
    return new Set(results.map((r) => r.item));
  } catch {
    return new Set();
  }
}

export async function ownsItem(db: D1Database, userId: string, item: string): Promise<boolean> {
  return canUse(item, await ownedItems(db, userId));
}
