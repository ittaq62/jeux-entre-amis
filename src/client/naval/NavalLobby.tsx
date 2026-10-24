import {
  FLEETS,
  SHIP_LENGTH,
  SHIP_NAME,
  type BotLevel,
  type GridSize,
  type NavalSettings,
  type ShotRule,
} from "../../shared/games/naval/engine.ts";
import { NAVAL_MAX_PLAYERS, type NavalClientMessage, type NavalRoomView } from "../../shared/protocol.ts";
import { Check, Options } from "../components/ui.tsx";
import { RulesHeading, TableLobby, TableSize } from "../game/TableLobby.tsx";

export const TEAM_NAMES = ["Bâbord", "Tribord"] as const;

const SHOT_HINTS: Record<ShotRule, string> = {
  single: "Un tir chacun son tour, touché ou pas.",
  replay: "Celui qui touche rejoue, jusqu'à tomber à l'eau.",
  salvo: "À chaque tour, autant de tirs que de navires encore à flot.",
};

const BOT_HINTS: Record<BotLevel, string> = {
  mousse: "Tire un peu au hasard.",
  chasseur: "Quadrille la mer et s'acharne sur ce qu'il touche.",
  amiral: "Calcule où tes navires ont le plus de chances d'être.",
};

interface Props {
  room: NavalRoomView;
  send: (msg: NavalClientMessage) => void;
  unread: number;
  onOpenChat: () => void;
  onLeave: () => void;
  onBackToGame?: () => void;
}

/** Le salon d'une table de bataille navale : le salon commun et les réglages de la bataille. */
export function NavalLobby({ room, send, ...rest }: Props) {
  const s = room.settings.naval;
  const isHost = room.you.isHost;
  const update = (patch: Partial<NavalSettings>) => send({ t: "settings", settings: patch });
  const teamsReady = s.teams && room.settings.maxPlayers === 4;
  const fleet = FLEETS[s.grid].map((k) => `${SHIP_NAME[k]} (${SHIP_LENGTH[k]})`).join(", ");

  const toggles: { key: "touching" | "arsenal" | "teams"; label: string; desc: string; disabled?: boolean }[] = [
    { key: "touching", label: "Navires collés", desc: "Deux navires peuvent se toucher. Sinon, une case d'eau les sépare toujours." },
    { key: "arsenal", label: "Mode Arsenal", desc: "Couler un navire rapporte une arme : radar, torpille ou barrage." },
    {
      key: "teams",
      label: "Équipes 2 contre 2",
      desc: room.settings.maxPlayers === 4 ? "Bâbord contre Tribord : on partage ses victoires." : "Possible à 4 joueurs exactement.",
      disabled: room.settings.maxPlayers !== 4,
    },
  ];

  return (
    <TableLobby
      room={room}
      send={send}
      {...rest}
      shareTitle="Viens jouer à la bataille navale"
      startLabel="Lever l'ancre"
      hostWillStart="va donner le signal du départ"
      canStart={room.seats.length >= 2 && (!teamsReady || room.seats.length === 4)}
      startHint={teamsReady ? "Il faut quatre joueurs pour jouer en équipes : ajoute des bots." : undefined}
      seatNote={teamsReady ? (_seat, i) => `équipe ${TEAM_NAMES[i % 2]}` : undefined}
      rules={
        <section className="rules-sheet panel">
          <RulesHeading room={room} />

          <div className="field">
            <span className="field-label">Grille</span>
            <Options<GridSize>
              label="Grille"
              value={s.grid}
              disabled={!isHost}
              onChange={(grid) => update({ grid })}
              options={[
                { value: 8, label: "Petite, 8×8" },
                { value: 10, label: "Classique, 10×10" },
                { value: 12, label: "Grande, 12×12" },
              ]}
            />
            <p className="hint" style={{ margin: 0 }}>
              Flotte : {fleet}.
            </p>
          </div>

          <div className="field">
            <span className="field-label">Tirs</span>
            <Options<ShotRule>
              label="Tirs"
              value={s.shots}
              disabled={!isHost}
              onChange={(shots) => update({ shots })}
              options={[
                { value: "single", label: "Un tir chacun" },
                { value: "replay", label: "On rejoue si touché" },
                { value: "salvo", label: "Salve" },
              ]}
            />
            <p className="hint" style={{ margin: 0 }}>
              {SHOT_HINTS[s.shots]}
            </p>
          </div>

          <div className="rule-list">
            {toggles.map((r) => {
              const off = !isHost || r.disabled;
              return (
                <div
                  key={r.key}
                  className={`rule-row ${r.disabled ? "is-forced" : ""}`}
                  onClick={() => !off && update({ [r.key]: !s[r.key] })}
                >
                  <Check label={r.label} checked={s[r.key] && !r.disabled} disabled={off} onChange={() => {}} />
                  <span>
                    <strong>{r.label}</strong>
                    <span className="hint">{r.desc}</span>
                  </span>
                </div>
              );
            })}
          </div>

          <div className="field">
            <span className="field-label">Niveau des bots</span>
            <Options<BotLevel>
              label="Niveau des bots"
              value={s.botLevel}
              disabled={!isHost}
              onChange={(botLevel) => update({ botLevel })}
              options={[
                { value: "mousse", label: "Mousse" },
                { value: "chasseur", label: "Chasseur" },
                { value: "amiral", label: "Amiral" },
              ]}
            />
            <p className="hint" style={{ margin: 0 }}>
              {BOT_HINTS[s.botLevel]}
            </p>
          </div>

          <div className="field">
            <span className="field-label">Temps pour tirer</span>
            <Options
              label="Temps pour tirer"
              value={s.turnSeconds}
              disabled={!isHost}
              onChange={(turnSeconds) => update({ turnSeconds })}
              options={[
                { value: 15, label: "15 s" },
                { value: 30, label: "30 s" },
                { value: 60, label: "1 min" },
                { value: 0, label: "Illimité" },
              ]}
            />
          </div>

          <TableSize room={room} send={send} max={NAVAL_MAX_PLAYERS} />
        </section>
      }
    />
  );
}
