// L'écran du grand jeu : la scène en 3D, et par-dessus ce qu'il faut à chaque étape : le chargement commun, les titres
// des cinématiques (l'arrivée, la révélation de chaque épreuve avec sa règle, les éliminés, l'accéléré, le podium), le
// bouton pour passer, les commandes de l'épreuve, et la feuille de fin (classement, Elo, revanche, étoiles en campagne).

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { CHAPTER_BY_ID } from "../../shared/games/cour/campaign.ts";
import { EPREUVE_INFO, type EpreuveId } from "../../shared/games/cour/epreuves.ts";
import type { MatchView } from "../../shared/games/cour/match.ts";
import type { CourClientMessage, CourRoomView } from "../../shared/games/cour/net.ts";
import type { StarAwardResult } from "../../shared/stars.ts";
import { Avatar } from "../components/Avatar.tsx";
import { EveningLine } from "../components/EveningLine.tsx";
import { Icon } from "../components/Icon.tsx";
import { ReportButton } from "../components/ReportButton.tsx";
import { MenuSound, SoundButton } from "../components/SoundSettings.tsx";
import { EloLine } from "../game/EloLine.tsx";
import { FirstSecondsPanel } from "../game/FirstSecondsPanel.tsx";
import { GameLoading, loadingShown, type LoadingTheme } from "../game/GameLoading.tsx";
import { watchFirstSeconds } from "../lib/firstSeconds.ts";
import { useGateClock, useLoadedSignal } from "../lib/loadGate.ts";
import { nextFrame } from "../lib/prepare.ts";
import { StarResult } from "../stars/Stars.tsx";
import { useTourBridge } from "../tour/bridge.ts";
import { TourNextNote } from "../tour/TourNextNote.tsx";
import { Controls } from "./CourControls.tsx";
import { HowToPlay } from "./CourHelp.tsx";
import { CourRuntime, type HudState } from "./runtime.ts";
import * as sfx from "./sfx.ts";
import type { CourListeners } from "./useCourRoom.ts";

const LOADING_THEME: LoadingTheme = { from: "#2f74d0", to: "#123a6b", accent: "#ffd84a" };

const OUT_WORDS: Record<string, string> = {
  peinture: "repeint",
  tarte: "entarté",
  mousse: "dans la mousse",
  plouf: "à l'eau",
  trappe: "par la trappe",
  gelee: "gélifié",
  canon: "sous la mousse",
  plumes: "plumé",
  chute: "tombé",
  temps: "trop tard",
  jury: "écarté par le jury",
};

