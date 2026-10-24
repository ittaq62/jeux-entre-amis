import { Icon } from "./Icon.tsx";

/** Petite plaque dorée à côté du nom de l'administrateur du site. */
export function AdminBadge({ large = false }: { large?: boolean }) {
  return (
    <span className={`admin-badge ${large ? "is-large" : ""}`} title="Administrateur du site">
      <Icon name="crown" size={large ? 13 : 10} strokeWidth={2.6} />
      ADMIN
    </span>
  );
}

/** Nom d'un joueur qui se coupe proprement si trop long, suivi du badge s'il est admin. */
export function PlayerName({ name, admin, suffix }: { name: string; admin?: boolean; suffix?: string }) {
  return (
    <span className="player-name">
      <span className="player-name-text">
        {name}
        {suffix}
      </span>
      {admin && <AdminBadge />}
    </span>
  );
}
