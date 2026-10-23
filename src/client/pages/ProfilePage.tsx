import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ACHIEVEMENTS } from "../../shared/achievements.ts";
import type { PublicUser } from "../../shared/protocol.ts";
import { AppHeader } from "../components/AppHeader.tsx";
import { Avatar } from "../components/Avatar.tsx";
import { Chip } from "../components/Chip.tsx";
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
      toast({ title: res.result === "accepted" ? "Vous êtes maintenant amis" : "Demande d'ami envoyée" });
      await refreshFriends();
      void load();
    } catch (err) {
      toast({ tone: "danger", title: err instanceof ApiError ? err.message : "Impossible pour l'instant." });
    }
  }

  const since = new Date(profile.memberSince).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  const sortedAchievements = [...ACHIEVEMENTS].sort((x, y) => Number(owned.has(y.id)) - Number(owned.has(x.id)));

  return (
    <div className="felt page">
      <AppHeader />
      <main className="profile">
        <section className="profile-head">
          <Avatar avatar={user.avatar} userId={user.id} photo={user.photo} size={88} />
          <div className="profile-id">
            <h1>{user.pseudo}</h1>
            <p>
              À la table depuis {since}
              {stats.played > 0 && <>, {stats.rating} points au classement</>}
              {stats.streak >= 2 && <>, {stats.streak} victoires d'affilée en ce moment</>}.
            </p>
          </div>
          <div className="row-actions">
            {profile.friendship === "self" && (
              <Link href="/compte" className="btn">
                Modifier mon profil
              </Link>
            )}
            {profile.friendship === "none" && (
              <button className="btn btn-primary" onClick={() => void addFriend()}>
                Ajouter en ami
              </button>
            )}
            {profile.friendship === "incoming" && (
              <button className="btn btn-primary" onClick={() => void addFriend()}>
                Accepter sa demande
              </button>
            )}
            {profile.friendship === "outgoing" && <span className="tag">Demande envoyée</span>}
            {profile.friendship === "accepted" && <span className="tag tag-strong">Ami</span>}
          </div>
        </section>

        <div className="profile-grid">
          <section className="carnet paper">
            <h2>Le carnet</h2>
            <p className="carnet-summary">
              {stats.played === 0
                ? "Aucune partie jouée pour l'instant."
                : `${stats.played} partie${stats.played > 1 ? "s" : ""}, ${stats.won} gagnée${stats.won > 1 ? "s" : ""} (${rate} %).`}
            </p>
            <dl className="ledger">
              <LedgerRow label="Meilleure série" value={stats.bestStreak} strong />
              <LedgerRow label="Cartes posées" value={t.played} />
              <LedgerRow label="Cartes piochées" value={t.drawn} />
              <LedgerRow label="Pénalités infligées" value={t.plusGiven} />
              <LedgerRow label="Pénalités encaissées" value={t.penaltyCards} />
              <LedgerRow label="Plus grosse main" value={t.maxHand} />
              <LedgerRow label="Plus grosse pile ramassée" value={t.biggestStackTaken} />
              <LedgerRow label="UNO criés" value={t.unoCalls} />
              <LedgerRow label="Étourdis dénoncés" value={t.caughtOthers} />
              <LedgerRow label="Fois pris sans UNO" value={t.gotCaught} />
              <LedgerRow label="Bluffs démasqués" value={t.challengesWon} />
            </dl>
          </section>

          <section className="achievements">
            <h2>
              Succès{" "}
              <span className="hint num">
                {owned.size} sur {ACHIEVEMENTS.length}
              </span>
            </h2>
            <ul className="achievement-grid">
              {sortedAchievements.map((a) => {
                const at = owned.get(a.id);
                return (
                  <li key={a.id} className={`achievement ${at ? "is-owned" : ""}`}>
                    <Chip label={a.chip} tone={a.tone} size={46} muted={!at} title={a.title} />
                    <span className="achievement-text">
                      <strong>{a.title}</strong>
                      <span>{a.description}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        <section className="history">
          <h2>Dernières parties</h2>
          {profile.recent.length === 0 ? (
            <p className="empty">Pas encore de partie terminée.</p>
          ) : (
            <ul className="rows">
              {profile.recent.map((g) => (
                <li key={g.id} className={`row ${g.rank === 1 ? "is-win" : ""}`}>
                  <span className="history-rank num">{g.rank}</span>
                  <span className="row-text">
                    <strong>
                      {g.rank === 1 ? "Victoire" : `${g.rank}e sur ${g.players}`}, {g.variant === "nomercy" ? "No Mercy" : "classique"}
                    </strong>
                    <span className="hint">{g.table.map((p) => `${p.name}${p.bot ? " (bot)" : ""}`).join(", ")}</span>
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

function LedgerRow({ label, value, strong }: { label: string; value: number | undefined; strong?: boolean }) {
  return (
    <div className={`ledger-row ${strong ? "is-key" : ""}`}>
      <dt>{label}</dt>
      <dd>{value ?? 0}</dd>
    </div>
  );
}
