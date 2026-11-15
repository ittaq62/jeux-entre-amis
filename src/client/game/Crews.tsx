import { TABLE_TEAMS, tableTeamName, type TableTeamCount } from "../../shared/games/teams.ts";
import type { LobbyRoom } from "../../shared/protocol.ts";
import { Avatar } from "../components/Avatar.tsx";
import { Options } from "../components/ui.tsx";
import "../styles/tableRules.css";

// Les équipes des tables (UNO, Mèche) : comme à Capitale, une couleur, un nom et une forme par équipe (un rond, un
// triangle, un carré), pour qu'on les distingue même sans voir les couleurs.

export const crewColor = (team: number) => TABLE_TEAMS[team]?.color ?? "#888";
const SHAPES = ["rond", "triangle", "carré"] as const;

/** La forme d'une équipe, à sa couleur, bordée de blanc */
export function CrewMark({ team, size = 14 }: { team: number; size?: number }) {
  const color = crewColor(team);
  const shape = team % 3;
  const label = `${tableTeamName(team)} (${SHAPES[shape]})`;
  return (
    <svg className="crew-mark" width={size} height={size} viewBox="0 0 20 20" role="img" aria-label={label}>
      <title>{label}</title>
      {shape === 0 && <circle cx="10" cy="10" r="7.6" fill={color} stroke="#fff" strokeWidth="2.4" />}
      {shape === 1 && <path d="M10 2.2 L18.2 17 L1.8 17 Z" fill={color} stroke="#fff" strokeWidth="2.2" strokeLinejoin="round" />}
      {shape === 2 && <rect x="2.6" y="2.6" width="14.8" height="14.8" rx="2" fill={color} stroke="#fff" strokeWidth="2.4" />}
    </svg>
  );
}

/** Ce qui manque pour jouer en équipes : autant de joueurs dans chacune, au moins deux ; null si c'est bon */
export function crewProblem(room: LobbyRoom, count: number): string | null {
  if (!count) return null;
  const sizes = Array.from({ length: count }, (_, k) => room.seats.filter((x) => x.team === k).length);
  if (sizes.every((n) => n === sizes[0]) && (sizes[0] ?? 0) >= 2) return null;
  return `En équipes, il faut au moins deux joueurs par équipe, autant dans chacune : c'est ${sizes.join(" contre ")} pour l'instant.`;
}

/** Le choix du nombre d'équipes, et ce qu'il veut dire pour la table */
export function CrewCountField({
  count,
  max,
  disabled,
  onChange,
  win,
}: {
  count: number;
  /** Places au plus du jeu */
  max: number;
  disabled: boolean;
  onChange: (teamCount: TableTeamCount) => void;
  /** Comment on gagne ensemble, à ce jeu */
  win: string;
}) {
  const sizes = max >= 8 ? "2 contre 2, 3 contre 3 ou 4 contre 4" : "2 contre 2 ou 3 contre 3";
  return (
    <div className="field">
      <span className="field-label">Équipes</span>
      <Options<TableTeamCount>
        label="Équipes"
        value={count as TableTeamCount}
        disabled={disabled}
        onChange={onChange}
        options={[
          { value: 0, label: "Chacun pour soi" },
          { value: 2, label: "2 équipes" },
          { value: 3, label: "3 équipes" },
        ]}
      />
      <p className="hint" style={{ margin: 0 }}>
        {count === 0
          ? `Chacun joue pour lui. En équipes : ${sizes}, ou trois équipes de deux.`
          : `${count === 2 ? `Deux équipes de même taille : ${sizes}.` : "Trois équipes de deux : il faut six joueurs."} ${win}`}
      </p>
    </div>
  );
}

/** Les équipes du salon : chacun choisit la sienne, l'hôte place aussi les bots et les autres joueurs */
export function CrewsPanel({
  room,
  send,
  count,
}: {
  room: LobbyRoom;
  send: (msg: { t: "team"; seatId: string; team: number }) => void;
  count: number;
}) {
  const me = room.seats.find((seat) => seat.id === room.you.seatId);
  const size = Math.max(2, Math.ceil(room.settings.maxPlayers / count));
  const sizeLabel =
    count === 3 ? "trois équipes de deux" : size >= 4 ? "quatre contre quatre" : size === 3 ? "trois contre trois" : "deux contre deux";
  return (
    <section className="lobby-section panel teams-panel crews-panel" aria-label="Les équipes">
      <h2>
        Les équipes <span className="hint">{sizeLabel}</span>
      </h2>
      <div className={`teams-grid crews-grid is-${count}`}>
        {Array.from({ length: count }, (_, t) => {
          const crew = room.seats.filter((seat) => seat.team === t);
          return (
            <div key={t} className="team-col" style={{ ["--team-color" as string]: crewColor(t) }}>
              <h3 className="team-name">
                <CrewMark team={t} size={18} /> {tableTeamName(t)}
              </h3>
              <ul className="team-crew">
                {crew.map((seat) => (
                  <li key={seat.id}>
                    <Avatar avatar={seat.avatar} userId={seat.userId} photo={seat.photo} size={30} />
                    <span className="team-member">
                      {seat.name}
                      {seat.id === me?.id && <span className="hint"> (toi)</span>}
                    </span>
                    {room.you.isHost &&
                      seat.id !== me?.id &&
                      Array.from({ length: count }, (_, o) => o)
                        .filter((o) => o !== t)
                        .map((o) => (
                          <button
                            key={o}
                            className="btn btn-ghost btn-sm team-move crew-move"
                            onClick={() => send({ t: "team", seatId: seat.id, team: o })}
                            aria-label={`Envoyer ${seat.name} chez les ${tableTeamName(o)}`}
                            title={`Envoyer chez les ${tableTeamName(o)}`}
                          >
                            <span aria-hidden="true">→</span>
                            <CrewMark team={o} size={14} />
                          </button>
                        ))}
                  </li>
                ))}
                {Array.from({ length: Math.max(0, size - crew.length) }, (_, i) => (
                  <li key={`libre-${i}`} className="is-empty">
                    <span className="team-empty-mark" />
                    place libre
                  </li>
                ))}
              </ul>
              {me && me.team !== t && (
                <button className="btn btn-sm btn-block" onClick={() => send({ t: "team", seatId: me.id, team: t })}>
                  Passer chez les {tableTeamName(t)}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
