import { useMemo } from "react";
import type { Card } from "../../shared/games/uno/cards.ts";
import type { UnoPlayerView } from "../../shared/games/uno/view.ts";
import type { SeatView } from "../../shared/protocol.ts";
import { CardFace } from "../components/Card.tsx";
import { sortHand } from "./Hand.tsx";
import { layoutPartners, partnerCardSpot } from "./partnerLayout.ts";

/** Ce que prend une main en plus de ses cartes : le nom (largeur fixe), l'écart, le cadre. Sur un écran bas, le prénom
 * seul (le nombre de cartes reste affiché au siège) */
export const PARTNER_LABEL = { short: 48, compact: 50, wide: 70 } as const;
const PANEL_PAD = 8;
const PANEL_GAP = 8;
const BAR_GAP = 8;

function labelWidth(compact: boolean, short: boolean): number {
  return short ? PARTNER_LABEL.short : compact ? PARTNER_LABEL.compact : PARTNER_LABEL.wide;
}

export function partnerChrome(compact: boolean, short = false): number {
  return labelWidth(compact, short) + PANEL_GAP + PANEL_PAD * 2 + 2;
}

interface PartnerBarProps {
  partners: { id: string; hand: Card[] }[];
  seats: SeatView[];
  players: UnoPlayerView[];
  turn: string | null;
  teamColor: string;
  compact: boolean;
  /** Écran bas : on préfère serrer les cartes dans la barre du haut */
  short: boolean;
  /** Écran en hauteur : une main par ligne plutôt que des cartes serrées */
  tall: boolean;
  card: number;
  /** Plus petite carte permise quand deux mains doivent tenir côte à côte */
  minCard: number;
  /** Place libre au milieu de la barre du haut, et largeur d'une ligne entière */
  inlineRoom: number;
  rowRoom: number;
}

/**
 * UNO en équipe : la main de chaque coéquipier, face visible, à une place à elle en haut de l'écran. Dans la barre du
 * haut quand elle y tient, sinon sur sa propre ligne juste dessous : la table descend d'autant, rien ne se chevauche.
 */
export function PartnerBar({
  partners,
  seats,
  players,
  turn,
  teamColor,
  compact,
  short,
  tall,
  card: wanted,
  minCard,
  inlineRoom,
  rowRoom,
}: PartnerBarProps) {
  const hands = useMemo(() => partners.map((p) => ({ id: p.id, cards: sortHand(p.hand) })), [partners]);
  const chrome = partnerChrome(compact, short);
  const layout = layoutPartners({
    counts: hands.map((h) => h.cards.length),
    card: wanted,
    minCard,
    inlineRoom,
    rowRoom,
    chrome,
    gap: BAR_GAP,
    short,
    tall,
  });
  const card = layout.card;
  return (
    <div
      className={`partner-bar ${layout.inline ? "is-inline" : "is-row"} ${layout.stacked ? "is-stacked" : ""} ${compact ? "is-compact" : ""}`}
      style={{ ["--team-color" as string]: teamColor, gap: BAR_GAP }}
    >
      {hands.map((h, k) => {
        const seat = seats.find((s) => s.id === h.id);
        const player = players.find((p) => p.id === h.id);
        const l = layout.hands[k]!;
        const n = h.cards.length;
        const state = player?.out ? (player.eliminated ? "éliminé" : "a fini") : `${n} carte${n > 1 ? "s" : ""}`;
        return (
          <div
            key={h.id}
            className={`partner-panel ${turn === h.id ? "is-turn" : ""}`}
            style={{ gap: PANEL_GAP, padding: `4px ${PANEL_PAD}px` }}
            aria-label={`Main de ${seat?.name ?? "ton coéquipier"} : ${state}`}
          >
            <span className="partner-label" style={{ width: labelWidth(compact, short) }}>
              <span className="partner-name">{seat?.name ?? "…"}</span>
              {(!short || n === 0) && <span className="partner-count">{state}</span>}
            </span>
            {n > 0 && (
              <div className="partner-hand" style={{ width: l.width, height: l.height }}>
                {h.cards.map((c, i) => {
                  const spot = partnerCardSpot(l, i, card);
                  return (
                    <span key={c.id} className="partner-card" style={{ left: spot.x, top: spot.y }}>
                      <CardFace card={c} width={card} />
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
