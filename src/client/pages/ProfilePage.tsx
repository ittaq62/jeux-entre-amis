import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ACHIEVEMENTS } from "../../shared/achievements.ts";
import type { PublicUser } from "../../shared/protocol.ts";
import { AppHeader } from "../components/AppHeader.tsx";
import { Avatar } from "../components/Avatar.tsx";
import { Icon } from "../components/Icon.tsx";
import { Loading, timeAgo } from "../components/ui.tsx";
import { api, ApiError } from "../lib/api.ts";
import { toast } from "../lib/toast.ts";
import { useHub } from "../stores/hub.ts";

interface Profile {
  user: PublicUser;
  memberSince: number;
  friendship: "none" | "self" | "accepted" | "incoming" | "outgoing";
  stats: {
    played: number;
    won: number;
    rating: number;
    streak: number;
    bestStreak: number;
    totals: Record<string, number>;
  };
  achievements: { id: string; at: number }[];
  recent: {
    id: string;
    variant: string;
    endedAt: number;
    players: number;
    rank: number;
    score: number;
    table: { name: string; rank: number; bot: boolean }[];
  }[];
}

export function ProfilePage({ pseudo }: { pseudo: string }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refreshFriends = useHub((s) => s.refreshFriends);

  const load = () =>
    api
      .get<Profile>(`/profile/${encodeURIComponent(pseudo)}`)
      .then(setProfile)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Profil introuvable."));

  useEffect(() => {
    setProfile(null);
    void load();
  }, [pseudo]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error)
    return (
      <div className="felt page">
        <AppHeader />
        <p className="empty center-text">{error}</p>
      </div>
    );
  if (!profile) return <Loading />;

  const { stats, user } = profile;
  const t = stats.totals;
  const rate = stats.played > 0 ? Math.round((stats.won / stats.played) * 100) : 0;
  const owned = new Map(profile.achievements.map((a) => [a.id, a.at]));

  async function addFriend() {
    try {
      const res = await api.post<{ result: string }>("/friends", { pseudo: user.pseudo });
      toast({ icon: "👋", title: res.result === "accepted" ? `Vous êtes maintenant amis !` : "Demande d'ami envoyée" });
      await refreshFriends();
      void load();
    } catch (err) {
      toast({ tone: "danger", title: err instanceof ApiError ? err.message : "Impossible pour l'instant." });
    }
  }

  return (
    <div className="felt page">
      <AppHeader />
      <main className="profile">
        <section className="profile-head panel panel-pad">
          <Avatar avatar={user.avatar} userId={user.id} photo={user.photo} size={96} />
          <div className="profile-id">
            <h1>{user.pseudo}</h1>
            <p className="hint">
              À la table depuis {new Date(profile.memberSince).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
            </p>
            <div className="profile-chips">
              <span className="chip chip-gold">
                <Icon name="trophy" size={13} /> {stats.rating} pts de classement
              </span>
              {stats.streak >= 2 && <span className="chip">🔥 {stats.streak} victoires d'affilée</span>}
            </div>
          </div>
          <div className="profile-actions">
            {profile.friendship === "self" && (
              <Link href="/compte" className="btn">
                <Icon name="settings" size={18} /> Modifier
              </Link>
            )}
            {profile.friendship === "none" && (
              <button className="btn btn-primary" onClick={() => void addFriend()}>
                <Icon name="plus" size={18} /> Ajouter en ami
              </button>
            )}
            {profile.friendship === "incoming" && (
              <button className="btn btn-primary" onClick={() => void addFriend()}>
                Accepter la demande
              </button>
            )}
            {profile.friendship === "outgoing" && <span className="chip">Demande envoyée</span>}
            {profile.friendship === "accepted" && <span className="chip chip-green">Ami</span>}
          </div>
        </section>

        <section className="stat-tiles">
          <StatTile label="Parties" value={stats.played} />
          <StatTile label="Victoires" value={stats.won} />
          <StatTile label="Taux de victoire" value={`${rate} %`} />
          <StatTile label="Série record" value={stats.bestStreak} />
        </section>

        <div className="profile-grid">
          <section className="panel panel-pad">
            <h3 className="section-title">Le détail</h3>
            <dl className="stat-list">
              <StatRow label="Cartes posées" value={t.played} />
              <StatRow label="Cartes piochées" value={t.drawn} />
              <StatRow label="Cartes infligées avec des « + »" value={t.plusGiven} />
              <StatRow label="Cartes encaissées en pénalité" value={t.penaltyCards} />
              <StatRow label="Plus grosse main" value={t.maxHand} />
              <StatRow label="Plus grosse pile encaissée" value={t.biggestStackTaken} />
              <StatRow label="UNO criés" value={t.unoCalls} />
              <StatRow label="Oublis dénoncés" value={t.caughtOthers} />
              <StatRow label="Pris la main dans le sac" value={t.gotCaught} />
              <StatRow label="Bluffs démasqués" value={t.challengesWon} />
            </dl>
          </section>

          <section className="panel panel-pad">
            <h3 className="section-title">
              Succès{" "}
              <span className="hint">
                {owned.size}/{ACHIEVEMENTS.length}
              </span>
            </h3>
            <ul className="achievement-grid">
              {[...ACHIEVEMENTS]
                .sort((x, y) => Number(owned.has(y.id)) - Number(owned.has(x.id)))
                .map((a) => {
                  const at = owned.get(a.id);
                  return (
                    <li key={a.id} className={`achievement ${at ? "is-owned" : ""}`} title={a.description}>
                      <span className="achievement-icon">{a.icon}</span>
                      <span className="achievement-text">
                        <strong>{a.title}</strong>
                        <span className="hint">{a.description}</span>
                      </span>
                    </li>
                  );
                })}
            </ul>
          </section>
        </div>

        <section className="panel panel-pad">
          <h3 className="section-title">Dernières parties</h3>
          {profile.recent.length === 0 ? (
            <p className="empty">Aucune partie pour l'instant.</p>
          ) : (
            <ul className="history">
              {profile.recent.map((g) => (
                <li key={g.id} className={`history-row ${g.rank === 1 ? "is-win" : ""}`}>
                  <span className="history-rank">{g.rank === 1 ? "🏆" : `${g.rank}e`}</span>
                  <span className="history-main">
                    <strong>
                      {g.variant === "nomercy" ? "No Mercy" : "Classique"} · {g.players} joueurs
                    </strong>
                    <span className="hint">{g.table.map((p) => `${p.name}${p.bot ? " 🤖" : ""}`).join(" · ")}</span>
                  </span>
                  <span className="hint">{timeAgo(g.endedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="stat-tile panel">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="stat-row">
      <dt>{label}</dt>
      <dd>{value ?? 0}</dd>
    </div>
  );
}
