// Le lancer d'essai, pendant l'attente au salon : sa propre piste, dans la salle et avec les règles de la table, sans
// chrono ni score qui compte. Tout se joue sur l'appareil (la même partie que celle du serveur, jouée ici). La partie
// lancée par l'hôte ferme l'essai (le salon disparaît, et lui avec).

import { useEffect, useRef, useState } from "react";
import type { AvatarConfig } from "../../shared/avatar.ts";
import {
  AIM_MS,
  createMatch,
  DEFAULT_CONFIG,
  mergeConfig,
  tickMatch,
  throwBall,
  totalOf,
  type BowlingConfig,
  type Match,
} from "../../shared/games/bowling/match.ts";
import type { BowlingLook } from "../../shared/games/bowling/looks.ts";
import { SALLES } from "../../shared/games/bowling/salles.ts";
import { Icon } from "../components/Icon.tsx";
import { Coach, coachDone, coachShowing } from "../lib/coach.tsx";
import { verdict, type Banner } from "./BowlingGame.tsx";
import { BOWLING_COACH, bowlingHaptics } from "./coach.ts";
import { kmh, slantName, spinName } from "./gesture.ts";
import { BallSwatch } from "./LookPicker.tsx";
import { BowlingRuntime, type HudState } from "./runtime.ts";
import { strikeBurst } from "./strikeFx.ts";
import * as sfx from "./sfx.ts";

const ME = "moi";

/** Une partie d'essai : dix frames, sans présentation de la salle ni chrono */
function practiceMatch(cfg: BowlingConfig, now: number): Match {
  const m = createMatch(cfg, [{ id: ME, team: 0 }], (now % 100_000) + 1, now);
  m.deadline = now;
  tickMatch(m, now);
  return m;
}

