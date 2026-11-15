import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { GAME_NAMES } from "../../shared/protocol.ts";
import type { Card } from "../../shared/games/uno/cards.ts";
import { CYCLE_DAYS, LOGIN_LADDER, MAX_JOKERS, type StreakStatus } from "../../shared/streak.ts";
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

/** Le joker du 7e jour : une vraie carte joker de la table */
const JOKER: Card = { id: -7, kind: "wild", color: null };
/** Chaque tampon penche un peu à sa façon, comme posé à la main */
const TILT = [-11, 7, -4, 12, -8, 5, -13];

/** Le moment de l'animation : la case d'aujourd'hui attend son tampon, puis il tombe */
type Phase = "before" | "landed";

const STAMP_AT = 520;
const WEEK_AFTER = 650;
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
 * La carte d'habitué : un carton imprimé, un tampon par jour d'affilée (7 cases, le joker au bout), et en talon le
 * défi de la semaine. Le tampon du jour s'abat au moment où les points tombent.
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
  const [phase, setPhase] = useState<Phase>(animate && day ? "before" : "landed");
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
    const timers: number[] = [];
    if (day) {
      timers.push(
        window.setTimeout(() => {
          setPhase("landed");
          play("cardPlace", { volume: 0.8 });
        }, STAMP_AT),
      );
    }
    if (thisWeek) {
      timers.push(
        window.setTimeout(
          () => {
            setWeekLanded(true);
            play("achievement", { volume: 0.7 });
          },
          day ? STAMP_AT + WEEK_AFTER : STAMP_AT,
        ),
      );
    }
    return () => timers.forEach((t) => clearTimeout(t));
  }, [animate, day, thisWeek]);

  const target = paid > 0 ? balanceBefore + paid : liveBalance;
  const counting = !animate || phase === "landed" || (!day && weekLanded);
  const shownBalance = useCountUp(balanceBefore, target, counting, !animate);

  if (!status) return null;
  const { login, play: playing } = status;
  const thud = animate && day !== null && phase === "landed";
  return createPortal(
    <div
      className={`modal-backdrop habitue-backdrop ${still ? "is-still" : ""}`}
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div className={`habitue paper ${thud ? "is-thud" : ""}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <button className="habitue-close" onClick={close} aria-label="Fermer">
          <Icon name="close" size={20} />
        </button>
        <p className="habitue-kicker">La Tablée · carte d'habitué</p>
        <h2 id={titleId} className="habitue-title">
          <span className="habitue-count">{login.streak}</span>
          <span className="habitue-title-text">
            {login.streak > 1 ? "jours d'affilée" : "jour d'affilée"}
            <small>
              Record : {plural(login.best, "jour")}
              {playing.streak > 0 && <> · {plural(playing.streak, "jour")} de jeu</>}
            </small>
          </span>
        </h2>

        <Punches status={status} phase={phase} animate={animate && day !== null} />

        <div className="habitue-notes">
          <Today status={status} />
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
            <JokerNote status={status} />
          )}
        </div>

        {status.week.bonus > 0 && <Challenge status={status} landed={weekLanded} animate={animate && thisWeek !== null} />}
        {lastWeek && <p className="habitue-last-week">Défi de la semaine dernière réussi : +{lastWeek.bonus} points.</p>}

        <div className="habitue-foot">
          <span className="habitue-balance">
            <span className="habitue-balance-label">Ton solde</span>
            <strong className="num">{fr(shownBalance)}</strong> points
            {animate && counting && (
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

/** Les 7 cases de la carte : tamponnées, celle d'aujourd'hui, et celles qui attendent */
function Punches({ status, phase, animate }: { status: StreakStatus; phase: Phase; animate: boolean }) {
  const { cycleDay, claimedToday } = status.login;
  return (
    <ol className="punches" aria-label="Les 7 jours de ta carte">
      {LOGIN_LADDER.map((reward, i) => {
        const n = i + 1;
        const today = n === cycleDay;
        const stamped = n < cycleDay || (today && claimedToday && phase === "landed");
        const label = `Jour ${n} : ${reward} points${n === CYCLE_DAYS ? " et un joker" : ""}${stamped ? ", tamponné" : today ? ", aujourd'hui" : ""}`;
        return (
          <li key={n} className={`punch ${today ? "is-today" : ""} ${n === CYCLE_DAYS ? "is-seventh" : ""}`} aria-label={label}>
            <span className="punch-hole" aria-hidden="true">
              {n === CYCLE_DAYS ? (
                <span className="punch-joker">
                  <CardFace card={JOKER} width={24} />
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

/** Le logo de la maison, en éventail de quatre cartes, comme dans l'en-tête du site */
const FAN = [-26, -9, 9, 26];

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

function JokerNote({ status }: { status: StreakStatus }) {
  if (status.login.jokers > 0) {
    return (
      <p>
        <MiniJoker /> {status.login.jokers >= MAX_JOKERS ? "Joker" : "Jokers"} en poche : un jour raté ne casse pas ta série.
      </p>
    );
  }
  return (
    <p className="habitue-soft">
      <MiniJoker /> Au 7e tampon : +{LOGIN_LADDER[CYCLE_DAYS - 1]} et un joker, qui couvre un jour raté.
    </p>
  );
}

/** Aujourd'hui et demain, en clair */
function Today({ status }: { status: StreakStatus }) {
  const { cycleDay, claimedToday, jokers } = status.login;
  const next = (cycleDay % CYCLE_DAYS) + 1;
  const joker = next === CYCLE_DAYS && jokers < MAX_JOKERS;
  return (
    <p className="habitue-today">
      {claimedToday ? "Aujourd'hui" : "En ouvrant l'accueil aujourd'hui"} : <strong className="num">+{LOGIN_LADDER[cycleDay - 1]}</strong>
      <span className="habitue-sep" aria-hidden="true">
        ·
      </span>
      Demain : <strong className="num">+{LOGIN_LADDER[next - 1]}</strong>
      {joker && " et un joker"}
    </p>
  );
}

/** Le talon de la carte : le défi de la semaine, une partie à chacun des jeux ouverts d'ici dimanche soir */
function Challenge({ status, landed, animate }: { status: StreakStatus; landed: boolean; animate: boolean }) {
  const { games, played, bonus, paid } = status.week;
  const done = paid && landed;
  return (
    <section className={`habitue-week ${done ? "is-done" : ""}`} aria-label="Le défi de la semaine">
      <div className="habitue-week-head">
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
        {done ? `Les ${games.length} jeux, cette semaine.` : `Une partie de chacun des ${games.length} jeux d'ici dimanche soir.`}
      </p>
      <div className="habitue-games-row">
        <ul className="habitue-games">
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
        <span className="habitue-week-count num" aria-label={`${played.length} sur ${games.length}`}>
          {played.length}/{games.length}
        </span>
      </div>
      <p className="habitue-soft">Contre des amis ou des bots, du moment que tu restes jusqu'à la fin.</p>
    </section>
  );
}
