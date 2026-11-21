import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { GAME_NAMES } from "../../shared/protocol.ts";
import type { Card } from "../../shared/games/uno/cards.ts";
import { CYCLE_DAYS, dayNumber, LOGIN_LADDER, MAX_JOKERS, type StreakStatus } from "../../shared/streak.ts";
import { play } from "../lib/sound.ts";
import { usePrefs } from "../stores/prefs.ts";
import { useShop } from "../stores/shop.ts";
import { useStreak } from "../stores/streak.ts";
import { GameTicket } from "../tour/TourParts.tsx";
import { CardFace } from "./Card.tsx";
import { Icon } from "./Icon.tsx";

/** Rien ne bouge avec « Effets réduits », ni quand le système le demande */
function useStill(): boolean {
  const reduced = usePrefs((s) => s.reducedEffects);
  const [os, setOs] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setOs(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced || os;
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;
const fr = (n: number) => n.toLocaleString("fr-FR");
const ordinal = (n: number) => (n === 1 ? "1er" : `${n}e`);
const WEEK_TOTAL = LOGIN_LADDER.reduce((sum, n) => sum + n, 0);

/** Le joker du 7e jour : une vraie carte joker de la table */
const JOKER: Card = { id: -7, kind: "wild", color: null };
/** Chaque tampon penche un peu à sa façon, comme posé à la main */
const TILT = [-11, 7, -4, 12, -8, 5, -13];
/** Le logo de la maison, en éventail de quatre cartes, comme dans l'en-tête du site */
const FAN = [-26, -9, 9, 26];

/**
 * Le moment de l'animation : la récompense attend, le grand tampon s'abat au milieu de la carte, puis la case du jour est
 * tamponnée et le solde monte.
 */
type Phase = "before" | "hero" | "landed";

const HERO_AT = 450;
const LAND_AT = 1050;
const WEEK_AFTER = 600;
const COUNT_MS = 700;

/** Le solde qui monte jusqu'à sa nouvelle valeur (tout de suite, sans animation) */
function useCountUp(from: number, to: number, start: boolean, still: boolean): number {
  const [value, setValue] = useState(still ? to : from);
  useEffect(() => {
    if (still) return setValue(to);
    if (!start) return setValue(from);
    let frame = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / COUNT_MS);
      setValue(Math.round(from + (to - from) * (1 - (1 - k) ** 3)));
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [from, to, start, still]);
  return value;
}

/**
 * La carte d'habitué : en grand, la récompense du jour (un tampon qui s'abat), puis la semaine en 7 cases avec ce que
 * rapporte chacune, quelques rappels quand quelque chose risque de se perdre, et en talon le défi de la semaine.
 */
export function StreakDialog() {
  const status = useStreak((s) => s.status);
  const gained = useStreak((s) => s.gained);
  const balanceBefore = useStreak((s) => s.balanceBefore);
  const close = useStreak((s) => s.close);
  const liveBalance = useShop((s) => s.balance);
  const still = useStill();
  const titleId = useId();
  const primary = useRef<HTMLButtonElement>(null);

  const day = gained?.day ?? null;
  const thisWeek = gained?.weeks.find((w) => w.current) ?? null;
  const lastWeek = gained?.weeks.find((w) => !w.current) ?? null;
  const paid = (day?.reward ?? 0) + (gained?.weeks.reduce((sum, w) => sum + w.bonus, 0) ?? 0);
  // L'animation ne se joue qu'au moment où les points tombent, pas quand on rouvre la carte pour la regarder
  const animate = !still && paid > 0;
  const [phase, setPhase] = useState<Phase>(animate ? "before" : "landed");
  const [weekLanded, setWeekLanded] = useState(!animate || !thisWeek);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    primary.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus?.({ preventScroll: true });
    };
  }, [close]);

  useEffect(() => {
    if (!animate) return;
    const timers = [
      window.setTimeout(() => {
        setPhase("hero");
        play("cardPlace", { volume: 0.9 });
      }, HERO_AT),
      window.setTimeout(() => setPhase("landed"), day ? LAND_AT : HERO_AT),
    ];
    if (thisWeek) {
      timers.push(
        window.setTimeout(
          () => {
            setWeekLanded(true);
            play("achievement", { volume: 0.7 });
          },
          day ? LAND_AT + WEEK_AFTER : HERO_AT,
        ),
      );
    }
    return () => timers.forEach((t) => clearTimeout(t));
  }, [animate, day, thisWeek]);

  const target = paid > 0 ? balanceBefore + paid : liveBalance;
  const shownBalance = useCountUp(balanceBefore, target, !animate || phase === "landed", !animate);

  if (!status) return null;
  const { login } = status;
  // La récompense mise en avant : celle du jour, sinon celle du défi qui vient d'être réussi, sinon celle déjà prise aujourd'hui
  const hero = day
    ? { amount: day.reward, label: "Ta récompense du jour" }
    : thisWeek
      ? { amount: thisWeek.bonus, label: "Défi de la semaine réussi" }
      : login.claimedToday
        ? { amount: LOGIN_LADDER[login.cycleDay - 1]!, label: "Récompense du jour : déjà prise" }
        : null;
  const heroStamped = !animate || phase !== "before";
  return createPortal(
    <div
      className={`modal-backdrop habitue-backdrop ${still ? "is-still" : ""}`}
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div
        className={`habitue paper ${animate && phase === "hero" ? "is-thud" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <button className="habitue-close" onClick={close} aria-label="Fermer">
          <Icon name="close" size={22} />
        </button>
        <p className="habitue-kicker">La Tablée · carte d'habitué</p>

        <div className="habitue-hero">
          {hero && (
            <span className="hero-slot" aria-hidden="true">
              {heroStamped && <BigStamp amount={hero.amount} pressing={animate} />}
            </span>
          )}
          <div className="hero-text">
            {hero && <p className="hero-label">{hero.label}</p>}
            <h2 id={titleId} className="hero-title">
              <span className="habitue-count num">{login.streak}</span> {login.streak > 1 ? "jours d'affilée" : "jour d'affilée"}
            </h2>
            <p className="hero-sub">
              Record : {plural(login.best, "jour")}
              {status.play.streak > 0 && <> · {plural(status.play.streak, "jour")} de jeu d'affilée</>}
            </p>
          </div>
        </div>
        {lastWeek && <p className="habitue-last-week">Défi de la semaine dernière réussi : +{lastWeek.bonus} points.</p>}

        <div className="habitue-week-days">
          <div className="habitue-section-head">
            <h3>Ta semaine</h3>
            <span className="habitue-section-note">
              {WEEK_TOTAL} points et un joker en {CYCLE_DAYS} jours
            </span>
          </div>
          <Punches status={status} stamped={!animate || phase === "landed"} animate={animate && day !== null} />
        </div>

        <div className="habitue-notes">
          <Tomorrow status={status} />
          {day && day.lost >= 2 && <p>Ta série de {day.lost} jours s'était arrêtée : nouvelle carte !</p>}
          {day?.jokerUsed ? (
            <p>
              <MiniJoker /> Joker utilisé : le jour raté est pardonné.
            </p>
          ) : day?.jokerEarned ? (
            <p>
              <MiniJoker /> 7e tampon : un joker en poche ! Il couvrira un jour raté.
            </p>
          ) : (
            login.jokers > 0 && (
              <p>
                <MiniJoker /> {login.jokers >= MAX_JOKERS ? "Joker" : "Jokers"} en poche : un jour raté ne casse pas ta série.
              </p>
            )
          )}
          <PlayReminder status={status} />
        </div>

        {status.week.bonus > 0 && <Challenge status={status} landed={weekLanded} animate={animate && thisWeek !== null} />}

        <div className="habitue-foot">
          <span className="habitue-balance">
            <span className="habitue-balance-label">Ton solde</span>
            <strong className="num">{fr(shownBalance)}</strong> points
            {animate && phase === "landed" && (
              <span className="habitue-plus num" aria-hidden="true">
                +{paid}
              </span>
            )}
          </span>
          <button ref={primary} className="habitue-go" onClick={close}>
            À table !
          </button>
        </div>
        <p className="habitue-fine">Un tampon par jour en ouvrant l'accueil, à l'heure de Paris.</p>
        <span className="visually-hidden" role="status">
          {day ? `Tu gagnes ${day.reward} points aujourd'hui, ${ordinal(day.cycleDay)} jour de ta semaine.` : ""}
          {gained?.weeks.map((w) => ` Défi de la semaine${w.current ? "" : " dernière"} réussi : ${w.bonus} points.`).join("") ?? ""}
        </span>
      </div>
    </div>,
    document.body,
  );
}

