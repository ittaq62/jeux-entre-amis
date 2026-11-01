import { motion } from "motion/react";
import { DECK_NAMES, DECKS, GROUPS, JAIL_FINE, SQUARES, type CardEffect, type DeckId } from "../../shared/games/capitale/board.ts";
import type { CapitaleAction } from "../../shared/games/capitale/engine.ts";
import type { CapitaleView } from "../../shared/games/capitale/view.ts";
import type { SeatView } from "../../shared/protocol.ts";
import { Avatar } from "../components/Avatar.tsx";
import { ConfirmButton } from "../components/ui.tsx";
import { money } from "./boardUi.ts";
import { CardArt } from "./CardArt.tsx";
import { Band, Pop } from "./CityPanel.tsx";
import { Note } from "./Money.tsx";
import { squareFacts } from "./SquareInfo.tsx";

// Les décisions, une à la fois, en grand au milieu : acheter, enchérir, payer une dette. Et la carte tirée.

/** Acheter la case où l'on vient de s'arrêter, ou la laisser aux enchères */
export function BuyPrompt({
  g,
  index,
  cash,
  busy,
  act,
  name,
}: {
  g: CapitaleView;
  index: number;
  cash: number;
  busy: boolean;
  act: (a: CapitaleAction) => void;
  name: (id: string) => string;
}) {
  const sq = SQUARES[index]!;
  const facts = squareFacts(g, index, name);
  const group = sq.group ? GROUPS[sq.group] : null;
  const mine = group ? group.squares.filter((i) => g.deeds[i]!.owner === g.you).length : 0;
  return (
    <Pop>
      <Band g={g} index={index} name={name} />
      <p className="cap-pop-ask">Tu l'achètes ?</p>
      {sq.kind === "property" ? (
        <p className="cap-pop-text">
          Loyer de départ <b className="num">{money(sq.rents![0])}</b>, et jusqu'à <b className="num">{money(sq.rents![5])}</b> avec un
          gratte-ciel.
          {group && (
            <>
              {" "}
              Tu as {mine} rue{mine > 1 ? "s" : ""} sur {group.squares.length} du quartier
              {mine + 1 === group.squares.length ? " : celle-ci le complète, loyers doublés !" : "."}
            </>
          )}
        </p>
      ) : (
        <p className="cap-pop-text">{facts.what}</p>
      )}
      <div className="cap-pop-buttons">
        <button className="cap-cta is-green" disabled={cash < sq.price! || busy} onClick={() => act({ type: "buy" })}>
          <span>Acheter</span>
          <b className="num">{money(sq.price!)}</b>
        </button>
        <button className="cap-cta is-grey" disabled={busy} onClick={() => act({ type: "decline" })}>
          <span>Aux enchères</span>
        </button>
      </div>
      {cash < sq.price! && <p className="cap-why">Pas assez d'argent : hypothèque un titre (Mes villes), ou laisse-la aux enchères.</p>}
    </Pop>
  );
}

/** L'enchère : le titre, la meilleure offre en grand, le temps qui reste, des offres en billets */
export function AuctionPrompt({
  g,
  me,
  cash,
  left,
  busy,
  act,
  name,
}: {
  g: CapitaleView;
  me: string | null;
  cash: number;
  left: number | null;
  busy: boolean;
  act: (a: CapitaleAction) => void;
  name: (id: string) => string;
}) {
  const a = g.auction!;
  const canBid = Boolean(me && g.bidders.includes(me) && a.high?.player !== me);
  const bid = (inc: number) => (a.high?.amount ?? 0) + inc;
  return (
    <Pop>
      <Band g={g} index={a.square} name={name} />
      <p className="cap-pop-ask">Aux enchères !</p>
      <div className="cap-auction-high">
        <span>{a.high ? (a.high.player === me ? "Tu mènes avec" : `${name(a.high.player)} offre`) : "Personne n'a encore misé"}</span>
        <b className="num">{a.high ? money(a.high.amount) : "—"}</b>
      </div>
      {left !== null && (
        <span className="cap-timebar" style={{ ["--left" as string]: Math.max(0, Math.min(1, left / 12)) }}>
          <span className="num">{left} s</span>
        </span>
      )}
      {canBid ? (
        <div className="cap-pop-buttons">
          {[10, 50, 100].map((inc) => (
            <button key={inc} className="cap-bid" disabled={bid(inc) > cash || busy} onClick={() => act({ type: "bid", amount: bid(inc) })}>
              <Note value={inc} size="md" />
              <span className="num">{money(bid(inc))}</span>
            </button>
          ))}
          <button className="cap-cta is-grey" disabled={busy} onClick={() => act({ type: "pass" })}>
            <span>Passer</span>
          </button>
        </div>
      ) : (
        <p className="cap-pop-text">
          {me && a.high?.player === me ? "Les autres ont la main : attends la fin du compte à rebours." : "Tu regardes l'enchère."}
        </p>
      )}
    </Pop>
  );
}

/** Une dette à régler : vendre, hypothéquer, ou abandonner */
export function DebtPrompt({
  amount,
  to,
  onCities,
  act,
}: {
  amount: number;
  to: string;
  onCities: () => void;
  act: (a: CapitaleAction) => void;
}) {
  return (
    <Pop>
      <h3 className="cap-pop-title">Il te manque de l'argent</h3>
      <p className="cap-pop-text">
        Tu dois <b className="num">{money(amount)}</b> {to}. Revends des niveaux ou hypothèque des titres : la dette se paie dès que
        l'argent suffit.
      </p>
      <div className="cap-pop-buttons">
        <button className="cap-cta is-green" onClick={onCities}>
          <span>Mes villes</span>
        </button>
        <ConfirmButton className="cap-cta is-grey" confirm="Tout abandonner ?" onConfirm={() => act({ type: "bankrupt" })}>
          Faire faillite
        </ConfirmButton>
      </div>
    </Pop>
  );
}

/** Ce que fait une carte, en quelques mots, pour la pastille sous son texte */
function effectChip(e: CardEffect): { text: string; tone: "good" | "bad" | "move" } {
  switch (e.kind) {
    case "money":
      return e.amount > 0 ? { text: `+${money(e.amount)}`, tone: "good" } : { text: `−${money(-e.amount)}`, tone: "bad" };
    case "moveTo":
      return { text: `→ ${SQUARES[e.square]!.name}`, tone: "move" };
    case "moveBy":
      return { text: e.steps < 0 ? `Recule de ${-e.steps} cases` : `Avance de ${e.steps} cases`, tone: "move" };
    case "nearest":
      return { text: e.target === "station" ? "→ gare la plus proche" : "→ réseau le plus proche", tone: "move" };
    case "jail":
      return { text: "En prison", tone: "bad" };
    case "jailFree":
      return { text: "Sortie de prison gardée", tone: "good" };
    case "repairs":
      return { text: `${money(e.level)} par niveau`, tone: "bad" };
    case "eachPlayer":
      return e.amount > 0 ? { text: `+${money(e.amount)} de chacun`, tone: "good" } : { text: `${money(-e.amount)} à chacun`, tone: "bad" };
  }
}

/** Le signe du paquet : un point d'interrogation pour Hasard, une enveloppe pour Courrier */
function DeckMark({ deck }: { deck: DeckId }) {
  if (deck === "hasard") return <span className="cap-card-mark-q">?</span>;
  return (
    <svg className="cap-card-mark-env" viewBox="0 0 24 24" aria-hidden="true">
      <rect x={2.5} y={5} width={19} height={14} rx={2.5} fill="currentColor" />
      <path d="M3.5 6.5 12 13l8.5-6.5" stroke="#fffaf0" strokeWidth={1.8} fill="none" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * La carte tirée : elle arrive du paquet, se retourne, et reste le temps de la lire (la barre en bas montre ce
 * qu'il reste avant qu'elle agisse). Un dessin pour ce qu'elle raconte, son effet en grand, qui l'a tirée.
 * Un clic la range plus tôt.
 */
export function CardShow({
  card,
  seat,
  mine,
  onClose,
  still = false,
}: {
  card: { deck: DeckId; card: number; read: number };
  seat: SeatView | undefined;
  mine: boolean;
  onClose: () => void;
  /** Posée telle quelle, sans animation (la planche de contrôle) */
  still?: boolean;
}) {
  const c = DECKS[card.deck][card.card];
  if (!c) return null;
  const chip = effectChip(c.effect);
  return (
    <motion.div
      className={`cap-card deck-${card.deck} ${still ? "is-still" : ""}`}
      role="status"
      aria-label={`Carte ${DECK_NAMES[card.deck]} : ${c.text}`}
      onClick={onClose}
      initial={still ? false : { opacity: 0, scale: 0.35, y: 140, rotate: -12 }}
      animate={{ opacity: 1, scale: 1, y: 0, rotate: 0 }}
      exit={{ opacity: 0, scale: 0.82, y: -30, transition: { duration: 0.22 } }}
      transition={{ type: "spring", stiffness: 210, damping: 21 }}
    >
      <motion.div
        className="cap-card-inner"
        initial={still ? false : { rotateY: 180 }}
        animate={{ rotateY: 0 }}
        transition={{ delay: 0.3, duration: 0.65, ease: [0.3, 0.7, 0.2, 1] }}
      >
        <div className="cap-card-face is-back" aria-hidden="true">
          <span className="cap-card-back-mark">
            <DeckMark deck={card.deck} />
          </span>
          <strong>{DECK_NAMES[card.deck]}</strong>
        </div>
        <div className="cap-card-face is-front">
          <span className="cap-card-corner is-tl" aria-hidden="true">
            <DeckMark deck={card.deck} />
          </span>
          <span className="cap-card-corner is-br" aria-hidden="true">
            <DeckMark deck={card.deck} />
          </span>
          <span className="cap-card-deck">{DECK_NAMES[card.deck]}</span>
          <span className="cap-card-art">
            <CardArt deck={card.deck} card={card.card} />
          </span>
          <p className="cap-card-text">{c.text}</p>
          <span className={`cap-card-chip tone-${chip.tone}`}>{chip.text}</span>
          <span className="cap-card-who">
            {seat && <Avatar avatar={seat.avatar} userId={seat.userId} photo={seat.photo} size={24} />}
            {mine ? "Ta carte" : `Tirée par ${seat?.name ?? "?"}`}
          </span>
          <span className="cap-card-time" style={{ animationDuration: `${Math.max(800, card.read - 380)}ms` }} />
        </div>
      </motion.div>
    </motion.div>
  );
}

/** En prison, au moment de lancer : les autres façons de sortir */
export function JailChoices({ cash, cards, busy, act }: { cash: number; cards: number; busy: boolean; act: (a: CapitaleAction) => void }) {
  return (
    <div className="cap-jail">
      <span>En prison : un double pour sortir, ou</span>
      <button className="btn btn-sm" disabled={cash < JAIL_FINE || busy} onClick={() => act({ type: "payJail" })}>
        payer {money(JAIL_FINE)}
      </button>
      {cards > 0 && (
        <button className="btn btn-sm" disabled={busy} onClick={() => act({ type: "useJailCard" })}>
          la carte
        </button>
      )}
    </div>
  );
}