export function CourGame({
  room,
  send,
  serverNow,
  listeners,
  stars,
  onLeave,
  onOpenChat,
  unread,
  onShowLobby,
}: {
  room: CourRoomView;
  send: (msg: CourClientMessage) => void;
  serverNow: () => number;
  listeners: MutableRefObject<CourListeners>;
  stars: StarAwardResult | null;
  onLeave: () => void;
  onOpenChat: () => void;
  unread: number;
  onShowLobby: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<CourRuntime | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [menu, setMenu] = useState(false);
  const [help, setHelp] = useState(false);
  const [prep, setPrep] = useState({ share: 0, done: false });
  const bridge = useTourBridge();
  const m = room.match!;
  const roster = room.roster ?? [];
  const mySeat = room.you.seatId;
  const serverOffset = serverNow() - Date.now();
  const gateClock = useGateClock(room.gate, serverOffset);
  useLoadedSignal(room.gate, mySeat, prep.done, send);
  const live = prep.done && gateClock.passed && room.status === "playing";
  useEffect(() => {
    if (live) return watchFirstSeconds("La Cour des Grands");
  }, [live]);

  // Une seule scène pour toute la partie
  useEffect(() => {
    if (!host.current) return;
    const rt = new CourRuntime(host.current, {
      me: mySeat,
      serverNow,
      send: (i) => send({ t: "in", i }),
      skip: () => send({ t: "skip" }),
      onHud: setHud,
    });
    runtime.current = rt;
    // Pour les essais (page de travail, console)
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__courRt = rt;
    rt.setMatch(m);
    listeners.current.onMatch = (mv: MatchView) => rt.setMatch(mv);
    let stopped = false;
    void (async () => {
      await nextFrame();
      if (stopped) return;
      await rt.prepare(roster, (share) => !stopped && setPrep({ share, done: false }));
    })()
      .catch((err: unknown) => console.error("La cour ne se prépare pas", err))
      .then(() => {
        if (stopped) return;
        setPrep({ share: 1, done: true });
        rt.start();
      });
    return () => {
      stopped = true;
      listeners.current.onMatch = undefined;
      rt.dispose();
      runtime.current = null;
    };
    // Une seule scène pour toute la partie
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    runtime.current?.setPaused(menu || help);
  }, [menu, help]);

  // La musique qui va avec l'étape
  const ep: EpreuveId | null = m.program[m.round] ?? null;
  useEffect(() => {
    if (!live) return;
    sfx.musicFor(m.phase, ep);
  }, [live, m.phase, ep]);
  useEffect(() => () => sfx.stopMusic(), []);

  const phase = hud?.phase ?? m.phase;
  const finished = room.status === "finished" || m.phase === "over";
  const info = ep ? EPREUVE_INFO[ep] : null;
  const chapter = room.campaign ? CHAPTER_BY_ID.get(room.campaign.chapter) : null;
  const nameOf = (id: string | null | undefined) => (id === mySeat ? "Toi" : (roster.find((c) => c.id === id)?.name ?? "?"));
  const alive = m.cands.filter((c) => c.alive).length;
  const meCand = mySeat ? m.cands.find((c) => c.id === mySeat) : undefined;
  const lastRound = m.history[m.history.length - 1];

  return (
    <div className={`cg-game ${mySeat ? "" : "is-watching"}`}>
      <div ref={host} className="cg-stage" />
      {room.status === "playing" && loadingShown(prep.done, gateClock) && (
        <GameLoading
          title="La Cour des Grands"
          theme={LOADING_THEME}
          share={prep.share}
          done={prep.done}
          gate={room.gate}
          serverOffset={serverOffset}
          players={room.seats.map((s) => ({ id: s.id, name: s.name, avatar: s.avatar, userId: s.userId }))}
          me={mySeat}
        />
      )}
      <FirstSecondsPanel />

      <header className="cg-top">
        <div className="cg-count">
          <strong className="num">{alive}</strong>
          <small>/ {m.cands.length} candidats</small>
        </div>
        {info && phase !== "intro" && phase !== "ff" && !finished && (
          <div className="cg-epname" style={{ "--ep": info.color } as React.CSSProperties}>
            <small>{ep === "polochons" ? "La finale" : `Épreuve ${hud?.index ?? 1} sur ${hud?.rounds ?? 1}`}</small>
            <strong>{info.name}</strong>
          </div>
        )}
        <div className="cg-top-right">
          <SoundButton className="btn btn-sm btn-ghost cg-icon-btn" />
          <button className="btn btn-sm btn-ghost cg-icon-btn" onClick={onOpenChat} aria-label="Discussion">
            <Icon name="chat" size={18} />
            {unread > 0 && <span className="cg-unread">{unread}</span>}
          </button>
          <button className="btn btn-sm btn-ghost cg-icon-btn" onClick={() => setMenu((x) => !x)} aria-label="Menu" aria-expanded={menu}>
            <Icon name="menu" size={18} />
          </button>
        </div>
      </header>

      {/* Les cinématiques */}
      {phase === "intro" && (
        <div className="cg-cine is-intro" key="intro">
          {chapter ? (
            <>
              <small>Campagne</small>
              <strong>{chapter.title}</strong>
              {chapter.story.map((line, k) => (
                <p key={k} style={{ animationDelay: `${0.8 + k * 2.4}s` }}>
                  {line}
                </p>
              ))}
              <p className="cg-rival" style={{ animationDelay: `${0.8 + chapter.story.length * 2.4}s` }}>
                {chapter.rival}
              </p>
            </>
          ) : (
            <>
              <small>Bienvenue sur l'île de Récré</small>
              <strong className="cg-logo">La Cour des Grands</strong>
              <p style={{ animationDelay: "1.5s" }}>
                {m.cands.length} candidats, {m.program.filter((e) => e !== "polochons").length} épreuve{m.program.length > 2 ? "s" : ""}
                {m.program.includes("polochons") ? ", une finale" : ""}… et une seule Cloche d'or.
              </p>
            </>
          )}
        </div>
      )}
      {phase === "reveal" && info && (
        <div
          className="cg-cine is-reveal"
          key={`reveal-${m.round}`}
          style={{ "--ep": info.color, "--ep-dark": info.dark } as React.CSSProperties}
        >
          <small>{ep === "polochons" ? "La finale" : `Épreuve ${hud?.index ?? 1}`}</small>
          <strong>{info.name}</strong>
          <em>{info.tagline}</em>
          <ul>
            {info.rules.map((r, k) => (
              <li key={k} style={{ animationDelay: `${1.2 + k * 1.3}s` }}>
                {r}
              </li>
            ))}
          </ul>
          <p className="cg-controls-hint" style={{ animationDelay: `${1.2 + info.rules.length * 1.3}s` }}>
            {info.controls}
          </p>
        </div>
      )}
      {phase === "results" && lastRound && (
        <div className="cg-cine is-results" key={`results-${m.round}`}>
          <strong>
            {lastRound.out.length === 0
              ? "Personne n'est tombé !"
              : `${lastRound.out.length} candidat${lastRound.out.length > 1 ? "s" : ""} éliminé${lastRound.out.length > 1 ? "s" : ""}`}
          </strong>
          <p>
            Il en reste <b className="num">{alive}</b>
            {lastRound.saved.length ? ` · ${lastRound.saved.length} repêché${lastRound.saved.length > 1 ? "s" : ""}` : ""}
            {lastRound.cut.length ? ` · le jury en a écarté ${lastRound.cut.length}` : ""}
          </p>
          <div className="cg-faces">
            {lastRound.out.slice(0, 18).map((id) => {
              const c = roster.find((r) => r.id === id);
              const cand = m.cands.find((x) => x.id === id);
              return (
                <span
                  key={id}
                  className={`cg-face ${id === mySeat ? "is-me" : ""} ${c?.userId ? "is-human" : ""}`}
                  title={`${c?.name ?? "?"}, ${OUT_WORDS[cand?.outHow ?? ""] ?? ""}`}
                >
                  {c && <Avatar avatar={c.avatar} size={38} />}
                  <small>{nameOf(id)}</small>
                </span>
              );
            })}
          </div>
          {meCand && !meCand.alive && meCand.outRound === m.round && (
            <p className="cg-me-out">Tu es {OUT_WORDS[meCand.outHow ?? ""] ?? "éliminé"} ! Tu regardes la suite depuis les gradins.</p>
          )}
        </div>
      )}
      {phase === "ff" && (
        <div className="cg-cine is-ff" key="ff">
          <small>Plus aucun vrai joueur en lice</small>
          <strong>La suite en accéléré</strong>
          <ul>
            {m.history
              .filter((h) => h.fast)
              .map((h, k) => (
                <li key={k} style={{ animationDelay: `${0.6 + k * 1.1}s` }}>
                  {EPREUVE_INFO[h.ep].name} : {h.count} → {h.count - h.out.length}
                </li>
              ))}
          </ul>
        </div>
      )}
      {(phase === "podium" || finished) && m.winner && !m.cfg.only && (
        <div className="cg-cine is-podium" key="podium">
          <small>La Cloche d'or est à</small>
          <strong>{nameOf(m.winner)} !</strong>
        </div>
      )}

      {!finished && phase !== "play" && phase !== "over" && (
        <button className={`cg-skip ${hud?.skipped ? "is-done" : ""}`} onClick={() => runtime.current?.skip()} disabled={hud?.skipped}>
          {hud?.skipped ? "Les autres regardent encore…" : "Passer ▸▸"}
        </button>
      )}

      {phase === "play" && hud && runtime.current && <Controls hud={hud} rt={runtime.current} roster={roster} serverNow={serverNow} />}
      {phase === "play" && meCand && !meCand.alive && !(ep === "epervier") && (
        <div className="cg-watch">Éliminé : tu regardes la suite</div>
      )}

      {finished && <FinalSheet room={room} send={send} stars={stars} onLeave={onLeave} onShowLobby={onShowLobby} />}

      {menu && (
        <div className="cg-menu panel" role="menu">
          {!bridge && room.status === "playing" && !room.campaign && (
            <button className="menu-item" onClick={() => (onShowLobby(), setMenu(false))}>
              <Icon name="users" size={18} /> Voir le salon et les règles
            </button>
          )}
          <button className="menu-item" onClick={() => (setHelp(true), setMenu(false))}>
            <Icon name="info" size={18} /> Comment jouer
          </button>
          <MenuSound />
          <ReportButton
            look="menu"
            game="cour"
            variant={`La Cour des Grands, ${info?.name ?? ""}`}
            code={room.code}
            role={mySeat ? "player" : "watcher"}
            onOpen={() => setMenu(false)}
          />
          <span className="hint cg-menu-stats">{hud ? `${hud.fps} images/s` : ""}</span>
          <button className="menu-item is-danger" onClick={onLeave}>
            <Icon name="door" size={18} /> {bridge ? "Quitter la tournée" : "Quitter la cour"}
          </button>
        </div>
      )}

      {help && (
        <div className="cg-help-backdrop" onClick={() => setHelp(false)}>
          <div className="panel panel-pad cg-help" onClick={(e) => e.stopPropagation()}>
            <h2>Comment jouer</h2>
            <HowToPlay focus={ep} />
            <button className="btn btn-primary" onClick={() => setHelp(false)}>
              Compris
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FinalSheet({
  room,
  send,
  stars,
  onLeave,
  onShowLobby,
}: {
  room: CourRoomView;
  send: (m: CourClientMessage) => void;
  stars: StarAwardResult | null;
  onLeave: () => void;
  onShowLobby: () => void;
}) {
  const inTour = Boolean(useTourBridge());
  const m = room.match!;
  const roster = room.roster ?? [];
  const me = room.you.seatId;
  const ranks = m.ranks ?? {};
  const asked = room.rematch.includes(room.you.userId);
  const seated = me !== null;
  const campaign = room.campaign;
  const chapter = campaign ? CHAPTER_BY_ID.get(campaign.chapter) : null;
  const order = useMemo(() => [...m.cands].sort((a, b) => (ranks[a.id] ?? 99) - (ranks[b.id] ?? 99)), [m.cands, ranks]);
  const shown = order.filter((c, k) => k < 8 || c.id === me || roster.find((r) => r.id === c.id)?.userId);
  const winner = roster.find((r) => r.id === m.winner);
  // Sans finale (une épreuve seule, un chapitre de campagne), pas de Cloche d'or ni de finalistes : le meilleur score et
  // ceux qui ont passé l'épreuve
  const hasFinal = m.program.includes("polochons");
  const title = campaign
    ? (campaign.score ?? 0) > 0
      ? "Épreuve réussie !"
      : "Éliminé…"
    : m.winner === me
      ? hasFinal
        ? "Tu remportes la Cloche d'or !"
        : "Tu fais le meilleur score !"
      : winner
        ? hasFinal
          ? `${winner.name} remporte la Cloche d'or`
          : `Meilleur score : ${winner.name}`
        : "Fin du grand jeu";
  const roundName = (k: number) => (k >= 0 && m.program[k] ? EPREUVE_INFO[m.program[k]!].name : "");
  return (
    <div className="cg-final">
      <div className="cg-final-card panel">
        <h1>{title}</h1>
        {chapter && (
          <>
            <p className="hint" style={{ margin: 0 }}>
              {chapter.title} · score <b className="num">{campaign?.score ?? 0}</b> / 100
            </p>
            {(campaign?.score ?? 0) > 0 && <p className="cg-final-win">{chapter.win}</p>}
            {stars && <StarResult result={stars} />}
          </>
        )}
        {!campaign && <EloLine result={room.results?.[room.you.userId]} />}
        <ol className="cg-ranking">
          {shown.map((c) => {
            const info = roster.find((r) => r.id === c.id);
            return (
              <li key={c.id} className={`${c.id === m.winner ? "is-first" : ""} ${c.id === me ? "is-me" : ""}`}>
                <span className="cg-rank num">{ranks[c.id] ?? "–"}</span>
                {info && <Avatar avatar={info.avatar} size={30} />}
                <span className="cg-rank-name">
                  <strong>{c.id === me ? "Toi" : (info?.name ?? "?")}</strong>
                  <small>
                    {c.id === m.winner
                      ? hasFinal
                        ? "La Cloche d'or"
                        : "meilleur score"
                      : c.alive
                        ? hasFinal
                          ? "finaliste"
                          : "épreuve passée"
                        : `${OUT_WORDS[c.outHow ?? ""] ?? "éliminé"} · ${roundName(c.outRound)}`}
                  </small>
                </span>
              </li>
            );
          })}
        </ol>
        {!campaign && <EveningLine game="cour" />}
        {inTour ? (
          <TourNextNote />
        ) : (
          !seated && (
            <p className="hint" style={{ margin: 0 }}>
              Tu regardes ce grand jeu : reste pour jouer le suivant.
            </p>
          )
        )}
        <div className="cg-final-actions">
          {campaign ? (
            <a className="btn btn-primary" href="/cour/campagne">
              Retour à la campagne
            </a>
          ) : (
            !inTour &&
            seated && (
              <button className="btn btn-primary" disabled={asked} onClick={() => send({ t: "rematch" })}>
                {asked ? "En attente des autres" : "Revanche"}
              </button>
            )
          )}
          {!inTour && !campaign && (
            <button className="btn" onClick={onShowLobby}>
              {room.you.isHost ? "Changer les règles" : "Voir le salon"}
            </button>
          )}
          <button className="btn btn-ghost" onClick={onLeave}>
            {inTour ? "Quitter la tournée" : "Quitter"}
          </button>
        </div>
      </div>
    </div>
  );
}
