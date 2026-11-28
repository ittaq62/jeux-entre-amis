import { motion } from "motion/react";
import { isOpen, type StarBook } from "../../shared/games/toque/campaign.ts";
import { KITCHEN_IDS, KITCHENS, type KitchenId } from "../../shared/games/toque/kitchens.ts";
import type { ToqueClientMessage, ToqueRoomView } from "../../shared/games/toque/net.ts";
import type { ChefStats } from "../../shared/games/toque/sim.ts";
import type { StarAwardResult } from "../../shared/stars.ts";
import { AvatarDrawing } from "../components/Avatar.tsx";
import { EveningLine } from "../components/EveningLine.tsx";
import { ReportButton } from "../components/ReportButton.tsx";
import { EloLine } from "../game/EloLine.tsx";
import { Stars } from "../stars/Stars.tsx";
import { useGameStars } from "../stores/stars.ts";
import { useTourBridge } from "../tour/bridge.ts";
import { TourNextNote } from "../tour/TourNextNote.tsx";
import { PLAYER_COLORS } from "./ToqueGame.tsx";

/** Le titre de chaque chef, d'après ce qu'il a le plus fait */
function chefTitle(st: ChefStats, best: { [k in keyof ChefStats]?: number }): string {
  const lead = (k: keyof ChefStats) => st[k] > 0 && st[k] >= (best[k] ?? 0);
  if (lead("fires") && st.fires >= 2) return "Pompier de service";
  if (lead("served")) return "Roi du passe";
  if (lead("washed") && st.washed >= 3) return "As de la plonge";
  if (lead("chopped")) return "Fine lame";
  if (lead("caught")) return "Voltigeur";
  if (lead("thrown") && st.thrown >= 3) return "Lanceur d'élite";
  if (st.falls >= 2) return "Abonné au plongeon";
  if (st.burnt >= 1) return "Spécialiste du charbon";
  if (st.dashes >= 30) return "Toujours pressé";
  return "Commis dévoué";
}

