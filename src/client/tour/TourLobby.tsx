import { GAME_NAMES, type LobbyRoom, type SeatView } from "../../shared/protocol.ts";
import {
  END_CHOICES,
  TOUR_BOT_LEVELS,
  fitsGame,
  GAME_SEATS,
  TOUR_GAMES,
  TOUR_MAX_PLAYERS,
  TOUR_POINTS,
  TOUR_TEAM_COLORS,
  TOUR_TEAMS,
  type TourBotLevel,
  type TourClientMessage,
  type TourEnd,
  type TourView,
} from "../../shared/tour.ts";
import { Check, Options } from "../components/ui.tsx";
import { TableLobby, TableSize } from "../game/TableLobby.tsx";
import { TeamsPanel } from "../game/TeamsPanel.tsx";
import { GameTicket } from "./TourParts.tsx";

interface Props {
  view: TourView;
  send: (msg: TourClientMessage) => void;
  unread: number;
  onOpenChat: () => void;
  onLeave: () => void;
}

/** La tournée vue comme une table : les joueurs à la place des sièges, pour le salon d'attente commun */
export function lobbyRoomOf(view: TourView): LobbyRoom {
  const players = view.members.filter((m) => m.role === "player" && !m.left);
  const seats: SeatView[] = players.map((m) => ({
    id: m.userId,
    kind: m.kind,
    userId: m.kind === "bot" ? null : m.userId,
    name: m.name,
    avatar: m.avatar,
    photo: m.photo,
    connected: m.connected,
    autoplay: false,
    isHost: m.isHost,
    admin: m.admin,
    ...(m.team !== null ? { team: m.team } : {}),
  }));
  const watchers = view.members
    .filter((m) => m.role === "spectator" && !m.left && m.connected)
    .map((m) => ({ userId: m.userId, name: m.name }));
  return {
    code: view.code,
    game: "tour",
    status: view.status === "lobby" ? "lobby" : view.status === "finished" ? "finished" : "playing",
    settings: { visibility: view.settings.visibility, maxPlayers: view.settings.maxPlayers },
    seats,
    spectators: [...watchers, ...view.spectators],
    you: {
      userId: view.you.userId,
      seatId: view.you.role === "player" ? view.you.userId : null,
      isHost: view.you.isHost,
      isAdmin: view.you.isAdmin,
    },
  };
}

const END_KINDS: { value: TourEnd["kind"]; label: string }[] = [
  { value: "games", label: "Nombre de jeux" },
  { value: "score", label: "Premier à un score" },
  { value: "time", label: "Durée" },
  { value: "endless", label: "Sans fin" },
];

/** La valeur proposée par défaut quand l'hôte change de façon de finir */
function endOf(kind: TourEnd["kind"]): TourEnd {
  switch (kind) {
    case "games":
      return { kind, count: 5 };
    case "score":
      return { kind, target: 50 };
    case "time":
      return { kind, minutes: 60 };
    case "endless":
      return { kind };
  }
}

