import { motion } from "motion/react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { isRoomCode, ROOM_CODE_LENGTH } from "../../shared/app.ts";
import type { Card } from "../../shared/games/uno/cards.ts";
import { GAME_NAMES, type GameId, type RoomSummary, type TableGame, type Visibility } from "../../shared/protocol.ts";
import { AppHeader } from "../components/AppHeader.tsx";
import { PlayerName } from "../components/AdminBadge.tsx";
import { Avatar } from "../components/Avatar.tsx";
import { CardBack, CardFace } from "../components/Card.tsx";
import { Icon } from "../components/Icon.tsx";
import { Modal } from "../components/ui.tsx";
import { NavalPreview } from "../naval/NavalPreview.tsx";
import { BricksPreview } from "../bricks/BricksPreview.tsx";
import { CapitalePreview } from "../capitale/CapitalePreview.tsx";
import { MechePreview } from "../meche/MechePreview.tsx";
import { BolidesPreview } from "../bolides/BolidesPreview.tsx";
import { CramponsPreview } from "../crampons/CramponsPreview.tsx";
import { HomeAlbum } from "../cards/HomeAlbum.tsx";
import { TourPreview } from "../tour/TourPreview.tsx";
import { api, ApiError } from "../lib/api.ts";
import { ALBUM_SEARCH, HOME_GAMES, matchesGame, searchWords, type HomeGame } from "../lib/homeGames.ts";
import { toast } from "../lib/toast.ts";
import { useHub } from "../stores/hub.ts";
import { useSession } from "../stores/session.ts";

// Quelques cartes posees sur le feutre, a cote de la fiche du jeu
const TABLE_CARDS: { card: Card; x: number; y: number; r: number }[] = [
  { card: { id: 1, kind: "number", color: "blue", value: 9 }, x: 0, y: 26, r: -14 },
  { card: { id: 2, kind: "skip", color: "green" }, x: 62, y: 4, r: -4 },
  { card: { id: 3, kind: "wild4", color: null }, x: 128, y: 18, r: 7 },
  { card: { id: 4, kind: "draw2", color: "red" }, x: 70, y: 112, r: 19 },
];

// Le coin de décor de chaque fiche. Ses textes sont dans HOME_GAMES : un nouveau jeu, c'est une entrée ici et une là-bas.
const LOOK: Record<TableGame, { stage: string; art: () => ReactNode }> = {
  tour: { stage: "is-stage", art: () => <TourPreview /> },
  uno: { stage: "", art: () => <TableScatter /> },
  naval: { stage: "is-sea", art: () => <NavalPreview px={250} /> },
  bricks: { stage: "is-lacquer", art: () => <BricksPreview cell={17} /> },
  capitale: { stage: "is-map", art: () => <CapitalePreview px={360} /> },
  meche: { stage: "is-workshop", art: () => <MechePreview /> },
  bolides: { stage: "is-circuit", art: () => <BolidesPreview /> },
  crampons: { stage: "is-pitch", art: () => <CramponsPreview /> },
};

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Encore debout";
  if (h < 18) return "Bonjour";
  return "Bonsoir";
}

