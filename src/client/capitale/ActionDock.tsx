import type { ReactNode } from "react";
import { GROUPS, JAIL_FINE, SQUARES } from "../../shared/games/capitale/board.ts";
import type { CapitaleAction } from "../../shared/games/capitale/engine.ts";
import type { CapitaleView } from "../../shared/games/capitale/view.ts";
import type { CapitaleRoomView, SeatView } from "../../shared/protocol.ts";
import { Avatar } from "../components/Avatar.tsx";
import { Icon } from "../components/Icon.tsx";
import { ConfirmButton } from "../components/ui.tsx";
import { TimerRing } from "../game/Seat.tsx";
import { colorOf, money } from "./boardUi.ts";
import { DeedCard } from "./Deed.tsx";
import { Note } from "./Money.tsx";

// Ce qu'on peut faire, selon le moment : un titre de propriété à acheter, une enchère, les dés, le chantier.
// Pendant que le plateau montre le coup précédent, les boutons attendent (busy) : on voit d'abord, on joue ensuite.

interface Props {
  g: CapitaleView;
  room: CapitaleRoomView;
  me: string | null;
  myTurn: boolean;
  meCash: number;
  busy: boolean;
  name: (id: string | null | undefined) => string;
  seat: (id: string) => SeatView | undefined;
  auctionLeft: number | null;
  serverOffset: number;
  act: (a: CapitaleAction) => void;
  onTitles: () => void;
  onTrade: () => void;
  onBuild: () => void;
  onTakeBack?: () => void;
}

