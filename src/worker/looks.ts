// Les apparences choisies, côté serveur : lues et modifiées par le joueur lui-même. Les tables vérifient toujours la
// propriété des articles au moment de s'en servir ; ici on ne garde que des choix, bornés (src/shared/savedLooks.ts).

import { cleanSavedLooks, patchSavedLooks, type SavedLooks } from "../shared/savedLooks.ts";

/** Ses choix enregistrés ; {} si rien (ou si la table manque encore : migration 0014) */
export async function savedLooks(db: D1Database, userId: string): Promise<SavedLooks> {
  try {
    const row = await db.prepare("SELECT looks FROM user_looks WHERE user_id = ?").bind(userId).first<{ looks: string }>();
    return row ? cleanSavedLooks(JSON.parse(row.looks)) : {};
  } catch (err) {
    console.error("Apparences illisibles", err);
    return {};
  }
}

/** Applique une modification (une valeur remplace, null efface) ; renvoie l'ensemble, ou une erreur si c'est trop gros */
export async function saveLooks(db: D1Database, userId: string, patch: unknown): Promise<SavedLooks | { error: string }> {
  const next = patchSavedLooks(await savedLooks(db, userId), patch);
  if (next === null) return { error: "Trop de choix enregistrés." };
  await db
    .prepare(
      `INSERT INTO user_looks (user_id, looks, updated_at) VALUES (?1, ?2, ?3)
       ON CONFLICT(user_id) DO UPDATE SET looks = excluded.looks, updated_at = excluded.updated_at`,
    )
    .bind(userId, JSON.stringify(next), Date.now())
    .run();
  return next;
}
