import { Link, useLocation } from "wouter";
import { useHub } from "../stores/hub.ts";
import { usePrefs } from "../stores/prefs.ts";
import { useSession } from "../stores/session.ts";
import { Avatar } from "./Avatar.tsx";
import { Icon } from "./Icon.tsx";
import { Logo } from "./ui.tsx";

export function AppHeader() {
  const user = useSession((s) => s.user);
  const friends = useHub((s) => s.friends);
  const online = useHub((s) => s.online);
  const [location] = useLocation();
  const sound = usePrefs((s) => s.sound);
  const setPrefs = usePrefs((s) => s.set);
  const requests = friends.filter((f) => f.status === "incoming").length;
  const onlineCount = friends.filter((f) => f.status === "accepted" && f.user.id in online).length;
  if (!user) return null;
  return (
    <header className="app-header">
      <Link href="/" className="logo-link" aria-label="Accueil">
        <Logo size={22} />
      </Link>
      <nav className="app-nav">
        <button
          className="btn btn-ghost btn-icon"
          onClick={() => setPrefs({ sound: !sound })}
          aria-label={sound ? "Couper le son" : "Activer le son"}
        >
          <Icon name={sound ? "volume" : "mute"} />
        </button>
        <Link href="/classement" className={`btn btn-ghost nav-btn ${location === "/classement" ? "is-active" : ""}`}>
          <Icon name="trophy" />
          <span className="nav-label">Classement</span>
        </Link>
        <Link href="/amis" className={`btn btn-ghost nav-btn ${location === "/amis" ? "is-active" : ""}`}>
          <Icon name="users" />
          <span className="nav-label">Amis</span>
          {requests > 0 ? (
            <span className="badge badge-red">{requests}</span>
          ) : onlineCount > 0 ? (
            <span className="badge">{onlineCount}</span>
          ) : null}
        </Link>
        <Link href={`/joueur/${encodeURIComponent(user.pseudo)}`} className="nav-avatar" aria-label="Mon profil">
          <Avatar avatar={user.avatar} userId={user.id} photo={user.photo} size={36} />
        </Link>
      </nav>
    </header>
  );
}
