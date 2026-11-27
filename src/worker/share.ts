// L'aperçu d'un lien envoyé dans une messagerie (WhatsApp, Discord, SMS…). Les robots de ces messageries lisent le
// <head> de la page sans jouer son JavaScript : pour « /salon/ABCD », le Worker renvoie la même page que le site, avec
// des balises qui disent la table (« Léa t'attend pour une partie de Bowling · Table ABCD · 2 places libres ») et
// l'image de son jeu. Seulement ce que dit déjà le résumé public d'une table.

import { APP_NAME, APP_TAGLINE } from "../shared/app.ts";
import { inviteDetails, inviteTitle } from "../shared/invite.ts";
import type { PublicTable } from "../shared/publicTable.ts";

/** Ce que disent les balises d'un aperçu */
export interface ShareTags {
  title: string;
  description: string;
  /** Adresse absolue de l'image, 1200×630 */
  image: string;
  url: string;
}

export const SITE_DESCRIPTION =
  "Les jeux du soir entre amis, dans le navigateur : cartes, bataille navale, briques, course de karts, foot, minigolf, billard et bien d'autres. Tables privées, bots et tournées. Gratuit, sans pub.";

/** Les images de partage, une par jeu (public/partage) */
export function shareImage(origin: string, game: string | null): string {
  return `${origin}/partage/${game ?? "site"}.jpg`;
}

/** Les balises de la page d'une adresse partagée : la table si on la connaît, sinon le site */
export function shareTags(path: string, origin: string, table: PublicTable | null): ShareTags {
  const url = `${origin}${path}`;
  if (table) {
    return {
      title: inviteTitle(table),
      description: `${inviteDetails(table)}. ${APP_NAME}, ${APP_TAGLINE.charAt(0).toLowerCase()}${APP_TAGLINE.slice(1)}`,
      image: shareImage(origin, table.game),
      url,
    };
  }
  if (path.startsWith("/tournee/")) {
    return { title: `Les résultats d'une tournée · ${APP_NAME}`, description: SITE_DESCRIPTION, image: shareImage(origin, "tour"), url };
  }
  return { title: `${APP_NAME} · les jeux du soir entre amis`, description: SITE_DESCRIPTION, image: shareImage(origin, null), url };
}

/** Le code d'une table dans « /salon/ABCD » (et ses variantes), ou null */
export function sharedTableCode(path: string): string | null {
  const m = /^\/salon\/([A-Za-z]{4})\/?$/.exec(path);
  return m ? m[1]!.toUpperCase() : null;
}

function attr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Les balises ajoutées à la fin du <head> (les autres sont réécrites en place ; la taille de l'image et twitter:card sont dans index.html) */
export function extraHead(tags: ShareTags): string {
  return [
    `<meta property="og:url" content="${attr(tags.url)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${attr(APP_NAME)}" />`,
    `<meta property="og:locale" content="fr_FR" />`,
    `<meta name="twitter:title" content="${attr(tags.title)}" />`,
    `<meta name="twitter:description" content="${attr(tags.description)}" />`,
    `<meta name="twitter:image" content="${attr(tags.image)}" />`,
  ].join("");
}

/** La page du site, avec les balises de l'aperçu (le titre de l'onglet ne change pas : le site le garde partout) */
export function withShareTags(page: Response, tags: ShareTags): Response {
  const set = (value: string) => ({
    element(e: Element) {
      e.setAttribute("content", value);
    },
  });
  return new HTMLRewriter()
    .on('meta[name="description"]', set(tags.description))
    .on('meta[property="og:title"]', set(tags.title))
    .on('meta[property="og:description"]', set(tags.description))
    .on('meta[property="og:image"]', set(tags.image))
    .on("head", {
      element(e) {
        e.append(extraHead(tags), { html: true });
      },
    })
    .transform(page);
}