/** La feuille de fin : les étoiles, le score, ce qu'a fait chacun ; la revanche, ou la cuisine suivante */
export function ToqueGameOver({
  room,
  send,
  onLeave,
  onShowLobby,
  stars,
}: {
  room: ToqueRoomView;
  send: (m: ToqueClientMessage) => void;
  onLeave: () => void;
  onShowLobby: () => void;
  stars: StarAwardResult | null;
}) {
  const inTour = Boolean(useTourBridge());
  const view = room.toque!;
  const result = view.result!;
  const def = KITCHENS[view.kitchen];
  const seated = room.you.seatId !== null;
  const asked = room.rematch.includes(room.you.userId);
  const myOwner = room.you.seatId ? view.owners.findIndex((o) => o.seat === room.you.seatId) : -1;
  const myTeam = myOwner >= 0 ? view.owners[myOwner]!.team : 0;
  const team = result.teams[myTeam]!;
  const goals = view.goals[myTeam] ?? [0, 0, 0];
  const book = useGameStars("toque");
  // La suite de la route : ouverte maintenant ?
  const starBook: StarBook = {};
  for (const [k, v] of Object.entries(book?.maps ?? {})) starBook[k as KitchenId] = v.stars;
  if (stars) starBook[view.kitchen] = Math.max(starBook[view.kitchen] ?? 0, stars.stars);
  const next = KITCHEN_IDS[KITCHEN_IDS.indexOf(view.kitchen) + 1];
  const nextOpen = next && isOpen(next, starBook);
  const fresh = stars ? Math.max(0, stars.stars - stars.previous) : 0;
  const title = view.duel
    ? result.winner === null
      ? "Égalité parfaite !"
      : result.winner === myTeam && myOwner >= 0
        ? "Ta brigade l'emporte !"
        : myOwner >= 0
          ? "L'autre brigade l'emporte…"
          : `Victoire de la brigade ${result.winner === 0 ? "de gauche" : "de droite"}`
    : team.stars === 3
      ? "Service trois étoiles !"
      : team.stars === 2
        ? "Très beau service !"
        : team.stars === 1
          ? "Service réussi !"
          : "Le service est fini…";
  const best: { [k in keyof ChefStats]?: number } = {};
  for (const c of result.chefs)
    for (const [k, v] of Object.entries(c))
      if (k !== "owner") best[k as keyof ChefStats] = Math.max(best[k as keyof ChefStats] ?? 0, v as number);
  return (
    <div className="tq-over">
      <motion.div className="tq-over-card panel" initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}>
        <p className="tq-over-kitchen">{def.name}</p>
        <h1>{title}</h1>
        {!view.duel && (
          <div className="tq-over-stars">
            <Stars
              value={team.stars}
              size={44}
              fresh={stars ? fresh : team.stars}
              label={`${team.stars} étoile${team.stars > 1 ? "s" : ""}`}
            />
            {stars && stars.stars > team.stars && (
              <p className="hint">
                Ton record ici : {stars.stars} étoile{stars.stars > 1 ? "s" : ""}.
              </p>
            )}
            {stars && stars.points > 0 && <p className="tq-over-bonus">+{stars.points} points pour tes nouvelles étoiles</p>}
          </div>
        )}
        <div className="tq-over-score">
          {view.duel ? (
            <>
              <span className={`tq-over-team ${result.winner === 0 ? "is-win" : ""}`}>
                <strong className="num">{result.teams[0]!.score}</strong>
                <small>{myTeam === 0 && myOwner >= 0 ? "Ta brigade" : "Brigade de gauche"}</small>
              </span>
              <span className="tq-over-vs">contre</span>
              <span className={`tq-over-team ${result.winner === 1 ? "is-win" : ""}`}>
                <strong className="num">{result.teams[1]!.score}</strong>
                <small>{myTeam === 1 && myOwner >= 0 ? "Ta brigade" : "Brigade de droite"}</small>
              </span>
            </>
          ) : (
            <>
              <span className="tq-over-points">
                <strong className="num">{team.score}</strong> points
              </span>
              <span className="tq-over-goals num">
                ★ {goals[0]} · ★★ {goals[1]} · ★★★ {goals[2]}
              </span>
            </>
          )}
        </div>
        <dl className="tq-over-ledger">
          <div>
            <dt>Plats servis</dt>
            <dd className="num">{team.served}</dd>
          </div>
          <div>
            <dt>Pourboires</dt>
            <dd className="num">{team.tips}</dd>
          </div>
          <div>
            <dt>Commandes ratées</dt>
            <dd className="num">{team.failed}</dd>
          </div>
          <div>
            <dt>Meilleur enchaînement</dt>
            <dd className="num">{team.best}</dd>
          </div>
        </dl>
        {/* En brigade, pas d'Elo : les étoiles font les points */}
        {view.duel && <EloLine result={room.results?.[room.you.userId]} />}
        <ol className="tq-over-chefs">
          {view.owners.map((o, i) => {
            const seat = room.seats.find((s) => s.id === o.seat);
            const mine = result.chefs.filter((c) => c.owner === i);
            if (!seat || mine.length === 0) return null;
            const sum = { ...mine[0]! };
            for (const c of mine.slice(1)) for (const k of Object.keys(sum) as (keyof typeof sum)[]) if (k !== "owner") sum[k] += c[k];
            return (
              <li key={o.seat} className={seat.id === room.you.seatId ? "is-me" : ""}>
                <AvatarDrawing avatar={seat.avatar} size={36} />
                <span className="tq-over-name" style={{ color: PLAYER_COLORS[i % 4] }}>
                  {seat.name}
                  {seat.kind === "bot" ? " (commis)" : ""}
                  <small>{chefTitle(sum, best)}</small>
                </span>
                <span className="tq-over-stats">
                  <span>
                    <strong className="num">{sum.served}</strong> servis
                  </span>
                  <span>
                    <strong className="num">{sum.chopped}</strong> coupés
                  </span>
                  {sum.washed > 0 && (
                    <span>
                      <strong className="num">{sum.washed}</strong> lavées
                    </span>
                  )}
                  {sum.fires > 0 && (
                    <span>
                      <strong className="num">{sum.fires}</strong> feux éteints
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
        {!view.duel && nextOpen && next && fresh > 0 && (
          <p className="tq-over-next">La roulotte peut repartir : « {KITCHENS[next].name} » est ouverte !</p>
        )}
        <EveningLine game="toque" />
        {inTour ? <TourNextNote /> : !seated && <p className="hint">Tu regardes ce service : reste pour voir le suivant.</p>}
        <div className="tq-over-actions">
          {!inTour && seated && (
            <button className="btn btn-primary" disabled={asked} onClick={() => send({ t: "rematch" })}>
              {asked ? "En attente des autres" : view.duel ? "Revanche" : "Rejouer cette cuisine"}
            </button>
          )}
          {!inTour && room.you.isHost && !view.duel && nextOpen && next && (
            <button
              className="btn"
              onClick={() => {
                send({ t: "settings", settings: { kitchen: next } });
                onShowLobby();
              }}
            >
              Cuisine suivante
            </button>
          )}
          {!inTour && (
            <button className="btn" onClick={onShowLobby}>
              {room.you.isHost ? "La carte de la route" : "Voir le salon"}
            </button>
          )}
          <button className="btn btn-ghost" onClick={onLeave}>
            {inTour ? "Quitter la tournée" : "Quitter"}
          </button>
        </div>
        <ReportButton game="toque" variant={`Toque !, ${def.name}`} code={room.code} role={seated ? "player" : "watcher"} />
      </motion.div>
    </div>
  );
}
