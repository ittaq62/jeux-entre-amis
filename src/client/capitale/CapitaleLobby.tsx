import { useMemo } from "react";
import type { BotLevel, CapitaleSettings, EndMode } from "../../shared/games/capitale/engine.ts";
import { TOKENS } from "../../shared/games/capitale/tokens.ts";
import { CAPITALE_MAX_PLAYERS, type CapitaleClientMessage, type CapitaleRoomView } from "../../shared/protocol.ts";
import { Icon } from "../components/Icon.tsx";
import { Check, Options } from "../components/ui.tsx";
import { RulesHeading, TableLobby, TableSize } from "../game/TableLobby.tsx";
import { PAWN_COLORS } from "./boardUi.ts";
import { tokenThumbnails } from "./scene/tokens.ts";

const BOT_HINTS: Record<BotLevel, string> = {
  facile: "Prudent jusqu'à l'excès : il garde son argent et bâtit peu.",
  moyen: "Achète raisonnablement, améliore ses rues, pose parfois une nuisance, accepte les échanges équitables.",
  fort: "Rafle les terrains, monte vite ses rues, pose ses nuisances chez le plus riche et négocie.",
};

type HouseRule = "freeParking" | "doubleGo" | "noRentInJail" | "quickStart" | "specials";

const HOUSE_RULES: { key: HouseRule; label: string; desc: string }[] = [
  {
    key: "specials",
    label: "Bâtiments spéciaux",
    desc: "Monument (loyers du quartier doublés), parc, stade, et des nuisances à poser chez les autres : décharge, centrale.",
  },
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
  const seatIndex = room.seats.findIndex((x) => x.id === room.you.seatId);
  const mine = seatIndex >= 0 ? room.seats[seatIndex] : undefined;

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

          {mine && (
            <TokenPicker
              color={PAWN_COLORS[seatIndex % PAWN_COLORS.length]!}
              current={mine.token ?? "pion"}
              wins={room.you.capitaleWins}
              onPick={(token) => send({ t: "token", token })}
            />
          )}

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
              La ville : chaque rue s'améliore d'un bouton, une fois par tour, de la maison au gratte-ciel. Au-delà de l'immeuble, il faut
              tout le quartier. Le reste suit la règle : enchères, prison, hypothèques.
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

/** Le choix du pion : quatre pour commencer, les autres s'ouvrent avec les victoires à Capitale */
function TokenPicker({
  color,
  current,
  wins,
  onPick,
}: {
  color: string;
  current: string;
  wins: number;
  onPick: (token: (typeof TOKENS)[number]["id"]) => void;
}) {
  const thumbs = useMemo(() => tokenThumbnails(color), [color]);
  const next = TOKENS.find((t) => t.wins > wins);
  return (
    <div className="field">
      <span className="field-label">Ton pion</span>
      <div className="cap-tokens" role="radiogroup" aria-label="Ton pion">
        {TOKENS.map((t) => {
          const locked = t.wins > wins;
          return (
            <button
              key={t.id}
              type="button"
              className={`cap-token ${current === t.id ? "is-on" : ""} ${locked ? "is-locked" : ""}`}
              aria-pressed={current === t.id}
              disabled={locked}
              onClick={() => onPick(t.id)}
              title={locked ? `${t.name} : ${t.wins} victoire${t.wins > 1 ? "s" : ""} à Capitale` : t.name}
            >
              {thumbs[t.id] ? (
                <img src={thumbs[t.id]} alt="" width={64} height={64} draggable={false} />
              ) : (
                <span className="cap-token-blank" />
              )}
              <span className="cap-token-name">{t.name}</span>
              {locked && (
                <span className="cap-token-lock">
                  <Icon name="lock" size={12} /> {t.wins}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="hint" style={{ margin: 0 }}>
        {wins > 0 ? `${wins} victoire${wins > 1 ? "s" : ""} à Capitale. ` : ""}
        {next ? `Prochain pion : ${next.name}, à ${next.wins} victoire${next.wins > 1 ? "s" : ""}.` : "Tous les pions sont à toi."}
      </p>
    </div>
  );
}