/** Le grand tampon de la récompense : le logo de la maison et les points, à l'encre rouge */
function BigStamp({ amount, pressing }: { amount: number; pressing: boolean }) {
  return (
    <svg className={`hero-stamp ${pressing ? "is-pressing" : ""}`} viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="60" r="56" fill="none" stroke="currentColor" strokeWidth="5" />
      <circle cx="60" cy="60" r="48" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <g transform="translate(60 42) scale(0.62)">
        {FAN.map((angle) => (
          <rect
            key={angle}
            x="-5"
            y="-21"
            width="10"
            height="15"
            rx="1.6"
            transform={`rotate(${angle})`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
          />
        ))}
      </g>
      <text className="hero-stamp-amount" x="60" y="80" textAnchor="middle">
        +{amount}
      </text>
      <text className="hero-stamp-unit" x="60" y="97" textAnchor="middle">
        POINTS
      </text>
    </svg>
  );
}

/** Les 7 cases de la carte : tamponnées, celle d'aujourd'hui, et celles qui attendent, avec ce que rapporte chacune */
function Punches({ status, stamped: todayStamped, animate }: { status: StreakStatus; stamped: boolean; animate: boolean }) {
  const { cycleDay, claimedToday } = status.login;
  return (
    <ol className="punches" aria-label="Les 7 jours de ta carte">
      {LOGIN_LADDER.map((reward, i) => {
        const n = i + 1;
        const today = n === cycleDay;
        const stamped = n < cycleDay || (today && claimedToday && todayStamped);
        const label = `Jour ${n} : ${reward} points${n === CYCLE_DAYS ? " et un joker" : ""}${stamped ? ", tamponné" : today ? ", aujourd'hui" : ""}`;
        return (
          <li key={n} className={`punch ${today ? "is-today" : ""} ${n === CYCLE_DAYS ? "is-seventh" : ""}`} aria-label={label}>
            <span className="punch-hole" aria-hidden="true">
              {n === CYCLE_DAYS ? (
                <span className="punch-joker">
                  <CardFace card={JOKER} width={26} />
                </span>
              ) : (
                !stamped && <span className="punch-day num">{n}</span>
              )}
              {stamped && <Stamp day={n} pressing={today && animate} />}
            </span>
            <span className="punch-amount num" aria-hidden="true">
              +{reward}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Un coup de tampon à l'encre rouge : un double cercle et l'éventail de cartes de la maison */
function Stamp({ day, pressing }: { day: number; pressing: boolean }) {
  return (
    <svg
      className={`stamp ${pressing ? "is-pressing" : ""}`}
      viewBox="0 0 60 60"
      style={{ "--tilt": `${TILT[day - 1] ?? 0}deg` } as CSSProperties}
      aria-hidden="true"
    >
      <circle cx="30" cy="30" r="27" fill="none" stroke="currentColor" strokeWidth="3.2" />
      <circle cx="30" cy="30" r="22.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <g transform="translate(30 42)">
        {FAN.map((angle) => (
          <rect
            key={angle}
            x="-5"
            y="-21"
            width="10"
            height="15"
            rx="1.6"
            transform={`rotate(${angle})`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          />
        ))}
      </g>
    </svg>
  );
}

function MiniJoker() {
  return (
    <span className="mini-joker" aria-hidden="true">
      <CardFace card={JOKER} width={14} />
    </span>
  );
}

/** Demain, et le 7e jour qui approche */
function Tomorrow({ status }: { status: StreakStatus }) {
  const { cycleDay, claimedToday, jokers } = status.login;
  const next = claimedToday ? (cycleDay % CYCLE_DAYS) + 1 : cycleDay;
  const joker = next === CYCLE_DAYS && jokers < MAX_JOKERS;
  return (
    <p className="habitue-tomorrow">
      {claimedToday ? "Reviens demain" : "Ouvre l'accueil aujourd'hui"} : <strong className="num">+{LOGIN_LADDER[next - 1]}</strong>
      {joker && " et un joker"}
      {next < CYCLE_DAYS && (
        <span className="habitue-soft">
          {" "}
          · au 7e jour : +{LOGIN_LADDER[CYCLE_DAYS - 1]}
          {jokers < MAX_JOKERS ? " et un joker" : ""}
        </span>
      )}
    </p>
  );
}

/** La série de jeu tient jusqu'à minuit : une partie terminée aujourd'hui la garde */
function PlayReminder({ status }: { status: StreakStatus }) {
  const { streak, today } = status.play;
  if (today || streak < 1) return null;
  return (
    <p className="habitue-alert">
      <Icon name="info" size={16} aria-hidden="true" /> Pas encore de partie aujourd'hui : une partie finie avant minuit garde tes{" "}
      {plural(streak, "jour")} de jeu d'affilée.
    </p>
  );
}

/** Le talon de la carte : le défi de la semaine, une partie à chacun des jeux ouverts d'ici dimanche soir */
function Challenge({ status, landed, animate }: { status: StreakStatus; landed: boolean; animate: boolean }) {
  const { games, played, bonus, paid } = status.week;
  const done = paid && landed;
  // Les jours qui restent, aujourd'hui compris (le dimanche, c'est le dernier)
  const left = 7 - (dayNumber(status.today) - dayNumber(status.week.start));
  const missing = games.filter((g) => !played.includes(g));
  // Au téléphone, au-delà de 6 jeux, les affiches passent sur deux lignes plutôt que de rapetisser
  const style = { "--n": games.length, "--half": Math.ceil(games.length / 2) } as CSSProperties;
  const twoRows = games.length > 6;
  return (
    <section className={`habitue-week ${done ? "is-done" : ""}`} aria-label="Le défi de la semaine">
      <div className="habitue-section-head">
        <h3>Défi de la semaine</h3>
        {done ? (
          <span className={`habitue-done ${animate ? "is-pressing" : ""}`}>
            Réussi <b className="num">+{bonus}</b>
          </span>
        ) : (
          <span className="habitue-week-prize num">+{bonus}</span>
        )}
      </div>
      <p className="habitue-week-text">
        {done || missing.length === 0 ? (
          `Les ${games.length} jeux, cette semaine.`
        ) : (
          <>
            <strong className="num">
              {played.length} jeu{played.length > 1 ? "x" : ""} sur {games.length}
            </strong>{" "}
            · une partie de chacun d'ici dimanche soir
            {left <= 2 && <span className="habitue-urgent">{left === 1 ? " · dernier jour !" : ` · plus que ${left} jours !`}</span>}
          </>
        )}
      </p>
      <ul className={`habitue-games ${twoRows ? "is-two-rows" : ""}`} style={style}>
        {games.map((g) => {
          const has = played.includes(g);
          return (
            <li key={g} className={has ? "is-played" : ""} title={`${GAME_NAMES[g]}${has ? " : joué" : " : pas encore"}`}>
              <GameTicket game={g} size="sm" />
              <span className="visually-hidden">{`${GAME_NAMES[g]}${has ? ", joué" : ", pas encore joué"}`}</span>
            </li>
          );
        })}
      </ul>
      {!done && missing.length > 0 && (
        <p className="habitue-missing">
          Il te manque {missing.length <= 5 ? missing.map((g) => GAME_NAMES[g]).join(", ") : `encore ${missing.length} jeux`}. Contre des
          amis ou des bots, du moment que tu restes jusqu'à la fin.
        </p>
      )}
    </section>
  );
}
