// Le chapitre de campagne qu'on vient de demander, d'une page à l'autre : la page de la campagne le laisse pour la table
// qu'elle vient d'ouvrir, la table le reprend (une seule fois) en arrivant. L'adresse ne suffit pas : la page des tables
// retire tout ce qui suit « ? » dès qu'elle s'ouvre, avant que la table de La Cour des Grands ne soit chargée.

const key = (code: string) => `cour-campagne:${code.toUpperCase()}`;

export function leaveCampaignChapter(code: string, chapter: string) {
  try {
    sessionStorage.setItem(key(code), chapter);
  } catch {
    // Stockage refusé (navigation privée stricte) : l'adresse sert encore si elle arrive intacte
  }
}

export function takeCampaignChapter(code: string): string | null {
  let chapter: string | null = null;
  try {
    chapter = sessionStorage.getItem(key(code));
    sessionStorage.removeItem(key(code));
  } catch {
    // rien
  }
  return chapter ?? new URLSearchParams(location.search).get("campagne");
}
