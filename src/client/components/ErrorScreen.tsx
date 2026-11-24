import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from "react";
import { CardBack } from "./Card.tsx";

const RELOADED_AT = "tablee:recharge";

/**
 * Un morceau du site chargé à la demande qui n'arrive pas : le plus souvent, le site a été mis à jour pendant que la page
 * était ouverte, et l'ancien fichier n'existe plus. Recharger la page suffit.
 */
export function isStaleChunk(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk \S+ failed|Unable to preload CSS/i.test(
    message,
  );
}

/** Recharge la page, une fois : si le rechargement d'il y a moins de 20 s n'a rien arrangé, on ne boucle pas. */
export function reloadOnce(now = Date.now()): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOADED_AT) ?? 0);
    if (now - last < 20_000) return false;
    sessionStorage.setItem(RELOADED_AT, String(now));
  } catch {
    // Pas de stockage : on recharge quand même, une fois par page
  }
  window.location.reload();
  return true;
}

/** Vite prévient quand le préchargement d'un morceau échoue : on recharge plutôt que de laisser la page à moitié cassée */
export function listenForStaleChunks() {
  window.addEventListener("vite:preloadError", (event) => {
    if (reloadOnce()) event.preventDefault();
  });
}

interface Props {
  /** Change quand on change de page : l'écran d'erreur s'efface et la nouvelle page s'affiche */
  resetKey: string;
  children: ReactNode;
}

/**
 * Ce qui s'affiche quand une page plante, au lieu d'un écran vide : un morceau du site périmé recharge la page tout
 * seul ; sinon on propose de recharger ou de revenir à l'accueil.
 */
export class ErrorBoundary extends Component<Props, { error: unknown; key: string }> {
  state = { error: null as unknown, key: this.props.resetKey };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: { error: unknown; key: string }) {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    if (isStaleChunk(error) && reloadOnce()) return;
    console.error(error, info.componentStack);
  }

  render() {
    if (this.state.error === null) return this.props.children;
    const stale = isStaleChunk(this.state.error);
    return (
      <div className="felt center-screen">
        <div className="stack center-text error-screen" role="alert">
          <CardBack width={90} />
          <h1>{stale ? "Le site vient d'être mis à jour" : "Quelque chose s'est mal passé"}</h1>
          <p className="hint">
            {stale
              ? "Une partie de la page n'a pas pu se charger. Recharge-la pour avoir la nouvelle version."
              : "Cette page a eu un souci. Recharger la page règle presque toujours le problème."}
          </p>
          <div className="row-actions error-screen-actions">
            <button className="btn btn-primary" onClick={() => window.location.reload()} autoFocus>
              Recharger la page
            </button>
            <a href="/" className="btn">
              Retour à l'accueil
            </a>
          </div>
        </div>
      </div>
    );
  }
}

/**
 * Le site ne répond pas (réseau coupé, serveur qui redémarre) au moment de savoir qui on est : plutôt que d'envoyer vers
 * la page de connexion, on attend et on réessaie tout seul (toutes les 5 s, et dès que le réseau revient).
 */
export function Unreachable({ retry }: { retry: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const again = async () => {
    setBusy(true);
    await retry();
    setBusy(false);
  };
  useEffect(() => {
    const t = setInterval(() => void retry(), 5000);
    const online = () => void retry();
    window.addEventListener("online", online);
    return () => {
      clearInterval(t);
      window.removeEventListener("online", online);
    };
  }, [retry]);
  return (
    <div className="felt center-screen">
      <div className="stack center-text error-screen" role="alert">
        <CardBack width={90} />
        <h1>Le site ne répond pas</h1>
        <p className="hint">Vérifie ta connexion internet. On réessaie tout seul toutes les quelques secondes.</p>
        <div className="row-actions error-screen-actions">
          <button className="btn btn-primary" onClick={() => void again()} disabled={busy}>
            {busy ? <span className="spinner" /> : "Réessayer maintenant"}
          </button>
        </div>
      </div>
    </div>
  );
}
