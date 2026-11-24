import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ACHIEVEMENTS } from "../../shared/achievements.ts";
import { TRACK_IDS, TRACKS } from "../../shared/games/bolides/track.ts";
import { TABLE_NAMES, type GameId, type PublicUser, type TableGame } from "../../shared/protocol.ts";
import { rankingPoints } from "../../shared/ranking.ts";
import { CARD_BY_ID, CARDS } from "../../shared/cards.ts";
import type { StreakStatus } from "../../shared/streak.ts";
import { TradingCard } from "../cards/TradingCard.tsx";
import { AppHeader } from "../components/AppHeader.tsx";
import { AdminBadge } from "../components/AdminBadge.tsx";
import { Avatar } from "../components/Avatar.tsx";
import { Chip } from "../components/Chip.tsx";
import { Icon } from "../components/Icon.tsx";
import { StreakCarnet } from "../components/StreakCarnet.tsx";
import { Loading, Options, timeAgo } from "../components/ui.tsx";
import { api, ApiError } from "../lib/api.ts";
import { formatSprint } from "../lib/countdown.ts";
import { toast } from "../lib/toast.ts";
import { tableLabel } from "../lib/variantLabel.ts";
import { useHub } from "../stores/hub.ts";
import { NotFound } from "./NotFoundPage.tsx";
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
  bricks: GameStats;
  capitale: GameStats;
  meche: GameStats;
  bolides: GameStats;
  crampons: GameStats;
  culbute: GameStats;
  escarmouche?: GameStats;
  minigolf?: GameStats;
  bowling?: GameStats;
  billard?: GameStats;
  tour: GameStats;
  tours: { id: string; endedAt: number; players: number; games: number; rank: number; points: number; wins: number }[];
  album: { count: number; best: string[] };
  /** Absente si le serveur n'a pas pu la lire */
  streak?: StreakStatus | null;
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
  const [error, setError] = useState<{ message: string; notFound: boolean } | null>(null);
  const refreshFriends = useHub((s) => s.refreshFriends);
  const games = useSession((s) => s.games);
  const tourOn = useSession((s) => s.tour);
  const [shelf, setShelf] = useState<TableGame>("uno");

  const load = () =>
    api
      .get<Profile>(`/profile/${encodeURIComponent(pseudo)}`)
      .then((p) => {
        setProfile(p);
        setError(null);
      })
      .catch((err) =>
        setError({
          message: err instanceof ApiError ? err.message : "Vérifie ta connexion, puis réessaie.",
          notFound: err instanceof ApiError && err.status === 404,
        }),
      );

  useEffect(() => {
    setProfile(null);
    setError(null);
    void load();
  }, [pseudo]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error)
    return (
      <div className="felt page">
        <AppHeader />
        <main className="not-found">
          <NotFound
            title={error.notFound ? "Ce joueur n'est pas à la table" : "Le profil n'a pas pu s'ouvrir"}
            text={
              error.notFound
                ? `Personne ne s'appelle « ${pseudo} ». Il a peut-être changé de pseudo : cherche-le parmi les joueurs.`
                : error.message
            }
          >
            {error.notFound ? (
              <Link href="/amis" className="btn">
                Chercher un joueur
              </Link>
            ) : (
              <button className="btn" onClick={() => void load()}>
                Réessayer
              </button>
            )}
          </NotFound>
        </main>
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
  const bricks = profile.bricks;
  const bt = bricks.totals;
  // Pareil pour Briques (un record au solo suffit à l'afficher)
  const showBricks = games.includes("bricks") || bricks.played > 0 || Boolean(bt.bestSprint);
  const capitale = profile.capitale;
  const ct = capitale.totals;
  const showCapitale = games.includes("capitale") || capitale.played > 0;
  const meche = profile.meche;
  const mt = meche.totals;
  const showMeche = games.includes("meche") || meche.played > 0;
  const bolides = profile.bolides ?? { played: 0, won: 0, points: 0, elo: 1000, totals: {} };
  const bot = bolides.totals;
  const showBolides = games.includes("bolides") || bolides.played > 0;
  const showCrampons = games.includes("crampons") || (profile.crampons?.played ?? 0) > 0;
  const showCulbute = games.includes("culbute") || (profile.culbute?.played ?? 0) > 0;
  const escarmouche = profile.escarmouche ?? { played: 0, won: 0, points: 0, elo: 1000, totals: {} };
  const et = escarmouche.totals as Record<string, number>;
  const showEscarmouche = games.includes("escarmouche") || escarmouche.played > 0;
  const minigolf = profile.minigolf ?? { played: 0, won: 0, points: 0, elo: 1000, totals: {} };
  const gt = minigolf.totals as Record<string, number>;
  const showMinigolf = games.includes("minigolf") || minigolf.played > 0;
  const bowling = profile.bowling ?? { played: 0, won: 0, points: 0, elo: 1000, totals: {} };
  const bwt = bowling.totals as Record<string, number>;
  const showBowling = games.includes("bowling") || bowling.played > 0;
  const billard = profile.billard ?? { played: 0, won: 0, points: 0, elo: 1000, totals: {} };
  const blt = billard.totals as Record<string, number>;
  const showBillard = games.includes("billard") || billard.played > 0;
  const tour = profile.tour;
  const tt = tour.totals;
  // La tournée aussi : visible si elle est ouverte à ce compte, ou si ce joueur en a déjà fini une
  const showTour = tourOn || tour.played > 0;
  const shelfGames = (
    [
      "uno",
      "naval",
      "bricks",
      "capitale",
      "meche",
      "bolides",
      "crampons",
      "culbute",
      "escarmouche",
      "minigolf",
      "bowling",
      "billard",
      "tour",
    ] as TableGame[]
  ).filter(
    (g) =>
      g === "uno" ||
      (g === "naval"
        ? showNaval
        : g === "bricks"
          ? showBricks
          : g === "capitale"
            ? showCapitale
            : g === "meche"
              ? showMeche
              : g === "crampons"
                ? showCrampons
                : g === "escarmouche"
                  ? showEscarmouche
                  : g === "culbute"
                    ? showCulbute
                    : g === "minigolf"
                      ? showMinigolf
                      : g === "bowling"
                        ? showBowling
                        : g === "billard"
                          ? showBillard
                          : g === "bolides"
                            ? showBolides
                            : showTour),
  );
  const shelfGame = shelfGames.includes(shelf) ? shelf : "uno";
  const shelfList = ACHIEVEMENTS.filter((a) => (a.game ?? "uno") === shelfGame);
  // Les succès gagnés d'abord, du plus récent au plus ancien, puis ceux qui restent à décrocher
  const won = shelfList.filter((a) => owned.has(a.id)).sort((x, y) => owned.get(y.id)! - owned.get(x.id)!);
  const toWin = shelfList.filter((a) => !owned.has(a.id));
  // Tous les jeux visibles ici : le total de la vitrine
  const allShelves = ACHIEVEMENTS.filter((a) => shelfGames.includes(a.game ?? "uno"));
  const allOwned = allShelves.filter((a) => owned.has(a.id)).length;
  // Les points au classement de chaque jeu joué, UNO d'abord, dans l'ordre des fiches de l'accueil
  const crampons = profile.crampons ?? { played: 0, won: 0, points: 0, elo: 1000, streak: 0, bestStreak: 0, totals: {} };
  const culbute = profile.culbute ?? { played: 0, won: 0, points: 0, elo: 1000, streak: 0, bestStreak: 0, totals: {} };
  // Les parties terminées de chaque jeu (et les tournées) : où en sont les succès à compteur
  const playedOn = (g: TableGame): number =>
    ({
      uno: stats,
      naval,
      bricks,
      capitale,
      meche,
      bolides,
      crampons,
      culbute,
      escarmouche,
      minigolf,
      bowling,
      billard,
      tour,
    })[g].played;
  const pointLines = (
    [
      { game: "uno", label: "à UNO", stats, shown: true },
      { game: "naval", label: "en bataille navale", stats: naval, shown: showNaval },
      { game: "bricks", label: "à Briques", stats: bricks, shown: showBricks },
      { game: "capitale", label: "à Capitale", stats: capitale, shown: showCapitale },
      { game: "meche", label: "à Mèche", stats: meche, shown: showMeche },
      { game: "bolides", label: "à Bolides", stats: bolides, shown: showBolides },
      { game: "crampons", label: "à Crampons", stats: crampons, shown: showCrampons },
      { game: "culbute", label: "à Culbute", stats: culbute, shown: showCulbute },
      { game: "escarmouche", label: "à Escarmouche", stats: escarmouche, shown: showEscarmouche },
      { game: "minigolf", label: "au minigolf", stats: minigolf, shown: showMinigolf },
      { game: "bowling", label: "au bowling", stats: bowling, shown: showBowling },
      { game: "billard", label: "au billard", stats: billard, shown: showBillard },
    ] satisfies { game: GameId; label: string; stats: Pick<GameStats, "played" | "points" | "elo">; shown: boolean }[]
  ).filter((line) => line.shown && line.stats.played > 0);
  const nt = naval.totals;
  const accuracy = (nt.shots ?? 0) > 0 ? Math.round(((nt.hits ?? 0) / nt.shots!) * 100) : 0;

  return (
    <div className="felt page">
      <AppHeader />
      <main className="profile">
        <section className="profile-head">
          {profile.friendship === "self" ? (
            <Link href="/personnage" className="profile-avatar-edit" aria-label="Modifier mon personnage" title="Modifier mon personnage">
              <Avatar avatar={user.avatar} userId={user.id} photo={user.photo} size={88} />
              <span className="profile-avatar-pen" aria-hidden="true">
                <Icon name="smile" size={15} />
              </span>
            </Link>
          ) : (
            <Avatar avatar={user.avatar} userId={user.id} photo={user.photo} size={88} />
          )}
          <div className="profile-id">
            <h1>
              {user.pseudo}
              {user.admin && <AdminBadge large />}
            </h1>
            <p>
              À la table depuis {since}
              {stats.streak >= 2 && <>, {stats.streak} victoires d'affilée en ce moment</>}.
            </p>
            {pointLines.map((line) => (
              <p key={line.game} className="profile-points">
                <strong className="num">{line.stats.points.toLocaleString("fr-FR")}</strong> points{" "}
                {pointLines.length === 1 && line.game === "uno" ? "au classement" : line.label}
                <span className="profile-elo">
                  Elo <strong className="num">{line.stats.elo}</strong>
                </span>
              </p>
            ))}
          </div>
          <div className="row-actions">
            {profile.friendship === "self" && (
              <>
                <Link href="/personnage" className="btn btn-primary">
                  Mon personnage
                </Link>
                <Link href="/compte" className="btn">
                  Modifier mon profil
                </Link>
              </>
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
            {profile.streak && <StreakCarnet streak={profile.streak} self={profile.friendship === "self"} />}
            {profile.album.count > 0 && (
              <section className="carnet panel">
                <h2>L'album</h2>
                <div className="profile-album">
                  <div className="profile-album-cards">
                    {profile.album.best.map((id) => (
                      <TradingCard key={id} card={CARD_BY_ID.get(id)!} width={84} />
                    ))}
                  </div>
                  <p className="carnet-summary">
                    <strong className="num">{profile.album.count}</strong> cartes sur {CARDS.length}
                  </p>
                </div>
              </section>
            )}
            <section className="carnet panel">
              <h2>Le carnet</h2>
              <p className="carnet-summary">
                {stats.played === 0
                  ? "Aucune partie jouée pour l'instant."
                  : `${stats.played} partie${stats.played > 1 ? "s" : ""}, ${stats.won} gagnée${stats.won > 1 ? "s" : ""} (${rate} %).`}
              </p>
              <dl className="ledger">
                <LedgerRow label="Meilleure série de victoires" value={stats.bestStreak} strong />
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

            {showBricks && (
              <section className="carnet panel">
                <h2>Le chantier</h2>
                <p className="carnet-summary">
                  {bricks.played === 0
                    ? bt.bestSprint
                      ? "Aucune partie contre les autres pour l'instant, seulement le solo."
                      : "Aucune partie de Briques pour l'instant."
                    : `${bricks.played} partie${bricks.played > 1 ? "s" : ""}, ${bricks.won} gagnée${bricks.won > 1 ? "s" : ""}.`}
                </p>
                <dl className="ledger">
                  {bt.bestSprint ? (
                    <div className="ledger-row is-key">
                      <dt>Record au solo 40 lignes</dt>
                      <dd>{formatSprint(bt.bestSprint)}</dd>
                    </div>
                  ) : null}
                  <LedgerRow label="Lignes faites" value={bt.lines} strong={!bt.bestSprint} />
                  <LedgerRow label="Lignes envoyées" value={bt.sent} />
                  <LedgerRow label="Quatre lignes d'un coup" value={bt.tetrises} />
                  <LedgerRow label="T-spins" value={bt.tspins} />
                  <LedgerRow label="Plus long combo" value={bt.maxCombo} />
                  <LedgerRow label="K.O. infligés" value={bt.kos} />
                  <LedgerRow label="Plateaux vidés" value={bt.allClears} />
                </dl>
              </section>
            )}

            {showCapitale && (
              <section className="carnet panel">
                <h2>L'immobilier</h2>
                <p className="carnet-summary">
                  {capitale.played === 0
                    ? "Aucune partie de Capitale pour l'instant."
                    : `${capitale.played} partie${capitale.played > 1 ? "s" : ""}, ${capitale.won} gagnée${capitale.won > 1 ? "s" : ""}.`}
                </p>
                <dl className="ledger">
                  <LedgerRow label="Loyers touchés" value={ct.rentEarned} strong />
                  <LedgerRow label="Plus belle fortune" value={ct.bestWorth} />
                  <LedgerRow label="Titres achetés" value={ct.bought} />
                  <LedgerRow label="Étages bâtis" value={ct.houses} />
                  <LedgerRow label="Monuments élevés" value={ct.hotels} />
                  <LedgerRow label="Échanges conclus" value={ct.trades} />
                  <LedgerRow label="Séjours en prison" value={ct.jail} />
                </dl>
              </section>
            )}

            {showMeche && (
              <section className="carnet panel">
                <h2>L'atelier</h2>
                <p className="carnet-summary">
                  {meche.played === 0
                    ? "Aucune partie de Mèche pour l'instant."
                    : `${meche.played} partie${meche.played > 1 ? "s" : ""}, ${meche.won} gagnée${meche.won > 1 ? "s" : ""}.`}
                </p>
                <dl className="ledger">
                  <LedgerRow label="Mots trouvés" value={mt.words} strong />
                  <LedgerRow label="Plus long mot" value={mt.longest} unit=" lettres" />
                  <LedgerRow label="Passes gagnées" value={mt.passesEarned} />
                  <LedgerRow label="Explosions encaissées" value={mt.booms} />
                </dl>
              </section>
            )}

            {showBolides && (
              <section className="carnet panel">
                <h2>Le garage</h2>
                <p className="carnet-summary">
                  {bolides.played === 0
                    ? "Aucune course de Bolides pour l'instant."
                    : `${bolides.played} course${bolides.played > 1 ? "s" : ""}, ${bolides.won} gagnée${bolides.won > 1 ? "s" : ""}.`}
                </p>
                <dl className="ledger">
                  <LedgerRow label="Mini-turbos en dérapant" value={bot.turbos} strong />
                  <LedgerRow label="Karts touchés" value={bot.hitsGiven} />
                  <LedgerRow label="Coups encaissés" value={bot.hitsTaken} />
                  <LedgerRow label="Caisses cassées" value={bot.boxes} />
                  {TRACK_IDS.filter((id) => bot[`lap_${id}`]).map((id) => (
                    <div key={id} className="ledger-row">
                      <dt>Meilleur tour, {TRACKS[id].name}</dt>
                      <dd className="num">{(bot[`lap_${id}`]! / 1000).toFixed(1).replace(".", ",")} s</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            {showEscarmouche && (
              <section className="carnet panel">
                <h2>Le front</h2>
                <p className="carnet-summary">
                  {escarmouche.played === 0
                    ? "Aucune partie d'Escarmouche pour l'instant."
                    : `${escarmouche.played} partie${escarmouche.played > 1 ? "s" : ""}, ${escarmouche.won} gagnée${escarmouche.won > 1 ? "s" : ""}.`}
                </p>
                <dl className="ledger">
                  <LedgerRow label="Adversaires éliminés" value={et.kills} strong />
                  <LedgerRow label="Balles à la tête" value={et.headshots} />
                  <LedgerRow label="Passes décisives" value={et.assists} />
                  <LedgerRow label="Fois éliminé" value={et.deaths} />
                  <LedgerRow label="Drapeaux rapportés" value={et.captures} />
                  <LedgerRow label="Meilleure série" value={et.bestStreak} />
                </dl>
              </section>
            )}

            {showMinigolf && (
              <section className="carnet panel">
                <h2>Le green</h2>
                <p className="carnet-summary">
                  {minigolf.played === 0
                    ? "Aucune partie de minigolf pour l'instant."
                    : `${minigolf.played} partie${minigolf.played > 1 ? "s" : ""}, ${minigolf.won} gagnée${minigolf.won > 1 ? "s" : ""}.`}
                </p>
                <dl className="ledger">
                  <LedgerRow label="Trous joués" value={gt.holes} strong />
                  <LedgerRow label="Trous en un" value={gt.aces} />
                  <LedgerRow label="Trous sous le par" value={gt.under} />
                  <LedgerRow label="Balles perdues" value={gt.lost} />
                </dl>
              </section>
            )}

            {showBowling && (
              <section className="carnet panel">
                <h2>La piste</h2>
                <p className="carnet-summary">
                  {bowling.played === 0
                    ? "Aucune partie de bowling pour l'instant."
                    : `${bowling.played} partie${bowling.played > 1 ? "s" : ""}, ${bowling.won} gagnée${bowling.won > 1 ? "s" : ""}.`}
                </p>
                <dl className="ledger">
                  <LedgerRow label="Meilleure partie (10 frames)" value={bwt.bestScore} strong />
                  <LedgerRow label="Moyenne (10 frames)" value={bwt.games10 ? Math.round((bwt.pins10 ?? 0) / bwt.games10) : undefined} />
                  <LedgerRow label="Strikes" value={bwt.strikes} />
                  <LedgerRow label="Spares" value={bwt.spares} />
                  <LedgerRow label="Splits relevés" value={bwt.splitsMade} />
                  <LedgerRow label="Plus longue série de strikes" value={bwt.bestRun} />
                  <LedgerRow label="Boules dans la rigole" value={bwt.gutters} />
                  <LedgerRow label="Points de pronostics" value={bwt.seer} />
                </dl>
              </section>
            )}

            {showBillard && (
              <section className="carnet panel">
                <h2>Le tapis vert</h2>
                <p className="carnet-summary">
                  {billard.played === 0
                    ? "Aucune partie de billard pour l'instant."
                    : `${billard.played} partie${billard.played > 1 ? "s" : ""}, ${billard.won} gagnée${billard.won > 1 ? "s" : ""}.`}
                </p>
                <dl className="ledger">
                  <LedgerRow label="Billes rentrées et points marqués" value={blt.pots} strong />
                  <LedgerRow label="Coups joués" value={blt.shots} />
                  <LedgerRow label="Manches gagnées sur la dernière bille" value={blt.racks} />
                  <LedgerRow label="Plus longue série" value={blt.bestRun} />
                  <LedgerRow label="Billes rentrées par la bande" value={blt.banks} />
                  <LedgerRow label="Casses et files" value={blt.breakRuns} />
                  <LedgerRow label="Carambolages à trois bandes" value={blt.threeRails} />
                  <LedgerRow label="Fautes" value={blt.fouls} />
                </dl>
              </section>
            )}

            {showTour && (
              <section className="carnet panel">
                <h2>Les tournées</h2>
                <p className="carnet-summary">
                  {tour.played === 0
                    ? "Aucune tournée terminée pour l'instant."
                    : `${tour.played} tournée${tour.played > 1 ? "s" : ""}, ${tour.won} gagnée${tour.won > 1 ? "s" : ""}.`}
                </p>
                <dl className="ledger">
                  <LedgerRow label="Points marqués en tournée" value={tour.points} strong />
                  <LedgerRow label="Jeux joués en tournée" value={tt.games} />
                  <LedgerRow label="Jeux gagnés en tournée" value={tt.gameWins} />
                  <LedgerRow label="Podiums" value={tt.podiums} />
                  <LedgerRow label="Titres reçus" value={tt.titles} />
                  <LedgerRow label="Meilleur total" value={tt.bestPoints} unit=" pts" />
                </dl>
              </section>
            )}
          </div>

          <section className="achievements">
            <h2>
              Succès{" "}
              <span className="hint num">
                {shelfList.filter((a) => owned.has(a.id)).length} sur {shelfList.length}
                {shelfGames.length > 1 && ` · ${allOwned} sur ${allShelves.length} en tout`}
              </span>
            </h2>
            {shelfGames.length > 1 && (
              <Options<TableGame>
                label="Succès de quel jeu"
                value={shelfGame}
                onChange={setShelf}
                options={shelfGames.map((g) => ({ value: g, label: g === "tour" ? "Tournée" : TABLE_NAMES[g] }))}
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
                        {a.goal !== undefined && (
                          <span className="album-progress achievement-progress" aria-label={`${playedOn(shelfGame)} sur ${a.goal}`}>
                            <span className="album-bar">
                              <i style={{ width: `${Math.min(100, (playedOn(shelfGame) / a.goal) * 100)}%` }} />
                            </span>
                            {/* Le compte y est déjà (succès venu après) : il tombe à la fin de la prochaine partie */}
                            <span className="num">
                              {playedOn(shelfGame) >= a.goal ? "à la prochaine partie" : `${playedOn(shelfGame)} / ${a.goal}`}
                            </span>
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>

        {profile.tours.length > 0 && (
          <section className="home-list history">
            <h2>Dernières tournées</h2>
            <ul className="rows">
              {profile.tours.map((t) => (
                <li key={t.id} className={`row ${t.rank === 1 ? "is-win" : ""}`}>
                  <span className="history-rank num">{t.rank}</span>
                  <span className="row-text">
                    <strong>
                      {t.rank === 1 ? "Tournée gagnée" : `${t.rank}e sur ${t.players}`}, {t.games} jeu{t.games > 1 ? "x" : ""}
                    </strong>
                    <span className="hint">
                      {t.wins > 0 ? `${t.wins} jeu${t.wins > 1 ? "x" : ""} gagné${t.wins > 1 ? "s" : ""}, ` : ""}
                      <Link href={`/tournee/${t.id}`}>la feuille de tournée</Link>
                    </span>
                  </span>
                  <span className="history-side">
                    <strong className="history-points num">{t.points} pts</strong>
                    <span className="hint">{timeAgo(t.endedAt)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

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
                      {g.rank === 1 ? "Victoire" : `${g.rank}e sur ${g.players}`}, {tableLabel(g.game, g.variant)}
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

/** « 2 octobre », et « 2 octobre 2025 » pour une autre année */
const dayMonth = (ts: number) =>
  new Date(ts).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    ...(new Date(ts).getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}),
  });

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
