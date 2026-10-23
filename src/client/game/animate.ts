import { COLOR_LABELS, type Card } from "../../shared/games/uno/cards.ts";
import type { UnoEvent } from "../../shared/games/uno/engine.ts";
import type { RoomView } from "../../shared/protocol.ts";
import { COLOR_HEX } from "../components/Card.tsx";
import { play, vibrate } from "../lib/sound.ts";
import { usePrefs } from "../stores/prefs.ts";
import { anchorRect, centerOf, effect, fly, shake, wait } from "./fx.ts";
import { usePileExtras } from "./pileExtras.ts";

export function pileRotation(cardId: number): number {
  return ((cardId * 37) % 25) - 12;
}

function seatRect(id: string, me: string | null): DOMRect | null {
  return id === me ? anchorRect("hand") : anchorRect(`seat-${id}`);
}

/** Taille d'arrivee d'une carte : petite chez un adversaire, normale dans ma main. */
function arrivalWidth(id: string, me: string | null, pileW: number): number {
  return id === me ? pileW : 26;
}

function seatPoint(id: string, me: string | null, dy = -10) {
  const c = centerOf(seatRect(id, me));
  return { x: c.x, y: c.y + (id === me ? -40 : dy) };
}

function nameOf(room: RoomView, id: string): string {
  return room.seats.find((s) => s.id === id)?.name ?? "?";
}

