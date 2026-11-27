import { TABLE_NAMES } from "../../shared/protocol.ts";
import type { PublicTable } from "../../shared/publicTable.ts";

/** Le code d'une table dans l'adresse où mène la connexion (« /salon/ABCD?jouer »), ou null */
export function invitedCode(next: string): string | null {
  const m = /^\/salon\/([A-Za-z]{4})(?:[/?#]|$)/.exec(next);
  return m ? m[1]!.toUpperCase() : null;
}

/** « Léa t'attend pour une partie de Bowling », « Léa t'invite à sa tournée », « Une table de UNO t'attend » */
export function inviteTitle(t: PublicTable): string {
  const host = t.hostName.trim();
  if (t.kind === "tour") return host ? `${host} t'invite à sa tournée` : "Une tournée t'attend";
  const game = TABLE_NAMES[t.game];
  return host ? `${host} t'attend pour une partie de ${game}` : `Une table de ${game} t'attend`;
}

/** « Table ABCD · 2 places libres », « Tournée ABCD · partie en cours, ouverte en cours de route », « … · complète » */
export function inviteDetails(t: PublicTable): string {
  const what = `${t.kind === "tour" ? "Tournée" : "Table"} ${t.code}`;
  if (t.status === "finished") return `${what} · partie terminée`;
  if (t.status === "playing") {
    if (!t.lateJoin) return `${what} · partie en cours`;
    return `${what} · partie en cours, ${t.freeSeats > 0 ? "tu peux la rejoindre" : "complète pour l'instant"}`;
  }
  if (t.freeSeats === 0) return `${what} · complète pour l'instant`;
  return `${what} · ${t.freeSeats} place${t.freeSeats > 1 ? "s" : ""} libre${t.freeSeats > 1 ? "s" : ""}`;
}
