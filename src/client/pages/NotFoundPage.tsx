import type { ReactNode } from "react";
import { Link } from "wouter";
import { AppHeader } from "../components/AppHeader.tsx";
import { CardBack } from "../components/Card.tsx";

/**
 * Ce qu'on cherchait n'est pas là (une page, un joueur, une tournée) : une carte retournée, le titre, une explication et
 * de quoi repartir. `children` : d'autres boutons, avant « Retour à l'accueil ».
 */
export function NotFound({ title, text, children }: { title: string; text?: string; children?: ReactNode }) {
  return (
    <div className="stack center-text error-screen">
      <CardBack width={90} />
      <h1>{title}</h1>
      {text && <p className="hint">{text}</p>}
      <div className="row-actions error-screen-actions">
        {children}
        <Link href="/" className="btn btn-primary">
          Retour à l'accueil
        </Link>
      </div>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div className="felt page">
      <AppHeader />
      <main className="not-found">
        <NotFound title="Cette page s'est perdue sous la table" text="L'adresse est peut-être incomplète, ou la page n'existe plus." />
      </main>
    </div>
  );
}
