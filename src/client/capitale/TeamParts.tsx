import { motion } from "motion/react";
import { GROUPS, MONOPOLY_GROUPS, sideName, SQUARES, teamName } from "../../shared/games/capitale/board.ts";
import { giftProblem, monopolyProgress, teamRules, type CapitaleAction } from "../../shared/games/capitale/engine.ts";
import type { CapitaleView } from "../../shared/games/capitale/view.ts";
import type { SeatView } from "../../shared/protocol.ts";
import { Modal } from "../components/ui.tsx";
import { asState, colorOf, money } from "./boardUi.ts";
import { isMate, sidesOf, teamColor, TeamMark, type Side } from "./teamsUi.tsx";

// En équipes : la fortune de chaque équipe, l'aide au coéquipier en dette. Au Monopole : où en est chaque camp.

/** La fortune de chaque équipe (ce qui compte à la fin pour la victoire d'équipe), avec ses joueurs */
export function TeamBar({ g, name, phone }: { g: CapitaleView; name: (id: string) => string; phone: boolean }) {
  const teams = [...new Set(g.players.map((p) => g.teams?.[p.id]).filter((t): t is number => t !== undefined))];
  const mine = g.you ? g.teams?.[g.you] : undefined;
  const win = teamRules(g).win;
  return (
    <div className={`cap-teambar is-n${teams.length} ${phone ? "is-phone" : ""}`} aria-label="Les équipes">
      {teams.map((t, k) => {
        const members = g.players.filter((p) => g.teams?.[p.id] === t);
        const worth = members.reduce((n, p) => n + (p.bankrupt ? 0 : (g.worth[p.id] ?? 0)), 0);
        return (
          <span key={t} className={`cap-teambar-team ${t === mine ? "is-mine" : ""}`} style={{ ["--team" as string]: teamColor(t) }}>
            {k > 0 && <i className="cap-teambar-vs">contre</i>}
            <TeamMark team={t} size={phone ? 13 : 16} />
            <strong>{teamName(t)}</strong>
            {!phone && <span className="cap-teambar-names">{members.map((p) => (p.id === g.you ? "toi" : name(p.id))).join(", ")}</span>}
            {win && <b className="num">{money(worth)}</b>}
          </span>
        );
      })}
    </div>
  );
}

/** Un coéquipier est en dette : de quoi lui donner ce qui lui manque, d'un bouton */
export function TeamHelp({
  g,
  me,
  seat,
  act,
}: {
  g: CapitaleView;
  me: string | null;
  seat: (id: string) => SeatView | undefined;
  act: (a: CapitaleAction) => void;
}) {
  const debt = g.debts[0];
  if (!me || !debt || g.step !== "debt" || !isMate(g, me, debt.debtor)) return null;
  const owed = g.debts.filter((d) => d.debtor === debt.debtor).reduce((n, d) => n + d.amount, 0);
  const debtor = g.players.find((p) => p.id === debt.debtor)!;
  const short = owed - debtor.cash;
  const meP = g.players.find((p) => p.id === me);
  if (short <= 0 || !meP) return null;
  const give = { cash: short, squares: [], jailCards: 0 };
  const why = giftProblem(asState(g), me, debtor.id, give);
  const name = seat(debtor.id)?.name ?? "?";
  return (
    <motion.div className="cap-offer panel cap-help" initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
      <div className="cap-offer-head">
        <strong>
          {name}, de ton équipe, doit {money(owed)} : il lui manque {money(short)}.
        </strong>
      </div>
      {why ? (
        <p className="hint">{teamRules(g).gifts ? why : "Les dons entre coéquipiers ne sont pas de la partie."}</p>
      ) : (
        <div className="cap-offer-actions">
          <button className="btn btn-sm btn-primary" onClick={() => act({ type: "gift", to: debtor.id, give })}>
            Lui donner {money(short)}
          </button>
          <span className="hint">Il pourra aussi hypothéquer ou revendre.</span>
        </div>
      )}
    </motion.div>
  );
}

