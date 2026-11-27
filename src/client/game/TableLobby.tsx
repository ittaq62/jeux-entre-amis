import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState, type ReactNode } from "react";
import { JOINS_STARTED, lateJoinHint, maySit } from "../../shared/lateJoin.ts";
import { MIN_PLAYERS, type LobbyClientMessage, type LobbyRoom, type SeatView } from "../../shared/protocol.ts";
import { PlayerName } from "../components/AdminBadge.tsx";
import { Avatar } from "../components/Avatar.tsx";
import { Icon } from "../components/Icon.tsx";
import { ConfirmButton, Modal, Options } from "../components/ui.tsx";
import { toast } from "../lib/toast.ts";
import { FriendButton, FriendsInvite } from "./FriendsInvite.tsx";

export interface TableLobbyProps {
  room: LobbyRoom;
  send: (msg: LobbyClientMessage) => void;
  unread: number;
  onOpenChat: () => void;
  onLeave: () => void;
  onBackToGame?: () => void;
  /** L'onglet « Règles » : l'essentiel des règles du jeu (le tirage au sort, le mode, la fin de partie…) */
  rules: ReactNode;
  /** Le reste des règles, replié sous « Plus de règles » (les places et qui peut venir y sont toujours) */
  moreRules?: ReactNode;
  /** L'onglet « Skin » : ce que le joueur choisit pour lui (pion, dos de cartes, arsenal, tenue…), et ses achats */
  look?: ReactNode;
  /** L'onglet « Comment jouer » : le but du jeu, les touches, l'aide */
  help?: ReactNode;
  /** Les règles en une ligne, à côté du bouton de départ (« Classique · premier à finir · 30 s par tour ») */
  summary?: string;
  /** Titre du partage, par exemple « Viens jouer au UNO » */
  shareTitle: string;
  startLabel: string;
  /** Ce qu'on lit en attendant l'hôte, par exemple « va distribuer les cartes » */
  hostWillStart: string;
  canStart?: boolean;
  startHint?: string;
  /** Précision sous le nom d'un joueur (équipe…) */
  seatNote?: (seat: SeatView, index: number) => string | null;
  /** Bloc propre au jeu sous la liste des joueurs (les équipes de la bataille navale…) */
  aside?: ReactNode;
  /** Le salon d'une tournée plutôt que d'une table : ses mots, et pas de bots */
  kind?: "table" | "tour";
  /** Le vote pour lancer (tournée) : à côté du bouton de l'hôte, à la place de l'attente pour les autres */
  vote?: ReactNode;
  /** Pas de bots à asseoir : l'ordinateur complète déjà les équipes */
  noBots?: boolean;
  /** Boutons en plus dans l'en-tête (la musique de la tournée…) */
  topActions?: ReactNode;
}

type LobbyTab = "rules" | "look" | "help";

/**
 * Le salon d'attente, le même pour tous les jeux et toujours dans le même ordre : en haut les joueurs, « Ajouter un
 * bot » et « Inviter » (le lien, le QR code et les amis en ligne au même endroit) ; dessous trois onglets, « Règles »
 * (l'essentiel, le reste replié), « Skin » et « Comment jouer » ; en bas le départ, avec les règles en une ligne.
 */