export function TourLobby({ view, send, unread, onOpenChat, onLeave }: Props) {
  const room = lobbyRoomOf(view);
  const isHost = view.you.isHost;
  const s = view.settings;
  const present = room.seats.filter((x) => x.connected);
  const count = present.length;
  const humans = present.filter((x) => x.kind === "human").length;
  const bots = room.seats.filter((x) => x.kind === "bot").length;
  const fitting = s.games.filter((g) => fitsGame(g, Math.max(2, count)));
  const red = present.filter((x) => x.team === 0).length;
  const teamsOk = !s.teams || (red > 0 && red * 2 === count);
  const canStart = count >= 2 && humans > 0 && fitting.length > 0 && teamsOk;
  const startHint =
    count < 2
      ? "Il faut au moins deux joueurs : envoie le lien à tes amis ou ajoute un bot."
      : humans === 0
        ? "Il faut au moins un vrai joueur dans la tournée."
        : fitting.length === 0
          ? `Aucun jeu coché n'accueille ${count} joueurs.`
          : !teamsOk
            ? `Il faut deux équipes de même taille : c'est ${red} contre ${count - red}.`
            : undefined;
  const update = (settings: Extract<TourClientMessage, { t: "settings" }>["settings"]) => send({ t: "settings", settings });

  const toggleGame = (game: (typeof TOUR_GAMES)[number]) => {
    if (!isHost) return;
    const on = s.games.includes(game);
    if (on && s.games.length === 1) return;
    update({ games: on ? s.games.filter((g) => g !== game) : [...s.games, game] });
  };

  const end = s.end;
  const endValues =
    end.kind === "games"
      ? END_CHOICES.games.map((v) => ({ value: v, label: `${v} jeux` }))
      : end.kind === "score"
        ? END_CHOICES.score.map((v) => ({ value: v, label: `${v} points` }))
        : end.kind === "time"
          ? END_CHOICES.time.map((v) => ({ value: v, label: `${v} min` }))
          : [];
  const endValue = end.kind === "games" ? end.count : end.kind === "score" ? end.target : end.kind === "time" ? end.minutes : 0;

  return (
    <TableLobby
      kind="tour"
      room={room}
      send={(msg) => send(msg)}
      unread={unread}
      onOpenChat={onOpenChat}
      onLeave={onLeave}
      shareTitle="Viens faire une tournée"
      startLabel="Lancer la tournée"
      hostWillStart="va lancer la tournée"
      canStart={canStart}
      startHint={startHint}
      seatNote={(seat) => (s.teams && seat.team !== undefined ? TOUR_TEAMS[seat.team] : null)}
      aside={
        <>
          {s.teams && room.seats.length > 0 && (
            <TeamsPanel room={room} send={(msg) => send(msg)} names={TOUR_TEAMS} colors={TOUR_TEAM_COLORS} />
          )}
          {view.you.member && (
            <div className="tour-role">
              {view.you.role === "player" ? (
                <button className="btn btn-ghost btn-sm" onClick={() => send({ t: "watch" })}>
                  Je préfère regarder
                </button>
              ) : null}
            </div>
          )}
        </>
      }
      rules={
        <section className="rules-sheet panel tour-rules">
          <div>
            <h2>Règles de la tournée</h2>
            {!isHost && (
              <p className="hint" style={{ margin: "4px 0 0" }}>
                Choisies par {room.seats.find((x) => x.isHost)?.name ?? "l'hôte"}.
              </p>
            )}
          </div>

          <div className="field">
            <span className="field-label">Au programme</span>
            <div className="tour-games">
              {TOUR_GAMES.map((game) => {
                const on = s.games.includes(game);
                const room4 = fitsGame(game, Math.max(2, count));
                return (
                  <button
                    key={game}
                    type="button"
                    className={`tour-game-pick ${on ? "is-on" : ""} ${room4 ? "" : "is-full"}`}
                    aria-pressed={on}
                    disabled={!isHost}
                    onClick={() => toggleGame(game)}
                  >
                    <GameTicket game={game} size="sm" dim={!on} off={on && !room4} />
                    <span className="tour-game-text">
                      <strong>{GAME_NAMES[game]}</strong>
                      <span className="hint">
                        {room4
                          ? `${GAME_SEATS[game].min} à ${GAME_SEATS[game].max} joueurs`
                          : `${GAME_SEATS[game].max} joueurs au plus : il sera passé`}
                      </span>
                    </span>
                    <Check label={GAME_NAMES[game]} checked={on} disabled={!isHost} onChange={() => {}} />
                  </button>
                );
              })}
            </div>
            <div className="rule-list">
              <div className="rule-row" onClick={() => isHost && update({ once: !s.once })}>
                <Check label="Chaque jeu une seule fois" checked={s.once} disabled={!isHost} onChange={() => {}} />
                <span>
                  <strong>Chaque jeu une seule fois</strong>
                  <span className="hint">
                    {s.once
                      ? `Un jeu joué ne revient plus : la tournée s'arrête quand les ${s.games.length > 1 ? `${s.games.length} jeux cochés ont` : "jeux cochés ont"} tous été joués.`
                      : "Sinon, un jeu peut revenir, mais jamais deux fois de suite."}
                  </span>
                </span>
              </div>
            </div>
            <p className="hint" style={{ margin: 0 }}>
              Les jeux cochés sortent au hasard. Chacun se joue avec ses règles habituelles.
            </p>
          </div>

          <div className="field">
            <span className="field-label">Fin de la tournée</span>
            <Options<TourEnd["kind"]>
              label="Fin de la tournée"
              value={end.kind}
              disabled={!isHost}
              onChange={(k) => update({ end: endOf(k) })}
              options={END_KINDS}
            />
            {endValues.length > 0 && (
              <Options<number>
                label="Combien"
                value={endValue}
                disabled={!isHost}
                onChange={(v) =>
                  update({
                    end:
                      end.kind === "games"
                        ? { kind: "games", count: v }
                        : end.kind === "score"
                          ? { kind: "score", target: v }
                          : { kind: "time", minutes: v },
                  })
                }
                options={endValues}
              />
            )}
            <p className="hint" style={{ margin: 0 }}>
              {end.kind === "games"
                ? s.once && end.count > s.games.length
                  ? `Chaque jeu ne passant qu'une fois, la tournée s'arrêtera après ${s.games.length} jeu${s.games.length > 1 ? "x" : ""}.`
                  : `La tournée s'arrête après ${end.count} jeux.`
                : end.kind === "score"
                  ? `La tournée s'arrête dès qu'un joueur${s.teams ? " (ou une équipe)" : ""} atteint ${end.target} points.`
                  : end.kind === "time"
                    ? `Au bout de ${end.minutes} minutes, le jeu en cours est le dernier.`
                    : "On enchaîne jusqu'à ce que l'hôte arrête la tournée."}
            </p>
          </div>

          <div className="field">
            <span className="field-label">Classement</span>
            <Options<"solo" | "teams">
              label="Classement"
              value={s.teams ? "teams" : "solo"}
              disabled={!isHost}
              onChange={(v) => update({ teams: v === "teams" })}
              options={[
                { value: "solo", label: "Chacun pour soi" },
                { value: "teams", label: "Deux équipes" },
              ]}
            />
            <p className="hint" style={{ margin: 0 }}>
              Points à chaque jeu : {TOUR_POINTS.map((p, i) => `${i + 1}${i === 0 ? "er" : "e"} ${p}`).join(", ")}, puis 1 point.
              {s.teams && ` Les ${TOUR_TEAMS[0]} et les ${TOUR_TEAMS[1]} additionnent les points de leurs joueurs.`}
            </p>
          </div>

          <div className="field">
            <span className="field-label">Niveau des bots</span>
            <Options<TourBotLevel>
              label="Niveau des bots"
              value={s.botLevel}
              disabled={!isHost}
              onChange={(botLevel) => update({ botLevel })}
              options={(Object.keys(TOUR_BOT_LEVELS) as TourBotLevel[]).map((v) => ({ value: v, label: TOUR_BOT_LEVELS[v].label }))}
            />
            <p className="hint" style={{ margin: 0 }}>
              {bots === 0 ? "Ajoute des bots dans la liste des joueurs pour compléter la tournée. " : ""}
              {s.botLevel === "easy"
                ? "Apprenti à Briques, Mousse à la bataille navale."
                : s.botLevel === "normal"
                  ? "Confirmé à Briques, Chasseur à la bataille navale."
                  : "Expert à Briques, Amiral à la bataille navale."}{" "}
              Ils jouent toute la tournée, marquent leurs points comme tout le monde, et cèdent leur place à un ami qui arrive.
            </p>
          </div>

          <TableSize room={room} send={(msg) => send(msg)} max={TOUR_MAX_PLAYERS} />
        </section>
      }
    />
  );
}