export function ActionDock(p: Props) {
  const { g, room, me, myTurn, meCash, busy, name, seat, act } = p;
  const meP = me ? g.players.find((x) => x.id === me) : undefined;
  const playing = Boolean(meP && !meP.bankrupt) && g.step !== "over";
  const debt = g.debts[0];
  const a = g.auction;
  const actor = g.actor ?? g.players[g.turn]?.id ?? null;
  const actorSeat = actor ? seat(actor) : undefined;
  const creditor = (c: string) => (c === "bank" ? "à la banque" : c === "pot" ? "à la cagnotte" : `à ${c === me ? "toi" : name(c)}`);

  // La ligne du haut : qui joue, et son chrono
  const head = (
    <div className="cap-dock-head" style={{ ["--pawn" as string]: actor ? colorOf(g, actor) : "var(--gold)" }}>
      {actorSeat && <Avatar avatar={actorSeat.avatar} userId={actorSeat.userId} photo={actorSeat.photo} size={34} />}
      <span className="cap-dock-who">
        <strong>
          {g.step === "over" ? "Partie terminée" : a ? "Enchère en cours" : actor === me ? "À toi" : `Au tour de ${name(actor)}`}
        </strong>
        {busy && <span className="cap-dock-wait">regarde le plateau…</span>}
      </span>
      {myTurn && room.deadline && !a && (
        <span className="cap-dock-timer">
          <TimerRing size={30} deadline={room.deadline} total={g.settings.turnSeconds} offset={p.serverOffset} />
        </span>
      )}
    </div>
  );

  let body: ReactNode = null;
  if (g.step === "over") body = <p className="cap-dock-text">La partie est terminée.</p>;
  else if (p.onTakeBack) {
    body = (
      <>
        <p className="cap-dock-text">Un bot gère tes affaires en attendant.</p>
        <button className="btn btn-primary btn-lg" onClick={p.onTakeBack}>
          Reprendre la main
        </button>
      </>
    );
  } else if (a) {
    // L'enchère : le titre, la meilleure offre en grand, le chrono, les offres en billets
    const canBid = me && g.bidders.includes(me) && a.high?.player !== me;
    const bid = (inc: number) => (a.high?.amount ?? 0) + inc;
    body = (
      <div className="cap-auction">
        <DeedCard g={g} index={a.square} compact />
        <div className="cap-auction-live">
          <span className="hint">Meilleure offre</span>
          <strong className="num cap-auction-high">{a.high ? money(a.high.amount) : "—"}</strong>
          <span className="cap-auction-by">
            {a.high ? (a.high.player === me ? "c'est toi qui mènes" : `par ${name(a.high.player)}`) : "personne n'a encore misé"}
          </span>
          {p.auctionLeft !== null && (
            <span className="cap-auction-bar" style={{ ["--left" as string]: Math.max(0, Math.min(1, p.auctionLeft / 12)) }}>
              <span className="num">{p.auctionLeft} s</span>
            </span>
          )}
          {canBid && (
            <div className="cap-bids">
              {[10, 50, 100].map((inc) => (
                <button
                  key={inc}
                  className="cap-bid"
                  disabled={bid(inc) > meCash || busy}
                  onClick={() => act({ type: "bid", amount: bid(inc) })}
                >
                  <Note value={inc === 10 ? 10 : inc} size="md" />
                  <span className="num">{money(bid(inc))}</span>
                </button>
              ))}
              <button className="btn btn-ghost" disabled={busy} onClick={() => act({ type: "pass" })}>
                Passer
              </button>
            </div>
          )}
          {me && !g.bidders.includes(me) && <span className="hint">Tu as passé.</span>}
        </div>
      </div>
    );
  } else if (debt) {
    body =
      debt.debtor === me ? (
        <div className="cap-debt">
          <p className="cap-dock-text">
            Tu dois <strong className="num">{money(debt.amount)}</strong> {creditor(debt.creditor)}. Vends des bâtiments ou hypothèque des
            titres : la dette se paie dès que l'argent suffit.
          </p>
          <div className="cap-dock-buttons">
            <button className="btn btn-primary btn-lg" onClick={p.onTitles}>
              <Icon name="cards" size={18} /> Mes titres
            </button>
            <ConfirmButton className="btn btn-ghost" confirm="Tout abandonner ?" onConfirm={() => act({ type: "bankrupt" })}>
              Faire faillite
            </ConfirmButton>
          </div>
        </div>
      ) : (
        <p className="cap-dock-text">
          {name(debt.debtor)} doit trouver {money(debt.amount)} {creditor(debt.creditor)}.
        </p>
      );
  } else if (g.step === "buy" && g.pendingBuy !== null) {
    const i = g.pendingBuy;
    const sq = SQUARES[i]!;
    const group = sq.group ? GROUPS[sq.group] : null;
    const mine = group ? group.squares.filter((x) => g.deeds[x]!.owner === (myTurn ? me : actor)).length : 0;
    body = (
      <div className="cap-buy">
        {group && (
          <p className="cap-buy-group">
            {myTurn ? "Tu as" : `${name(actor)} a`} {mine} rue{mine > 1 ? "s" : ""} sur {group.squares.length} du quartier{" "}
            {group.name.toLowerCase()}
            {mine + 1 === group.squares.length ? " : celle-ci le complète !" : "."}
          </p>
        )}
        {myTurn ? (
          <div className="cap-dock-buttons">
            <button
              className="btn btn-primary btn-lg cap-buy-btn"
              disabled={meCash < sq.price! || busy}
              onClick={() => act({ type: "buy" })}
            >
              Acheter <span className="num">{money(sq.price!)}</span>
            </button>
            <button className="btn" disabled={busy} onClick={() => act({ type: "decline" })}>
              Laisser aux enchères
            </button>
          </div>
        ) : (
          <p className="cap-dock-text">{name(actor)} hésite…</p>
        )}
        {myTurn && meCash < sq.price! && <p className="hint">Pas assez d'argent : hypothèque un titre, ou laisse-le aux enchères.</p>}
        <DeedCard g={g} index={i} compact />
      </div>
    );
  } else if (g.step === "roll") {
    if (myTurn) {
      body = (
        <div className="cap-dock-buttons">
          <button className="btn btn-primary btn-lg cap-roll" disabled={busy} onClick={() => act({ type: "roll" })}>
            <Icon name="dice" size={22} /> {g.rollAgain ? "Relancer (double !)" : "Lancer les dés"}
          </button>
          {meP?.inJail && (
            <>
              <button className="btn" disabled={meCash < JAIL_FINE || busy} onClick={() => act({ type: "payJail" })}>
                Payer {money(JAIL_FINE)} et sortir
              </button>
              {meP.jailCards.length > 0 && (
                <button className="btn" disabled={busy} onClick={() => act({ type: "useJailCard" })}>
                  Carte « sortie de prison »
                </button>
              )}
            </>
          )}
        </div>
      );
      if (meP?.inJail)
        body = (
          <>
            <p className="cap-dock-text">Tu es en prison ({meP.jailTurns + 1}e tour) : tente un double, paie ou utilise une carte.</p>
            {body}
          </>
        );
    } else body = <p className="cap-dock-text">{name(actor)} va lancer les dés.</p>;
  } else if (g.step === "manage") {
    body = myTurn ? (
      <div className="cap-manage">
        <button className="cap-big is-build" disabled={busy} onClick={p.onBuild}>
          <Icon name="build" size={26} />
          <span>Construire</span>
        </button>
        <button className="cap-big" disabled={busy} onClick={p.onTitles}>
          <Icon name="cards" size={26} />
          <span>Mes titres</span>
        </button>
        <button className="cap-big" disabled={busy} onClick={p.onTrade}>
          <Icon name="swap" size={26} />
          <span>Échanger</span>
        </button>
        <button className="cap-big is-end" disabled={busy} onClick={() => act({ type: "endTurn" })}>
          <Icon name="check" size={26} />
          <span>Finir le tour</span>
        </button>
      </div>
    ) : (
      <p className="cap-dock-text">{name(actor)} gère ses affaires : construire, échanger…</p>
    );
  }

  return (
    <div className={`cap-dock panel ${myTurn ? "is-mine" : ""} ${busy ? "is-busy" : ""}`}>
      {head}
      {body}
      {playing && !p.onTakeBack && g.step !== "manage" && !(debt?.debtor === me) && (
        <div className="cap-dock-links">
          <button className="btn btn-sm btn-ghost" onClick={p.onTitles}>
            <Icon name="cards" size={16} /> Mes titres
          </button>
          {!a && (
            <button className="btn btn-sm btn-ghost" onClick={p.onTrade}>
              <Icon name="swap" size={16} /> Échanger
            </button>
          )}
        </div>
      )}
    </div>
  );
}