export function TableLobby({
  room,
  send,
  unread,
  onOpenChat,
  onLeave,
  onBackToGame,
  rules,
  moreRules,
  look,
  help,
  summary,
  shareTitle,
  startLabel,
  hostWillStart,
  canStart = room.seats.length >= MIN_PLAYERS,
  startHint = "Il faut au moins deux joueurs : ajoute un bot pour commencer tout de suite.",
  seatNote,
  aside,
  noBots = false,
  kind = "table",
  vote,
  topActions,
}: TableLobbyProps) {
  const isHost = room.you.isHost;
  const tour = kind === "tour";
  const [inviteOpen, setInviteOpen] = useState(false);
  const [tab, setTab] = useState<LobbyTab>("rules");
  const [more, setMore] = useState(false);
  const link = `${location.origin}/salon/${room.code}`;
  const emptySeats = Math.max(0, room.settings.maxPlayers - room.seats.length);
  const finished = room.status === "finished";
  const playing = room.status === "playing";
  const seated = room.you.seatId !== null;
  // Une partie lancée ne se rejoint que si l'hôte le permet et que le jeu le sait (Crampons) : le serveur décide aussi
  const canTakeSeat = maySit({ started: playing, lateJoin: Boolean(room.settings.lateJoin), midGame: JOINS_STARTED[room.game] });
  const host = room.seats.find((x) => x.isHost);
  const canAddBot = isHost && emptySeats > 0 && !noBots;
  // Ceux qui sont déjà là, assis ou spectateurs : pas besoin de les inviter
  const here = useMemo(
    () => new Set([...room.seats.map((x) => x.userId), ...room.spectators.map((x) => x.userId)].filter((id): id is string => Boolean(id))),
    [room.seats, room.spectators],
  );
  const tabs: { id: LobbyTab; label: string; icon: "list" | "user" | "info" }[] = [
    { id: "rules", label: "Règles", icon: "list" },
    ...(look ? [{ id: "look" as const, label: "Skin", icon: "user" as const }] : []),
    ...(help ? [{ id: "help" as const, label: "Comment jouer", icon: "info" as const }] : []),
  ];
  // Un onglet qui disparaît (on quitte sa place : plus de look à choisir) ramène aux règles
  const shown: LobbyTab = tabs.some((t) => t.id === tab) ? tab : "rules";

  return (
    <div className="felt page lobby">
      <header className="page-top">
        <button className="btn btn-ghost btn-icon" onClick={onLeave} aria-label={tour ? "Quitter la tournée" : "Quitter la table"}>
          <Icon name="back" />
        </button>
        <h1 className="page-title">
          {tour
            ? host && !isHost
              ? `Tournée de ${host.name}`
              : "Ta tournée"
            : finished
              ? "Fin de partie"
              : host && !isHost
                ? `Table de ${host.name}`
                : "Ta table"}
        </h1>
        <div className="page-top-actions">
          {topActions}
          {room.you.isAdmin && (
            <ConfirmButton className="btn btn-sm btn-danger" confirm="Fermer pour tous ?" onConfirm={() => send({ t: "close" })}>
              {tour ? "Fermer la tournée" : "Fermer la table"}
            </ConfirmButton>
          )}
          <button className="btn btn-ghost btn-icon chat-toggle" onClick={onOpenChat} aria-label="Discussion">
            <Icon name="chat" />
            {unread > 0 && <span className="badge">{unread}</span>}
          </button>
        </div>
      </header>

      <main className="lobby-body">
        <section className="lobby-section panel lobby-players" aria-label={tour ? "Les joueurs" : "Autour de la table"}>
          <div className="lobby-players-head">
            <h2>
              {tour ? "Les joueurs" : "Autour de la table"}
              <span className="hint num">
                {room.seats.length} sur {room.settings.maxPlayers}
              </span>
            </h2>
            <div className="lobby-players-actions">
              {canAddBot && (
                <button className="btn btn-sm" onClick={() => send({ t: "addBot" })}>
                  <Icon name="bot" size={16} /> Ajouter un bot
                </button>
              )}
              <button className="btn btn-sm btn-primary" onClick={() => setInviteOpen(true)}>
                <Icon name="share" size={16} /> Inviter
                <span className="lobby-code" aria-label={`code ${room.code.split("").join(" ")}`}>
                  {room.code}
                </span>
              </button>
            </div>
          </div>
          <ul className="seat-list seat-grid">
            <AnimatePresence initial={false}>
              {room.seats.map((seat, i) => {
                const note = seatNote?.(seat, i);
                return (
                  <motion.li
                    key={seat.id}
                    className="seat-row"
                    // Dans une tournée, les arrivées glissent en place ; les tables gardent leur liste fixe
                    initial={tour ? { opacity: 0, x: -14 } : false}
                    animate={{ opacity: 1, x: 0 }}
                    exit={tour ? { opacity: 0, x: 14, transition: { duration: 0.18 } } : undefined}
                    transition={{ type: "spring", stiffness: 420, damping: 32 }}
                  >
                    <Avatar avatar={seat.avatar} userId={seat.userId} photo={seat.photo} size={40} />
                    <span className="row-text">
                      <strong>
                        <PlayerName name={seat.name} admin={seat.admin} suffix={seat.id === room.you.seatId ? " (toi)" : undefined} />
                      </strong>
                      <span className="hint">
                        {[note, seat.isHost && "hôte", seat.kind === "bot" && "bot", seat.kind === "human" && !seat.connected && "absent"]
                          .filter(Boolean)
                          .join(", ") || " "}
                      </span>
                    </span>
                    <span className="seat-actions">
                      {seat.kind === "human" && seat.userId && seat.userId !== room.you.userId && (
                        <FriendButton userId={seat.userId} pseudo={seat.name} />
                      )}
                      {(isHost || room.you.isAdmin) && seat.id !== room.you.seatId && (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() =>
                            send(seat.kind === "bot" ? { t: "removeSeat", seatId: seat.id } : { t: "kick", userId: seat.userId! })
                          }
                        >
                          {seat.kind === "bot" ? "Retirer" : "Exclure"}
                        </button>
                      )}
                    </span>
                  </motion.li>
                );
              })}
            </AnimatePresence>
            {emptySeats > 0 && (
              <li className="seat-row is-empty">
                <span className="seat-empty-mark" />
                <span className="row-text">{emptySeats === 1 ? "Encore une place libre" : `Encore ${emptySeats} places libres`}</span>
              </li>
            )}
          </ul>
          {!seated &&
            canTakeSeat &&
            (room.seats.length < room.settings.maxPlayers || (tour && room.seats.some((x) => x.kind === "bot"))) && (
              <button className="btn btn-primary btn-block" style={{ marginTop: 14 }} onClick={() => send({ t: "sit" })}>
                {tour ? "Jouer la tournée" : playing ? "Entrer sur le terrain" : "Prendre une place"}
              </button>
            )}
          {!seated && !canTakeSeat && (
            <p className="hint" style={{ marginTop: 12 }}>
              {room.settings.lateJoin
                ? "La partie est lancée : tu la regardes, et tu pourras t'asseoir à la suivante."
                : "La table n'accepte plus personne en cours de route : tu regardes, et tu pourras t'asseoir à la prochaine partie."}
            </p>
          )}
          {room.spectators.length > 0 && (
            <p className="hint" style={{ marginTop: 12 }}>
              {tour ? "Regardent seulement" : "Regardent la partie"} : {room.spectators.map((sp) => sp.name).join(", ")}
            </p>
          )}
        </section>

        {aside}

        <div className="lobby-tabs" role="tablist" aria-label="Le salon">
          {tabs.map((t) => (
            <button
              key={t.id}
              id={`lobby-tab-${t.id}`}
              role="tab"
              type="button"
              className={`lobby-tab ${shown === t.id ? "is-active" : ""}`}
              aria-selected={shown === t.id}
              aria-controls={`lobby-panel-${t.id}`}
              onClick={() => setTab(t.id)}
            >
              <Icon name={t.icon} size={18} /> {t.label}
            </button>
          ))}
        </div>

        {/* Changer d'onglet fait apparaître son contenu en douceur (sauf « Effets réduits ») */}
        <section
          key={shown}
          className="rules-sheet panel lobby-panel rise"
          role="tabpanel"
          id={`lobby-panel-${shown}`}
          aria-labelledby={`lobby-tab-${shown}`}
        >
          {shown === "rules" ? (
            <>
              <RulesHeading room={room} tour={tour} />
              {rules}
              {moreRules && (
                <>
                  <button type="button" className="lobby-more" aria-expanded={more} onClick={() => setMore((m) => !m)}>
                    <Icon name={more ? "chevronUp" : "chevronDown"} size={18} />
                    {more ? "Moins de règles" : "Plus de règles"}
                  </button>
                  {more && <div className="lobby-more-body">{moreRules}</div>}
                </>
              )}
            </>
          ) : shown === "look" ? (
            look
          ) : (
            help
          )}
        </section>
      </main>

      <footer className="lobby-footer">
        {summary && room.status !== "playing" && (
          <p className="lobby-summary">
            <Icon name="list" size={16} /> <span>{summary}</span>
          </p>
        )}
        {onBackToGame && (
          <button className="btn btn-lg" onClick={onBackToGame}>
            Retour à la partie
          </button>
        )}
        {room.status !== "playing" &&
          (isHost ? (
            <div className="lobby-start">
              {vote}
              {!canStart && <span className="hint">{startHint}</span>}
              <button className="btn btn-primary btn-lg" disabled={!canStart} onClick={() => send({ t: "start" })}>
                {finished ? "Rejouer" : startLabel}
              </button>
            </div>
          ) : vote ? (
            <div className="lobby-start">{vote}</div>
          ) : (
            <p className="lobby-wait">
              <span className="spinner" /> {host ? `${host.name} ${hostWillStart}…` : "On attend l'hôte…"}
            </p>
          ))}
      </footer>

      <InviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        code={room.code}
        link={link}
        tour={tour}
        shareTitle={shareTitle}
        here={here}
        visibility={room.settings.visibility}
      />
    </div>
  );
}

