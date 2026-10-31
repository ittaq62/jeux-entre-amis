import { motion } from "motion/react";
import { useState } from "react";
import {
  DECK_NAMES,
  DECKS,
  GROUP_ORDER,
  GROUPS,
  groupOf,
  HOTEL,
  mortgageValue,
  SQUARES,
  STATIONS,
  unmortgageCost,
  UTILITIES,
  type DeckId,
} from "../../shared/games/capitale/board.ts";
import {
  canBuild,
  canMortgage,
  canSell,
  rentFor,
  type CapitaleAction,
  type Offer,
  type Trade,
} from "../../shared/games/capitale/engine.ts";
import type { CapitaleView } from "../../shared/games/capitale/view.ts";
import type { SeatView } from "../../shared/protocol.ts";
import { Avatar } from "../components/Avatar.tsx";
import { Modal } from "../components/ui.tsx";
import { asState, colorOf, money } from "./boardUi.ts";

type Seat = (id: string) => SeatView | undefined;

/** Ce qu'un joueur peut faire de ses titres maintenant : tout pendant son tour, vendre et hypothéquer pendant sa dette */
export function manageRights(g: CapitaleView, me: string | null): "full" | "raise" | null {
  if (!me || g.step === "over" || g.step === "auction") return null;
  if (g.debts.length > 0) return g.debts[0]!.debtor === me ? "raise" : null;
  if (g.players[g.turn]?.id !== me) return null;
  return g.step === "roll" || g.step === "buy" || g.step === "manage" ? "full" : null;
}

const kindLabel = (i: number) => {
  const sq = SQUARES[i]!;
  if (sq.kind === "station") return "Gare TGV";
  if (sq.kind === "utility") return "Réseau";
  return `Terrain, groupe ${GROUPS[sq.group!].name.toLowerCase()}`;
};

// ---------------------------------------------------------------------------
// La fiche d'une case
// ---------------------------------------------------------------------------