export function HomePage() {
  const user = useSession((s) => s.user)!;
  const [, navigate] = useLocation();
  const lobby = useHub((s) => s.lobby);
  const watchLobby = useHub((s) => s.watchLobby);
  const friends = useHub((s) => s.friends);
  const online = useHub((s) => s.online);
  const games = useSession((s) => s.games);
  const beta = useSession((s) => s.beta);
  const tourOn = useSession((s) => s.tour);
  const [createFor, setCreateFor] = useState<TableGame | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    watchLobby(true);
    return () => watchLobby(false);
  }, [watchLobby]);

  async function quickMatch(game: TableGame) {
    setBusy(`quick-${game}`);
    try {
      const res =
        game === "tour"
          ? await api.post<{ code: string; created: boolean }>("/tours/quick")
          : await api.post<{ code: string; created: boolean }>("/rooms/quick", { game });
      navigate(`/salon/${res.code}`);
    } catch (err) {
      toast({ tone: "danger", title: err instanceof ApiError ? err.message : "Impossible de trouver une partie." });
      setBusy(null);
    }
  }

  async function createRoom(visibility: Visibility) {
    setBusy(visibility);
    try {
      const res =
        createFor === "tour"
          ? await api.post<{ code: string }>("/tours", { visibility })
          : await api.post<{ code: string }>("/rooms", { visibility, game: createFor ?? "uno" });
      navigate(`/salon/${res.code}`);
    } catch (err) {
      toast({ tone: "danger", title: err instanceof ApiError ? err.message : "Impossible d'ouvrir la table." });
      setBusy(null);
    }
  }

  // Le code mène à la bonne table quel que soit le jeu : la salle sait à quoi on y joue
  async function join(value: string) {
    if (!isRoomCode(value)) return toast({ tone: "danger", title: "Un code de table fait 4 lettres." });
    setBusy("join");
    try {
      await api.get(`/rooms/${value}`);
      navigate(`/salon/${value}`);
    } catch (err) {
      toast({ tone: "danger", title: err instanceof ApiError ? err.message : "Table introuvable." });
      setBusy(null);
    }
  }

  const terms = searchWords(query);
  const searching = terms.length > 0;
  const available = HOME_GAMES.filter((g) => (g.id === "tour" ? tourOn : g.id === "uno" || games.includes(g.id)));
  const found = new Set(available.filter((g) => matchesGame(g, terms)).map((g) => g.id));
  const albumShown = matchesGame(ALBUM_SEARCH, terms);
  const nothing = found.size === 0 && !albumShown;
  // Quand on cherche un jeu, les tables ouvertes se limitent à lui
  const rooms = lobby.filter((r) => (r.game === "tour" ? tourOn : games.includes(r.game)) && (!searching || found.has(r.game)));
  const accepted = friends.filter((f) => f.status === "accepted");
  const sortedFriends = accepted.slice().sort((a, b) => Number(b.user.id in online) - Number(a.user.id in online));

  return (
    <div className="felt page">
      <AppHeader />
      <main className="home">
        <div className="home-top">
          <h1 className="home-greeting">
            <span className="script-word">{greeting()},</span> {user.pseudo}
          </h1>
          <GameSearch value={query} onChange={setQuery} />
        </div>
        <p className="visually-hidden" role="status">
          {searching
            ? found.size === 0
              ? "Aucun jeu trouvé"
              : `${found.size} jeu${found.size > 1 ? "x" : ""} trouvé${found.size > 1 ? "s" : ""}`
            : ""}
        </p>

        {/* Masqués plutôt que retirés : ce qu'on efface réapparaît aussitôt, sans rejouer les animations */}
        <div hidden={!albumShown}>
          <HomeAlbum />
        </div>

        <div className="home-games">
          {available.map((game) => (
            <GameSheet
              key={game.id}
              game={game}
              hidden={!found.has(game.id)}
              isBeta={beta.includes(game.id)}
              busy={busy}
              onQuick={(id) => void quickMatch(id)}
              onCreate={setCreateFor}
              onJoin={(code) => void join(code)}
            />
          ))}
          {nothing && (
            <div className="home-no-game panel">
              <p>Aucun jeu ne correspond à « {query.trim()} ».</p>
              <button className="btn" onClick={() => setQuery("")}>
                Voir tous les jeux
              </button>
            </div>
          )}
        </div>

        {!nothing && (
          <div className="home-columns">
            <section className="home-list">
              <h2>Tables ouvertes</h2>
              {rooms.length === 0 ? (
                <p className="empty">
                  Personne n'attend pour l'instant. Lance une partie rapide : les prochains arrivés s'assoiront avec toi.
                </p>
              ) : (
                <ul className="rows">
                  {rooms.map((room) => (
                    <RoomRow key={room.code} room={room} showGame={games.length > 1} />
                  ))}
                </ul>
              )}
            </section>

            <section className="home-list">
              <h2>
                Tes amis{" "}
                <Link href="/amis" className="heading-link">
                  gérer
                </Link>
              </h2>
              {sortedFriends.length === 0 ? (
                <p className="empty">
                  Pas encore d'amis ici. <Link href="/amis">Cherche leur pseudo</Link> pour les voir en ligne et les inviter.
                </p>
              ) : (
                <ul className="rows">
                  {sortedFriends.slice(0, 8).map((f) => {
                    const isOnline = f.user.id in online;
                    const room = online[f.user.id];
                    return (
                      <li key={f.user.id} className="row">
                        <Link href={`/joueur/${encodeURIComponent(f.user.pseudo)}`} className="row-who">
                          <span className="avatar-wrap">
                            <Avatar avatar={f.user.avatar} userId={f.user.id} photo={f.user.photo} size={36} />
                            <span className={`dot presence-dot ${isOnline ? (room ? "dot-playing" : "dot-online") : ""}`} />
                          </span>
                          <span className="row-text">
                            <strong>
                              <PlayerName name={f.user.pseudo} admin={f.user.admin} />
                            </strong>
                            <span className="hint">
                              {!isOnline
                                ? "hors ligne"
                                : room
                                  ? room.status === "playing"
                                    ? "en pleine partie"
                                    : "à une table"
                                  : "en ligne"}
                            </span>
                          </span>
                        </Link>
                        {room && (
                          <Link href={`/salon/${room.code}`} className="btn btn-sm">
                            {room.status === "playing" ? "Regarder" : "Rejoindre"}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        )}
      </main>

      <Modal
        open={createFor !== null}
        onClose={() => setCreateFor(null)}
        title={HOME_GAMES.find((g) => g.id === createFor)?.modal ?? "Ouvrir une table"}
      >
        <div className="create-options">
          <button className="create-option" onClick={() => void createRoom("private")} disabled={busy !== null}>
            <strong>Entre amis</strong>
            <span>
              {createFor === "tour"
                ? "Seuls ceux qui ont le code ou le lien peuvent rejoindre la tournée."
                : "Seuls ceux qui ont le code ou le lien peuvent s'asseoir."}
            </span>
          </button>
          <button className="create-option" onClick={() => void createRoom("public")} disabled={busy !== null}>
            <strong>Ouverte à tous</strong>
            <span>
              {createFor === "tour"
                ? "La tournée apparaît dans la liste : n'importe qui peut la rejoindre, même entre deux jeux."
                : "La table apparaît dans la liste : n'importe quel joueur peut venir."}
            </span>
          </button>
        </div>
      </Modal>
    </div>
  );
}

/** La barre de recherche : elle filtre les fiches à chaque lettre. */
function GameSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <form
      className="home-search"
      role="search"
      onSubmit={(e) => {
        // « Entrée » range le clavier du téléphone, qui cachait les résultats
        e.preventDefault();
        input.current?.blur();
      }}
    >
      <Icon name="search" size={20} aria-hidden="true" />
      <input
        ref={input}
        className="input"
        type="search"
        enterKeyHint="search"
        aria-label="Chercher un jeu"
        placeholder="Chercher un jeu : cartes, course, à 8…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onChange("");
        }}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
      />
      {value && (
        <button
          type="button"
          className="home-search-clear"
          aria-label="Effacer la recherche"
          onClick={() => {
            onChange("");
            input.current?.focus();
          }}
        >
          <Icon name="close" size={18} aria-hidden="true" />
        </button>
      )}
    </form>
  );
}

/** Quelques cartes posées sur le feutre, sur la fiche d'UNO. */
function TableScatter() {
  return (
    <div className="table-scatter">
      {TABLE_CARDS.map(({ card, x, y, r }, i) => (
        <motion.div
          key={card.id}
          className="scatter-card"
          style={{ left: x, top: y }}
          initial={{ opacity: 0, y: -18, rotate: r - 10 }}
          animate={{ opacity: 1, y: 0, rotate: r }}
          transition={{ delay: 0.08 * i, duration: 0.45, ease: [0.2, 0.8, 0.3, 1] }}
        >
          <CardFace card={card} width={96} />
        </motion.div>
      ))}
      <motion.div
        className="scatter-card scatter-deck"
        initial={{ opacity: 0, x: 30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.4, duration: 0.45, ease: [0.2, 0.8, 0.3, 1] }}
      >
        <CardBack width={80} />
      </motion.div>
    </div>
  );
}

/** La fiche d'un jeu : son décor, à quoi on y joue, et de quoi s'asseoir. */
function GameSheet({
  game,
  hidden,
  isBeta,
  busy,
  onQuick,
  onCreate,
  onJoin,
}: {
  game: HomeGame;
  hidden: boolean;
  isBeta: boolean;
  busy: string | null;
  onQuick: (game: TableGame) => void;
  onCreate: (game: TableGame) => void;
  onJoin: (code: string) => void;
}) {
  const look = LOOK[game.id];
  return (
    <section hidden={hidden} className={`home-game home-game-${game.id} panel`} aria-label={game.name}>
      <div className={`game-stage ${look.stage}`} aria-hidden="true">
        {look.art()}
      </div>
      <div className="game-sheet">
        <h2 className={`game-name is-${game.id}`}>{game.name}</h2>
        {isBeta && (
          <p className="beta-note">
            <span className="beta-tag">Bêta</span> Visible seulement pour toi et tes invités, tant que tu ne l'ouvres pas à tous depuis la
            page Admin.
          </p>
        )}
        <p className="game-desc">{game.desc}</p>
        <div className="game-actions">
          <button className="btn btn-primary btn-lg" onClick={() => onQuick(game.id)} disabled={busy !== null}>
            {busy === `quick-${game.id}` && <span className="spinner" />} {game.quick}
          </button>
          <button className="btn btn-lg" onClick={() => onCreate(game.id)} disabled={busy !== null}>
            {game.open}
          </button>
        </div>
        <JoinCode id={`join-code-${game.id}`} busy={busy !== null} onJoin={onJoin} />
      </div>
    </section>
  );
}

/** « Un ami t'a donné un code ? » : le même champ sur la fiche de chaque jeu. */
function JoinCode({ id, busy, onJoin }: { id: string; busy: boolean; onJoin: (code: string) => void }) {
  const [code, setCode] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    onJoin(code.trim().toUpperCase());
  }
  return (
    <form className="join-code" onSubmit={submit}>
      <label className="join-label" htmlFor={id}>
        Un ami t'a donné un code ?
      </label>
      <div className="join-row">
        <input
          id={id}
          className="input join-input"
          value={code}
          onChange={(e) =>
            setCode(
              e.target.value
                .toUpperCase()
                .replace(/[^A-Z]/g, "")
                .slice(0, ROOM_CODE_LENGTH),
            )
          }
          placeholder="ABCD"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
        />
        <button className="btn" disabled={code.length !== ROOM_CODE_LENGTH || busy}>
          Rejoindre
        </button>
      </div>
    </form>
  );
}

const NAVAL_MODES: Record<string, string> = {
  duel: "duel",
  melee: "mêlée",
  teams: "en équipes",
  sprint: "solo 40 lignes",
  commune: "mèche classique",
  rallonge: "mèche à rallonge",
  chacun: "chacun sa mèche",
  port: "au Port",
  vignes: "aux Vignes",
  col: "au Col",
  hasard: "circuit au hasard",
  "5": "5 contre 5",
  "7": "7 contre 7",
  "11": "11 contre 11",
};

function RoomRow({ room, showGame }: { room: RoomSummary; showGame: boolean }) {
  const seats = room.humans + room.bots;
  if (room.game === "tour") {
    const programme = room.variant
      .split(",")
      .filter((g): g is GameId => g in GAME_NAMES)
      .map((g) => GAME_NAMES[g])
      .join(", ");
    return (
      <li className="row">
        <span className="room-code">{room.code}</span>
        <span className="row-text">
          <strong>{room.hostName ? `Tournée de ${room.hostName}` : "Tournée ouverte"}</strong>
          <span className="hint">
            {programme}, {room.humans + room.bots} sur {room.maxPlayers}
            {room.status === "playing" ? ", en cours" : ""}
          </span>
        </span>
        <Link href={`/salon/${room.code}`} className="btn btn-sm">
          Rejoindre
        </Link>
      </li>
    );
  }
  const variant = room.game !== "uno" ? (NAVAL_MODES[room.variant] ?? room.variant) : room.variant === "nomercy" ? "No Mercy" : "classique";
  return (
    <li className="row">
      <span className="room-code">{room.code}</span>
      <span className="row-text">
        <strong>{room.hostName ? `Table de ${room.hostName}` : "Table ouverte"}</strong>
        <span className="hint">
          {showGame ? `${GAME_NAMES[room.game as GameId]} ${variant}` : variant}, {seats} sur {room.maxPlayers}
          {room.status === "playing" ? ", partie en cours" : ""}
          <span className="seat-dots" aria-hidden="true">
            {Array.from({ length: room.maxPlayers }, (_, i) => (
              <span key={i} className={i < room.humans ? "is-human" : i < seats ? "is-bot" : ""} />
            ))}
          </span>
        </span>
      </span>
      <Link href={`/salon/${room.code}`} className="btn btn-sm">
        {room.status === "playing" ? "Regarder" : "S'asseoir"}
      </Link>
    </li>
  );
}
