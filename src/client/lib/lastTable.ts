// La dernière table ouverte sur cet appareil, pour « Ta table » dans le bloc « Ce soir » de l'accueil : on y revient
// d'un geste après être passé ailleurs (le profil d'un ami, la boutique). Oubliée au bout de trois heures.

const KEY = "tablee:derniere-table";
const KEEP_MS = 3 * 3_600_000;

export function rememberTable(code: string, now = Date.now()) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ code, at: now }));
  } catch {
    // Pas de stockage : pas de « Ta table »
  }
}

export function lastTable(now = Date.now()): string | null {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as { code?: unknown; at?: unknown } | null;
    if (!saved || typeof saved.code !== "string" || typeof saved.at !== "number") return null;
    return now - saved.at < KEEP_MS ? saved.code : null;
  } catch {
    return null;
  }
}

export function forgetTable() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // rien
  }
}
