import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { GAME_NAMES } from "../../shared/protocol.ts";
import { CYCLE_DAYS, LOGIN_LADDER, MAX_JOKERS, type StreakStatus } from "../../shared/streak.ts";
import { play } from "../lib/sound.ts";
import { usePrefs } from "../stores/prefs.ts";
import { useShop } from "../stores/shop.ts";
import { useStreak } from "../stores/streak.ts";
import { GameTicket } from "../tour/TourParts.tsx";
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

/** Le moment de l'animation : avant que les pièces tombent, pendant, puis le jour gagné */
type Phase = "before" | "falling" | "landed";

const FALL_AT = 450;
const LAND_AT = 1050;
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

/** La fenêtre de la semaine : les 7 jours du cycle, ce qui est gagné, ce qui vient, et le défi de la semaine. */
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
  // L'animation ne se joue qu'au moment où les points tombent, pas quand on rouvre la fenêtre pour regarder
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
      timers.push(window.setTimeout(() => setPhase("falling"), FALL_AT));
      timers.push(
        window.setTimeout(() => {
          setPhase("landed");
          play("pop", { volume: 0.6 });
        }, LAND_AT),
      );
    }
    if (thisWeek) {
      timers.push(
        window.setTimeout(
          () => {
            setWeekLanded(true);
            play("achievement", { volume: 0.7 });
          },
          day ? LAND_AT + 550 : FALL_AT,
        ),
      );
    }
    return () => timers.forEach((t) => clearTimeout(t));
  }, [animate, day, thisWeek]);

  const target = paid > 0 ? balanceBefore + paid : liveBalance;
  const counting = !animate || phase === "landed" || (!day && weekLanded);
  const shownBalance = useCountUp(balanceBefore, target, counting, !animate);

  if (!status) return null;
  return createPortal(
    <div
      className={`modal-backdrop streak-backdrop ${still ? "is-still" : ""}`}
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div className="modal panel streak-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="modal-head streak-head">
          <h2 id={titleId}>
            <Icon name="flame" size={24} aria-hidden="true" className="streak-flame" />
            {plural(status.login.streak, "jour")} d'affilée
          </h2>
          <button className="btn btn-ghost btn-icon" onClick={close} aria-label="Fermer">
            <Icon name="close" />
          </button>
        </div>
        <p className="streak-sub">
          Record : {plural(status.login.best, "jour")}
          {status.play.streak > 0 && <> · {plural(status.play.streak, "jour")} de jeu d'affilée</>}
        </p>

        <Week status={status} phase={phase} animate={animate && day !== null} />

        <div className="streak-notes">
          <Today status={status} />
          {day && day.lost >= 2 && <p>Ta série de {day.lost} jours s'était arrêtée : elle repart aujourd'hui.</p>}
          {day?.jokerUsed && (
            <p>
              <Icon name="shield" size={16} aria-hidden="true" /> Ton joker a couvert le jour raté : ta série continue.
            </p>
          )}
          {day?.jokerEarned ? (
            <p>
              <Icon name="shield" size={16} aria-hidden="true" /> Un joker en réserve ! Si tu rates un jour, il sauvera ta série.
            </p>
          ) : (
            !day?.jokerUsed && <JokerNote status={status} />
          )}
          <p className="hint">Un jour compte dès que tu ouvres l'accueil connecté, à l'heure de Paris.</p>
        </div>

        {status.week.bonus > 0 && <Challenge status={status} landed={weekLanded} animate={animate && thisWeek !== null} />}
        {lastWeek && (
          <p className="streak-last-week">
            <Icon name="check" size={16} aria-hidden="true" /> Défi de la semaine dernière réussi : +{lastWeek.bonus} points.
          </p>
        )}

        <div className="streak-foot">
          <span className="streak-balance">
            <Icon name="coin" size={18} aria-hidden="true" />
            <strong className="num">{fr(shownBalance)}</strong> points
          </span>
          <button ref={primary} className="btn btn-primary" onClick={close}>
            Allons jouer
          </button>
        </div>
        <span className="visually-hidden" role="status">
          {day ? `Tu gagnes ${day.reward} points aujourd'hui, ${ordinal(day.cycleDay)} jour de ta semaine.` : ""}
          {gained?.weeks.map((w) => ` Défi de la semaine${w.current ? "" : " dernière"} réussi : ${w.bonus} points.`).join("") ?? ""}
        </span>
      </div>
    </div>,
    document.body,
  );
}

