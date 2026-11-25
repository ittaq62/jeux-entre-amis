import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode, type RefObject } from "react";
import { Link, useLocation } from "wouter";
import { ROOM_CODE_LENGTH } from "../../shared/app.ts";
import type { Card } from "../../shared/games/uno/cards.ts";
import {
  GAME_NAMES,
  type FriendEntry,
  type GameId,
  type PresenceRoom,
  type RoomSummary,
  type TableGame,
  type Visibility,
} from "../../shared/protocol.ts";
import { AppHeader } from "../components/AppHeader.tsx";
import { PlayerName } from "../components/AdminBadge.tsx";
import { Avatar } from "../components/Avatar.tsx";
import { CardBack, CardFace, COLOR_HEX } from "../components/Card.tsx";
import { Icon } from "../components/Icon.tsx";
import { StreakChip } from "../components/StreakChip.tsx";
import { Modal } from "../components/ui.tsx";
import { lateJoinTag, presenceText, TableLinks } from "../components/TableLinks.tsx";
import { NavalPreview } from "../naval/NavalPreview.tsx";
import { BricksPreview } from "../bricks/BricksPreview.tsx";
import { CapitalePreview } from "../capitale/CapitalePreview.tsx";
import { MechePreview } from "../meche/MechePreview.tsx";
import { BolidesPreview } from "../bolides/BolidesPreview.tsx";
import { CramponsPreview } from "../crampons/CramponsPreview.tsx";
import { CulbutePreview } from "../culbute/CulbutePreview.tsx";
import { MinigolfPreview } from "../minigolf/MinigolfPreview.tsx";
import { BowlingPreview } from "../bowling/BowlingPreview.tsx";
import { BillardPreview } from "../billard/BillardPreview.tsx";
import { EscarmouchePreview, EscarmoucheTitle } from "../escarmouche/EscarmouchePreview.tsx";
import { HomeAlbum } from "../cards/HomeAlbum.tsx";
import { TourPreview } from "../tour/TourPreview.tsx";
import { api, ApiError } from "../lib/api.ts";
import { tableHref } from "../lib/arrival.ts";
import { ALBUM_SEARCH, HOME_GAMES, matchesGame, searchWords, type HomeGame } from "../lib/homeGames.ts";
import { readRoomCode, roomCodeProblem } from "../lib/roomCode.ts";
import { tableLabel, variantName } from "../lib/variantLabel.ts";
import { toast } from "../lib/toast.ts";
import { usePrefs } from "../stores/prefs.ts";
import { useHub } from "../stores/hub.ts";
import { useSession } from "../stores/session.ts";
import "../styles/banners.css";

// Quelques cartes posees sur le feutre, a cote de la fiche du jeu
const TABLE_CARDS: { card: Card; x: number; y: number; r: number }[] = [
  { card: { id: 1, kind: "number", color: "blue", value: 9 }, x: 0, y: 26, r: -14 },
  { card: { id: 2, kind: "skip", color: "green" }, x: 62, y: 4, r: -4 },
  { card: { id: 3, kind: "wild4", color: null }, x: 128, y: 18, r: 7 },
];

// Puis la partie continue sur la pile, une carte toutes les 3 s : un +2 rouge (l'image fixe), un +2 jaune, un joker qui
// redemande du rouge, et le +2 rouge revient. Chacune part de la pioche, en bas à droite.
const PILE = { x: 70, y: 112 };
const DECK_CENTER = { x: 260, y: 200 };
const PLAYED: { card: Card; dx: number; dy: number; r: number; glow?: string }[] = [
  { card: { id: 4, kind: "draw2", color: "red" }, dx: 0, dy: 0, r: 19 },
  { card: { id: 5, kind: "draw2", color: "yellow" }, dx: 7, dy: -7, r: 9 },
  { card: { id: 6, kind: "wild", color: null }, dx: -3, dy: 3, r: 27, glow: COLOR_HEX.red },
];
const PLAY_EVERY = 3;
const FIRST_PLAY = 0.8;

