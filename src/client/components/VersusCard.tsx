import { useEffect, useState } from "react";
import type { HeadToHead, VersusResult } from "../../shared/headToHead.ts";
import { TABLE_NAMES } from "../../shared/protocol.ts";
import { api } from "../lib/api.ts";
import { timeAgo } from "./ui.tsx";

const RESULT: Record<VersusResult, string> = { won: "gagnée", lost: "perdue", tied: "à égalité" };

/**
 * « Face-à-face », sur le profil d'un autre joueur : vos parties à la même table, qui a fini devant l'autre (en tout et
 * jeu par jeu), la série en cours et la dernière revanche. Rien tant que vous n'avez pas joué ensemble.
 */
export function VersusCard({ pseudo }: { pseudo: string }) {
  const [versus, setVersus] = useState<HeadToHead | null>(null);
  useEffect(() => {
    let alive = true;
    setVersus(null);
    api
      .get<{ versus: HeadToHead }>(`/versus/${encodeURIComponent(pseudo)}`)
      .then((r) => alive && setVersus(r.versus))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [pseudo]);
  if (!versus || versus.played === 0) return null;
  const { won, lost, tied, streak, last } = versus;
  return (
    <section className="carnet panel versus rise">
      <h2>Face-à-face</h2>
      <p className="versus-score" aria-label={`Toi ${won}, ${pseudo} ${lost}`}>
        <span>
          <strong className="num">{won}</strong> toi
        </span>
        <span className="versus-dash" aria-hidden="true">
          –
        </span>
        <span>
          <strong className="num">{lost}</strong> {pseudo}
        </span>
      </p>
      <p className="carnet-summary">
        {versus.played} partie{versus.played > 1 ? "s" : ""} à la même table
        {tied > 0 && `, ${tied} sans vainqueur entre vous (même équipe ou même place)`}.
        {streak &&
          (streak.who === "me" ? ` Tu as gagné les ${streak.count} dernières.` : ` ${pseudo} a gagné les ${streak.count} dernières.`)}
      </p>
      <dl className="ledger">
        {versus.byGame.slice(0, 5).map((g) => (
          <div key={g.game} className="ledger-row">
            <dt>{TABLE_NAMES[g.game]}</dt>
            <dd className="num">
              {g.won} – {g.lost}
            </dd>
          </div>
        ))}
      </dl>
      {last && (
        <p className="versus-last hint">
          Dernière partie : {TABLE_NAMES[last.game]}, {timeAgo(last.endedAt)}, {RESULT[last.result]}.
        </p>
      )}
    </section>
  );
}
