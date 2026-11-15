import { GAME_NAMES } from "../../shared/protocol.ts";
import type { StreakStatus } from "../../shared/streak.ts";
import { GameTicket } from "../tour/TourParts.tsx";
import { Icon } from "./Icon.tsx";
import "../styles/streak.css";

function Row({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`ledger-row ${strong ? "is-key" : ""}`}>
      <dt>{label}</dt>
      <dd>
        {value} jour{value > 1 ? "s" : ""}
      </dd>
    </div>
  );
}

/** La série sur le profil : les jours d'affilée (accueil ouvert, partie terminée), les records, les jeux de la semaine */
export function StreakCarnet({ streak, self }: { streak: StreakStatus; self: boolean }) {
  const { login, play, week } = streak;
  const n = week.played.length;
  return (
    <section className="carnet panel streak-carnet">
      <h2>
        <Icon name="flame" size={22} aria-hidden="true" /> La série
      </h2>
      <p className="carnet-summary">
        {login.streak > 0
          ? `${login.streak} jour${login.streak > 1 ? "s" : ""} d'affilée à passer par l'accueil.`
          : self
            ? "Pas de série en cours : elle démarre dès que tu ouvres l'accueil."
            : "Pas de série en cours."}
      </p>
      <dl className="ledger">
        <Row label="Connexion, jours d'affilée" value={login.streak} strong />
        <Row label="Meilleure série de connexion" value={login.best} />
        <Row label="Jeu, jours d'affilée" value={play.streak} />
        <Row label="Meilleure série de jeu" value={play.best} />
        {self && (
          <div className="ledger-row">
            <dt>Jokers en réserve</dt>
            <dd>{login.jokers}</dd>
          </div>
        )}
      </dl>
      <h3 className="streak-carnet-week">
        Cette semaine{" "}
        <span className="hint num">
          {n} jeu{n > 1 ? "x" : ""} sur {week.games.length}
        </span>
      </h3>
      <ul className="streak-games">
        {week.games.map((g) => {
          const has = week.played.includes(g);
          return (
            <li key={g} title={`${GAME_NAMES[g]}${has ? " : joué cette semaine" : " : pas encore cette semaine"}`}>
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
      {self && week.bonus > 0 && (
        <p className="hint">
          {week.paid
            ? `Défi de la semaine réussi : +${week.bonus} points.`
            : `Une partie de chacun d'ici dimanche soir : +${week.bonus} points.`}
        </p>
      )}
    </section>
  );
}
