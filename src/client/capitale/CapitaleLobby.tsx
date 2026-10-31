import type { BotLevel, CapitaleSettings, EndMode } from "../../shared/games/capitale/engine.ts";
import { CAPITALE_MAX_PLAYERS, type CapitaleClientMessage, type CapitaleRoomView } from "../../shared/protocol.ts";
import { Check, Options } from "../components/ui.tsx";
import { RulesHeading, TableLobby, TableSize } from "../game/TableLobby.tsx";

const BOT_HINTS: Record<BotLevel, string> = {
  facile: "Prudent jusqu'à l'excès : il garde son argent et bâtit peu.",
  moyen: "Achète raisonnablement, construit, et accepte les échanges équitables.",
  fort: "Rafle les terrains, monte vite à trois maisons et négocie pour compléter ses groupes.",
};

type HouseRule = "freeParking" | "doubleGo" | "noRentInJail" | "quickStart";

const HOUSE_RULES: { key: HouseRule; label: string; desc: string }[] = [
  {
    key: "freeParking",
    label: "Cagnotte de l'Aire de repos",
    desc: "Taxes et amendes s'entassent sur l'Aire de repos : celui qui s'y arrête rafle tout.",
  },
  { key: "doubleGo", label: "Double salaire sur Départ", desc: "Tomber pile sur Départ rapporte 400 au lieu de 200." },
  { key: "noRentInJail", label: "Pas de loyer en prison", desc: "Un propriétaire derrière les barreaux ne touche plus ses loyers." },
  { key: "quickStart", label: "Départ rapide", desc: "Chacun reçoit deux titres tirés au sort pour commencer." },
];

interface Props {
  room: CapitaleRoomView;
  send: (msg: CapitaleClientMessage) => void;
  unread: number;
  onOpenChat: () => void;
  onLeave: () => void;
  onBackToGame?: () => void;
}

/** Le salon d'une table de Capitale : le salon commun et les règles de la partie. */
export function CapitaleLobby({ room, send, ...rest }: Props) {
  const s = room.settings.capitale;
  const isHost = room.you.isHost;
  const update = (patch: Partial<CapitaleSettings>) => send({ t: "settings", settings: patch });

  return (
    <TableLobby
      room={room}
      send={send}
      {...rest}
      shareTitle="Viens jouer à Capitale"
      startLabel="Distribuer les billets"
      hostWillStart="va distribuer les billets"
      rules={
        <section className="rules-sheet panel">
          <RulesHeading room={room} />

          <div className="field">
            <span className="field-label">Fin de la partie</span>
            <Options<EndMode>
              label="Fin de la partie"
              value={s.end}
              disabled={!isHost}
              onChange={(end) => update({ end })}
              options={[
                { value: "timed", label: "Partie rapide" },
                { value: "bankrupt", label: "Jusqu'à la faillite" },
              ]}
            />
            {s.end === "timed" && (
              <Options<number>
                label="Durée"
                value={s.minutes}
                disabled={!isHost}
                onChange={(minutes) => update({ minutes })}
                options={[
                  { value: 30, label: "30 min" },
                  { value: 45, label: "45 min" },
                  { value: 60, label: "1 h" },
                ]}
              />
            )}
            <p className="hint" style={{ margin: 0 }}>
              {s.end === "timed"
                ? `Au bout de ${s.minutes} minutes, le tour en cours est le dernier : le plus riche gagne (argent, titres et constructions).`
                : "Le dernier joueur à ne pas avoir fait faillite gagne. Compte une à trois heures."}
            </p>
          </div>

          <div className="field">
            <span className="field-label">Règles maison</span>
            <div className="rule-list">
              {HOUSE_RULES.map((r) => (
                <div key={r.key} className="rule-row" onClick={() => isHost && update({ [r.key]: !s[r.key] })}>
                  <Check label={r.label} checked={s[r.key]} disabled={!isHost} onChange={() => {}} />
                  <span>
                    <strong>{r.label}</strong>
                    <span className="hint">{r.desc}</span>
                  </span>
                </div>
              ))}
            </div>
            <p className="hint" style={{ margin: 0 }}>
              Le reste suit la règle : enchères quand on refuse d'acheter, prison, hypothèques, constructions égales, 32 maisons et 12
              hôtels à la banque.
            </p>
          </div>

          <div className="field">
            <span className="field-label">Niveau des bots</span>
            <Options<BotLevel>
              label="Niveau des bots"
              value={s.botLevel}
              disabled={!isHost}
              onChange={(botLevel) => update({ botLevel })}
              options={[
                { value: "facile", label: "Facile" },
                { value: "moyen", label: "Moyen" },
                { value: "fort", label: "Fort" },
              ]}
            />
            <p className="hint" style={{ margin: 0 }}>
              {BOT_HINTS[s.botLevel]}
            </p>
          </div>

          <div className="field">
            <span className="field-label">Temps par décision</span>
            <Options
              label="Temps par décision"
              value={s.turnSeconds}
              disabled={!isHost}
              onChange={(turnSeconds) => update({ turnSeconds })}
              options={[
                { value: 30, label: "30 s" },
                { value: 60, label: "1 min" },
                { value: 0, label: "Illimité" },
              ]}
            />
            <p className="hint" style={{ margin: 0 }}>
              Passé ce temps, les dés se lancent tout seuls et le terrain part aux enchères.
            </p>
          </div>

          <TableSize room={room} send={send} max={CAPITALE_MAX_PLAYERS} />
        </section>
      }
    />
  );
}
