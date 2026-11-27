// Les commandes de chaque épreuve, par-dessus la scène : le bouton qu'on garde appuyé pour courir, les boîtes du Sablé,
// le « hisse ! » de la corde, les numéros et les deux nénuphars, « Assis ! », la manette de l'épervier, les quatre gestes
// des polochons. Elles lisent ce que l'épreuve affiche (l'état « hud » de la scène) et appellent la scène, qui envoie.

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from "react";
import { EPREUVE_INFO } from "../../shared/games/cour/epreuves.ts";
import type { Candidate } from "../../shared/games/cour/net.ts";
import type { CourRuntime, HudState } from "./runtime.ts";
import type { BiscuitStage } from "./scene/stages/biscuit.ts";
import { BOX_COLORS, BOX_SYMBOLS } from "./scene/stages/biscuit.ts";
import type { ChaisesStage } from "./scene/stages/chaises.ts";
import type { CordeStage } from "./scene/stages/corde.ts";
import { TEAM_COLORS, TEAM_NAMES } from "./scene/stages/corde.ts";
import type { EpervierStage } from "./scene/stages/epervier.ts";
import type { NenupharsStage } from "./scene/stages/nenuphars.ts";
import type { PolochonsStage } from "./scene/stages/polochons.ts";
import type { SoleilStage } from "./scene/stages/soleil.ts";

type H = Record<string, unknown>;
const num = (v: unknown, d = 0) => (typeof v === "number" ? v : d);

export function Controls({ hud, rt, roster, serverNow }: { hud: HudState; rt: CourRuntime; roster: Candidate[]; serverNow: () => number }) {
  const s = (hud.stage ?? {}) as H;
  const nameOf = (id: unknown) => roster.find((c) => c.id === id)?.name ?? "?";
  const stage = rt.currentStage;
  if (!hud.me || !stage) return null;
  // Éliminé : on regarde (sauf à l'épervier, où l'on revient en épervier)
  if (!hud.me.alive && !(hud.ep === "epervier" && s.role === "h")) return null;
  switch (hud.ep) {
    case "soleil":
      return <SoleilControls s={s} stage={stage as SoleilStage} />;
    case "biscuit":
      return <BiscuitControls s={s} stage={stage as BiscuitStage} />;
    case "corde":
      return <CordeControls s={s} stage={stage as CordeStage} serverNow={serverNow} />;
    case "nenuphars":
      return <NenupharsControls s={s} stage={stage as NenupharsStage} nameOf={nameOf} />;
    case "chaises":
      return <ChaisesControls s={s} stage={stage as ChaisesStage} />;
    case "billes":
      return <BillesControls s={s} nameOf={nameOf} />;
    case "marelle":
      return <MarelleControls s={s} />;
    case "epervier":
      return <EpervierControls s={s} stage={stage as EpervierStage} />;
    case "polochons":
      return <PolochonsControls s={s} stage={stage as PolochonsStage} />;
    default:
      return null;
  }
}

