// L'aventure du minigolf, au salon : les huit parcours dans l'ordre, ses étoiles sur chacun (sur 27, une par trou et
// par marche : fini, au par, sous le par), le suivant qui s'ouvre quand chaque trou du précédent a une étoile. Elle se
// joue seul ; la salle vérifie que le parcours est ouvert (voir starCourses.ts).

import { courseOpen, courseStars, STAR_COURSES, type StarCourse } from "../../shared/games/minigolf/starCourses.ts";
import type { MinigolfClientMessage, MinigolfRoomView } from "../../shared/games/minigolf/net.ts";
import { Icon } from "../components/Icon.tsx";
import { GameStarsTotal, Stars } from "../stars/Stars.tsx";
import { useGameStars } from "../stores/stars.ts";

/** Le par d'un parcours entier */
export function coursePar(c: StarCourse): number {
  return c.pars.reduce<number>((s, p) => s + p, 0);
}

/** Les étoiles des neuf trous d'un parcours, en petit (le menu du choix du parcours) */
export function HoleStarStrip({ course }: { course: string }) {
  const stars = useGameStars("minigolf");
  const c = STAR_COURSES.find((x) => x.id === course);
  if (!c) return null;
  const mine = courseStars(stars, c);
  return (
    <div className="mg-hole-stars" aria-label={`${mine.total} étoiles sur ${mine.max}`}>
      {mine.holes.map((n, i) => (
        <span key={i} className="mg-hole-star" title={`Trou ${i + 1} : ${n} étoile${n > 1 ? "s" : ""}`}>
          <span className="num">{i + 1}</span>
          <Stars value={n} size={9} label={`Trou ${i + 1} : ${n} étoile${n > 1 ? "s" : ""} sur 3`} />
        </span>
      ))}
      <span className="mg-hole-stars-total num">
        {mine.total} / {mine.max}
      </span>
    </div>
  );
}

export function AdventurePanel({ room, send }: { room: MinigolfRoomView; send: (msg: MinigolfClientMessage) => void }) {
  const stars = useGameStars("minigolf");
  const others = room.seats.some((s) => s.kind === "human" && s.userId !== room.you.userId);
  const can = room.you.isHost && !others && room.status !== "playing";
  // Les parcours ouverts, puis le prochain à ouvrir ; les autres tiennent sur une ligne (au téléphone, huit lignes
  // fermées faisaient un long panneau)
  const firstLocked = STAR_COURSES.findIndex((c) => !courseOpen(stars, c.id));
  const shown = firstLocked < 0 ? STAR_COURSES.length : firstLocked + 1;
  const later = STAR_COURSES.slice(shown);
  return (
    <section className="lobby-section panel mg-adventure" aria-label="L'aventure">
      <header className="mg-adv-head">
        <h2>L'aventure</h2>
        <GameStarsTotal game="minigolf" />
      </header>
      <p className="hint" style={{ margin: 0 }}>
        Seul, les huit parcours dans l'ordre : chaque trou fini donne sa première étoile, et un parcours fini ouvre le suivant. Sur chaque
        trou, un défi.
      </p>
      <ol className="mg-adv-list">
        {STAR_COURSES.slice(0, shown).map((c, k) => {
          const open = courseOpen(stars, c.id);
          const mine = courseStars(stars, c);
          return (
            <li key={c.id} className={`mg-adv-course ${open ? "" : "is-locked"}`}>
              <span className="mg-adv-num num">{k + 1}</span>
              <span className="mg-adv-name">
                <strong>{c.name}</strong>
                <span className="hint">
                  {!open ? "Fermé : finis chaque trou du parcours d'avant" : `Par ${coursePar(c)} · ${mine.total} / ${mine.max} étoiles`}
                </span>
              </span>
              <Stars value={mine.min} size={15} label={`${mine.total} étoiles sur ${mine.max}`} />
              <button
                type="button"
                className={`btn btn-sm ${open ? "btn-primary" : "btn-ghost"}`}
                disabled={!open || !can}
                aria-label={open ? `Jouer ${c.name}` : `${c.name} : fermé`}
                onClick={() => send({ t: "adventure", course: c.id })}
              >
                <Icon name={open ? "play" : "lock"} size={16} />
              </button>
            </li>
          );
        })}
        {later.length > 0 && (
          <li className="mg-adv-later hint">
            Puis {later.length === 1 ? "" : `${later.length} parcours : `}
            {later.map((c) => c.name).join(", ")}
          </li>
        )}
      </ol>
      {others && (
        <p className="hint" style={{ margin: 0 }}>
          L'aventure se joue seul : quand tu es seul à la table (les bots s'en vont d'eux-mêmes).
        </p>
      )}
    </section>
  );
}
