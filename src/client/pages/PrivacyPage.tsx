import { APP_NAME } from "../../shared/app.ts";
import { PageShell } from "../components/ui.tsx";

export function PrivacyPage() {
  return (
    <PageShell back="/" title="Confidentialité">
      <article className="prose panel panel-pad">
        <p>
          {APP_NAME} est un site de jeux entre amis, sans publicité et sans revente de données. Voici exactement ce qu'il garde, et
          pourquoi.
        </p>
        <h3>Ce qui est enregistré</h3>
        <ul>
          <li>
            <strong>Ton adresse email</strong>, pour t'envoyer ton code de connexion. Elle n'est jamais affichée aux autres joueurs.
          </li>
          <li>
            <strong>Ton pseudo, ton avatar et ta photo</strong> si tu en ajoutes une : ils sont visibles par les autres joueurs.
          </li>
          <li>
            <strong>Tes parties</strong> : résultats, statistiques et succès, pour ton profil et le classement.
          </li>
          <li>
            <strong>Tes amis</strong> et les demandes en cours.
          </li>
          <li>
            Un <strong>cookie de session</strong>, indispensable pour rester connecté (30 jours). Aucun cookie publicitaire ni de mesure
            d'audience.
          </li>
        </ul>
        <h3>Ce qui n'est pas gardé</h3>
        <ul>
          <li>Les messages du chat disparaissent avec le salon.</li>
          <li>Les codes de connexion sont stockés sous forme chiffrée et expirent au bout de 10 minutes.</li>
        </ul>
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
