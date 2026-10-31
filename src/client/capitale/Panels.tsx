import { motion } from "motion/react";
import { useState } from "react";
import {
  BUILDINGS,
  buildingPrice,
  DECK_NAMES,
  DECKS,
  GROUP_ORDER,
  GROUPS,
  groupOf,
  mortgageValue,
  SQUARES,
  STATIONS,
  unmortgageCost,
  UTILITIES,
  type DeckId,
} from "../../shared/games/capitale/board.ts";
import {
  canMortgage,
  canRaze,
  canSell,
  floorsOf,
  rentFor,
  tradeProblem,
  type CapitaleAction,
  type Offer,
  type Trade,
} from "../../shared/games/capitale/engine.ts";
import type { CapitaleView } from "../../shared/games/capitale/view.ts";
import type { SeatView } from "../../shared/protocol.ts";
import { Avatar } from "../components/Avatar.tsx";
import { Modal } from "../components/ui.tsx";
import { Icon } from "../components/Icon.tsx";
import { asState, colorOf, money } from "./boardUi.ts";
import { DeedCard, ParcelGrid } from "./Deed.tsx";

type Seat = (id: string) => SeatView | undefined;

/** Ce qu'un joueur peut faire de ses titres maintenant : tout pendant son tour, vendre et hypothéquer pendant sa dette */
export function manageRights(g: CapitaleView, me: string | null): "full" | "raise" | null {
  if (!me || g.step === "over" || g.step === "auction") return null;
  if (g.debts.length > 0) return g.debts[0]!.debtor === me ? "raise" : null;
  if (g.players[g.turn]?.id !== me) return null;
  return g.step === "roll" || g.step === "buy" || g.step === "manage" ? "full" : null;
}

// ---------------------------------------------------------------------------
// La fiche d'une case : le titre de propriété, la parcelle et ce qu'on peut y faire
// ---------------------------------------------------------------------------

const SQUARE_TEXT: Partial<Record<string, string>> = {
  card: "On tire une carte.",
  jail: "Trois tours au plus : un double, 50 ₣ ou une carte pour sortir.",
  toJail: "Direction la prison, sans passer par Départ.",
  go: "Chaque passage rapporte 200 ₣.",
};

