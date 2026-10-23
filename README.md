# La Tablée

Des jeux de société en ligne, à jouer entre amis. Premier jeu : le **UNO**, en version classique et en version **No Mercy**.

- Connexion par **code reçu par email** : pas de mot de passe.
- **Salons** privés (code à 4 lettres ou lien), **lobby public** et bouton **partie rapide**.
- **2 à 8 joueurs**, avec des **bots** pour compléter la table ou remplacer un absent.
- **Règles maison** réglables par l'hôte : cumul des +2/+4, piocher jusqu'à pouvoir jouer, 7-0, interception, fin de partie (premier qui finit, classement complet ou aux points).
- Le cri **UNO !** et le **contre-UNO** pour dénoncer les étourdis, la contestation du +4 bluff.
- Chrono par tour, et un bot prend le relais si quelqu'un s'absente.
- **Réactions**, petites piques et chat, **amis** avec présence en ligne et invitations.
- **Profil** avec avatar à composer ou photo, statistiques, **succès** et **classement** (Elo).
- Pensé pour le **téléphone** comme pour l'**ordinateur**, installable comme une application.

Tout tourne sur l'offre gratuite de Cloudflare, sans carte bancaire.

## Comment c'est construit

| Rôle            | Outil                                                                                     |
| --------------- | ----------------------------------------------------------------------------------------- |
| Interface       | React 19, TypeScript, Vite, Motion pour les animations, cartes et avatars dessinés en SVG |
| Serveur         | Cloudflare Workers (API Hono)                                                             |
| Temps réel      | Durable Objects : un objet par salon, qui fait autorité sur la partie (WebSocket)         |
| Base de données | Cloudflare D1 (SQLite) : comptes, sessions, amis, parties, statistiques                   |
| Emails          | SMTP depuis le Worker (un compte Gmail dédié avec un mot de passe d'application)          |

Les règles du jeu vivent dans `src/shared/games/uno` et sont partagées entre le serveur et l'interface. Le serveur valide chaque coup et
n'envoie à chaque joueur que sa propre main : impossible de tricher en fouillant le navigateur.

```
src/
  shared/      règles du UNO, bots, protocole, avatars, succès
  worker/      API, connexion par code, salons (Durable Objects), hub de présence
  client/      pages, table de jeu, animations, sons
migrations/    schéma de la base D1
public/        icônes, manifeste, sons
```

## Lancer le projet sur son ordinateur

Il faut Node.js 22 ou plus récent.

```bash
npm install
cp .dev.vars.example .dev.vars
npm run db:local
npm run dev
```

Le site est alors sur http://localhost:5173. En local, aucun email n'est envoyé : le code de connexion s'affiche dans le terminal (et
directement sur la page de connexion).

Pour jouer à plusieurs depuis le même ordinateur, ouvre une fenêtre de navigation privée, ou utilise http://127.0.0.1:5173 dans un
second onglet : chaque adresse garde sa propre session. Depuis un téléphone sur le même wifi, utilise l'adresse « Network » affichée par
Vite.

Les tests du moteur de jeu :

```bash
npm test
```

## Mettre en ligne

Une seule fois :

1. Créer un compte gratuit sur [Cloudflare](https://dash.cloudflare.com/sign-up), puis se connecter depuis le terminal :
   ```bash
   npx wrangler login
   ```
2. Créer la base de données, et copier l'identifiant affiché dans `wrangler.jsonc` (champ `database_id`) :
   ```bash
   npx wrangler d1 create jeux-entre-amis
   ```
3. Appliquer le schéma :
   ```bash
   npm run db:remote
   ```
4. Préparer l'envoi des emails avec un compte Gmail dédié au site : activer la validation en deux étapes, puis créer un « mot de passe
   d'application » sur https://myaccount.google.com/apppasswords. Enregistrer ensuite les secrets (ils sont demandés dans le terminal
   et ne sont jamais écrits dans le code) :
   ```bash
   npx wrangler secret put SMTP_USER
   npx wrangler secret put SMTP_PASS
   npx wrangler secret put SESSION_PEPPER
   ```
   `SMTP_USER` est l'adresse Gmail, `SMTP_PASS` le mot de passe d'application, `SESSION_PEPPER` une longue phrase aléatoire.

Puis, à chaque nouvelle version :

```bash
npm run deploy
```

Le site est publié sur **https://jouer.latablee.workers.dev**.

## Limites de l'offre gratuite

Largement suffisantes pour une bande d'amis :

- Workers : 100 000 requêtes par jour ;
- Durable Objects : les salons se mettent en veille dès qu'il ne se passe rien ;
- D1 : 5 Go de stockage ;
- Gmail : environ 500 emails par jour. Le site se limite lui-même à 450 codes par jour, 6 par adresse et par heure.

## Crédits

Les effets sonores viennent de [Kenney](https://kenney.nl) (domaine public, CC0) et de [Mixkit](https://mixkit.co) (licence libre
Mixkit). UNO est une marque de Mattel : ce projet est un jeu amateur entre amis, sans lien avec Mattel, et ses cartes sont dessinées à la
main.