/** Le détail du Monopole : la règle, puis pour chaque camp ses quartiers, son meilleur côté et ses gares */
export function MonopolyPanel({
  g,
  open,
  onClose,
  name,
}: {
  g: CapitaleView;
  open: boolean;
  onClose: () => void;
  name: (id: string) => string;
}) {
  const s = asState(g);
  const sides = sidesOf(g);
  const teams = sides.some((x) => x.team !== null);
  const owner = (i: number) => {
    const o = g.deeds[i]?.owner;
    return o ? `à ${o === g.you ? "toi" : name(o)}` : "libre";
  };
  const squares = (list: number[]) => list.map((i) => `${SQUARES[i]!.name} (${owner(i)})`).join(", ");
  const title = (side: Side) =>
    side.team !== null ? (
      <>
        <TeamMark team={side.team} size={16} /> {teamName(side.team)}
        <span className="hint"> · {side.members.map((id) => (id === g.you ? "toi" : name(id))).join(", ")}</span>
      </>
    ) : (
      <>
        <i className="cap-mono-dot" style={{ background: colorOf(g, side.rep) }} /> {side.rep === g.you ? "Toi" : name(side.rep)}
      </>
    );
  return (
    <Modal open={open} onClose={onClose} title="Monopole" wide>
      <p className="cap-mono-rule">
        La partie s'arrête net pour qui réunit <strong>trois quartiers complets</strong>, <strong>toutes les rues d'un côté</strong> du
        plateau, ou <strong>les quatre gares</strong>. Les titres hypothéqués comptent.
        {teams && " Les titres des coéquipiers comptent ensemble."}
      </p>
      <div className="cap-mono-list">
        {sides.map((side) => {
          const p = monopolyProgress(s, side.rep);
          const best = p.sides.map((x, k) => ({ ...x, k })).sort((a, b) => a.missing.length - b.missing.length || b.total - a.total)[0]!;
          const near = Object.values(GROUPS)
            .map((grp) => ({ grp, missing: grp.squares.filter((i) => !p.groups.includes(grp.id) && !held(g, side, i)) }))
            .filter((x) => x.missing.length > 0)
            .sort((a, b) => a.missing.length - b.missing.length)
            .slice(0, Math.max(0, MONOPOLY_GROUPS - p.groups.length));
          return (
            <section key={side.key} className={`cap-mono-side ${p.winning.length > 0 ? "is-close" : ""}`}>
              <h3>{title(side)}</h3>
              {p.winning.length > 0 && <p className="cap-mono-alert">Gagne tout de suite avec : {squares(p.winning)}</p>}
              <ul>
                <li>
                  <span className="cap-mono-goal">Quartiers</span>
                  <b className="num">
                    {Math.min(p.groups.length, MONOPOLY_GROUPS)}/{MONOPOLY_GROUPS}
                  </b>
                  <span className="cap-mono-what">
                    {p.groups.map((id) => (
                      <i key={id} className="cap-mono-group" style={{ background: GROUPS[id].color }} title={GROUPS[id].name} />
                    ))}
                    {near.length > 0 &&
                      ` il manque ${near.map((x) => `${GROUPS[x.grp.id].name.toLowerCase()} : ${squares(x.missing)}`).join(" ; ")}`}
                  </span>
                </li>
                <li>
                  <span className="cap-mono-goal">Un côté</span>
                  <b className="num">
                    {best.have}/{best.total}
                  </b>
                  <span className="cap-mono-what">
                    {sideName(best.k)}
                    {best.missing.length > 0 && ` : il manque ${squares(best.missing)}`}
                  </span>
                </li>
                <li>
                  <span className="cap-mono-goal">Gares</span>
                  <b className="num">{p.stations.have}/4</b>
                  <span className="cap-mono-what">{p.stations.missing.length > 0 && `il manque ${squares(p.stations.missing)}`}</span>
                </li>
              </ul>
            </section>
          );
        })}
      </div>
    </Modal>
  );
}

/** Ce titre est-il à ce camp ? */
function held(g: CapitaleView, side: Side, i: number) {
  const o = g.deeds[i]?.owner;
  return Boolean(o && side.members.includes(o) && !g.players.find((p) => p.id === o)?.bankrupt);
}
