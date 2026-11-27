// La saison en solo, dans le salon d'une table (pour son hôte, hors tournée) : les chapitres ouverts et le prochain à
// ouvrir, leurs étoiles, et « Jouer » qui lance le chapitre aussitôt à cette table, contre la foule et Gaspard. Les
// chapitres encore loin tiennent sur une ligne ; l'histoire complète de chacun est sur la page de la campagne.

import { Link } from "wouter";
import { CHAPTERS } from "../../shared/games/cour/campaign.ts";
import { EPREUVE_INFO } from "../../shared/games/cour/epreuves.ts";
import type { CourClientMessage, CourRoomView } from "../../shared/games/cour/net.ts";
import { Icon } from "../components/Icon.tsx";
import { GameStarsTotal, MapStars } from "../stars/Stars.tsx";
import { useGameStars } from "../stores/stars.ts";

export function SeasonPanel({ room, send }: { room: CourRoomView; send: (msg: CourClientMessage) => void }) {
  const stars = useGameStars("cour");
  const got = (id: string) => stars?.maps?.[id]?.stars ?? 0;
  const others = room.seats.some((s) => s.kind === "human" && s.userId !== room.you.userId);
  const can = room.you.isHost && room.you.seatId !== null && !others && room.status !== "playing";
  const firstLocked = CHAPTERS.findIndex((_, k) => k > 0 && got(CHAPTERS[k - 1]!.id) === 0);
  const shown = firstLocked < 0 ? CHAPTERS.length : firstLocked + 1;
  const later = CHAPTERS.slice(shown);
  return (
    <section className="lobby-section panel cg-season" aria-label="La saison en solo">
      <header className="cg-season-head">
        <h2>La saison en solo</h2>
        <GameStarsTotal game="cour" />
      </header>
      <p className="hint" style={{ margin: 0 }}>
        Neuf épreuves dans l'ordre, contre la foule et Gaspard le Magnifique : une à trois étoiles chacune, et une étoile ouvre le chapitre
        suivant.
      </p>
      <ol className="cg-season-list">
        {CHAPTERS.slice(0, shown).map((c, k) => {
          const open = firstLocked < 0 || k < firstLocked;
          const info = EPREUVE_INFO[c.ep];
          return (
            <li key={c.id} className={`cg-season-row ${open ? "" : "is-locked"}`} style={{ "--ep": info.color } as React.CSSProperties}>
              <span className="cg-season-num num">{k + 1}</span>
              <span className="cg-season-name">
                <strong>{c.title}</strong>
                <span className="hint">{open ? info.name : "Fermé : gagne une étoile au chapitre d'avant"}</span>
              </span>
              {open && <MapStars game="cour" map={c.id} size={15} />}
              <button
                type="button"
                className={`btn btn-sm ${open ? "btn-primary" : "btn-ghost"}`}
                disabled={!open || !can}
                aria-label={open ? `Jouer « ${c.title} »` : `${c.title} : fermé`}
                onClick={() => send({ t: "campagne", chapter: c.id })}
              >
                <Icon name={open ? "play" : "lock"} size={16} />
              </button>
            </li>
          );
        })}
      </ol>
      {later.length > 0 && <p className="hint cg-season-later">Ensuite : {later.map((c) => EPREUVE_INFO[c.ep].name).join(", ")}.</p>}
      {others && (
        <p className="hint" style={{ margin: 0 }}>
          La saison se joue seul : les autres candidats doivent quitter la table.
        </p>
      )}
      <Link href="/cour/campagne" className="cg-season-link">
        Toute l'histoire de la saison →
      </Link>
    </section>
  );
}