// Le coin de décor de chaque fiche, et son titre quand il est dessiné. Ses textes sont dans HOME_GAMES : un nouveau jeu, c'est une
// entrée ici et une là-bas.
const LOOK: Record<TableGame, { stage: string; art: () => ReactNode; title?: () => ReactNode }> = {
  tour: { stage: "is-stage", art: () => <TourPreview /> },
  uno: { stage: "", art: () => <TableScatter /> },
  naval: { stage: "is-sea", art: () => <NavalPreview px={290} /> },
  bricks: { stage: "is-lacquer", art: () => <BricksPreview cell={17} /> },
  capitale: { stage: "is-map", art: () => <CapitalePreview px={360} /> },
  meche: { stage: "is-workshop", art: () => <MechePreview /> },
  bolides: { stage: "is-circuit", art: () => <BolidesPreview /> },
  crampons: { stage: "is-pitch", art: () => <CramponsPreview /> },
  culbute: { stage: "is-arena", art: () => <CulbutePreview /> },
  escarmouche: { stage: "is-front", art: () => <EscarmouchePreview />, title: () => <EscarmoucheTitle /> },
  minigolf: { stage: "is-green", art: () => <MinigolfPreview /> },
  bowling: { stage: "is-alley", art: () => <BowlingPreview /> },
  billard: { stage: "is-felt", art: () => <BillardPreview /> },
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
      // Une partie rapide, c'est pour jouer : y compris dans une tournée déjà lancée qui accueille en cours de route
      navigate(tableHref(res.code, "play"));
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
    const problem = roomCodeProblem(value);
    if (problem) return toast({ tone: "danger", title: problem });
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
  // Une table fermée en cours de route se regarde quand on y a un ami : les pseudos assis le disent
  const friendNames = new Set(accepted.map((f) => f.user.pseudo));
  const sortedFriends = accepted.slice().sort((a, b) => Number(b.user.id in online) - Number(a.user.id in online));

  return (
    <div className="felt page">
      <AppHeader />
      <main className="home">
        <div className="home-top">
          <div className="home-hello">
            <h1 className="home-greeting">
              <span className="script-word">{greeting()},</span> {user.pseudo}
            </h1>
            <StreakChip />
          </div>
          <GameSearch value={query} onChange={setQuery} />
        </div>
        <p className="visually-hidden" role="status">
          {searching
            ? found.size === 0
              ? "Aucun jeu trouvé"
              : `${found.size} jeu${found.size > 1 ? "x" : ""} trouvé${found.size > 1 ? "s" : ""}`
            : ""}
        </p>

        {/* Qui est là ce soir : la liste des amis est tout en bas, après les fiches des jeux */}
        {!searching && <FriendsOnline friends={sortedFriends} online={online} />}

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
                    <RoomRow key={room.code} room={room} showGame={games.length > 1} friendNames={friendNames} />
                  ))}
                </ul>
              )}
            </section>

            <section className="home-list" id="tes-amis">
              <h2 tabIndex={-1}>
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
                            <span className="hint">{isOnline ? presenceText(room) : "hors ligne"}</span>
                          </span>
                        </Link>
                        {room && (
                          <span className="row-actions">
                            <TableLinks code={room.code} game={room.game} status={room.status} lateJoin={room.lateJoin} />
                          </span>
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

/**
 * Les amis en ligne, sous le bonjour : leurs visages, qui joue, et « Les voir » qui descend à la liste (avec ses boutons
 * Rejoindre et Regarder). Rien quand personne n'est en ligne.
 */
function FriendsOnline({ friends, online }: { friends: FriendEntry[]; online: Record<string, PresenceRoom | null> }) {
  const here = friends.filter((f) => f.user.id in online);
  if (here.length === 0) return null;
  const playing = here.filter((f) => online[f.user.id]);
  // « 1 à une table et 2 en tournée »
  const inTour = playing.filter((f) => online[f.user.id]?.game === "tour").length;
  const atTable = playing.length - inTour;
  const busy = [atTable > 0 ? `${atTable} à une table` : "", inTour > 0 ? `${inTour} en tournée` : ""].filter(Boolean).join(" et ");
  const first = here[0]!;
  const others = here.length - 1;
  const text =
    others === 0
      ? playing.length > 0
        ? `${first.user.pseudo} est ${presenceText(online[first.user.id])}`
        : `${first.user.pseudo} est en ligne`
      : `${first.user.pseudo} et ${others === 1 ? "un autre ami sont" : `${others} autres amis sont`} en ligne` + (busy ? `, ${busy}` : "");
  return (
    <section className="home-online panel" aria-label="Amis en ligne">
      <span className="home-online-faces" aria-hidden="true">
        {here.slice(0, 5).map((f) => (
          <span key={f.user.id} className="avatar-wrap">
            <Avatar avatar={f.user.avatar} userId={f.user.id} photo={f.user.photo} size={30} />
            <span className={`dot presence-dot ${online[f.user.id] ? "dot-playing" : "dot-online"}`} />
          </span>
        ))}
      </span>
      <p>{text}</p>
      <button
        type="button"
        className="btn btn-sm"
        onClick={() => {
          const list = document.getElementById("tes-amis");
          list?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
          list?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
        }}
      >
        {here.length > 1 ? "Les voir" : "Voir"}
      </button>
    </section>
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

/** Quelques cartes posées sur le feutre, sur la fiche d'UNO, et une partie qui continue sur la pile (en CSS). */
function TableScatter() {
  return (
    <div className="table-scatter">
      {TABLE_CARDS.map(({ card, x, y, r }, i) => (
        <div key={card.id} className="scatter-card is-dealt" style={{ left: x, top: y, "--r": `${r}deg`, "--i": i } as CSSProperties}>
          <CardFace card={card} width={96} />
        </div>
      ))}
      <div className="scatter-card scatter-deck">
        <CardBack width={80} />
      </div>
      {PLAYED.map(({ card, dx, dy, r, glow }, i) => {
        const left = PILE.x + dx;
        const top = PILE.y + dy;
        const style = {
          left,
          top,
          "--r": `${r}deg`,
          "--fx": `${DECK_CENTER.x - (left + 48)}px`,
          "--fy": `${(DECK_CENTER.y - (top + 48 * 1.4)).toFixed(1)}px`,
          "--d": `${FIRST_PLAY + i * PLAY_EVERY}s`,
          ...(glow ? { "--glow": glow } : {}),
        } as CSSProperties;
        return (
          <div key={card.id} className={`scatter-card scatter-play ${i === 0 ? "is-first" : ""}`} style={style}>
            {glow && <span className="scatter-glow" />}
            <div className="scatter-flip">
              <CardFace card={card} width={96} />
              <CardBack width={96} className="scatter-back" />
            </div>
          </div>
        );
      })}
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
  const stage = useRef<HTMLDivElement>(null);
  const motion = useStageMotion(stage);
  return (
    <section hidden={hidden} className={`home-game home-game-${game.id} panel`} aria-label={game.name}>
      <div
        ref={stage}
        className={`game-stage ${look.stage} ${motion === "still" ? "is-still" : motion === "paused" ? "is-paused" : ""}`}
        aria-hidden="true"
      >
        {look.art()}
      </div>
      <div className="game-sheet">
        <h2 className={`game-name is-${game.id}`}>{look.title ? look.title() : game.name}</h2>
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

/**
 * Ce que fait le décor d'une fiche : il bouge quand on le voit ; hors de l'écran, fiche masquée ou page cachée, il s'arrête
 * là où il en est (et reprend sans saut) ; avec « Effets réduits » ou si le système le demande, il montre son image fixe.
 * Les animations sont en CSS (is-paused, is-still dans banners.css) ; celles en SVG (la mer de la bataille navale) suivent ici.
 */
function useStageMotion(stage: RefObject<HTMLDivElement | null>): "live" | "paused" | "still" {
  const reduced = usePrefs((s) => s.reducedEffects);
  const [osReduced, setOsReduced] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [onScreen, setOnScreen] = useState(false);
  const [pageShown, setPageShown] = useState(() => document.visibilityState === "visible");

  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setOsReduced(query.matches);
    query.addEventListener("change", onChange);
    const onVisibility = () => setPageShown(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      query.removeEventListener("change", onChange);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setOnScreen(Boolean(entry?.isIntersecting)), { rootMargin: "80px 0px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [stage]);

  const state = reduced || osReduced ? "still" : onScreen && pageShown ? "live" : "paused";

  useEffect(() => {
    for (const svg of stage.current?.querySelectorAll("svg") ?? []) {
      if (state === "live") svg.unpauseAnimations();
      else svg.pauseAnimations();
      if (state === "still") svg.setCurrentTime(0);
    }
  }, [state, stage]);

  return state;
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
          // Un lien ou un message collé donne son code (« …/salon/ABCD », « Rejoins ma table, code ABCD »)
          onChange={(e) => setCode(readRoomCode(e.target.value))}
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

function RoomRow({ room, showGame, friendNames }: { room: RoomSummary; showGame: boolean; friendNames: Set<string> }) {
  const seats = room.humans + room.bots;
  // Fermée en cours de route, elle ne se regarde que si l'un de ses joueurs est un ami (le serveur décide aussi)
  const links = (
    <span className="row-actions">
      <TableLinks
        code={room.code}
        game={room.game}
        status={room.status}
        lateJoin={room.lateJoin}
        canWatch={room.names.some((n) => friendNames.has(n))}
        joinLabel={room.game === "tour" ? "Rejoindre" : "S'asseoir"}
      />
    </span>
  );
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
            {room.status === "playing" ? ", en cours" : ""} · {lateJoinTag(room.lateJoin)}
          </span>
        </span>
        {links}
      </li>
    );
  }
  const game = room.game as GameId;
  // « Bolides, Le Volcan » ; quand UNO est le seul jeu, sa variante suffit (« classique »)
  const what = showGame ? tableLabel(game, room.variant) : (variantName(game, room.variant) ?? GAME_NAMES[game]);
  return (
    <li className="row">
      <span className="room-code">{room.code}</span>
      <span className="row-text">
        <strong>{room.hostName ? `Table de ${room.hostName}` : "Table ouverte"}</strong>
        <span className="hint">
          {what}, {seats} sur {room.maxPlayers}
          {room.status === "playing" ? ", partie en cours" : ""} · {lateJoinTag(room.lateJoin)}
          <span className="seat-dots" aria-hidden="true">
            {Array.from({ length: room.maxPlayers }, (_, i) => (
              <span key={i} className={i < room.humans ? "is-human" : i < seats ? "is-bot" : ""} />
            ))}
          </span>
        </span>
      </span>
      {links}
    </li>
  );
}
