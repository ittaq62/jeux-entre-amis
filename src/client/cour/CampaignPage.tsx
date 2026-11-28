// La campagne de La Cour des Grands : la saison, chapitre par chapitre. Chaque chapitre montre son histoire, ses trois
// étoiles (et comment les gagner), et s'ouvre quand le précédent a au moins une étoile. « Jouer » ouvre une table privée
// où l'épreuve part aussitôt, contre la foule des bots et Gaspard.

import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { CHAPTERS } from "../../shared/games/cour/campaign.ts";
import { EPREUVE_INFO } from "../../shared/games/cour/epreuves.ts";
import { AppHeader } from "../components/AppHeader.tsx";
import { api, ApiError } from "../lib/api.ts";
import { toast } from "../lib/toast.ts";
import { GameStarsTotal, MapStars, StarGoals } from "../stars/Stars.tsx";
import { useGameStars } from "../stores/stars.ts";
import { leaveCampaignChapter } from "./campaignStart.ts";
import "./cour.css";

export function CampaignPage() {
  const [, navigate] = useLocation();
  const stars = useGameStars("cour");
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const got = (id: string) => stars?.maps?.[id]?.stars ?? 0;
  const firstLocked = CHAPTERS.findIndex((_, k) => k > 0 && got(CHAPTERS[k - 1]!.id) === 0);
  useEffect(() => {
    // Le prochain chapitre à jouer, ouvert d'office
    const next = CHAPTERS.find((c) => got(c.id) === 0) ?? CHAPTERS[CHAPTERS.length - 1]!;
    setOpen((o) => o ?? next.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stars]);

  const play = async (chapter: string) => {
    setBusy(chapter);
    try {
      const { code } = await api.post<{ code: string }>("/rooms", { visibility: "private", game: "cour" });
      leaveCampaignChapter(code, chapter);
      navigate(`/salon/${code}?campagne=${chapter}`);
    } catch (err) {
      toast({ tone: "danger", title: err instanceof ApiError ? err.message : "La cour est fermée pour l'instant." });
      setBusy(null);
    }
  };

  return (
    <div className="page cg-campaign">
      <AppHeader />
      <main className="cg-campaign-main">
        <header className="cg-campaign-head">
          <Link href="/" className="hint">
            ← Accueil
          </Link>
          <h1>La Cour des Grands</h1>
          <p className="cg-campaign-sub">
            La saison en solo : neuf épreuves, une Cloche d'or, et Gaspard le Magnifique qui ne te lâche pas.
          </p>
          <GameStarsTotal game="cour" />
        </header>
        <ol className="cg-chapters">
          {CHAPTERS.map((c, k) => {
            const locked = firstLocked >= 0 && k >= firstLocked;
            const info = EPREUVE_INFO[c.ep];
            const isOpen = open === c.id;
            return (
              <li
                key={c.id}
                className={`cg-chapter ${locked ? "is-locked" : ""} ${isOpen ? "is-open" : ""}`}
                style={{ "--ep": info.color, "--ep-dark": info.dark } as React.CSSProperties}
              >
                <button className="cg-chapter-head" onClick={() => setOpen(isOpen ? null : c.id)} aria-expanded={isOpen}>
                  <span className="cg-chapter-num num">{k + 1}</span>
                  <span className="cg-chapter-title">
                    <strong>{c.title}</strong>
                    <small>{info.name}</small>
                  </span>
                  {locked ? (
                    <span className="cg-lock" aria-label="Fermé">
                      🔒
                    </span>
                  ) : (
                    <MapStars game="cour" map={c.id} size={18} />
                  )}
                </button>
                {isOpen && (
                  <div className="cg-chapter-body">
                    {c.story.map((line, i) => (
                      <p key={i}>{line}</p>
                    ))}
                    <p className="cg-rival">{c.rival}</p>
                    <ul className="cg-goals">
                      {c.goals.map((g, i) => (
                        <li key={i} className={got(c.id) > i ? "is-got" : ""}>
                          <span>{"★".repeat(i + 1)}</span> {g}
                        </li>
                      ))}
                    </ul>
                    <StarGoals game="cour" map={c.id} />
                    <button className="btn btn-primary" disabled={locked || busy !== null} onClick={() => play(c.id)}>
                      {locked
                        ? "Gagne une étoile au chapitre d'avant"
                        : busy === c.id
                          ? "La cloche sonne…"
                          : got(c.id)
                            ? "Rejouer"
                            : "Jouer"}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </main>
    </div>
  );
}