export function DeedSheet({ g, index, seat, onClose }: { g: CapitaleView; index: number | null; seat: Seat; onClose: () => void }) {
  const sq = index !== null ? SQUARES[index] : undefined;
  const deed = index !== null ? g.deeds[index] : null;
  const group = index !== null ? groupOf(index) : null;
  return (
    <Modal open={index !== null && Boolean(sq)} onClose={onClose} title={sq?.name}>
      {sq && index !== null && (
        <div className="cap-deed">
          <div className="cap-deed-head" style={{ background: group?.color ?? "var(--panel-raised)" }}>
            <span className="hint">{sq.price ? kindLabel(index) : "Case du plateau"}</span>
            <strong>{sq.name}</strong>
          </div>
          {sq.kind === "property" && (
            <table className="cap-rents">
              <tbody>
                <tr>
                  <td>Terrain nu</td>
                  <td className="num">{money(sq.rents![0])}</td>
                </tr>
                <tr>
                  <td>Avec tout le groupe</td>
                  <td className="num">{money(sq.rents![0] * 2)}</td>
                </tr>
                {[1, 2, 3, 4].map((h) => (
                  <tr key={h} className={deed?.houses === h ? "is-now" : ""}>
                    <td>
                      {h} maison{h > 1 ? "s" : ""}
                    </td>
                    <td className="num">{money(sq.rents![h]!)}</td>
                  </tr>
                ))}
                <tr className={deed?.houses === HOTEL ? "is-now" : ""}>
                  <td>Hôtel</td>
                  <td className="num">{money(sq.rents![5])}</td>
                </tr>
              </tbody>
            </table>
          )}
          {sq.kind === "station" && (
            <table className="cap-rents">
              <tbody>
                {[25, 50, 100, 200].map((r, k) => (
                  <tr key={r}>
                    <td>
                      {k + 1} gare{k > 0 ? "s" : ""} au même propriétaire
                    </td>
                    <td className="num">{money(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {sq.kind === "utility" && <p className="hint">Un réseau : 4 fois les dés. Les deux au même propriétaire : 10 fois les dés.</p>}
          {sq.kind === "tax" && <p className="hint">On paie {money(sq.tax!)} en s'arrêtant ici.</p>}
          {sq.kind === "card" && <p className="hint">On tire une carte « {sq.name} ».</p>}
          {sq.kind === "jail" && <p className="hint">Trois tours au plus : un double, 50 ₣ ou une carte pour sortir.</p>}
          {sq.kind === "toJail" && <p className="hint">Direction la prison, sans passer par Départ.</p>}
          {sq.kind === "go" && <p className="hint">Chaque passage rapporte 200 ₣.</p>}
          {sq.kind === "rest" && (
            <p className="hint">{g.settings.freeParking ? "La cagnotte des taxes revient à qui s'arrête ici." : "On souffle un peu."}</p>
          )}
          {sq.price !== undefined && deed && (
            <dl className="cap-deed-facts">
              <div>
                <dt>Prix</dt>
                <dd className="num">{money(sq.price)}</dd>
              </div>
              {group && (
                <div>
                  <dt>Une maison</dt>
                  <dd className="num">{money(group.houseCost)}</dd>
                </div>
              )}
              <div>
                <dt>Hypothèque</dt>
                <dd className="num">{money(mortgageValue(index))}</dd>
              </div>
              <div>
                <dt>Propriétaire</dt>
                <dd>
                  {deed.owner ? (
                    <span className="cap-owner-tag" style={{ ["--owner" as string]: colorOf(g, deed.owner) }}>
                      {seat(deed.owner)?.name ?? "?"}
                    </span>
                  ) : (
                    "La banque"
                  )}
                  {deed.mortgaged && <span className="hint"> · hypothéqué</span>}
                </dd>
              </div>
              {deed.owner && sq.kind !== "utility" && (
                <div>
                  <dt>Loyer aujourd'hui</dt>
                  <dd className="num">{money(rentFor(asState(g), index, { diceTotal: 7 }))}</dd>
                </div>
              )}
            </dl>
          )}
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Mes titres : construire, vendre, hypothéquer
// ---------------------------------------------------------------------------

export function TitlesSheet({
  g,
  me,
  open,
  onClose,
  act,
}: {
  g: CapitaleView;
  me: string;
  open: boolean;
  onClose: () => void;
  act: (a: CapitaleAction) => void;
}) {
  const s = asState(g);
  const rights = manageRights(g, me);
  const p = g.players.find((x) => x.id === me);
  const mine = (list: number[]) => list.filter((i) => g.deeds[i]!.owner === me);
  const groups = [
    ...GROUP_ORDER.map((gid) => ({ key: gid, name: GROUPS[gid].name, color: GROUPS[gid].color, squares: mine(GROUPS[gid].squares) })),
    { key: "tgv", name: "TGV", color: "#c9d3d6", squares: mine(STATIONS) },
    { key: "res", name: "Réseaux", color: "#9fb4bb", squares: mine(UTILITIES) },
  ].filter((x) => x.squares.length > 0);
  const debt = g.debts.filter((d) => d.debtor === me).reduce((n, d) => n + d.amount, 0);

  return (
    <Modal open={open} onClose={onClose} title="Mes titres" wide>
      <div className="cap-titles">
        <p className="cap-titles-sum">
          <span>
            Argent <strong className="num">{money(p?.cash ?? 0)}</strong>
          </span>
          <span>
            Fortune <strong className="num">{money(g.worth[me] ?? 0)}</strong>
          </span>
          {debt > 0 && (
            <span className="cap-titles-debt">
              À payer <strong className="num">{money(debt)}</strong>
            </span>
          )}
        </p>
        {!rights && <p className="hint">Tu gères tes titres pendant ton tour (et pendant une dette, pour vendre ou hypothéquer).</p>}
        {rights === "raise" && (
          <p className="hint">
            Pour payer ta dette : vends des constructions ou hypothèque des titres. Elle se paie toute seule dès que l'argent suffit.
          </p>
        )}
        {groups.length === 0 && <p className="hint">Tu n'as encore aucun titre.</p>}
        {groups.map((grp) => (
          <section key={grp.key} className="cap-titles-group" style={{ ["--group" as string]: grp.color }}>
            <h3>{grp.name}</h3>
            {grp.squares.map((i) => {
              const d = g.deeds[i]!;
              const sq = SQUARES[i]!;
              const group = groupOf(i);
              const buildOk = rights === "full" && canBuild(s, me, i) === null;
              const sellOk = rights !== null && canSell(s, me, i) === null;
              const mortOk = rights !== null && canMortgage(s, me, i) === null;
              const liftOk = rights === "full" && d.mortgaged && (p?.cash ?? 0) >= unmortgageCost(i);
              return (
                <div key={i} className={`cap-title-row ${d.mortgaged ? "is-mortgaged" : ""}`}>
                  <span className="cap-title-name">
                    <strong>{sq.name}</strong>
                    <span className="hint">
                      {d.mortgaged
                        ? "hypothéqué"
                        : d.houses === HOTEL
                          ? "hôtel"
                          : d.houses > 0
                            ? `${d.houses} maison${d.houses > 1 ? "s" : ""}`
                            : "nu"}
                      {!d.mortgaged && sq.kind !== "utility" && ` · loyer ${money(rentFor(s, i, { diceTotal: 7 }))}`}
                    </span>
                  </span>
                  <span className="cap-title-actions">
                    {group && sq.kind === "property" && !d.mortgaged && (
                      <>
                        <button
                          className="btn btn-sm"
                          disabled={!sellOk}
                          onClick={() => act({ type: "sell", square: i })}
                          title={`Revendre à ${money(group.houseCost / 2)}`}
                        >
                          − Vendre
                        </button>
                        <button className="btn btn-sm btn-primary" disabled={!buildOk} onClick={() => act({ type: "build", square: i })}>
                          {d.houses === 4 ? "Hôtel" : "+ Maison"} <span className="num">{group.houseCost}</span>
                        </button>
                      </>
                    )}
                    {d.mortgaged ? (
                      <button className="btn btn-sm" disabled={!liftOk} onClick={() => act({ type: "unmortgage", square: i })}>
                        Lever <span className="num">{unmortgageCost(i)}</span>
                      </button>
                    ) : (
                      <button className="btn btn-sm btn-ghost" disabled={!mortOk} onClick={() => act({ type: "mortgage", square: i })}>
                        Hypothéquer <span className="num">+{mortgageValue(i)}</span>
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Échanges
// ---------------------------------------------------------------------------

const EMPTY: Offer = { cash: 0, squares: [], jailCards: 0 };

/** Les titres qu'un joueur peut céder : pas de construction dans leur groupe */
function tradable(g: CapitaleView, playerId: string): number[] {
  return SQUARES.filter((sq) => {
    const d = g.deeds[sq.index];
    if (!d || d.owner !== playerId) return false;
    const grp = groupOf(sq.index);
    return !(grp && grp.squares.some((x) => g.deeds[x]!.houses > 0));
  }).map((sq) => sq.index);
}

export function describeOffer(o: Offer): string {
  const parts = [
    ...o.squares.map((i) => SQUARES[i]!.name),
    ...(o.cash > 0 ? [money(o.cash)] : []),
    ...(o.jailCards > 0 ? [`${o.jailCards} carte${o.jailCards > 1 ? "s" : ""} sortie de prison`] : []),
  ];
  return parts.length > 0 ? parts.join(", ") : "rien";
}

export interface TradeDraft {
  partner: string | null;
  give: Offer;
  get: Offer;
  replaces?: number;
}

export function TradeModal({
  g,
  me,
  seat,
  draft,
  onClose,
  act,
}: {
  g: CapitaleView;
  me: string;
  seat: Seat;
  draft: TradeDraft | null;
  onClose: () => void;
  act: (a: CapitaleAction) => void;
}) {
  return (
    <Modal
      open={draft !== null}
      onClose={onClose}
      title={draft?.replaces !== undefined ? "Contre-proposition" : "Proposer un échange"}
      wide
    >
      {draft && (
        <TradeForm
          key={`${draft.partner}-${draft.replaces ?? "new"}`}
          g={g}
          me={me}
          seat={seat}
          draft={draft}
          onClose={onClose}
          act={act}
        />
      )}
    </Modal>
  );
}

function TradeForm({
  g,
  me,
  seat,
  draft,
  onClose,
  act,
}: {
  g: CapitaleView;
  me: string;
  seat: Seat;
  draft: TradeDraft;
  onClose: () => void;
  act: (a: CapitaleAction) => void;
}) {
  const others = g.players.filter((p) => p.id !== me && !p.bankrupt);
  const [partner, setPartner] = useState<string | null>(draft.partner ?? others[0]?.id ?? null);
  const [give, setGive] = useState<Offer>(draft.give);
  const [get, setGet] = useState<Offer>(draft.get);
  const mePl = g.players.find((p) => p.id === me)!;
  const other = g.players.find((p) => p.id === partner);
  const empty =
    give.cash === 0 &&
    give.squares.length === 0 &&
    give.jailCards === 0 &&
    get.cash === 0 &&
    get.squares.length === 0 &&
    get.jailCards === 0;

  const side = (owner: string, offer: Offer, setOffer: (o: Offer) => void, cashMax: number, cards: number, title: string) => (
    <div className="cap-trade-side">
      <h3>{title}</h3>
      <div className="cap-trade-list">
        {tradable(g, owner).length === 0 && <p className="hint">Aucun titre échangeable.</p>}
        {tradable(g, owner).map((i) => {
          const on = offer.squares.includes(i);
          const grp = groupOf(i);
          return (
            <label key={i} className={`cap-trade-item ${on ? "is-on" : ""}`} style={{ ["--group" as string]: grp?.color ?? "#9fb4bb" }}>
              <input
                type="checkbox"
                checked={on}
                onChange={() => setOffer({ ...offer, squares: on ? offer.squares.filter((x) => x !== i) : [...offer.squares, i] })}
              />
              <span>{SQUARES[i]!.name}</span>
              {g.deeds[i]!.mortgaged && <span className="hint">hypothéqué</span>}
            </label>
          );
        })}
      </div>
      <label className="cap-trade-cash">
        <span>Argent</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={cashMax}
          step={10}
          value={offer.cash || ""}
          placeholder="0"
          onChange={(e) => setOffer({ ...offer, cash: Math.max(0, Math.min(cashMax, Math.floor(Number(e.target.value) || 0))) })}
        />
        <span className="hint">sur {money(cashMax)}</span>
      </label>
      {cards > 0 && (
        <label className="cap-trade-cash">
          <span>Cartes sortie de prison</span>
          <input
            type="number"
            min={0}
            max={cards}
            value={offer.jailCards}
            onChange={(e) => setOffer({ ...offer, jailCards: Math.max(0, Math.min(cards, Math.floor(Number(e.target.value) || 0))) })}
          />
        </label>
      )}
    </div>
  );

  return (
    <div className="cap-trade">
      {draft.replaces === undefined && (
        <div className="cap-trade-partners" role="radiogroup" aria-label="Avec qui">
          {others.map((p) => {
            const s = seat(p.id);
            return (
              <button
                key={p.id}
                type="button"
                className={`cap-partner ${partner === p.id ? "is-on" : ""}`}
                style={{ ["--pawn" as string]: colorOf(g, p.id) }}
                aria-pressed={partner === p.id}
                onClick={() => {
                  setPartner(p.id);
                  setGet(EMPTY);
                }}
              >
                {s && <Avatar avatar={s.avatar} userId={s.userId} photo={s.photo} size={26} />}
                <span>{s?.name}</span>
              </button>
            );
          })}
        </div>
      )}
      {other && (
        <div className="cap-trade-sides">
          {side(me, give, setGive, mePl.cash, mePl.jailCards.length, "Tu donnes")}
          {side(other.id, get, setGet, other.cash, other.jailCards.length, `Tu demandes à ${seat(other.id)?.name ?? "?"}`)}
        </div>
      )}
      <p className="hint">
        Un titre hypothéqué reçu coûte 10 % d'intérêts tout de suite. Les terrains d'un groupe bâti ne s'échangent pas.
      </p>
      <div className="overlay-actions">
        <button
          className="btn btn-primary"
          disabled={!other || empty}
          onClick={() => {
            if (!other) return;
            act({ type: "propose", to: other.id, give, get, ...(draft.replaces !== undefined ? { replaces: draft.replaces } : {}) });
            onClose();
          }}
        >
          Envoyer la proposition
        </button>
        <button className="btn btn-ghost" onClick={onClose}>
          Annuler
        </button>
      </div>
    </div>
  );
}

/** Les propositions en cours qui me concernent : reçues (accepter, refuser, contre-proposer) ou envoyées (annuler) */
export function Offers({
  g,
  me,
  seat,
  act,
  onCounter,
}: {
  g: CapitaleView;
  me: string | null;
  seat: Seat;
  act: (a: CapitaleAction) => void;
  onCounter: (t: Trade) => void;
}) {
  if (!me) return null;
  const mine = g.trades.filter((t) => t.to === me || t.from === me);
  if (mine.length === 0) return null;
  return (
    <div className="cap-offers">
      {mine.map((t) => {
        const incoming = t.to === me;
        const other = seat(incoming ? t.from : t.to);
        return (
          <motion.div
            key={t.id}
            className={`cap-offer panel ${incoming ? "is-in" : "is-out"}`}
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
          >
            <div className="cap-offer-head">
              {other && <Avatar avatar={other.avatar} userId={other.userId} photo={other.photo} size={26} />}
              <strong>{incoming ? `${other?.name ?? "?"} te propose un échange` : `Ta proposition à ${other?.name ?? "?"}`}</strong>
            </div>
            <p className="cap-offer-body">
              {incoming ? (
                <>
                  Tu reçois <strong>{describeOffer(t.give)}</strong>, tu donnes <strong>{describeOffer(t.get)}</strong>.
                </>
              ) : (
                <>
                  Tu donnes <strong>{describeOffer(t.give)}</strong> contre <strong>{describeOffer(t.get)}</strong>.
                </>
              )}
            </p>
            <div className="cap-offer-actions">
              {incoming ? (
                <>
                  <button className="btn btn-sm btn-primary" onClick={() => act({ type: "accept", trade: t.id })}>
                    Accepter
                  </button>
                  <button className="btn btn-sm" onClick={() => onCounter(t)}>
                    Contre-proposer
                  </button>
                  <button className="btn btn-sm btn-ghost" onClick={() => act({ type: "reject", trade: t.id })}>
                    Refuser
                  </button>
                </>
              ) : (
                <>
                  <span className="hint">En attente de sa réponse…</span>
                  <button className="btn btn-sm btn-ghost" onClick={() => act({ type: "cancel", trade: t.id })}>
                    Annuler
                  </button>
                </>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// La carte tirée
// ---------------------------------------------------------------------------

export function CardReveal({ card, who }: { card: { deck: DeckId; card: number } | null; who: string | null }) {
  if (!card) return null;
  const c = DECKS[card.deck][card.card];
  if (!c) return null;
  return (
    <motion.div
      key={`${card.deck}-${card.card}-${who}`}
      className={`cap-card deck-${card.deck}`}
      initial={{ rotateY: 180, scale: 0.6, opacity: 0 }}
      animate={{ rotateY: 0, scale: 1, opacity: 1 }}
      exit={{ scale: 0.8, opacity: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
      role="status"
    >
      <span className="cap-card-deck">{DECK_NAMES[card.deck]}</span>
      <p>{c.text}</p>
      {who && <span className="hint">pour {who}</span>}
    </motion.div>
  );
}
