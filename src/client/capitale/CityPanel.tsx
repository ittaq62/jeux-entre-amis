import { motion } from "motion/react";
import type { ReactNode } from "react";
import {
  FREE_LEVELS,
  FREE_LEVELS_EVEN,
  GROUP_ORDER,
  GROUPS,
  levelName,
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
  buyoutPrice,
  buyoutShield,
  canMortgage,
  canPlaceSpecial,
  canRaze,
  canSell,
  canUpgrade,
  levelOf,
  newRules,
  rentFor,
  type CapitaleAction,
} from "../../shared/games/capitale/engine.ts";
import type { CapitaleView } from "../../shared/games/capitale/view.ts";
import { Icon } from "../components/Icon.tsx";
import { asState, colorOf, manageRights, money } from "./boardUi.ts";
import { levelThumb, specialThumb } from "./scene/thumbs.ts";
import { squareFacts } from "./SquareInfo.tsx";
import { isMate, TeamMark } from "./teamsUi.tsx";
import { annexedOf, BUILD_ORDER, BUILDS, cityRent, lotOf } from "../../shared/games/capitale/builder.ts";
import { baseSize, maxAnnex } from "../../shared/games/capitale/builderMap.ts";
import { buildThumb } from "./scene/thumbs.ts";
import { fr } from "../../shared/typo.ts";

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
          {facts.owner.team !== null && <TeamMark team={facts.owner.team} size={13} />}
          {facts.owner.id === g.you ? "à toi" : name(facts.owner.id)}
          {facts.owner.mate && " · ton équipe"}
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
  onBuild,
}: {
  g: CapitaleView;
  index: number;
  me: string | null;
  act: (a: CapitaleAction) => void;
  name: (id: string) => string;
  onClose: () => void;
  /** Builder : ouvrir le chantier de la ville */
  onBuild?: (index: number) => void;
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

  if (g.settings.builder) return <BuilderCityPanel g={g} index={index} me={me} act={act} name={name} onClose={onClose} onBuild={onBuild} />;

  const level = levelOf(s, index);
  const rent = deed?.owner && !deed.mortgaged ? rentFor(s, index, { diceTotal: 7 }) : 0;
  const up = mine && rights === "full" ? canUpgrade(s, me!, index) : "Ce n'est pas le moment.";
  const sp = deed?.special ?? null;
  const group = GROUPS[sq.group!];
  const free = newRules(g).evenBuild ? FREE_LEVELS_EVEN : FREE_LEVELS;

  return (
    <Pop onClose={onClose} wide className="is-city">
      <Band g={g} index={index} name={name} />
      <div className="cap-city-rent">
        <span>{deed?.owner ? "Loyer" : "Prix"}</span>
        <b className="num">{deed?.owner ? money(rent) : money(sq.price!)}</b>
        {deed?.mortgaged && <em>hypothéquée</em>}
      </div>
      {/* Les cinq niveaux, de la maison au monument de la ville, avec le loyer de chacun */}
      <ol className="cap-levels">
        {[1, 2, 3, 4, 5].map((l) => (
          <li
            key={l}
            className={`${l <= level ? "is-done" : ""} ${l === level + 1 ? "is-next" : ""} ${l === MAX_LEVEL ? "is-landmark" : ""}`}
          >
            <img src={levelThumb(l, index, deed?.owner ? colorOf(g, deed.owner) : color, 120)} alt="" width={52} height={52} />
            <span className="cap-level-name">{levelName(index, l)}</span>
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
          {up && level < MAX_LEVEL && <p className="cap-why">{fr(up)}</p>}
          {level >= free && level < MAX_LEVEL && !up && (
            <p className="hint">
              Il faut tout le quartier {group.name.toLowerCase()} pour dépasser le niveau {free}
              {newRules(g).evenBuild ? ", et le monter rue par rue (construction équilibrée)." : "."}
            </p>
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
      {!mine && me && deed?.owner && newRules(g).buyout && <BuyoutNote g={g} index={index} me={me} />}
      {g.settings.specials && deed?.owner && (
        <SpecialSection g={g} index={index} me={me} act={act} rights={rights} name={name} mine={mine} special={sp} />
      )}
    </Pop>
  );
}

/**
 * Builder : la fiche d'une ville, son loyer et ce qui y est bâti (combien de chaque, de cases prises) ; chez soi, le
 * bouton du chantier, l'hypothèque ; chez un adversaire, le rachat
 */
function BuilderCityPanel({
  g,
  index,
  me,
  act,
  name,
  onClose,
  onBuild,
}: {
  g: CapitaleView;
  index: number;
  me: string | null;
  act: (a: CapitaleAction) => void;
  name: (id: string) => string;
  onClose: () => void;
  onBuild?: (index: number) => void;
}) {
  const s = asState(g);
  const sq = SQUARES[index]!;
  const deed = g.deeds[index];
  const mine = Boolean(me && deed?.owner === me);
  const facts = squareFacts(g, index, name);
  const rights = manageRights(g, me);
  const cash = g.players.find((p) => p.id === me)?.cash ?? 0;
  const lot = lotOf(deed);
  const rent = deed?.owner && !deed.mortgaged ? rentFor(s, index, { diceTotal: 7 }) : 0;
  const detail = cityRent(s, index);
  const counts = BUILD_ORDER.map((k) => ({ k, n: lot.filter((b) => b.kind === k).length })).filter((x) => x.n > 0);
  const area = baseSize(index) + annexedOf(deed).length;
  const used = lot.reduce((n, b) => n + BUILDS[b.kind].w * BUILDS[b.kind].d, 0);
  const color = deed?.owner ? colorOf(g, deed.owner) : me ? colorOf(g, me) : "#e2453c";
  return (
    <Pop onClose={onClose} wide className="is-city">
      <Band g={g} index={index} name={name} />
      <div className="cap-city-rent">
        <span>{deed?.owner ? "Loyer" : "Prix"}</span>
        <b className="num">{deed?.owner ? money(rent) : money(sq.price!)}</b>
        {deed?.mortgaged && <em>hypothéquée</em>}
      </div>
      <p className="cap-pop-text">
        Territoire de <b className="num">{area}</b> cases
        {annexedOf(deed).length > 0 && ` (dont ${annexedOf(deed).length} annexées, ${maxAnnex(index)} au plus)`}, {used} bâties. Terrain{" "}
        nu&nbsp;: {money(detail.bare)}
        {detail.full ? ", quartier complet\u00a0: tout est doublé." : "."}
      </p>
      {counts.length > 0 ? (
        <ul className="cap-build-list">
          {counts.map(({ k, n }) => (
            <li key={k}>
              <img src={buildThumb(k, index, color, 96)} alt="" width={40} height={40} />
              <span>
                {n > 1 ? `${n} × ` : ""}
                {BUILDS[k].name}
              </span>
              <b className="num">{money(detail.buildings.filter((b) => b.kind === k).reduce((t, b) => t + b.rent, 0))}</b>
            </li>
          ))}
        </ul>
      ) : (
        deed?.owner && <p className="hint">Rien n'est encore bâti ici.</p>
      )}
      {mine && (
        <div className="cap-city-actions">
          {onBuild && (
            <button className="cap-cta is-green" disabled={deed?.mortgaged} onClick={() => onBuild(index)}>
              <span>Ouvrir le chantier</span>
              <em>poser, déplacer, annexer</em>
            </button>
          )}
          <div className="cap-city-small">
            {rights && <MortgageButton g={g} index={index} me={me!} act={act} full={rights === "full"} cash={cash} />}
          </div>
        </div>
      )}
      {!mine && <p className="cap-pop-text">{facts.what}</p>}
      {!mine && me && deed?.owner && newRules(g).buyout && <BuyoutNote g={g} index={index} me={me} />}
    </Pop>
  );
}

/** Chez un adversaire : ce que coûterait le rachat de sa ville, ou ce qui la protège */
function BuyoutNote({ g, index, me }: { g: CapitaleView; index: number; me: string }) {
  const s = asState(g);
  const shield = buyoutShield(s, me, index);
  if (shield && /coéquipier|pas à un adversaire/.test(shield)) return null;
  return (
    <p className={`cap-buyout-note ${shield ? "is-shielded" : ""}`}>
      {shield ? (
        <>
          <Icon name="lock" size={15} /> {fr(shield)}
        </>
      ) : (
        <>
          Rachat&nbsp;: <b className="num">{money(buyoutPrice(s, index))}</b>, à payer à son propriétaire quand tu t'y arrêtes.
        </>
      )}
    </p>
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
            <span className="hint">{fr(info.effect)}</span>
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
  // Pas de nuisance chez un coéquipier : rien à poser ici
  if (!mine && isMate(g, me, g.deeds[index]!.owner)) return null;
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
              title={fr(why ?? info.effect)}
            >
              <img src={specialThumb(k, me ? colorOf(g, me) : "#e2453c", 120)} alt="" width={56} height={56} />
              <span>
                <strong>
                  {info.name} <b className="num">{money(specialPrice(k, index))}</b>
                </strong>
                <span className="hint">{fr(why ?? info.effect)}</span>
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
  onBuild,
}: {
  g: CapitaleView;
  me: string;
  act: (a: CapitaleAction) => void;
  onOpen: (square: number) => void;
  onClose: () => void;
  /** Builder : ouvrir le chantier d'une ville */
  onBuild?: (square: number) => void;
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
        <p className="cap-why">
          Tu dois {money(debt)}&nbsp;: {onBuild ? "démolis des bâtiments" : "revends des niveaux"} ou hypothèque. La dette se paie dès que
          l'argent suffit.
        </p>
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
                    {sq.kind === "property" && !onBuild && (
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
                  {sq.kind === "property" && onBuild && (
                    <button className="cap-mini-cta" disabled={d.mortgaged} onClick={() => onBuild(i)} title="Ouvrir le chantier">
                      Bâtir
                    </button>
                  )}
                  {sq.kind === "property" && !onBuild && level < MAX_LEVEL && (
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
      <p className="hint">
        {onBuild
          ? "Builder\u00a0: ouvre le chantier d'une ville pour y poser tes bâtiments, à tout moment. Touche une ville pour sa fiche et l'hypothèque."
          : "Une amélioration par rue et par tour. Touche une rue pour ses bâtiments spéciaux, la revente ou l'hypothèque."}
      </p>
    </Pop>
  );
}
