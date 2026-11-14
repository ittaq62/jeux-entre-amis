import { useMemo, useState } from "react";
import { teamName } from "../../shared/games/capitale/board.ts";
import type { BotLevel, CapitaleSettings, EndMode, TeamCount } from "../../shared/games/capitale/engine.ts";
import { TOKENS, type TokenId } from "../../shared/games/capitale/tokens.ts";
import { SHOP_BY_ID, tokenItem } from "../../shared/shop.ts";
import { CAPITALE_MAX_PLAYERS, type CapitaleClientMessage, type CapitaleRoomView } from "../../shared/protocol.ts";
import { Avatar } from "../components/Avatar.tsx";
import { Icon } from "../components/Icon.tsx";
import { Check, Options } from "../components/ui.tsx";
import { RulesHeading, TableLobby, TableSize } from "../game/TableLobby.tsx";
import { BuyModal } from "../shop/BuyModal.tsx";
import { usePrefs } from "../stores/prefs.ts";
import { useMyItems } from "../stores/shop.ts";
import { tokenThumbnails } from "./scene/tokens.ts";
import { pawnColor, seatTeams, teamColor, TeamMark } from "./teamsUi.tsx";
import { MONOPOLY_RULE, TeamRules } from "./TeamRules.tsx";

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
  const setPrefs = usePrefs((p) => p.set);
  const count = s.teamCount ?? 0;
  const teams = count ? seatTeams(room.seats) : null;
  const ids = room.seats.map((x) => x.id);
  // En équipes : autant de joueurs dans chacune, au moins deux
  const sizes = Array.from({ length: count }, (_, k) => room.seats.filter((x) => x.team === k).length);
  const teamsOk = !count || (sizes.every((n) => n === sizes[0]) && (sizes[0] ?? 0) >= 2);

  return (
    <TableLobby
      room={room}
      send={send}
      {...rest}
      shareTitle="Viens jouer à Capitale"
      startLabel="Distribuer les billets"
      hostWillStart="va distribuer les billets"
      canStart={room.seats.length >= 2 && teamsOk}
      startHint={
        teamsOk
          ? undefined
          : `En équipes, il faut au moins deux joueurs par équipe, autant dans chacune : c'est ${sizes.join(" contre ")} pour l'instant.`
      }
      seatNote={count ? (seat) => (seat.team !== undefined ? teamName(seat.team) : null) : undefined}
      aside={count ? <CapTeamsPanel room={room} send={send} count={count} /> : undefined}
      rules={
        <section className="rules-sheet panel">
          <RulesHeading room={room} />

          {mine && (
            <TokenPicker
              color={pawnColor(ids, teams, mine.id)}
              current={mine.token ?? "pion"}
              onPick={(token) => {
                setPrefs({ capitaleToken: token });
                send({ t: "token", token });
              }}
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
            <div className="rule-list">
              <div className="rule-row" onClick={() => isHost && update({ monopoly: !s.monopoly })}>
                <Check label="Monopole" checked={Boolean(s.monopoly)} disabled={!isHost} onChange={() => {}} />
                <span>
                  <strong>Monopole</strong>
                  <span className="hint">{MONOPOLY_RULE} En plus de la fin choisie : la table montre à chacun où il en est.</span>
                </span>
              </div>
            </div>
          </div>

          <div className="field">
            <span className="field-label">Équipes</span>
            <Options<TeamCount>
              label="Équipes"
              value={count}
              disabled={!isHost}
              onChange={(teamCount) => update({ teamCount })}
              options={[
                { value: 0, label: "Chacun pour soi" },
                { value: 2, label: "2 équipes" },
                { value: 3, label: "3 équipes" },
              ]}
            />
            <p className="hint" style={{ margin: 0 }}>
              {count === 0
                ? "Chacun joue pour lui. En équipes : 2 contre 2, 3 contre 3, ou trois équipes de deux."
                : count === 2
                  ? "Deux équipes de même taille : 2 contre 2 ou 3 contre 3."
                  : "Trois équipes de deux : il faut six joueurs."}
            </p>
            {count > 0 && <TeamRules s={s} disabled={!isHost} update={update} />}
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

/** Le choix du pion : quatre pour commencer, les autres s'achètent avec ses points, dans l'ordre qu'on veut */
export function TokenPicker({ color, current, onPick }: { color: string; current: string; onPick: (token: TokenId) => void }) {
  const thumbs = useMemo(() => tokenThumbnails(color), [color]);
  const { balance, has } = useMyItems();
  const [buying, setBuying] = useState<TokenId | null>(null);
  return (
    <div className="field">
      <span className="field-label">Ton pion</span>
      <div className="cap-tokens" role="radiogroup" aria-label="Ton pion">
        {TOKENS.map((t) => {
          const locked = !has(tokenItem(t.id));
          return (
            <button
              key={t.id}
              type="button"
              className={`cap-token ${current === t.id ? "is-on" : ""} ${locked ? "is-locked" : ""}`}
              aria-pressed={current === t.id}
              onClick={() => (locked ? setBuying(t.id) : onPick(t.id))}
              title={locked ? `${t.name} : ${t.price} points` : t.name}
            >
              {thumbs[t.id] ? (
                <img src={thumbs[t.id]} alt="" width={64} height={64} draggable={false} />
              ) : (
                <span className="cap-token-blank" />
              )}
              <span className="cap-token-name">{t.name}</span>
              {locked && (
                <span className="cap-token-lock">
                  <Icon name="coin" size={12} /> {t.price}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="hint" style={{ margin: 0 }}>
        Tu as {balance} point{balance > 1 ? "s" : ""}. Touche un pion pour l'acheter, dans l'ordre que tu veux.
      </p>
      <BuyModal
        item={buying ? SHOP_BY_ID.get(tokenItem(buying))! : null}
        preview={buying && thumbs[buying] ? <img src={thumbs[buying]} alt="" width={128} height={128} draggable={false} /> : undefined}
        onClose={() => setBuying(null)}
        onBought={() => buying && onPick(buying)}
      />
    </div>
  );
}

/** Les équipes du salon : chacun choisit la sienne, l'hôte place les bots et les autres joueurs */
function CapTeamsPanel({ room, send, count }: { room: CapitaleRoomView; send: (msg: CapitaleClientMessage) => void; count: number }) {
  const me = room.seats.find((seat) => seat.id === room.you.seatId);
  const size = Math.max(2, Math.ceil(room.settings.maxPlayers / count));
  return (
    <section className="lobby-section panel teams-panel cap-teams" aria-label="Les équipes">
      <h2>
        Les équipes{" "}
        <span className="hint">{count === 3 ? "trois équipes de deux" : size === 3 ? "trois contre trois" : "deux contre deux"}</span>
      </h2>
      <div className={`teams-grid cap-teams-grid is-${count}`}>
        {Array.from({ length: count }, (_, t) => {
          const crew = room.seats.filter((seat) => seat.team === t);
          return (
            <div key={t} className="team-col" style={{ ["--team-color" as string]: teamColor(t) }}>
              <h3 className="team-name">
                <TeamMark team={t} size={18} /> {teamName(t)}
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
                            className="btn btn-ghost btn-sm team-move cap-team-move"
                            onClick={() => send({ t: "team", seatId: seat.id, team: o })}
                            aria-label={`Envoyer ${seat.name} chez les ${teamName(o)}`}
                            title={`Envoyer chez les ${teamName(o)}`}
                          >
                            <span aria-hidden="true">→</span>
                            <TeamMark team={o} size={14} />
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
                  Passer chez les {teamName(t)}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