/** Un gros bouton qu'on garde appuyé (au doigt comme à la souris) */
function HoldButton({
  label,
  sub,
  on,
  onChange,
  className = "",
}: {
  label: string;
  sub?: string;
  on: boolean;
  onChange: (v: boolean) => void;
  className?: string;
}) {
  const down = (e: RPointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    onChange(true);
  };
  return (
    <button
      className={`cg-big ${on ? "is-on" : ""} ${className}`}
      onPointerDown={down}
      onPointerUp={() => onChange(false)}
      onPointerCancel={() => onChange(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <strong>{label}</strong>
      {sub && <small>{sub}</small>}
    </button>
  );
}

function SoleilControls({ s, stage }: { s: H; stage: SoleilStage }) {
  const watching = Boolean(s.watching);
  const head = String(s.head ?? "");
  const st = num(s.st);
  if (st === 1) return <div className="cg-status is-good">Arrivé ! Regarde les autres…</div>;
  const others = (s.others as number[] | undefined) ?? [];
  return (
    <>
      <div className={`cg-status ${watching ? "is-danger" : head === "dos" ? "is-go" : ""}`}>
        {watching
          ? "Il regarde ! Plus un geste…"
          : head === "dos"
            ? "Il chante… cours !"
            : head === "tourne"
              ? "Il se retourne !"
              : "Prêts…"}
      </div>
      <div className="cg-track" aria-hidden>
        {others.map((d, k) => (d < 0 ? null : <i key={k} style={{ left: `${d * 100}%` }} />))}
        <b style={{ left: `${num(s.dist) * 100}%` }} />
        <em>Arrivée</em>
      </div>
      <HoldButton
        label="Courir"
        sub="garde le doigt appuyé"
        on={Boolean(s.running)}
        onChange={(v) => stage.setRun(v)}
        className={watching ? "is-danger" : ""}
      />
    </>
  );
}

function BiscuitControls({ s, stage }: { s: H; stage: BiscuitStage }) {
  const st = String(s.stage);
  if (st === "choix") {
    const box = num(s.box, -1);
    return (
      <div className="cg-boxes">
        <p className="cg-status">Choisis ta boîte ({num(s.left)} s)</p>
        <div className="cg-box-row">
          {BOX_COLORS.map((c, k) => (
            <button
              key={k}
              className={`cg-box ${box === k ? "is-on" : ""}`}
              style={{ "--box": c } as CSSProperties}
              onClick={() => stage.choose(k)}
            >
              <span>{BOX_SYMBOLS[k]}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (st === "revele") return <div className="cg-status is-go">Dans ta boîte : {String(s.shapeName ?? "…")} !</div>;
  const me = num(s.st);
  if (me === 1) return <div className="cg-status is-good">Forme détachée ! Tu es sauf.</div>;
  if (me === 2) return null;
  const crack = num(s.crack);
  return (
    <div className="cg-carve">
      <div className="cg-meter">
        <span>Découpé</span>
        <i style={{ width: `${num(s.prog) * 100}%` }} />
      </div>
      <div className={`cg-meter is-crack ${crack > 0.6 ? "is-danger" : ""}`}>
        <span>Fêlure</span>
        <i style={{ width: `${crack * 100}%` }} />
      </div>
      <p className="cg-hint">
        Suis le trait de {String(s.shapeName ?? "la forme")}, tout doux · {num(s.left)} s
      </p>
    </div>
  );
}

function CordeControls({ s, stage, serverNow }: { s: H; stage: CordeStage; serverNow: () => number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      tick((n) => n + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const playing = Boolean(s.playing);
  const myTeam = num(s.myTeam, -1);
  const rope = num(s.rope);
  const side = num(s.side);
  const beat0 = num(s.beat0);
  const ms = num(s.beatMs, 860);
  const now = serverNow();
  const phase = ((((now - beat0) % ms) + ms) % ms) / ms;
  const near = Math.min(phase, 1 - phase);
  const started = now >= beat0;
  const lead = side === 0 ? 0 : -rope * side;
  return (
    <>
      <div className="cg-status" style={{ "--team": TEAM_COLORS[myTeam] ?? "#fff" } as CSSProperties}>
        {String(s.stage) === "equipes"
          ? `Tu es chez ${TEAM_NAMES[myTeam] ?? "?"}`
          : playing
            ? started
              ? near < 0.12
                ? "HISSE !"
                : "Ho…"
              : "À vos cordes…"
            : `Rencontre ${num(s.cur) + 1} sur ${num(s.count)}`}
      </div>
      <div className="cg-rope" aria-hidden>
        <b style={{ left: `${50 + lead * 50}%` }} />
      </div>
      {playing && (
        <button
          className={`cg-big cg-beat ${near < 0.12 && started ? "is-on" : ""}`}
          onPointerDown={() => stage.tap()}
          style={{ "--beat": `${1 - near * 2}` } as CSSProperties}
        >
          <strong>Hisse !</strong>
          <small>touche pile sur le temps</small>
        </button>
      )}
    </>
  );
}

function NenupharsControls({ s, stage, nameOf }: { s: H; stage: NenupharsStage; nameOf: (id: unknown) => string }) {
  const st = String(s.stage);
  if (st === "numeros") {
    const order = (s.order as number[]) ?? [];
    const ids = (s.ids as string[]) ?? [];
    const mine = s.myOrder as number | null;
    return (
      <div className="cg-numbers">
        <p className="cg-status">{mine ? `Tu passeras en n° ${mine}` : `Choisis ton numéro de passage (${num(s.left)} s)`}</p>
        <div className="cg-number-grid">
          {ids.map((_, k) => {
            const n = k + 1;
            const who = order.indexOf(n);
            return (
              <button
                key={n}
                className={`cg-num ${mine === n ? "is-on" : ""}`}
                disabled={who >= 0 || Boolean(mine)}
                onClick={() => stage.pick(n)}
                title={who >= 0 ? nameOf(ids[who]) : undefined}
              >
                {n}
              </button>
            );
          })}
        </div>
      </div>
    );
  }
  if (num(s.st) === 1) return <div className="cg-status is-good">De l'autre côté, les pieds au sec !</div>;
  if (s.myTurn)
    return (
      <>
        <div className="cg-status is-go">À toi de sauter ! {s.decide !== null ? `${num(s.decide)} s` : ""}</div>
        <div className="cg-pads">
          <button className="cg-big" onClick={() => stage.jump(0)}>
            <strong>← Gauche</strong>
          </button>
          <button className="cg-big" onClick={() => stage.jump(1)}>
            <strong>Droite →</strong>
          </button>
        </div>
      </>
    );
  return (
    <div className="cg-status">
      {s.leader ? `${nameOf(s.leader)} devine…` : "Au suivant…"} {num(s.ahead) > 0 ? `· encore ${num(s.ahead)} avant toi` : ""}
    </div>
  );
}

function ChaisesControls({ s, stage }: { s: H; stage: ChaisesStage }) {
  if (!s.inRound) return null;
  if (s.sat) return <div className="cg-status is-good">Assis ! Ouf.</div>;
  const music = Boolean(s.music);
  return (
    <>
      <div className={`cg-status ${music ? "" : "is-danger"}`}>
        {music ? `La musique joue… ${num(s.chairs)} chaises pour ${num(s.players)}` : "STOP ! Assieds-toi !"}
      </div>
      <button className={`cg-big ${music ? "" : "is-on is-danger"}`} onPointerDown={() => stage.sit()}>
        <strong>Assis !</strong>
        <small>{s.faux ? "faux départ : tu repartiras en retard" : "dès que la musique s'arrête"}</small>
      </button>
    </>
  );
}

function BillesControls({ s, nameOf }: { s: H; nameOf: (id: unknown) => string }) {
  if (s.exempt) return <div className="cg-status is-good">Exempté : tu passes sans jouer !</div>;
  const wins = s.wins as [number, number] | null;
  return (
    <>
      <div className={`cg-status ${s.myTurn ? "is-go" : ""}`}>
        {s.myTurn ? "À toi : tire vers toi depuis ta bille, puis lâche" : `Contre ${nameOf(s.opp)}…`}
        {wins ? ` · manches ${wins[0]} – ${wins[1]}` : ""}
      </div>
      {s.power !== null && (
        <div className="cg-meter is-power">
          <span>Force</span>
          <i style={{ width: `${num(s.power) * 100}%` }} />
        </div>
      )}
    </>
  );
}

function MarelleControls({ s }: { s: H }) {
  const st = String(s.stage);
  const len = num(s.len);
  const prog = num(s.prog);
  if (num(s.st) === 1 && st === "saute") return <div className="cg-status is-good">Au Ciel ! Manche réussie.</div>;
  return (
    <>
      <div className={`cg-status ${st === "saute" ? "is-go" : ""}`}>
        {st === "montre"
          ? `Retiens l'ordre : ${len} cases`
          : st === "saute"
            ? `À toi : saute les cases dans l'ordre (${num(s.left)} s)`
            : `Manche ${num(s.round)}`}
      </div>
      {st === "saute" && (
        <div className="cg-dots" aria-hidden>
          {Array.from({ length: len }, (_, k) => (
            <i key={k} className={k < prog ? "is-on" : ""} />
          ))}
        </div>
      )}
    </>
  );
}

function EpervierControls({ s, stage }: { s: H; stage: EpervierStage }) {
  const pad = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState<[number, number]>([0, 0]);
  const drag = useRef<number | null>(null);
  const move = (e: RPointerEvent) => {
    if (drag.current !== e.pointerId || !pad.current) return;
    const r = pad.current.getBoundingClientRect();
    const R = r.width / 2;
    let x = (e.clientX - (r.left + R)) / R;
    let y = (e.clientY - (r.top + R)) / R;
    const l = Math.hypot(x, y);
    if (l > 1) {
      x /= l;
      y /= l;
    }
    setKnob([x, y]);
    stage.move(x, -y);
  };
  const end = () => {
    drag.current = null;
    setKnob([0, 0]);
    stage.move(0, 0);
  };
  if (s.caught) return <div className="cg-status is-danger">Attrapé ! Tu deviendras épervier à la prochaine traversée.</div>;
  const hawk = s.role === "h";
  return (
    <>
      <div className={`cg-status ${String(s.stage) === "course" ? "is-go" : ""}`}>
        {hawk
          ? "Tu es épervier : attrape-les !"
          : String(s.stage) === "course"
            ? `Traverse ! ${num(s.left)} s`
            : `Traversée ${num(s.crossing) + 1}, attends le sifflet…`}
      </div>
      <div
        ref={pad}
        className="cg-stick"
        onPointerDown={(e) => {
          drag.current = e.pointerId;
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          move(e);
        }}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <b style={{ transform: `translate(${knob[0] * 50}%, ${knob[1] * 50}%)` }} />
      </div>
      <button
        className={`cg-dash ${num(s.dashIn) > 0 ? "is-wait" : ""}`}
        onPointerDown={() => stage.dash()}
        style={{ "--ready": `${1 - num(s.dashIn) / num(s.dashMax, 1)}` } as CSSProperties}
      >
        {hawk ? "Plonger" : "Bond"}
      </button>
    </>
  );
}

function PolochonsControls({ s, stage }: { s: H; stage: PolochonsStage }) {
  const me = s.me as { bal: number; stam: number } | null;
  const them = s.them as { bal: number; stam: number } | null;
  const incoming = s.incoming as { side: "h" | "b"; left: number } | null;
  return (
    <>
      <div className="cg-bars">
        <div className="cg-meter">
          <span>Toi</span>
          <i style={{ width: `${me?.bal ?? 0}%` }} />
        </div>
        <div className="cg-meter is-them">
          <span>Adversaire</span>
          <i style={{ width: `${them?.bal ?? 0}%` }} />
        </div>
      </div>
      {incoming && <div className="cg-status is-danger">Coup {incoming.side === "h" ? "en haut" : "en bas"} ! Pare !</div>}
      {s.playing ? (
        <div className="cg-pillow">
          <button className="cg-act is-hit" onPointerDown={() => stage.act("hh")}>
            Frapper haut
          </button>
          <button className="cg-act is-hit" onPointerDown={() => stage.act("hb")}>
            Frapper bas
          </button>
          <button className="cg-act" onPointerDown={() => stage.act("ph")}>
            Parer haut
          </button>
          <button className="cg-act" onPointerDown={() => stage.act("pb")}>
            Parer bas
          </button>
        </div>
      ) : null}
    </>
  );
}

/** La règle de l'épreuve en une ligne (sous les commandes, pendant le jeu) */
export const controlsHint = (ep: string | null) => (ep ? (EPREUVE_INFO[ep as keyof typeof EPREUVE_INFO]?.controls ?? "") : "");
