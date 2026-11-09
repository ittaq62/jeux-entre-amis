import { CLUBS, FORMATION_NAMES, type Club, type FormationId } from "../../shared/games/crampons/clubs.ts";
import { HALF_CHOICES, LEVEL_NAMES, SIDE_CHOICES, type Ambience, type CramponsConfig } from "../../shared/games/crampons/view.ts";
import { CRAMPONS_MAX_PLAYERS, type CramponsClientMessage, type CramponsRoomView } from "../../shared/protocol.ts";
import { Check, Options } from "../components/ui.tsx";
import { RulesHeading, TableLobby, TableSize } from "../game/TableLobby.tsx";

const LEVEL_HINTS = [
  "L'ordinateur lit mal le jeu et rate ses passes : pour découvrir.",
  "Il joue simplement, sans presser très fort.",
  "Il presse, coupe les passes et ne pardonne pas les erreurs.",
  "Tout va vite, il lit tout : bon courage.",
];

const clubBy = (id: string): Club => CLUBS.find((c) => c.id === id) ?? CLUBS[0]!;

function ClubPicker({
  label,
  value,
  formation,
  disabled,
  onClub,
  onFormation,
}: {
  label: string;
  value: string;
  formation: FormationId;
  disabled: boolean;
  onClub: (id: string) => void;
  onFormation: (id: FormationId) => void;
}) {
  const club = clubBy(value);
  return (
    <div className="field">
      <label className="field-label" htmlFor={`club-${label}`}>
        {label}
      </label>
      <div className="cr-club">
        <span
          className="cr-crest"
          style={{ background: club.home.shirt, color: club.home.sleeves !== club.home.shirt ? club.home.sleeves : club.home.shorts }}
        >
          {club.short}
        </span>
        <select id={`club-${label}`} className="input" value={value} disabled={disabled} onChange={(e) => onClub(e.target.value)}>
          {CLUBS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.rating})
            </option>
          ))}
        </select>
        <select
          className="input cr-form"
          aria-label={`Dispositif, ${label}`}
          value={formation}
          disabled={disabled}
          onChange={(e) => onFormation(e.target.value as FormationId)}
        >
          {(Object.keys(FORMATION_NAMES) as FormationId[]).map((f) => (
            <option key={f} value={f}>
              {FORMATION_NAMES[f]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

interface Props {
  room: CramponsRoomView;
  send: (msg: CramponsClientMessage) => void;
  unread: number;
  onOpenChat: () => void;
  onLeave: () => void;
  onBackToGame?: () => void;
}

export function CramponsLobby({ room, send, unread, onOpenChat, onLeave, onBackToGame }: Props) {
  const s = room.settings.crampons;
  const isHost = room.you.isHost;
  const update = (settings: Partial<CramponsConfig>) => send({ t: "settings", settings });
  const mine = room.you.seatId ? room.teams[room.you.seatId] : undefined;
  const setClub = (t: 0 | 1, id: string) => {
    const clubs: [string, string] = [...s.clubs];
    clubs[t] = id;
    const formations: [FormationId, FormationId] = [...s.formations];
    formations[t] = clubBy(id).formation;
    update({ clubs, formations });
  };
  const setFormation = (t: 0 | 1, f: FormationId) => {
    const formations: [FormationId, FormationId] = [...s.formations];
    formations[t] = f;
    update({ formations });
  };
  return (
    <TableLobby
      room={room}
      send={send}
      unread={unread}
      onOpenChat={onOpenChat}
      onLeave={onLeave}
      onBackToGame={onBackToGame}
      shareTitle="Viens jouer à Crampons"
      startLabel="Coup d'envoi"
      hostWillStart="va donner le coup d'envoi"
      canStart={room.seats.length >= 1}
      noBots
      seatNote={(seat) => `${clubBy(s.clubs[room.teams[seat.id] ?? 0]).name}`}
      aside={
        room.you.seatId ? (
          <section className="lobby-section panel field">
            <span className="field-label">Ton équipe</span>
            <Options<0 | 1>
              label="Ton équipe"
              value={mine ?? 0}
              onChange={(team) => send({ t: "team", team })}
              options={[
                { value: 0, label: clubBy(s.clubs[0]).short },
                { value: 1, label: clubBy(s.clubs[1]).short },
              ]}
            />
            <p className="hint" style={{ margin: 0 }}>
              L'ordinateur joue les postes laissés libres, et toute une équipe s'il n'y a personne dedans.
            </p>
          </section>
        ) : null
      }
      rules={
        <>
          <section className="rules-sheet panel">
            <RulesHeading room={room} />
            <ClubPicker
              label="Domicile"
              value={s.clubs[0]}
              formation={s.formations[0]}
              disabled={!isHost}
              onClub={(id) => setClub(0, id)}
              onFormation={(f) => setFormation(0, f)}
            />
            <ClubPicker
              label="Extérieur"
              value={s.clubs[1]}
              formation={s.formations[1]}
              disabled={!isHost}
              onClub={(id) => setClub(1, id)}
              onFormation={(f) => setFormation(1, f)}
            />

            <div className="field">
              <span className="field-label">Durée d'une mi-temps</span>
              <Options<number>
                label="Durée d'une mi-temps"
                value={s.halfMinutes}
                disabled={!isHost}
                onChange={(halfMinutes) => update({ halfMinutes })}
                options={HALF_CHOICES.map((n) => ({ value: n, label: `${n} min` }))}
              />
            </div>

            <div className="field">
              <span className="field-label">Joueurs par équipe</span>
              <Options<number>
                label="Joueurs par équipe"
                value={s.side}
                disabled={!isHost}
                onChange={(side) => update({ side })}
                options={SIDE_CHOICES.map((n) => ({ value: n, label: `${n} contre ${n}` }))}
              />
            </div>

            <div className="field">
              <span className="field-label">Niveau de l'ordinateur</span>
              <Options<number>
                label="Niveau de l'ordinateur"
                value={s.level}
                disabled={!isHost}
                onChange={(level) => update({ level })}
                options={LEVEL_NAMES.map((name, value) => ({ value, label: name }))}
              />
              <p className="hint" style={{ margin: 0 }}>
                {LEVEL_HINTS[s.level]}
              </p>
            </div>

            <div className="field">
              <span className="field-label">En cas de match nul</span>
              <Options<CramponsConfig["draw"]>
                label="En cas de match nul"
                value={s.draw}
                disabled={!isHost}
                onChange={(draw) => update({ draw })}
                options={[
                  { value: "none", label: "Match nul" },
                  { value: "penalties", label: "Tirs au but" },
                  { value: "extra", label: "Prolongations" },
                ]}
              />
            </div>

            <div className="field">
              <span className="field-label">Ambiance</span>
              <Options<Ambience>
                label="Ambiance"
                value={s.ambience}
                disabled={!isHost}
                onChange={(ambience) => update({ ambience })}
                options={[
                  { value: "jour", label: "Plein jour" },
                  { value: "soir", label: "Coucher de soleil" },
                  { value: "nuit", label: "Nocturne" },
                ]}
              />
            </div>

            <div className="field">
              <span className="field-label">Règles</span>
              <div className="rule-list">
                <div className="rule-row" onClick={() => isHost && update({ offside: !s.offside })}>
                  <Check label="Hors-jeu" checked={s.offside} disabled={!isHost} onChange={() => {}} />
                  <span>
                    <strong>Hors-jeu</strong>
                    <span className="hint">L'attaquant doit rester derrière le dernier défenseur au départ de la passe.</span>
                  </span>
                </div>
                <div className="rule-row" onClick={() => isHost && update({ fouls: !s.fouls })}>
                  <Check label="Fautes et cartons" checked={s.fouls} disabled={!isHost} onChange={() => {}} />
                  <span>
                    <strong>Fautes et cartons</strong>
                    <span className="hint">Un tacle en retard, c'est un coup franc, un penalty, voire un carton.</span>
                  </span>
                </div>
              </div>
            </div>

            <TableSize room={room} send={send} max={CRAMPONS_MAX_PLAYERS} />
          </section>

          <section className="rules-sheet panel cr-help">
            <h3>Les commandes au clavier</h3>
            <p className="hint">
              Se déplacer : flèches ou ZQSD (WASD). Sprint : Maj. Passe : J. Tir : K (tenir pour doser). Lob ou centre : L. Passe en
              profondeur : I. Tir enroulé : H + K. Tir piqué : G + K. Changer de joueur : U. Sans le ballon : J presse le porteur, I tacle,
              K tente un tacle glissé. Manette et écran tactile fonctionnent aussi.
            </p>
          </section>
        </>
      }
    />
  );
}
