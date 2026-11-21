import { BUILDS } from "../../shared/games/capitale/builder.ts";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { DECK_NAMES, DISASTERS, LANDMARKS, LEVEL_NAMES, sideName, SPECIALS, SQUARES, teamName } from "../../shared/games/capitale/board.ts";
import type { CapitaleEvent } from "../../shared/games/capitale/engine.ts";
import type { CapitaleView } from "../../shared/games/capitale/view.ts";
import type { SeatView } from "../../shared/protocol.ts";
import { Avatar } from "../components/Avatar.tsx";
import { Modal } from "../components/ui.tsx";
import { colorOf, money } from "./boardUi.ts";
import { isMate } from "./teamsUi.tsx";

// Ce qui se passe, en clair : chaque événement devient une phrase, montrée au moment où on le voit sur le plateau.

export type Tone = "turn" | "info" | "good" | "bad" | "big";

export interface Line {
  id: number;
  text: string;
  tone: Tone;
  /** Le joueur dont on montre le visage */
  who: string | null;
  /** Quand elle est apparue (ms), et combien de fois de suite */
  at?: number;
  times?: number;
}

/** Ajoute une phrase au fil ; la même phrase répétée juste après se regroupe (« ×3 ») */
export function pushLine(lines: Line[], line: Omit<Line, "id" | "at" | "times">, id: number): Line[] {
  const last = lines[lines.length - 1];
  const now = Date.now();
  if (last && last.text === line.text && now - (last.at ?? 0) < 8000) {
    return [...lines.slice(0, -1), { ...last, id, at: now, times: (last.times ?? 1) + 1 }];
  }
  return [...lines.slice(-60), { ...line, id, at: now, times: 1 }];
}

interface Ctx {
  g: CapitaleView;
  name: (id: string) => string;
}

