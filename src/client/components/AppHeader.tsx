import { Link, useLocation } from "wouter";
import { useHub } from "../stores/hub.ts";
import { usePrefs } from "../stores/prefs.ts";
import { useSession } from "../stores/session.ts";
import { Avatar } from "./Avatar.tsx";
import { Icon } from "./Icon.tsx";
import { Logo } from "./ui.tsx";

/** Bandeau du haut, comme la rampe en bois d'une table de jeu. */
export function AppHeader() {
  const user = useSession((s) => s.user);
  const friends = useHub((s) => s.friends);
  const [location] = useLocation();
  const sound = usePrefs((s) => s.sound);
  const setPrefs = usePrefs((s) => s.set);
  const requests = friends.filter((f) => f.status === "incoming").length;
  if (!user) return null;
  return (
    <header className="app-header">
      <Link href="/" className="logo-link" aria-label="Accueil">
        <Logo size={22} />
      </Link>
      <nav className="app-nav">
        {user.admin && (
          <Link href="/admin" className={`nav-link nav-admin ${location === "/admin" ? "is-active" : ""}`} aria-label="Administration">
            <Icon name="shield" size={17} />
            <span className="nav-admin-label">Admin</span>
          </Link>
        )}
        <Link href="/classement" className={`nav-link ${location === "/classement" ? "is-active" : ""}`}>
          Classement
        </Link>
        <Link href="/amis" className={`nav-link ${location === "/amis" ? "is-active" : ""}`}>
          Amis
          {requests > 0 && (
            <span className="nav-count" aria-label={`${requests} demande${requests > 1 ? "s" : ""}`}>
              {requests}
            </span>
          )}
        </Link>
        <button className="nav-sound" onClick={() => setPrefs({ sound: !sound })} aria-label={sound ? "Couper le son" : "Activer le son"}>
          <Icon name={sound ? "volume" : "mute"} size={19} />
        </button>
        <Link href={`/joueur/${encodeURIComponent(user.pseudo)}`} className="nav-avatar" aria-label="Mon profil">
          <Avatar avatar={user.avatar} userId={user.id} photo={user.photo} size={34} />
        </Link>
      </nav>
    </header>
  );
}
