import type { LobbyRoom, SeatView } from "../../shared/protocol.ts";
import { Avatar } from "../components/Avatar.tsx";

export const crewsOf = (seats: SeatView[]) => [0, 1].map((t) => seats.filter((seat) => (seat.team ?? 0) === t));

interface Props {
  room: LobbyRoom;
  send: (msg: { t: "team"; seatId: string; team: 0 | 1 }) => void;
  /** Noms des deux équipes, et leurs couleurs */
  names: readonly [string, string];
  colors: readonly [string, string];
}

/** Deux équipes face à face : chacun choisit la sienne, l'hôte peut placer les bots et les autres joueurs. */
export function TeamsPanel({ room, send, names, colors }: Props) {
  const me = room.seats.find((seat) => seat.id === room.you.seatId);
  const crews = crewsOf(room.seats);
  return (
    <section
      className="lobby-section panel teams-panel"
      aria-label="Les équipes"
      style={{ ["--team-a" as string]: colors[0], ["--team-b" as string]: colors[1] }}
    >
      <h2>
        Les équipes <span className="hint">deux contre deux</span>
      </h2>
      <div className="teams-grid">
        {([0, 1] as const).map((t) => {
          const other = t === 0 ? 1 : 0;
          return (
            <div key={t} className={`team-col ${t === 0 ? "is-a" : "is-b"}`}>
              <h3 className="team-name">{names[t]}</h3>
              <ul className="team-crew">
                {crews[t]!.map((seat) => (
                  <li key={seat.id}>
                    <Avatar avatar={seat.avatar} userId={seat.userId} photo={seat.photo} size={30} />
                    <span className="team-member">
                      {seat.name}
                      {seat.id === me?.id && <span className="hint"> (toi)</span>}
                    </span>
                    {room.you.isHost && seat.id !== me?.id && (
                      <button
                        className="btn btn-ghost btn-sm team-move"
                        onClick={() => send({ t: "team", seatId: seat.id, team: other })}
                        aria-label={`Envoyer ${seat.name} à ${names[other]}`}
                      >
                        {/* La flèche montre l'autre colonne : à côté sur grand écran, dessous ou dessus sur téléphone */}
                        <span className="arrow-side">{t === 0 ? "→" : "←"}</span>
                        <span className="arrow-stack">{t === 0 ? "↓" : "↑"}</span>
                      </button>
                    )}
                  </li>
                ))}
                {Array.from({ length: Math.max(0, 2 - crews[t]!.length) }, (_, i) => (
                  <li key={`libre-${i}`} className="is-empty">
                    <span className="team-empty-mark" />
                    place libre
                  </li>
                ))}
              </ul>
              {me && (me.team ?? 0) !== t && (
                <button className="btn btn-sm btn-block" onClick={() => send({ t: "team", seatId: me.id, team: t })}>
                  Passer à {names[t]}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {room.seats.length === 4 && crews[0]!.length !== 2 && (
        <p className="hint teams-warning">
          C'est {crews[0]!.length} contre {crews[1]!.length} : il faut deux marins de chaque côté pour lever l'ancre.
        </p>
      )}
    </section>
  );
}