export function DeedSheet({
  g,
  index,
  seat,
  me,
  act,
  onClose,
  onBuild,
}: {
  g: CapitaleView;
  index: number | null;
  seat: Seat;
  me: string | null;
  act: (a: CapitaleAction) => void;
  onClose: () => void;
  onBuild: (square: number) => void;
}) {
  const sq = index !== null ? SQUARES[index] : undefined;
  const deed = index !== null ? g.deeds[index] : null;
  const [cell, setCell] = useState<number | null>(null);
  const s = asState(g);
  const rights = manageRights(g, me);
  const mine = Boolean(deed && me && deed.owner === me);
  const b = index !== null && cell !== null ? (deed?.lots?.[cell] ?? null) : null;
  return (
    <Modal open={index !== null && Boolean(sq)} onClose={() => (setCell(null), onClose())} title={sq?.name}>
      {sq && index !== null && (
        <div className="cap-sheet">
          {sq.price !== undefined ? (
            <DeedCard g={g} index={index} />
          ) : (
            <p className="hint">
              {sq.kind === "tax"
                ? `On paie ${money(sq.tax!)} en s'arrêtant ici.`
                : sq.kind === "rest"
                  ? g.settings.freeParking
                    ? "La cagnotte des taxes revient à qui s'arrête ici."
                    : "On souffle un peu."
                  : (SQUARE_TEXT[sq.kind] ?? "")}
            </p>
          )}
          {deed?.owner && (
            <p className="cap-sheet-owner">
              Propriétaire :{" "}
              <span className="cap-owner-tag" style={{ ["--owner" as string]: colorOf(g, deed.owner) }}>
                {deed.owner === me ? "toi" : (seat(deed.owner)?.name ?? "?")}
              </span>
            </p>
          )}
          {deed?.lots && (
            <div className="cap-sheet-parcel">
              <ParcelGrid g={g} index={index} size={56} onCell={(c) => setCell(cell === c ? null : c)} active={cell} />
              <div className="cap-sheet-cell">
                {cell === null && <p className="hint">Touche une case de la parcelle pour voir ce qu'il y a dessus.</p>}
                {cell !== null && !b && <p className="hint">Case libre.</p>}
                {b && (
                  <>
                    <p>
                      <strong>{BUILDINGS[b.kind].name}</strong>{" "}
                      {b.by !== deed.owner && <span className="cap-warn">posée par {b.by === me ? "toi" : (seat(b.by)?.name ?? "?")}</span>}
                    </p>
                    <p className="hint">{BUILDINGS[b.kind].effect}</p>
                    {mine && rights && canSell(s, me!, index, cell!) === null && (
                      <button className="btn btn-sm" onClick={() => act({ type: "sell", square: index, cell: cell! })}>
                        Revendre +{money(Math.floor(buildingPrice(b.kind, index) / 2))}
                      </button>
                    )}
                    {mine && rights === "full" && BUILDINGS[b.kind].nuisance && (
                      <button
                        className="btn btn-sm btn-primary"
                        disabled={canRaze(s, me!, index, cell!) !== null}
                        onClick={() => act({ type: "raze", square: index, cell: cell! })}
                      >
                        Faire raser {money(buildingPrice(b.kind, index))}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
          {mine && rights && (
            <div className="cap-sheet-actions">
              {rights === "full" && deed?.lots && !deed.mortgaged && (
                <button className="btn btn-primary" onClick={() => (setCell(null), onBuild(index))}>
                  <Icon name="build" size={18} /> Construire ici
                </button>
              )}
              {deed?.mortgaged ? (
                <button
                  className="btn"
                  disabled={rights !== "full" || (g.players.find((p) => p.id === me)?.cash ?? 0) < unmortgageCost(index)}
                  onClick={() => act({ type: "unmortgage", square: index })}
                >
                  Lever l'hypothèque {money(unmortgageCost(index))}
                </button>
              ) : (
                <button
                  className="btn btn-ghost"
                  disabled={canMortgage(s, me!, index) !== null}
                  onClick={() => act({ type: "mortgage", square: index })}
                >
                  Hypothéquer +{money(mortgageValue(index))}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Mes titres : les titres de propriété en main, par quartier
// ---------------------------------------------------------------------------

export function TitlesSheet({
  g,
  me,
  open,
  onClose,
  onOpen,
}: {
  g: CapitaleView;
  me: string;
  open: boolean;
  onClose: () => void;
  onOpen: (square: number) => void;
}) {
  const s = asState(g);
  const rights = manageRights(g, me);
  const p = g.players.find((x) => x.id === me);
  const mine = (list: number[]) => list.filter((i) => g.deeds[i]!.owner === me);
  const groups = [
    ...GROUP_ORDER.map((gid) => ({
      key: gid,
      name: `Quartier ${GROUPS[gid].name.toLowerCase()}`,
      total: GROUPS[gid].squares.length,
      squares: mine(GROUPS[gid].squares),
    })),
    { key: "tgv", name: "Gares TGV", total: 4, squares: mine(STATIONS) },
    { key: "res", name: "Réseaux", total: 2, squares: mine(UTILITIES) },
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
            Pour payer ta dette : touche un titre, revends des bâtiments ou hypothèque. Elle se paie dès que l'argent suffit.
          </p>
        )}
        {groups.length === 0 && <p className="hint">Tu n'as encore aucun titre.</p>}
        {groups.map((grp) => (
          <section key={grp.key} className="cap-titles-group">
            <h3>
              {grp.name}{" "}
              <span className="hint">
                {grp.squares.length} sur {grp.total}
              </span>
            </h3>
            <div className="cap-hand-deeds">
              {grp.squares.map((i) => {
                const d = g.deeds[i]!;
                const sq = SQUARES[i]!;
                const group = groupOf(i);
                const light = sq.group === "jaune" || sq.group === "ciel";
                return (
                  <button key={i} type="button" className={`cap-mini-deed ${d.mortgaged ? "is-mortgaged" : ""}`} onClick={() => onOpen(i)}>
                    <span className={`cap-mini-deed-head ${light ? "is-light" : ""}`} style={{ background: group?.color ?? "#cfd6d8" }}>
                      {sq.name}
                    </span>
                    {d.lots ? (
                      <ParcelGrid g={g} index={i} size={30} />
                    ) : (
                      <span className="cap-mini-deed-kind">{sq.kind === "station" ? "Gare" : "Réseau"}</span>
                    )}
                    <span className="cap-mini-deed-foot">
                      {d.mortgaged
                        ? "hypothéqué"
                        : sq.kind === "utility"
                          ? "4 ou 10 × les dés"
                          : `loyer ${money(rentFor(s, i, { diceTotal: 7 }))}`}
                      {d.lots && floorsOf(s, i) > 0 && ` · ${floorsOf(s, i)} ét.`}
                    </span>
                  </button>
                );
              })}
            </div>
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

/** Les titres qu'un joueur peut céder : sans ses bâtiments dessus, sans gratte-ciel dans le quartier */
function tradable(g: CapitaleView, playerId: string): number[] {
  return SQUARES.filter((sq) => tradeProblem(asState(g), playerId, sq.index) === null).map((sq) => sq.index);
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
        Un titre hypothéqué reçu coûte 10 % d'intérêts tout de suite. Une rue bâtie ne s'échange pas : revends d'abord ses bâtiments.
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