export function Practice({
  rules,
  name,
  avatar,
  look,
  onClose,
}: {
  /** Les règles de la table (la salle, les barrières, la boule géante…) */
  rules: BowlingConfig;
  name: string;
  avatar: AvatarConfig;
  look: BowlingLook;
  onClose: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const match = useRef<Match | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [ready, setReady] = useState(false);
  const [readout, setReadout] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [view, setView] = useState({ frame: 0, ball: 0, total: 0, down: 0, throws: 0, phase: "aim" as Match["phase"] });
  const bannerKey = useRef(0);
  const run = useRef(0);
  // Ce qui distingue cet essai d'un autre, pour que la main du coach compte ses tours une fois chacun
  const [nonce] = useState(() => Date.now().toString(36));
  const cfg = mergeConfig(DEFAULT_CONFIG, {
    salle: rules.salle,
    bumpers: rules.bumpers,
    geante: rules.geante,
    glisse: rules.glisse,
    lune: rules.lune,
    mode: "classique",
    frames: 10,
    pace: "long",
    pronostics: false,
  });
  const cfgRef = useRef(cfg);

  useEffect(() => {
    if (!host.current) return;
    let m = practiceMatch(cfgRef.current, Date.now());
    match.current = m;
    const show = () => {
      rt.setView(structuredClone(m));
      const p = m.players[0]!;
      const down = (p.rolls[m.frame] ?? []).reduce((a, b) => a + b, 0);
      setView({ frame: m.frame, ball: m.ball, total: totalOf(m, p), down, throws: m.throws, phase: m.phase });
    };
    const rt = new BowlingRuntime(host.current, {
      me: ME,
      serverNow: () => Date.now(),
      onThrow: (n, t) => {
        if (n !== m.throws) return;
        const r = throwBall(m, ME, t, Date.now());
        if (typeof r !== "string") show();
      },
      onPose: () => {},
      onHud: setHud,
      onPhys: (e, vol) => sfx.phys(e, vol),
      onRoll: (sp, vol, g) => sfx.roll(sp, vol, g),
      onMoment: (mo) => {
        sfx.moment(mo);
        bowlingHaptics(mo, ME);
        if (mo.k === "result") {
          const strike = mo.rec.down.length === 10 && mo.rec.rack.length === 10;
          run.current = strike ? run.current + 1 : 0;
          const b = verdict(mo.rec, run.current, true, name);
          if (b) setBanner({ ...b, key: ++bannerKey.current });
          if (strike) strikeBurst(look.fx, true);
        }
      },
      onGesture: (g) => {
        if (typeof g === "string")
          setReadout(g === "back" ? "Recule d'abord : ton bras part en arrière." : "Pousse plus vite vers l'avant, et lâche aussitôt !");
        else {
          setReadout([`${kmh(g.v)} km/h`, spinName(g.s), slantName(g.dev)].filter(Boolean).join(" · "));
          coachDone("bowling");
        }
      },
    });
    rt.setPlayers([{ id: ME, name, avatar, look }]);
    show();
    let stopped = false;
    void rt
      .prepare()
      .catch((err: unknown) => console.error("Piste d'essai impossible à préparer", err))
      .then(() => !stopped && setReady(true));
    // Le temps passe : le lancer montré, la frame suivante ; pas de chrono pour lancer ; la partie finie, une autre
    const id = setInterval(() => {
      const now = Date.now();
      let changed = tickMatch(m, now);
      if (m.phase === "aim" && now >= m.deadline - 5000) m.deadline = now + AIM_MS.long;
      if (m.phase === "over") {
        m = practiceMatch(cfgRef.current, now);
        match.current = m;
        run.current = 0;
        changed = true;
      }
      if (changed) show();
    }, 100);
    return () => {
      stopped = true;
      clearInterval(id);
      rt.dispose();
      sfx.stopRoll();
    };
    // Une seule piste pour tout l'essai
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Échap ferme l'essai
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Le lancer suivant : l'ancienne mesure s'efface
  useEffect(() => {
    if (view.phase === "aim") setReadout(null);
  }, [view.throws, view.phase]);

  const canThrow = ready && view.phase === "aim" && Boolean(hud?.canThrow) && !hud?.swinging;
  const coaching = coachShowing("bowling", canThrow);
  const salle = match.current ? SALLES[match.current.salle].name : "";

  return (
    <div className="bw-game bw-practice" role="dialog" aria-modal="true" aria-label="Lancer d'essai">
      <div ref={host} className="bw-stage" />

      <header className="bw-top">
        <div className="bw-frame-card">
          <span className="bw-frame-num num">{view.frame + 1}</span>
          <span className="bw-frame-text">
            <strong>Lancer d'essai</strong>
            <small>
              {[
                `Frame ${view.frame + 1}`,
                `boule ${view.ball + 1}`,
                view.ball > 0 && view.down < 10 ? `${view.down} à terre` : null,
                view.frame > 0 ? `score ${view.total}` : null,
                salle,
              ]
                .filter(Boolean)
                .join(" · ")}
            </small>
          </span>
        </div>
        <div className="bw-top-right">
          <button className="btn btn-sm bw-practice-close" onClick={onClose} aria-label="Retour au salon">
            <Icon name="back" size={18} />
            <span>Retour au salon</span>
          </button>
        </div>
      </header>

      {!ready && <p className="bw-practice-wait">La piste se prépare…</p>}

      <Coach
        id="bowling"
        active={canThrow}
        steps={BOWLING_COACH}
        turn={`essai:${nonce}:${view.throws}`}
        bubble={{ bottom: "calc(14px + var(--safe-bottom, 0px))" }}
      />
      {canThrow && (
        <>
          <div className="bw-grip" aria-hidden="true">
            <span className="bw-grip-ring" />
            <BallSwatch look={look} size={70} />
          </div>
          {!coaching && (
            <p className="bw-tip">
              {readout ??
                (view.throws === 0
                  ? "Appuie sur la boule, recule, pousse vers l'avant et lâche · glisse en bas pour te placer, en haut pour viser"
                  : "Rien ne compte ici : relance autant que tu veux")}
            </p>
          )}
        </>
      )}
      {ready && hud?.swinging && (
        <div className="bw-swing" aria-hidden="true">
          <span style={{ transform: `rotate(${Math.round((hud.arm / 2.2) * 90)}deg)` }} />
        </div>
      )}
      {view.phase === "roll" && readout && <p className="bw-tip is-readout">{readout}</p>}

      {banner && (
        <div key={banner.key} className={`bw-banner is-${banner.tone}`} onAnimationEnd={() => setBanner(null)}>
          <strong>{banner.text}</strong>
          {banner.sub && <small>{banner.sub}</small>}
        </div>
      )}
    </div>
  );
}
