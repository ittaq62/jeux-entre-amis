import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ACHIEVEMENTS } from "../../shared/achievements.ts";
import { GAME_NAMES, type GameId, type PublicUser } from "../../shared/protocol.ts";
import { rankingPoints } from "../../shared/ranking.ts";
import { AppHeader } from "../components/AppHeader.tsx";
import { AdminBadge } from "../components/AdminBadge.tsx";
import { Avatar } from "../components/Avatar.tsx";
import { Chip } from "../components/Chip.tsx";
import { Loading, Options, timeAgo } from "../components/ui.tsx";
import { api, ApiError } from "../lib/api.ts";
import { toast } from "../lib/toast.ts";
import { useHub } from "../stores/hub.ts";
import { useSession } from "../stores/session.ts";

interface GameStats {
  played: number;
  won: number;
  points: number;
  elo: number;
  streak: number;
  bestStreak: number;
  totals: Record<string, number>;
}

interface Profile {
  user: PublicUser;
  memberSince: number;
  friendship: "none" | "self" | "accepted" | "incoming" | "outgoing";
  stats: GameStats;
  naval: GameStats;
  achievements: { id: string; at: number }[];
  recent: {
    id: string;
    game: GameId;
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
  const games = useSession((s) => s.games);
  const [shelf, setShelf] = useState<GameId>("uno");

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
  const naval = profile.naval;
  // La bataille navale n'apparaît que si on la voit déjà, ou si ce joueur y a joué
  const showNaval = games.includes("naval") || naval.played > 0;
  const shelfGame = showNaval ? shelf : "uno";
  const shelfList = ACHIEVEMENTS.filter((a) => (a.game ?? "uno") === shelfGame);
  // Les succès gagnés d'abord, du plus récent au plus ancien, puis ceux qui restent à décrocher
  const won = shelfList.filter((a) => owned.has(a.id)).sort((x, y) => owned.get(y.id)! - owned.get(x.id)!);
  const toWin = shelfList.filter((a) => !owned.has(a.id));
  const nt = naval.totals;
  const accuracy = (nt.shots ?? 0) > 0 ? Math.round(((nt.hits ?? 0) / nt.shots!) * 100) : 0;

  return (
    <div className="felt page">
      <AppHeader />
      <main className="profile">
        <section className="profile-head">
          <Avatar avatar={user.avatar} userId={user.id} photo={user.photo} size={88} />
          <div className="profile-id">
            <h1>
              {user.pseudo}
              {user.admin && <AdminBadge large />}
            </h1>
            <p>
              À la table depuis {since}
              {stats.streak >= 2 && <>, {stats.streak} victoires d'affilée en ce moment</>}.
            </p>
            {stats.played > 0 && (
              <p className="profile-points">
                <strong className="num">{stats.points.toLocaleString("fr-FR")}</strong> points au classement
                {showNaval && naval.played > 0 && " de UNO"}
                <span className="profile-elo">
                  Elo <strong className="num">{stats.elo}</strong>
                </span>
              </p>
            )}
            {showNaval && naval.played > 0 && (
              <p className="profile-points">
                <strong className="num">{naval.points.toLocaleString("fr-FR")}</strong> points en bataille navale
                <span className="profile-elo">
                  Elo <strong className="num">{naval.elo}</strong>
                </span>
              </p>
            )}
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
          <div className="profile-col">
            <section className="carnet panel">
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

            {showNaval && (
              <section className="carnet panel">
                <h2>Le journal de bord</h2>
                <p className="carnet-summary">
                  {naval.played === 0
                    ? "Aucune bataille navale pour l'instant."
                    : `${naval.played} bataille${naval.played > 1 ? "s" : ""}, ${naval.won} gagnée${naval.won > 1 ? "s" : ""}.`}
                </p>
                <dl className="ledger">
                  <LedgerRow label="Tirs au but" value={accuracy} unit=" %" strong />
                  <LedgerRow label="Obus tirés" value={nt.shots} />
                  <LedgerRow label="Touchés" value={nt.hits} />
                  <LedgerRow label="Navires coulés" value={nt.sunk} />
                  <LedgerRow label="Navires perdus" value={nt.lost} />
                  <LedgerRow label="Plus longue série de touches" value={nt.bestStreak} />
                  <LedgerRow label="Armes spéciales utilisées" value={nt.weapons} />
                </dl>
              </section>
            )}
          </div>

          <section className="achievements">
            <h2>
              Succès{" "}
              <span className="hint num">
                {shelfList.filter((a) => owned.has(a.id)).length} sur {shelfList.length}
              </span>
            </h2>
            {showNaval && (
              <Options<GameId>
                label="Succès de quel jeu"
                value={shelfGame}
                onChange={setShelf}
                options={(["uno", "naval"] as GameId[]).map((g) => ({ value: g, label: GAME_NAMES[g] }))}
              />
            )}
            {won.length > 0 && (
              <ul className="achievement-grid">
                {won.map((a) => (
                  <li key={a.id} className="achievement is-owned">
                    <Chip label={a.chip} tone={a.tone} size={46} title={a.title} />
                    <span className="achievement-text">
                      <strong>{a.title}</strong>
                      <span>{a.description}</span>
                      <span className="achievement-date">Obtenu le {dayMonth(owned.get(a.id)!)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {toWin.length > 0 && (
              <>
                <h3 className="achievement-group">{won.length > 0 ? "À décrocher" : "Tous à décrocher"}</h3>
                <ul className="achievement-grid">
                  {toWin.map((a) => (
                    <li key={a.id} className="achievement">
                      <span className="chip-slot" aria-hidden="true">
                        <span>{a.chip}</span>
                      </span>
                      <span className="achievement-text">
                        <strong>{a.title}</strong>
                        <span>{a.description}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>

        <section className="home-list history">
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
                      {g.rank === 1 ? "Victoire" : `${g.rank}e sur ${g.players}`}, {recentLabel(g)}
                    </strong>
                    <span className="hint">{g.table.map((p) => `${p.name}${p.bot ? " (bot)" : ""}`).join(", ")}</span>
                  </span>
                  <span className="history-side">
                    <strong className="history-points num">+{gamePoints(g)}</strong>
                    <span className="hint">{timeAgo(g.endedAt)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

const dayMonth = (ts: number) => new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });

const NAVAL_MODES: Record<string, string> = { duel: "en duel", melee: "en mêlée", teams: "en équipes" };

function recentLabel(g: Profile["recent"][number]): string {
  if (g.game === "naval") return `bataille navale ${NAVAL_MODES[g.variant] ?? ""}`.trim();
  return `UNO ${g.variant === "nomercy" ? "No Mercy" : "classique"}`;
}

/** Points rapportés par une partie de l'historique, avec le barème du classement. */
function gamePoints(g: Profile["recent"][number]): number {
  const players = g.table.map((p) => ({ rank: p.rank, isBot: p.bot }));
  return rankingPoints(players, players.find((p) => p.rank === g.rank) ?? { rank: 0, isBot: false });
}

function LedgerRow({ label, value, strong, unit = "" }: { label: string; value: number | undefined; strong?: boolean; unit?: string }) {
  return (
    <div className={`ledger-row ${strong ? "is-key" : ""}`}>
      <dt>{label}</dt>
      <dd>
        {value ?? 0}
        {unit}
      </dd>
    </div>
  );
}
