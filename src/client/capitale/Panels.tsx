import { motion } from "motion/react";
import { useState } from "react";
import { groupOf, SQUARES } from "../../shared/games/capitale/board.ts";
import { tradeProblem, type CapitaleAction, type Offer, type Trade } from "../../shared/games/capitale/engine.ts";
import type { CapitaleView } from "../../shared/games/capitale/view.ts";
import type { SeatView } from "../../shared/protocol.ts";
import { Avatar } from "../components/Avatar.tsx";
import { Modal } from "../components/ui.tsx";
import { asState, colorOf, money } from "./boardUi.ts";

type Seat = (id: string) => SeatView | undefined;

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
