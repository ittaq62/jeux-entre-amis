import { APP_NAME } from "../../shared/app.ts";
import { PageShell } from "../components/ui.tsx";

export function PrivacyPage() {
  return (
    <PageShell back="/" title="Confidentialité">
      <article className="prose sheet panel">
        <p>
          {APP_NAME} est un site de jeux entre amis, sans publicité et sans revente de données. Voici exactement ce qu'il garde, et
          pourquoi.
        </p>
        <h3>Ce qui est enregistré</h3>
        <ul>
          <li>
            <strong>Ton adresse email</strong>, pour t'envoyer ton code de connexion. Elle n'est jamais affichée aux autres joueurs ; seul
            l'administrateur du site la voit, pour gérer les comptes.
          </li>
          <li>
            <strong>Ton pseudo, ton personnage et ta photo</strong> si tu en ajoutes une : ils sont visibles par les autres joueurs.
          </li>
          <li>
            <strong>Tes parties</strong> : résultats, statistiques et succès, pour ton profil et le classement.
          </li>
          <li>
            <strong>Tes points, tes achats à la boutique et ton album</strong> de cartes.
          </li>
          <li>
            <strong>Ta série</strong> : les jours où tu passes par l'accueil et ceux où tu joues.
          </li>
          <li>
            <strong>Tes amis</strong> et les demandes en cours.
          </li>
          <li>
            <strong>Tes signalements</strong>, si tu en envoies un (depuis une partie, sa fin ou le menu de ton compte) : ton texte, le jeu
            et la table ou la page, la version du site, et ton appareil en clair (téléphone, tablette ou PC, son système, son navigateur et
            la taille de l'écran). Ni adresse IP ni rien d'autre. Seul l'administrateur du site les lit ; ils partent avec ton compte si tu
            le supprimes.
          </li>
          <li>
            Un <strong>cookie de session</strong>, indispensable pour rester connecté (30 jours). Aucun cookie publicitaire ni de mesure
            d'audience.
          </li>
        </ul>
        <h3>Ce qui reste sur ton appareil</h3>
        <ul>
          <li>
            Tes réglages (son, vibrations, symboles de couleur, effets réduits, touches) et le dernier skin choisi pour chaque jeu, gardés
            par ton navigateur et non dans ton compte : sur un autre appareil, tu retrouves les réglages de départ.
          </li>
          <li>
            Ta dernière adresse email, pour la proposer à la prochaine connexion. Elle s'efface de l'appareil si tu supprimes ton compte.
          </li>
        </ul>
        <h3>Ce qui n'est pas gardé</h3>
        <ul>
          <li>Les messages du chat disparaissent avec le salon.</li>
          <li>Les codes de connexion sont stockés sous forme chiffrée et expirent au bout de 10 minutes.</li>
        </ul>
        <h3>Modération</h3>
        <p>
          L'administrateur du site, signalé par un badge ADMIN, peut renommer un pseudo, retirer une photo, fermer une table ou suspendre un
          compte qui ne respecte pas les autres joueurs.
        </p>
        <h3>Où sont les données</h3>
        <p>Le site et sa base de données sont hébergés par Cloudflare. Les emails de connexion partent via Gmail.</p>
        <h3>Tes droits</h3>
        <p>
          Tu peux modifier ton profil ou <strong>supprimer ton compte</strong> à tout moment depuis la page « Mon compte » : tout est effacé
          immédiatement.
        </p>
      </article>
    </PageShell>
  );
}
