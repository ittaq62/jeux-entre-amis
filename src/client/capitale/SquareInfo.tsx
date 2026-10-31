import { GO_SALARY, GROUPS, JAIL_FINE, LEVEL_NAMES, SPECIALS, SQUARES, STATION_RENTS } from "../../shared/games/capitale/board.ts";
import { levelOf, rentFor } from "../../shared/games/capitale/engine.ts";
import type { CapitaleView } from "../../shared/games/capitale/view.ts";
import { asState, colorOf, money } from "./boardUi.ts";

// Ce que fait chaque case, en une phrase : pour la bulle au survol, et les fenêtres quand on touche une case.

export interface SquareFacts {
  title: string;
  /** La couleur du bandeau : celle du quartier, ou une teinte selon le genre de case */
  band: string;
  /** Le genre de case, en deux ou trois mots */
  kind: string;
  /** Ce qu'elle fait, en une phrase */
  what: string;
  /** Le chiffre qui compte : son prix si elle est libre, son loyer sinon */
  figure?: { label: string; value: string };
  owner?: { id: string; color: string };
  /** Une ligne de plus : le niveau, le bâtiment spécial, l'hypothèque */
  extra?: string;
}

export function squareFacts(g: CapitaleView, index: number, name: (id: string) => string): SquareFacts {
  const sq = SQUARES[index]!;
  const deed = g.deeds[index];
  const s = asState(g);
  const owner = deed?.owner ? { id: deed.owner, color: colorOf(g, deed.owner) } : undefined;
  const ownerText = deed?.owner ? (deed.owner === g.you ? "à toi" : `à ${name(deed.owner)}`) : "";
  const rent = deed?.owner && !deed.mortgaged ? rentFor(s, index, { diceTotal: 7 }) : 0;
  switch (sq.kind) {
    case "property": {
      const group = GROUPS[sq.group!];
      const level = levelOf(s, index);
      const sp = deed?.special;
      const extras = [
        level > 0 ? `${LEVEL_NAMES[level]} (niveau ${level})` : null,
        sp ? `${SPECIALS[sp.kind].name} : ${SPECIALS[sp.kind].effect.toLowerCase()}` : null,
        deed?.mortgaged ? "Hypothéquée : pas de loyer." : null,
      ].filter(Boolean);
      return {
        title: sq.name,
        band: group.color,
        kind: `Rue · quartier ${group.name.toLowerCase()}`,
        what: deed?.owner
          ? `Elle est ${ownerText}. Qui s'arrête ici paie le loyer.`
          : `À vendre. Ensuite, chaque adversaire qui s'arrête ici te paie un loyer, et tu peux l'améliorer.`,
        figure: deed?.owner ? { label: "Loyer", value: money(rent) } : { label: "Prix", value: money(sq.price!) },
        ...(owner ? { owner } : {}),
        ...(extras.length > 0 ? { extra: extras.join(" · ") } : {}),
      };
    }
    case "station":
      return {
        title: sq.name,
        band: "#7d8a96",
        kind: "Gare TGV",
        what: `Le loyer double avec chaque autre gare au même propriétaire : ${STATION_RENTS.map((r) => money(r)).join(", ")}.`,
        figure: deed?.owner ? { label: "Loyer", value: money(rent) } : { label: "Prix", value: money(sq.price!) },
        ...(owner ? { owner } : {}),
        ...(deed?.mortgaged ? { extra: "Hypothéquée : pas de loyer." } : {}),
      };
    case "utility":
      return {
        title: sq.name,
        band: "#5aa0b8",
        kind: "Réseau",
        what: "Le loyer vaut 4 fois les dés, ou 10 fois si le même joueur a le barrage et le parc éolien.",
        figure: deed?.owner ? { label: "Loyer", value: "× les dés" } : { label: "Prix", value: money(sq.price!) },
        ...(owner ? { owner } : {}),
      };
    case "tax":
      return {
        title: sq.name,
        band: "#9c8f7a",
        kind: index === 38 ? "Péage" : "Impôts",
        what: `On paie ${money(sq.tax!)} en s'arrêtant ici.`,
        figure: { label: "À payer", value: money(sq.tax!) },
      };
    case "card":
      return {
        title: sq.name,
        band: sq.deck === "hasard" ? "#e07a2c" : "#2f6fb8",
        kind: "Carte",
        what:
          sq.deck === "hasard"
            ? "On tire une carte Hasard : le plus souvent, un voyage vers une autre case."
            : "On tire une carte Courrier : le plus souvent, de l'argent à toucher ou à payer.",
      };
    case "go":
      return { title: "Départ", band: "#d6433a", kind: "Coin", what: `Chaque passage par Départ rapporte ${money(GO_SALARY)}.` };
    case "jail":
      return {
        title: "Prison",
        band: "#e8b12f",
        kind: "Coin",
        what: `En passant, simple visite. En cellule : on sort avec un double, ${money(JAIL_FINE)} ou une carte, au plus en 3 tours.`,
      };
    case "rest":
      return {
        title: "Aire de repos",
        band: "#2fa864",
        kind: "Coin",
        what: g.settings.freeParking ? `La cagnotte des taxes (${money(g.pot)}) revient à qui s'arrête ici.` : "On souffle : rien à payer.",
      };
    case "toJail":
      return { title: "Allez en prison", band: "#2f5bb8", kind: "Coin", what: "Direction la prison, sans passer par Départ." };
  }
}

/** La bulle qui suit la souris : le nom, ce que fait la case, son prix ou son loyer */
export function SquareTip({ facts, x, y }: { facts: SquareFacts; x: number; y: number }) {
  const right = x > window.innerWidth - 300;
  return (
    <div className={`cap-tip ${right ? "is-left" : ""}`} style={{ left: x, top: y }} role="tooltip">
      <div className="cap-tip-band" style={{ background: facts.band }}>
        <span>{facts.kind}</span>
        <strong>{facts.title}</strong>
      </div>
      <p>{facts.what}</p>
      {facts.figure && (
        <p className="cap-tip-figure">
          <span>{facts.figure.label}</span>
          <b className="num">{facts.figure.value}</b>
        </p>
      )}
      {facts.extra && <p className="cap-tip-extra">{facts.extra}</p>}
    </div>
  );
}