/** En-tête de l'onglet des règles : qui les a choisies. */
function RulesHeading({ room, tour }: { room: LobbyRoom; tour: boolean }) {
  const host = room.seats.find((x) => x.isHost);
  return (
    <div>
      <h2>{tour ? "Règles de la tournée" : "Règles de la table"}</h2>
      {!room.you.isHost && (
        <p className="hint" style={{ margin: "4px 0 0" }}>
          Choisies par {host?.name ?? "l'hôte"}.
        </p>
      )}
    </div>
  );
}

/** Nombre de places, ouverture de la table, et ce qu'on peut faire une fois la partie lancée : les mêmes pour tous les jeux. */
export function TableSize({ room, send, max }: { room: LobbyRoom; send: (msg: LobbyClientMessage) => void; max: number }) {
  const isHost = room.you.isHost;
  const late = Boolean(room.settings.lateJoin);
  return (
    <>
      <div className="rules-two">
        <div className="field">
          <span className="field-label">Joueurs au plus</span>
          <div className="stepper">
            <button
              className="btn btn-icon btn-sm"
              disabled={!isHost || room.settings.maxPlayers <= Math.max(MIN_PLAYERS, room.seats.filter((x) => x.kind === "human").length)}
              onClick={() => send({ t: "settings", settings: {}, maxPlayers: room.settings.maxPlayers - 1 })}
              aria-label="Une place de moins"
            >
              −
            </button>
            <strong className="num">{room.settings.maxPlayers}</strong>
            <button
              className="btn btn-icon btn-sm"
              disabled={!isHost || room.settings.maxPlayers >= max}
              onClick={() => send({ t: "settings", settings: {}, maxPlayers: room.settings.maxPlayers + 1 })}
              aria-label="Une place de plus"
            >
              +
            </button>
          </div>
        </div>
        <div className="field">
          <span className="field-label">Qui peut venir</span>
          <Options
            label="Qui peut venir"
            value={room.settings.visibility}
            disabled={!isHost}
            onChange={(visibility) => send({ t: "settings", settings: {}, visibility })}
            options={[
              { value: "private", label: "Mes invités" },
              { value: "public", label: "Tout le monde" },
            ]}
          />
        </div>
      </div>
      <div className="field">
        <span className="field-label">Rejoindre en cours de route</span>
        <Options<"yes" | "no">
          label="Rejoindre en cours de route"
          value={late ? "yes" : "no"}
          disabled={!isHost}
          onChange={(v) => send({ t: "settings", settings: {}, lateJoin: v === "yes" })}
          options={[
            { value: "yes", label: "Oui" },
            { value: "no", label: "Non" },
          ]}
        />
        <p className="hint" style={{ margin: 0 }}>
          {lateJoinHint(room.game, late)}
        </p>
      </div>
    </>
  );
}