/** Une phrase pour un événement, ou null s'il se voit déjà assez (une carte, un pas de pion…) */
export function describe(e: CapitaleEvent, { g, name }: Ctx): Omit<Line, "id"> | null {
  const me = g.you;
  const isMe = (id: string | null | undefined) => id !== null && id !== undefined && id === me;
  /** « Berthe achète » ou « Tu achètes » */
  const say = (id: string, third: string, second: string) => (isMe(id) ? `Tu ${second}` : `${name(id)} ${third}`);
  const sq = (i: number | undefined) => (i !== undefined ? SQUARES[i]!.name : "");
  /** « de Berthe », « d'Odile » */
  const of = (id: string) => (isMe(id) ? "à toi" : /^[aeiouyhéèêàâîïôû]/i.test(name(id)) ? `d'${name(id)}` : `de ${name(id)}`);
  switch (e.type) {
    case "turn":
      return { text: isMe(e.player) ? "À toi de jouer\u00a0!" : `Au tour de ${name(e.player)}`, tone: "turn", who: e.player };
    case "dice": {
      const [a, b] = e.dice;
      const text = `${say(e.player, "fait", "fais")} ${a} + ${b} = ${a + b}${e.doubles ? "\u00a0: double\u00a0!" : ""}`;
      return { text, tone: e.doubles ? "big" : "info", who: e.player };
    }
    case "money": {
      const from = e.from;
      const to = e.to;
      const player = (a: string) => a !== "bank" && a !== "pot";
      if (e.reason === "rent" && player(from) && player(to)) {
        // Entre coéquipiers, le loyer réduit de l'équipe
        if (isMate(g, from, to))
          return {
            text: `${say(from, "paie", "paies")} ${money(e.amount)} à ${isMe(to) ? "toi" : name(to)}, tarif d'équipe (${sq(e.square)})`,
            tone: "info",
            who: from,
          };
        if (isMe(from)) return { text: `Tu paies ${money(e.amount)} de loyer à ${name(to)} (${sq(e.square)})`, tone: "bad", who: to };
        if (isMe(to)) return { text: `${name(from)} te paie ${money(e.amount)} de loyer (${sq(e.square)})`, tone: "good", who: from };
        return { text: `${name(from)} paie ${money(e.amount)} de loyer à ${name(to)}`, tone: "info", who: from };
      }
      if (e.reason === "ticket" && player(from) && player(to)) {
        return {
          text: isMe(to)
            ? `${name(from)} paie un billet de ${money(e.amount)} à ton stade`
            : `${say(from, "paie", "paies")} un billet de ${money(e.amount)} au stade ${of(to)}`,
          tone: isMe(from) ? "bad" : isMe(to) ? "good" : "info",
          who: from,
        };
      }
      if (e.reason === "tax" && player(from)) {
        const what = e.square === 38 ? "de péage" : "d'impôts";
        return { text: `${say(from, "paie", "paies")} ${money(e.amount)} ${what}`, tone: isMe(from) ? "bad" : "info", who: from };
      }
      if (e.reason === "go" && player(to)) {
        return { text: `${say(to, "passe", "passes")} par Départ\u00a0: +${money(e.amount)}`, tone: isMe(to) ? "good" : "info", who: to };
      }
      if (e.reason === "pot" && player(to)) {
        return { text: `${say(to, "ramasse", "ramasses")} la cagnotte\u00a0: +${money(e.amount)}`, tone: "big", who: to };
      }
      if (e.reason === "jail" && player(from)) {
        return { text: `${say(from, "paie", "paies")} ${money(e.amount)} pour sortir de prison`, tone: "info", who: from };
      }
      return null;
    }
    case "buy":
      return { text: `${say(e.player, "achète", "achètes")} ${sq(e.square)} pour ${money(e.price)}`, tone: "info", who: e.player };
    case "auction":
      return { text: `${sq(e.square)} part aux enchères\u00a0!`, tone: "big", who: null };
    case "auctionEnd":
      return e.winner
        ? { text: `${say(e.winner, "remporte", "remportes")} ${sq(e.square)} pour ${money(e.amount)}`, tone: "big", who: e.winner }
        : { text: `Personne ne veut de ${sq(e.square)}`, tone: "info", who: null };
    case "upgrade":
      return {
        text:
          e.level === 5
            ? `${say(e.player, "élève", "élèves")} ${LANDMARKS[e.square] ?? "un monument"} à ${sq(e.square)}\u00a0!`
            : `${say(e.player, "améliore", "améliores")} ${sq(e.square)}\u00a0: ${LEVEL_NAMES[e.level]!.toLowerCase()}`,
        tone: e.level === 5 ? "big" : "info",
        who: e.player,
      };
    case "special": {
      const info = SPECIALS[e.kind];
      const owner = g.deeds[e.square]?.owner ?? null;
      if (info.nuisance) {
        const at = isMe(owner) ? "chez toi" : `chez ${owner ? name(owner) : "?"}`;
        return {
          text: `${say(e.player, "pose", "poses")} ${info.one} ${at}, à ${sq(e.square)}\u00a0!`,
          tone: isMe(owner) ? "bad" : "big",
          who: e.player,
        };
      }
      return { text: `${say(e.player, "construit", "construis")} ${info.one} à ${sq(e.square)}`, tone: "big", who: e.player };
    }
    case "sell":
      return { text: `${say(e.player, "revend", "revends")} un niveau de ${sq(e.square)}`, tone: "info", who: e.player };
    case "build": {
      // Builder : le monument, une nuisance, et ce que bâtissent les autres (le sien, on le voit pousser)
      const info = BUILDS[e.building.kind];
      if (e.building.kind === "monument")
        return {
          text: `${say(e.player, "élève", "élèves")} ${LANDMARKS[e.square] ?? "le monument"} à ${sq(e.square)}\u00a0!`,
          tone: "big",
          who: e.player,
        };
      if (info.nuisance)
        return {
          text: `${say(e.player, "pose", "poses")} ${info.one} à ${sq(e.square)}\u00a0: ses voisins perdent 30\u00a0%`,
          tone: "big",
          who: e.player,
        };
      if (isMe(e.player)) return null;
      return { text: `${name(e.player)} pose ${info.one} à ${sq(e.square)}`, tone: "info", who: e.player };
    }
    case "annex":
      return {
        text: `${say(e.player, "repousse", "repousses")} la frontière de ${sq(e.square)} d'une case (${money(e.price)})`,
        tone: "info",
        who: e.player,
      };
    case "demolish":
      return e.how === "auto" || !isMe(e.player)
        ? null
        : { text: `Tu démolis ${BUILDS[e.building.kind].the} de ${sq(e.square)}`, tone: "info", who: e.player };
    case "raze":
      return e.how === "auto"
        ? null
        : {
            text:
              e.how === "pay"
                ? `${say(e.player, "fait", "fais")} raser ${SPECIALS[e.kind].the} de ${sq(e.square)}`
                : `${say(e.player, "revend", "revends")} ${SPECIALS[e.kind].the} de ${sq(e.square)}`,
            tone: "info",
            who: e.player,
          };
    case "mortgage":
      return { text: `${say(e.player, "hypothèque", "hypothèques")} ${sq(e.square)}`, tone: "info", who: e.player };
    case "unmortgage":
      return { text: `${say(e.player, "lève", "lèves")} l'hypothèque de ${sq(e.square)}`, tone: "info", who: e.player };
    case "jail":
      return { text: `${say(e.player, "va", "vas")} en prison\u00a0!`, tone: "bad", who: e.player };
    case "leaveJail": {
      const how =
        e.how === "pay"
          ? "paie et sort"
          : e.how === "card"
            ? "sort avec sa carte"
            : e.how === "doubles"
              ? "sort sur un double"
              : "sort, au bout de 3 tours";
      const howMe =
        e.how === "pay"
          ? "paies et sors"
          : e.how === "card"
            ? "sors avec ta carte"
            : e.how === "doubles"
              ? "sors sur un double"
              : "sors, au bout de 3 tours";
      return { text: `${say(e.player, how, howMe)} de prison`, tone: "info", who: e.player };
    }
    case "debt":
      return {
        text: `${say(e.player, "doit", "dois")} trouver ${money(e.amount)}\u00a0: vendre ou hypothéquer`,
        tone: isMe(e.player) ? "bad" : "info",
        who: e.player,
      };
    case "trade":
      if (e.status === "proposed")
        return {
          text: `${say(e.trade.from, "propose", "proposes")} un échange à ${isMe(e.trade.to) ? "toi" : name(e.trade.to)}`,
          tone: "info",
          who: e.trade.from,
        };
      if (e.status === "accepted")
        return { text: `Marché conclu entre ${name(e.trade.from)} et ${name(e.trade.to)}`, tone: "big", who: e.trade.to };
      if (e.status === "rejected") return { text: `${say(e.trade.to, "refuse", "refuses")} l'échange`, tone: "info", who: e.trade.to };
      return null;
    case "bankrupt":
      if (e.heir)
        return {
          text: `${say(e.player, "fait", "fais")} faillite\u00a0: ${isMe(e.to) ? "tu reprends" : `${name(e.to as string)} reprend`} ses titres, l'équipe les garde`,
          tone: "bad",
          who: e.player,
        };
      return { text: `${say(e.player, "fait", "fais")} faillite`, tone: "bad", who: e.player };
    case "gift": {
      const parts = [
        ...e.give.squares.map((i) => SQUARES[i]!.name),
        ...(e.give.cash > 0 ? [money(e.give.cash)] : []),
        ...(e.give.jailCards > 0 ? [e.give.jailCards > 1 ? "des cartes de sortie de prison" : "une carte de sortie de prison"] : []),
      ].join(", ");
      if (isMe(e.to)) return { text: `${name(e.from)} te donne ${parts}`, tone: "good", who: e.from };
      return { text: `${say(e.from, "donne", "donnes")} ${parts} à ${name(e.to)}`, tone: "info", who: e.from };
    }
    case "teamFree":
      return {
        text: isMe(e.player)
          ? `Chez ${isMe(e.owner) ? "toi" : name(e.owner)}, de ton équipe\u00a0: pas de loyer (${money(e.amount)} économisés)`
          : `${name(e.player)} est chez ${isMe(e.owner) ? "toi" : name(e.owner)}, de son équipe\u00a0: pas de loyer`,
        tone: isMe(e.player) || isMe(e.owner) ? "good" : "info",
        who: e.player,
      };
    case "monopoly": {
      const what =
        e.kind === "stations" ? "les quatre gares" : e.kind === "side" ? `tout ${sideName(e.side ?? 0)}` : "trois quartiers complets";
      const who = e.team !== null ? `Les ${teamName(e.team)} réunissent` : isMe(e.player) ? "Tu réunis" : `${name(e.player)} réunit`;
      return { text: `Monopole\u00a0! ${who} ${what}`, tone: "big", who: e.player };
    }
    case "timeUp":
      return { text: "C'est l'heure\u00a0: ce tour est le dernier", tone: "big", who: null };
    case "reshuffle":
      return { text: `Le paquet ${DECK_NAMES[e.deck]} est épuisé\u00a0: on remélange toutes ses cartes`, tone: "info", who: null };
    case "buyout":
      return {
        text: isMe(e.from)
          ? `${name(e.player)} te rachète ${sq(e.square)} pour ${money(e.price)}\u00a0!`
          : `${say(e.player, "rachète", "rachètes")} ${sq(e.square)} à ${isMe(e.from) ? "toi" : name(e.from)} pour ${money(e.price)}\u00a0!`,
        tone: isMe(e.from) ? "bad" : "big",
        who: e.player,
      };
    case "disaster": {
      const what = DISASTERS[e.kind].name;
      if (e.kind === "expropriation")
        return e.title !== undefined
          ? {
              text: `${what}\u00a0: la banque reprend ${sq(e.title)} ${of(e.player)}`,
              tone: isMe(e.player) ? "bad" : "info",
              who: e.player,
            }
          : { text: `${what}\u00a0: rien à reprendre ${of(e.player)}`, tone: "info", who: e.player };
      if (e.kind === "cession")
        return e.title !== undefined && e.to
          ? {
              text: `${what}\u00a0: ${sq(e.title)} passe ${of(e.player)} à ${isMe(e.to) ? "toi" : name(e.to)}`,
              tone: isMe(e.player) ? "bad" : isMe(e.to) ? "good" : "info",
              who: e.player,
            }
          : { text: `${what}\u00a0: rien à céder, ouf\u00a0!`, tone: "info", who: e.player };
      if (e.hits.length === 0) return { text: `${what}\u00a0: plus de peur que de mal, rien n'est touché`, tone: "info", who: e.player };
      const list = e.hits.map((h) => `${sq(h.square)}${isMe(h.owner) ? " (à toi)" : ""}`).join(", ");
      return {
        text: `${what}\u00a0: ${list} ${e.hits.length > 1 ? "perdent" : "perd"} un niveau`,
        tone: e.hits.some((h) => isMe(h.owner)) ? "bad" : "big",
        who: e.player,
      };
    }
    default:
      return null;
  }
}

