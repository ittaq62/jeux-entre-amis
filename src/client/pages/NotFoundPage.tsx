import { Link } from "wouter";
import { CardBack } from "../components/Card.tsx";

export function NotFoundPage() {
  return (
    <div className="felt center-screen">
      <div className="stack center-text" style={{ alignItems: "center" }}>
        <CardBack width={90} />
        <h2>Cette page s'est perdue sous la table</h2>
        <Link href="/" className="btn btn-primary">
          Retour à l'accueil
        </Link>
      </div>
    </div>
  );
}