/** Inviter, au même endroit : le code de la table, le lien à envoyer ou copier, le QR code, et les amis en ligne */
function InviteModal({
  open,
  onClose,
  code,
  link,
  tour,
  shareTitle,
  here,
  visibility,
}: {
  open: boolean;
  onClose: () => void;
  code: string;
  link: string;
  tour: boolean;
  shareTitle: string;
  here: Set<string>;
  visibility: string;
}) {
  const [qr, setQr] = useState<string | null>(null);
  if (open && !qr) {
    void import("qrcode").then((QRCode) =>
      QRCode.toDataURL(link, { margin: 1, width: 360, color: { dark: "#1d1b18", light: "#f2ecdf" } }).then(setQr),
    );
  }
  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title: shareTitle, text: `Rejoins ma ${tour ? "tournée" : "table"}, code ${code}`, url: link });
      } else {
        await navigator.clipboard.writeText(link);
        toast({ title: "Lien copié", body: "Colle-le sur Discord pour inviter tes amis." });
      }
    } catch {
      // partage annulé
    }
  }
  return (
    <Modal open={open} onClose={onClose} title={tour ? "Inviter à la tournée" : "Inviter à la table"} wide>
      <div className="invite-modal">
        <div className="invite-top">
          <div className="ticket-wrap">
            <div className="ticket">
              <span className="ticket-label">
                <strong>{tour ? "Tournée" : "Table"}</strong>
                {visibility === "public" ? "ouverte à tous" : "entre amis"}
              </span>
              <span className="ticket-code" aria-label={`Code ${code.split("").join(" ")}`}>
                {code}
              </span>
            </div>
          </div>
          <div className="invite-actions">
            <button className="btn btn-primary" onClick={() => void share()}>
              <Icon name="share" size={16} /> Envoyer le lien
            </button>
            <button
              className="btn"
              onClick={() => {
                void navigator.clipboard.writeText(link).then(() => toast({ title: "Lien copié" }));
              }}
            >
              <Icon name="copy" size={16} /> Copier le lien
            </button>
          </div>
        </div>
        <div className="invite-bottom">
          <div className="invite-qr-box">
            {qr ? <img src={qr} alt={`QR code de la table ${code}`} className="invite-qr" /> : <span className="invite-qr" />}
            <p className="hint center-text" style={{ margin: 0 }}>
              À scanner avec le téléphone
            </p>
          </div>
          <FriendsInvite code={code} here={here} />
        </div>
      </div>
    </Modal>
  );
}
