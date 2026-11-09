import { motion } from "motion/react";
import type { ReactNode } from "react";
import {
  GROUP_ORDER,
  GROUPS,
  LEVEL_NAMES,
  MAX_LEVEL,
  mortgageValue,
  SPECIAL_ORDER,
  SPECIALS,
  specialPrice,
  SQUARES,
  STATIONS,
  unmortgageCost,
  upgradeCost,
  UTILITIES,
} from "../../shared/games/capitale/board.ts";
import {
  canMortgage,
  canPlaceSpecial,
  canRaze,
  canSell,
  canUpgrade,
  levelOf,
  rentFor,
  type CapitaleAction,
} from "../../shared/games/capitale/engine.ts";
import type { CapitaleView } from "../../shared/games/capitale/view.ts";
import { Icon } from "../components/Icon.tsx";
import { asState, colorOf, manageRights, money } from "./boardUi.ts";
import { levelThumb, specialThumb } from "./scene/thumbs.ts";
import { squareFacts } from "./SquareInfo.tsx";

// La fiche d'une case, en grand au milieu de l'écran : son loyer, ses niveaux, et un bouton pour l'améliorer.
// « Mes villes » : toutes ses rues d'un coup d'œil, avec le bouton Améliorer sur chaque ligne.

/** Une fenêtre au centre de l'écran, par-dessus le plateau */
export function Pop({
  children,
  onClose,
  wide = false,
  className = "",
}: {
  children: ReactNode;
  onClose?: () => void;
  wide?: boolean;
  className?: string;
}) {
  return (
    <div className="cap-pop-back" onClick={onClose}>
      <motion.div
        className={`cap-pop ${wide ? "is-wide" : ""} ${className}`}
        initial={{ scale: 0.86, opacity: 0, y: 14 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
      >
        {onClose && (
          <button className="cap-pop-close" onClick={onClose} aria-label="Fermer">
            <Icon name="close" size={20} />
          </button>
        )}
        {children}
      </motion.div>
    </div>
  );
}

/** Le bandeau de couleur d'une case, avec son propriétaire */
export function Band({ g, index, name }: { g: CapitaleView; index: number; name: (id: string) => string }) {
  const facts = squareFacts(g, index, name);
  const light = SQUARES[index]!.group === "jaune" || SQUARES[index]!.group === "ciel";
  return (
    <div className={`cap-band ${light ? "is-light" : ""}`} style={{ background: facts.band }}>
      <span>{facts.kind}</span>
      <strong>{facts.title}</strong>
      {facts.owner && (
        <em className="cap-band-owner" style={{ ["--owner" as string]: facts.owner.color }}>
          {facts.owner.id === g.you ? "à toi" : name(facts.owner.id)}
        </em>
      )}
    </div>
  );
}

export function CityPanel({
  g,
  index,
  me,
  act,
  name,
  onClose,
}: {
  g: CapitaleView;
  index: number;
  me: string | null;
  act: (a: CapitaleAction) => void;
  name: (id: string) => string;
  onClose: () => void;
}) {
  const s = asState(g);
  const sq = SQUARES[index]!;
  const deed = g.deeds[index];
  const rights = manageRights(g, me);
  const mine = Boolean(me && deed?.owner === me);
  const facts = squareFacts(g, index, name);
  const cash = g.players.find((p) => p.id === me)?.cash ?? 0;
  const color = me ? colorOf(g, me) : "#e2453c";

  if (sq.kind !== "property") {
    return (
      <Pop onClose={onClose}>
        <Band g={g} index={index} name={name} />
        <p className="cap-pop-text">{facts.what}</p>
        {facts.figure && (
          <p className="cap-pop-figure">
            {facts.figure.label} <b className="num">{facts.figure.value}</b>
          </p>
        )}
        {facts.extra && <p className="hint">{facts.extra}</p>}
        {mine && rights && <MortgageButton g={g} index={index} me={me!} act={act} full={rights === "full"} cash={cash} />}
      </Pop>
    );
  }

  const level = levelOf(s, index);
  const rent = deed?.owner && !deed.mortgaged ? rentFor(s, index, { diceTotal: 7 }) : 0;
  const up = mine && rights === "full" ? canUpgrade(s, me!, index) : "Ce n'est pas le moment.";
  const sp = deed?.special ?? null;
  const group = GROUPS[sq.group!];

  return (
    <Pop onClose={onClose} wide className="is-city">
      <Band g={g} index={index} name={name} />
      <div className="cap-city-rent">
        <span>{deed?.owner ? "Loyer" : "Prix"}</span>
        <b className="num">{deed?.owner ? money(rent) : money(sq.price!)}</b>
        {deed?.mortgaged && <em>hypothéquée</em>}
      </div>
      {/* Les cinq niveaux, de la maison au gratte-ciel, avec le loyer de chacun */}
      <ol className="cap-levels">
        {[1, 2, 3, 4, 5].map((l) => (
          <li key={l} className={`${l <= level ? "is-done" : ""} ${l === level + 1 ? "is-next" : ""}`}>
            <img src={levelThumb(l, sq.group!, deed?.owner ? colorOf(g, deed.owner) : color, 120)} alt="" width={52} height={52} />
            <span className="cap-level-name">{LEVEL_NAMES[l]}</span>
            <b className="num">{money(sq.rents![l]!)}</b>
          </li>
        ))}
      </ol>
      {mine && (
        <div className="cap-city-actions">
          <button className="cap-cta is-green" disabled={up !== null} onClick={() => act({ type: "upgrade", square: index })}>
            <span>Améliorer</span>
            <b className="num">{money(upgradeCost(index))}</b>
            {level < MAX_LEVEL && <em>loyer → {money(sq.rents![level + 1]!)}</em>}
          </button>
          {up && level < MAX_LEVEL && <p className="cap-why">{up}</p>}
          {level >= 3 && level < MAX_LEVEL && !up && (
            <p className="hint">Il faut tout le quartier {group.name.toLowerCase()} pour dépasser le niveau 3.</p>
          )}
          <div className="cap-city-small">
            {rights && level > 0 && canSell(s, me!, index) === null && (
              <button className="btn btn-sm" onClick={() => act({ type: "sell", square: index })}>
                Revendre un niveau +{money(Math.floor(upgradeCost(index) / 2))}
              </button>
            )}
            {rights && <MortgageButton g={g} index={index} me={me!} act={act} full={rights === "full"} cash={cash} />}
          </div>
        </div>
      )}
      {!mine && <p className="cap-pop-text">{facts.what}</p>}
      {g.settings.specials && deed?.owner && (
        <SpecialSection g={g} index={index} me={me} act={act} rights={rights} name={name} mine={mine} special={sp} />
      )}
    </Pop>
  );
}

function MortgageButton({
  g,
  index,
  me,
  act,
  full,
  cash,
}: {
  g: CapitaleView;
  index: number;
  me: string;
  act: (a: CapitaleAction) => void;
  full: boolean;
  cash: number;
}) {
  const deed = g.deeds[index]!;
  return deed.mortgaged ? (
    <button
      className="btn btn-sm"
      disabled={!full || cash < unmortgageCost(index)}
      onClick={() => act({ type: "unmortgage", square: index })}
    >
      Lever l'hypothèque {money(unmortgageCost(index))}
    </button>
  ) : (
    <button
      className="btn btn-sm btn-ghost"
      disabled={canMortgage(asState(g), me, index) !== null}
      onClick={() => act({ type: "mortgage", square: index })}
      title={canMortgage(asState(g), me, index) ?? undefined}
    >
      Hypothéquer +{money(mortgageValue(index))}
    </button>
  );
}

/** Les bâtiments spéciaux : ce qu'il y a sur la rue, ou ce qu'on peut y poser (chez soi, ou une nuisance chez un autre) */
function SpecialSection({
  g,
  index,
  me,
  act,
  rights,
  name,
  mine,
  special,
}: {
  g: CapitaleView;
  index: number;
  me: string | null;
  act: (a: CapitaleAction) => void;
  rights: "full" | "raise" | null;
  name: (id: string) => string;
  mine: boolean;
  special: { kind: (typeof SPECIAL_ORDER)[number]; by: string } | null;
}) {
  const s = asState(g);
  if (special) {
    const info = SPECIALS[special.kind];
    const raze = mine && rights ? canRaze(s, me!, index) : "x";
    return (
      <div className="cap-specials">
        <h4>Bâtiment spécial</h4>
        <div className={`cap-special is-on ${info.nuisance ? "is-nuisance" : ""}`}>
          <img src={specialThumb(special.kind, colorOf(g, special.by), 120)} alt="" width={56} height={56} />
          <span>
            <strong>{info.name}</strong>
            {info.nuisance && <em> posée par {special.by === me ? "toi" : name(special.by)}</em>}
            <span className="hint">{info.effect}</span>
          </span>
          {raze === null && (
            <button className="btn btn-sm" onClick={() => act({ type: "raze", square: index })}>
              {info.nuisance
                ? `Faire raser ${money(specialPrice(special.kind, index))}`
                : `Revendre +${money(Math.floor(specialPrice(special.kind, index) / 2))}`}
            </button>
          )}
        </div>
      </div>
    );
  }
  if (rights !== "full") return null;
  const kinds = SPECIAL_ORDER.filter((k) => SPECIALS[k].nuisance !== mine);
  return (
    <div className="cap-specials">
      <h4>{mine ? "Poser un bâtiment spécial (un par tour)" : `Poser une nuisance chez ${name(g.deeds[index]!.owner!)}`}</h4>
      <div className="cap-special-list">
        {kinds.map((k) => {
          const info = SPECIALS[k];
          const why = canPlaceSpecial(s, me!, index, k);
          return (
            <button
              key={k}
              className={`cap-special ${info.nuisance ? "is-nuisance" : ""}`}
              disabled={why !== null}
              onClick={() => act({ type: "special", square: index, kind: k })}
              title={why ?? info.effect}
            >
              <img src={specialThumb(k, me ? colorOf(g, me) : "#e2453c", 120)} alt="" width={56} height={56} />
              <span>
                <strong>
                  {info.name} <b className="num">{money(specialPrice(k, index))}</b>
                </strong>
                <span className="hint">{why ?? info.effect}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Mes villes : chaque rue sur une ligne, son niveau, son loyer, et le bouton Améliorer */
export function MyCities({
  g,
  me,
  act,
  onOpen,
  onClose,
}: {
  g: CapitaleView;
  me: string;
  act: (a: CapitaleAction) => void;
  onOpen: (square: number) => void;
  onClose: () => void;
}) {
  const s = asState(g);
  const rights = manageRights(g, me);
  const mine = (list: number[]) => list.filter((i) => g.deeds[i]!.owner === me);
  const groups = [
    ...GROUP_ORDER.map((gid) => ({
      key: gid,
      name: `Quartier ${GROUPS[gid].name.toLowerCase()}`,
      color: GROUPS[gid].color,
      total: GROUPS[gid].squares.length,
      squares: mine(GROUPS[gid].squares),
    })),
    { key: "tgv", name: "Gares", color: "#7d8a96", total: 4, squares: mine(STATIONS) },
    { key: "res", name: "Réseaux", color: "#5aa0b8", total: 2, squares: mine(UTILITIES) },
  ].filter((x) => x.squares.length > 0);
  const debt = g.debts.filter((d) => d.debtor === me).reduce((n, d) => n + d.amount, 0);
  return (
    <Pop onClose={onClose} wide>
      <h3 className="cap-pop-title">Mes villes</h3>
      {debt > 0 && (
        <p className="cap-why">Tu dois {money(debt)} : revends des niveaux ou hypothèque. La dette se paie dès que l'argent suffit.</p>
      )}
      {groups.length === 0 && <p className="hint">Tu n'as encore rien acheté.</p>}
      <div className="cap-cities">
        {groups.map((grp) => (
          <section key={grp.key}>
            <h4 style={{ ["--group" as string]: grp.color }}>
              {grp.name}{" "}
              <span>
                {grp.squares.length}/{grp.total}
              </span>
            </h4>
            {grp.squares.map((i) => {
              const sq = SQUARES[i]!;
              const d = g.deeds[i]!;
              const level = levelOf(s, i);
              const up = sq.kind === "property" && rights === "full" ? canUpgrade(s, me, i) : "x";
              return (
                <div key={i} className={`cap-city-row ${d.mortgaged ? "is-mortgaged" : ""}`}>
                  <button className="cap-city-name" onClick={() => onOpen(i)}>
                    <strong>{sq.name}</strong>
                    {sq.kind === "property" && (
                      <span className="cap-dots" aria-label={`niveau ${level}`}>
                        {[1, 2, 3, 4, 5].map((l) => (
                          <i key={l} className={l <= level ? "is-on" : ""} />
                        ))}
                      </span>
                    )}
                  </button>
                  <span className="cap-city-rentcell num">
                    {d.mortgaged ? "hypothéquée" : sq.kind === "utility" ? "× dés" : money(rentFor(s, i, { diceTotal: 7 }))}
                  </span>
                  {sq.kind === "property" && level < MAX_LEVEL && (
                    <button
                      className="cap-mini-cta"
                      disabled={up !== null}
                      title={up ?? undefined}
                      onClick={() => act({ type: "upgrade", square: i })}
                    >
                      + <span className="num">{money(upgradeCost(i))}</span>
                    </button>
                  )}
                </div>
              );
            })}
          </section>
        ))}
      </div>
      <p className="hint">Une amélioration par rue et par tour. Touche une rue pour ses bâtiments spéciaux, la revente ou l'hypothèque.</p>
    </Pop>
  );
}