/** Les 7 jours du cycle : ceux déjà gagnés, aujourd'hui, et ceux qui viennent */
function Week({ status, phase, animate }: { status: StreakStatus; phase: Phase; animate: boolean }) {
  const { cycleDay, claimedToday } = status.login;
  return (
    <ol className="streak-week" aria-label="Les 7 jours de ta semaine de connexion">
      {LOGIN_LADDER.map((reward, i) => {
        const n = i + 1;
        const today = n === cycleDay;
        const won = n < cycleDay || (today && claimedToday && phase === "landed");
        const label = `Jour ${n} : ${reward} points${n === CYCLE_DAYS ? " et un joker" : ""}${won ? ", gagné" : today ? ", aujourd'hui" : ""}`;
        return (
          <li
            key={n}
            className={`streak-day ${won ? "is-won" : today ? "is-today" : "is-next"} ${today ? "is-current" : ""} ${
              today && animate && phase === "landed" ? "is-landed" : ""
            } ${n === CYCLE_DAYS ? "is-seventh" : ""}`}
            aria-label={label}
          >
            <span className="streak-day-label" aria-hidden="true">
              J{n}
            </span>
            <span className="streak-day-mark" aria-hidden="true">
              <Icon name={won ? "check" : n === CYCLE_DAYS ? "shield" : "coin"} size={won ? 20 : 18} />
            </span>
            <span className="streak-day-reward num" aria-hidden="true">
              +{reward}
            </span>
            {today && animate && phase === "falling" && (
              <span className="streak-coins" aria-hidden="true">
                {[-9, 7, -1].map((x, k) => (
                  <i key={k} style={{ "--x": `${x}px`, "--k": k } as CSSProperties} />
                ))}
              </span>
            )}
            {today && animate && phase === "landed" && (
              <span className="streak-float num" aria-hidden="true">
                +{reward}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function JokerNote({ status }: { status: StreakStatus }) {
  if (status.login.jokers > 0) {
    return (
      <p>
        <Icon name="shield" size={16} aria-hidden="true" /> {status.login.jokers >= MAX_JOKERS ? "Un joker" : "Des jokers"} en réserve : un
        jour raté ne cassera pas ta série.
      </p>
    );
  }
  return (
    <p className="hint">
      <Icon name="shield" size={16} aria-hidden="true" /> Le 7e jour rapporte aussi un joker : il sauve ta série si tu rates un jour.
    </p>
  );
}

/** Aujourd'hui et demain, en clair */
function Today({ status }: { status: StreakStatus }) {
  const { cycleDay, claimedToday, jokers } = status.login;
  const next = (cycleDay % CYCLE_DAYS) + 1;
  const joker = next === CYCLE_DAYS && jokers < MAX_JOKERS;
  return (
    <p className="streak-today">
      {claimedToday ? "Aujourd'hui" : "En ouvrant l'accueil aujourd'hui"}, {ordinal(cycleDay)} jour :{" "}
      <strong className="num">+{LOGIN_LADDER[cycleDay - 1]}</strong>. Reviens demain :{" "}
      <strong className="num">+{LOGIN_LADDER[next - 1]}</strong>
      {joker && " et un joker"}.
    </p>
  );
}

/** Le défi de la semaine : une partie à chacun des jeux ouverts, d'ici dimanche soir */
function Challenge({ status, landed, animate }: { status: StreakStatus; landed: boolean; animate: boolean }) {
  const { games, played, bonus, paid } = status.week;
  const done = paid && landed;
  return (
    <section
      className={`streak-challenge ${done ? "is-done" : ""} ${done && animate ? "is-landed" : ""}`}
      aria-label="Le défi de la semaine"
    >
      <div className="streak-challenge-head">
        <h3>Le défi de la semaine</h3>
        <span className="streak-prize num">
          {done && <Icon name="check" size={15} aria-hidden="true" />}+{bonus}
        </span>
        {done && animate && (
          <span className="streak-float is-week num" aria-hidden="true">
            +{bonus}
          </span>
        )}
      </div>
      <p className="streak-challenge-text">
        {done
          ? `Réussi : tu as joué à chacun des ${games.length} jeux cette semaine.`
          : `Termine une partie de chacun des ${games.length} jeux d'ici dimanche soir.`}
      </p>
      <ul className="streak-games">
        {games.map((g) => {
          const has = played.includes(g);
          return (
            <li key={g} className={has ? "is-played" : ""} title={`${GAME_NAMES[g]}${has ? " : joué" : " : pas encore"}`}>
              <GameTicket game={g} size="sm" dim={!has} />
              {has && (
                <span className="streak-game-check" aria-hidden="true">
                  <Icon name="check" size={12} />
                </span>
              )}
              <span className="visually-hidden">{`${GAME_NAMES[g]}${has ? ", joué" : ", pas encore joué"}`}</span>
            </li>
          );
        })}
      </ul>
      <p className="hint">
        {played.length} sur {games.length} · contre des amis ou des bots, du moment que tu restes jusqu'à la fin
      </p>
    </section>
  );
}