/** Rejoue en animation les evenements d'un message, avant que le nouvel etat ne s'affiche. */
export async function animateEvents(events: UnoEvent[], prev: RoomView, next: RoomView): Promise<void> {
  const me = next.you.seatId;
  const reduced = usePrefs.getState().reducedEffects;
  const pileW = anchorRect("pile")?.width ?? 80;
  const prevHand = new Set(prev.uno?.hand.map((c) => c.id) ?? []);
  const newMine = (next.uno?.hand ?? []).filter((c) => !prevHand.has(c.id));
  let mineCursor = 0;

  for (const e of events) {
    switch (e.type) {
      case "deal": {
        play("shuffle");
        const deck = anchorRect("deck");
        if (deck) {
          const targets = (next.uno?.players ?? []).map((p) => seatRect(p.id, me)).filter(Boolean) as DOMRect[];
          const flights: Promise<void>[] = [];
          for (let round = 0; round < 3; round++) {
            targets.forEach((to, i) => {
              flights.push(
                fly({ card: null, from: deck, to, width: pileW, toWidth: 26, duration: 320, delay: (round * targets.length + i) * 45 }),
              );
            });
          }
          await Promise.all(flights);
          play("cardSlide");
          await fly({
            card: e.top,
            from: deck,
            to: anchorRect("pile") ?? deck,
            width: pileW,
            duration: 380,
            flip: true,
            toRotate: pileRotation(e.top.id),
          });
          usePileExtras.getState().push(e.top);
        }
        break;
      }

      case "play": {
        const from = e.player === me ? (anchorRect(`hand-card-${e.card.id}`) ?? anchorRect("hand")) : anchorRect(`seat-${e.player}`);
        const to = anchorRect("pile");
        if (from && to) {
          if (e.player === me) usePileExtras.getState().hide(e.card.id);
          play("cardSlide", { volume: 0.6 });
          await fly({
            card: e.card,
            from,
            to,
            width: pileW,
            fromWidth: e.player === me ? undefined : 26,
            duration: e.player === me ? 340 : 420,
            flip: e.player !== me,
            fromRotate: e.player === me ? 0 : -20,
            toRotate: pileRotation(e.card.id),
          });
        }
        usePileExtras.getState().push(e.card);
        play("cardPlace");
        if (e.jumpIn) {
          const p = centerOf(to);
          effect({ kind: "banner", text: "Interception !", sub: nameOf(next, e.player), tone: "gold", x: p.x, y: p.y - 70 });
          play("hit", { volume: 0.6 });
        }
        break;
      }

      case "color": {
        const p = centerOf(anchorRect("pile"));
        effect({ kind: "ripple", x: p.x, y: p.y, color: COLOR_HEX[e.color] });
        effect({ kind: "float", text: COLOR_LABELS[e.color], tone: e.color, x: p.x, y: p.y + 60, duration: 1200 });
        play("wild");
        break;
      }

      case "skip": {
        const p = seatPoint(e.player, me);
        effect({ kind: "stamp", text: "Passe !", tone: "red", x: p.x, y: p.y });
        play("skip");
        if (e.player === me) vibrate(60);
        break;
      }

      case "skipAll": {
        const p = centerOf(anchorRect("pile"));
        effect({ kind: "banner", text: "Tout le monde passe !", tone: "red", x: p.x, y: p.y - 70 });
        for (const pl of next.uno?.players ?? []) {
          if (pl.id === e.player || pl.out) continue;
          const sp = seatPoint(pl.id, me);
          effect({ kind: "stamp", text: "Passe", tone: "red", x: sp.x, y: sp.y });
        }
        play("skip");
        await wait(250);
        break;
      }

      case "reverse": {
        const p = centerOf(anchorRect("pile"));
        effect({
          kind: "float",
          text: e.direction === 1 ? "↻ Sens horaire" : "↺ Sens inversé",
          tone: "white",
          x: p.x,
          y: p.y - 62,
          duration: 1300,
        });
        play("reverse");
        break;
      }

      case "stack": {
        const p = seatPoint(e.victim, me);
        effect({ kind: "float", text: `+${e.total}`, tone: "danger", x: p.x, y: p.y - 6, duration: 1400 });
        if (e.total >= 6 && !reduced) shake(e.total >= 10 ? 2 : 1);
        play(e.total >= 8 ? "bigHit" : "hit");
        if (e.victim === me) vibrate([60, 40, 90]);
        await wait(180);
        break;
      }

      case "draw": {
        const deck = anchorRect("deck");
        const target = seatRect(e.player, me);
        if (deck && target) {
          const shown = Math.min(e.count, 8);
          const flights: Promise<void>[] = [];
          for (let i = 0; i < shown; i++) {
            const card: Card | null = e.player === me ? (newMine[mineCursor++] ?? null) : null;
            flights.push(
              fly({
                card,
                from: deck,
                to: target,
                width: pileW,
                toWidth: arrivalWidth(e.player, me, pileW),
                duration: 300,
                delay: i * (e.count > 4 ? 55 : 85),
                flip: card !== null,
                toRotate: e.player === me ? 0 : 12,
              }),
            );
            play("cardDraw", { delay: i * (e.count > 4 ? 55 : 85) });
          }
          await Promise.all(flights);
        }
        if (e.reason !== "voluntary" && e.count >= 4) {
          const p = seatPoint(e.player, me);
          effect({ kind: "float", text: `+${e.count}`, tone: "danger", x: p.x, y: p.y, duration: 1300 });
          if (!reduced) shake(e.count >= 10 ? 2 : 1);
          play("bigHit");
          if (e.player === me) vibrate([80, 50, 120]);
        }
        break;
      }

      case "challenge": {
        const p = centerOf(anchorRect("pile"));
        effect({
          kind: "banner",
          text: "Contesté !",
          sub: `${nameOf(next, e.challenger)} accuse ${nameOf(next, e.target)}`,
          tone: "white",
          x: p.x,
          y: p.y - 70,
          duration: 1100,
        });
        play("buzzer", { volume: 0.5 });
        await wait(900);
        effect({
          kind: "banner",
          text: e.success ? "Bluff démasqué !" : "Coup régulier !",
          sub: e.success ? `${nameOf(next, e.target)} pioche 4` : `${nameOf(next, e.challenger)} pioche 6`,
          tone: e.success ? "gold" : "red",
          x: p.x,
          y: p.y - 70,
          big: true,
        });
        play(e.success ? "achievement" : "buzzer");
        await wait(500);
        break;
      }

      case "uno": {
        const p = seatPoint(e.player, me, -30);
        effect({ kind: "banner", text: "UNO !", tone: "gold", x: p.x, y: p.y, big: true, duration: 1200 });
        play("uno");
        if (e.player === me) vibrate(40);
        break;
      }

      case "caught": {
        const p = seatPoint(e.player, me);
        effect({ kind: "stamp", text: "Pris !", tone: "red", x: p.x, y: p.y, duration: 1500 });
        effect({ kind: "float", text: `dénoncé par ${nameOf(next, e.by)}`, tone: "white", x: p.x, y: p.y + 40, duration: 1600 });
        play("caught");
        if (e.player === me) vibrate([100, 60, 100]);
        await wait(250);
        break;
      }

      case "swap": {
        const a = seatRect(e.a, me);
        const b = seatRect(e.b, me);
        if (a && b) {
          play("cardSlide");
          await Promise.all([
            fly({
              card: null,
              from: a,
              to: b,
              width: pileW,
              fromWidth: arrivalWidth(e.a, me, pileW),
              toWidth: arrivalWidth(e.b, me, pileW),
              duration: 520,
            }),
            fly({
              card: null,
              from: b,
              to: a,
              width: pileW,
              fromWidth: arrivalWidth(e.b, me, pileW),
              toWidth: arrivalWidth(e.a, me, pileW),
              duration: 520,
            }),
          ]);
        }
        const p = centerOf(anchorRect("pile"));
        effect({
          kind: "banner",
          text: "Échange de mains !",
          sub: `${nameOf(next, e.a)} ⇄ ${nameOf(next, e.b)}`,
          tone: "blue",
          x: p.x,
          y: p.y - 70,
        });
        break;
      }

      case "rotate": {
        const players = (prev.uno?.players ?? []).filter((pl) => !pl.out);
        const flights: Promise<void>[] = [];
        players.forEach((pl, i) => {
          const target = players[(i + (e.direction === 1 ? 1 : players.length - 1)) % players.length]!;
          const a = seatRect(pl.id, me);
          const b = seatRect(target.id, me);
          if (a && b)
            flights.push(
              fly({
                card: null,
                from: a,
                to: b,
                width: pileW,
                fromWidth: arrivalWidth(pl.id, me, pileW),
                toWidth: arrivalWidth(target.id, me, pileW),
                duration: 600,
              }),
            );
        });
        play("cardSlide");
        await Promise.all(flights);
        const p = centerOf(anchorRect("pile"));
        effect({ kind: "banner", text: "Les mains tournent !", tone: "green", x: p.x, y: p.y - 70 });
        break;
      }

      case "discardAll": {
        const p = centerOf(anchorRect("pile"));
        if (e.count > 0) {
          effect({
            kind: "banner",
            text: "Défausse tout !",
            sub: `${e.count} carte${e.count > 1 ? "s" : ""} en plus`,
            tone: e.color,
            x: p.x,
            y: p.y - 70,
          });
          play("cardSlide");
        }
        break;
      }

      case "roulette": {
        const p = centerOf(anchorRect("pile"));
        effect({
          kind: "banner",
          text: "Roulette !",
          sub: `${nameOf(next, e.victim)} cherche du ${COLOR_LABELS[e.color].toLowerCase()}`,
          tone: e.color,
          x: p.x,
          y: p.y - 70,
        });
        const deck = anchorRect("deck");
        const target = seatRect(e.victim, me);
        if (deck && target) {
          const shown = e.flipped.slice(0, 10);
          await Promise.all(
            shown.map((card, i) => {
              play("cardDraw", { delay: i * 140 });
              return fly({
                card,
                from: deck,
                to: target,
                width: pileW,
                toWidth: arrivalWidth(e.victim, me, pileW),
                duration: 360,
                delay: i * 140,
                flip: true,
              });
            }),
          );
        }
        effect({
          kind: "float",
          text: `+${e.flipped.length}`,
          tone: "danger",
          x: centerOf(target).x,
          y: centerOf(target).y - 20,
          duration: 1400,
        });
        if (e.flipped.length >= 5 && !reduced) shake(1);
        play(e.flipped.length >= 5 ? "bigHit" : "hit");
        break;
      }

      case "eliminated": {
        const p = seatPoint(e.player, me);
        effect({ kind: "stamp", text: "Éliminé", tone: "danger", x: p.x, y: p.y, duration: 1800 });
        play("eliminated");
        if (!reduced) shake(2);
        await wait(400);
        break;
      }

      case "finish": {
        const p = seatPoint(e.player, me);
        effect({ kind: "stamp", text: e.rank === 1 ? "1er !" : `${e.rank}e`, tone: "gold", x: p.x, y: p.y, duration: 1800 });
        play("achievement");
        break;
      }

      case "reshuffle": {
        const p = centerOf(anchorRect("deck"));
        effect({ kind: "float", text: "On remélange…", tone: "white", x: p.x, y: p.y - 50, duration: 1200 });
        play("shuffle");
        break;
      }

      case "pass": {
        const p = seatPoint(e.player, me);
        effect({ kind: "float", text: "passe", tone: "white", x: p.x, y: p.y, duration: 1000 });
        break;
      }

      case "roundOver":
      case "gameOver":
        break;
    }
  }
}
