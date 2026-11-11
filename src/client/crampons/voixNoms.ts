/** Le nom d'un fichier de réplique : « Le Goff » donne « le-goff », « Prévost » donne « prevost » */
export function voiceSlug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