/** Le bandeau en haut du plateau : les dernières phrases, la plus récente en grand */
export function Narrator({ lines, g, seat }: { lines: Line[]; g: CapitaleView; seat: (id: string) => SeatView | undefined }) {
  // Les phrases récentes seulement : le fil se vide quand il ne se passe plus rien
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const shown = lines
    .filter((l) => now - (l.at ?? now) < 7000)
    .slice(-1)
    .reverse();
  return (
    <div className="cap-narrator" aria-live="polite">
      <AnimatePresence initial={false}>
        {shown.map((l, k) => {
          const s = l.who ? seat(l.who) : undefined;
          return (
            <motion.div
              key={l.id}
              layout
              className={`cap-line tone-${l.tone} ${k === 0 ? "is-new" : ""}`}
              style={{ ["--pawn" as string]: l.who ? colorOf(g, l.who) : "var(--gold)" }}
              initial={{ y: -16, opacity: 0, scale: 0.94 }}
              animate={{ y: 0, opacity: k === 0 ? 1 : 0.72 - k * 0.18, scale: k === 0 ? 1 : 0.92 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
            >
              {s ? (
                <Avatar avatar={s.avatar} userId={s.userId} photo={s.photo} size={k === 0 ? 24 : 20} />
              ) : (
                <span className="cap-line-dot" />
              )}
              <span>
                {l.text}
                {(l.times ?? 1) > 1 && <b className="cap-line-times"> ×{l.times}</b>}
              </span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

/** Le journal : tout ce qui s'est passé depuis l'arrivée à la table */
export function Journal({ open, onClose, lines }: { open: boolean; onClose: () => void; lines: Line[] }) {
  return (
    <Modal open={open} onClose={onClose} title="Le journal de la partie">
      <ol className="cap-journal">
        {lines.length === 0 && <li className="hint">Rien encore.</li>}
        {[...lines].reverse().map((l) => (
          <li key={l.id} className={`tone-${l.tone}`}>
            {l.text}
            {(l.times ?? 1) > 1 && ` ×${l.times}`}
          </li>
        ))}
      </ol>
    </Modal>
  );
}
