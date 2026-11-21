import { Fragment, useEffect, useRef, useState } from "react";
import { DEFAULT_SETTINGS, type BotLevel, type BricksSettings, type BricksWin } from "../../shared/games/bricks/engine.ts";
import { BRICKS_MAX_PLAYERS, type BricksClientMessage, type BricksRoomView } from "../../shared/protocol.ts";
import { applyDrawnRules } from "../../shared/randomRules.ts";
import { drawLock, RandomRulesField, tableDraw } from "../game/RandomRules.tsx";
import { Icon } from "../components/Icon.tsx";
import { Check, Options } from "../components/ui.tsx";
import { TableLobby, TableSize } from "../game/TableLobby.tsx";
import { crewsOf, TeamsPanel } from "../game/TeamsPanel.tsx";
import { ACTION_LABELS, useControls } from "./controls.ts";
import { sprite } from "./draw.ts";
import { KeysModal, useKeyLabel } from "./KeysModal.tsx";
import type { InputAction } from "./local.ts";

export const BRICK_TEAMS = ["Rubis", "Saphir"] as const;

const BOT_HINTS: Record<BotLevel, string> = {
  apprenti: "Pose lentement, laisse des trous et n'attaque presque jamais.",
  confirme: "Un rythme tranquille et quelques erreurs : un bon adversaire pour s'entraîner.",
  expert: "Rapide et précis : garde un puits pour les quatre lignes et tente les T-spins.",
};

/** Comment on gagne une bataille, sous le choix de la victoire et dans « Comment jouer » */
const WIN_HINTS: Record<BricksWin, string> = {
  ko: "Une pile qui déborde repart de zéro et compte un K.O. pour celui qui l'a fait tomber. À la fin du chrono, le plus de K.O. gagne.",
  survival: "Une seule vie. Après 3 minutes, la marée monte : une ligne grise toutes les 5 secondes pour tout le monde.",
};

/** Ce que chaque coup envoie, d'après la table du moteur (attackOf) */
const ATTACKS: { move: string; detail?: string; sent: string; picture?: boolean }[] = [
  { move: "1 ligne", sent: "rien" },
  { move: "2 lignes", sent: "1" },
  { move: "3 lignes", sent: "2" },
  { move: "4 lignes d'un coup", sent: "4" },
  { move: "T-spin", detail: "le T tourné au dernier moment pour se glisser sous un rebord", sent: "2 par ligne", picture: true },
  { move: "Plateau vidé", detail: "ta ligne ne laisse plus une seule brique", sent: "10 en plus" },
];

// Le dessin du T-spin : une pile avec un rebord, et le T glissé dessous qui complète deux lignes
const TSPIN_STACK = ["......", "SS....", "S...SS", "SS.SSS"];
const TSPIN_T: [number, number][] = [
  [1, 2],
  [2, 2],
  [3, 2],
  [2, 3],
];
const TSPIN_CELL = 16;

function TSpinPicture() {
  const ref = useRef<HTMLCanvasElement>(null);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = 6 * TSPIN_CELL;
  const h = TSPIN_STACK.length * TSPIN_CELL;
  useEffect(() => {
    const g = ref.current?.getContext("2d");
    if (!g) return;
    const c = TSPIN_CELL;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    TSPIN_STACK.forEach((row, y) => [...row].forEach((v, x) => v === "S" && g.drawImage(sprite(8, c, dpr), x * c, y * c, c, c)));
    for (const [x, y] of TSPIN_T) g.drawImage(sprite(3, c, dpr), x * c, y * c, c, c);
    // Le geste : le T arrive par le haut et tourne pour passer sous le rebord
    g.strokeStyle = "#f1d595";
    g.fillStyle = "#f1d595";
    g.lineWidth = 1.5;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(4.7 * c, 0.3 * c);
    g.quadraticCurveTo(2.6 * c, 0.2 * c, 2.5 * c, 1.45 * c);
    g.stroke();
    g.beginPath();
    g.moveTo(2.5 * c, 1.9 * c);
    g.lineTo(2.12 * c, 1.3 * c);
    g.lineTo(2.88 * c, 1.3 * c);
    g.closePath();
    g.fill();
  }, [dpr, w, h]);
  return <canvas ref={ref} className="tspin-picture" width={w * dpr} height={h * dpr} style={{ width: w, height: h }} aria-hidden="true" />;
}

/** Le mémo des attaques, dans « Comment jouer » : comment on attaque, et comment on se défend */
function AttackMemo() {
  return (
    <>
      <h3>
        Les attaques <span className="hint">lignes grises envoyées</span>
      </h3>
      <ul className="attack-list" aria-label="Ce que tes lignes envoient">
        {ATTACKS.map((a) => (
          <li key={a.move}>
            {a.picture && <TSpinPicture />}
            <span className="attack-move">
              {a.move}
              {a.detail && <span className="hint attack-detail">{a.detail}</span>}
            </span>
            <strong className={a.sent === "rien" ? "is-none" : undefined}>{a.sent}</strong>
          </li>
        ))}
      </ul>
      <p className="hint">
        Pour te défendre : tes lignes annulent d'abord celles qui t'arrivent (la barre rouge à côté de ton plateau), le reste part chez
        l'adversaire. Les lignes grises montent quand tu poses une pièce sans faire de ligne.
      </p>
    </>
  );
}

/** Comment jouer à Briques : le but de la partie choisie, les touches de cet appareil (réglables) et les attaques */
function BricksHelp({ s }: { s: BricksSettings }) {
  const keys = useControls((c) => c.keys);
  const label = useKeyLabel();
  const [keysOpen, setKeysOpen] = useState(false);
  // Sans réserve à cette table, sa touche ne sert à rien
  const actions = (Object.keys(ACTION_LABELS) as InputAction[]).filter((a) => s.hold || a !== "hold");
  return (
    <div className="lobby-help">
      <h2>Comment jouer</h2>
      <p>
        <strong>Le but :</strong>{" "}
        {s.sprint
          ? "faire 40 lignes le plus vite possible, seul contre la montre. Ton record va au classement."
          : "faire déborder la pile des autres en leur envoyant des lignes grises."}
      </p>
      <ul>
        <li>Déplace et tourne les pièces qui tombent pour remplir des lignes d'un bord à l'autre : une ligne pleine disparaît.</li>
        {!s.sprint && <li>{WIN_HINTS[s.win]}</li>}
        {s.hold && <li>La réserve met la pièce de côté pour plus tard, une fois par pièce.</li>}
      </ul>

      <h3>Les commandes</h3>
      {/* Au clavier : les touches réglées sur cet appareil ; au doigt (la liste se cache), les gestes */}
      <ul className="bricks-keys">
        {actions.map((a) => (
          <li key={a}>
            <span>{ACTION_LABELS[a]}</span>
            <span>
              {keys[a].length > 0
                ? keys[a].map((k, i) => (
                    <Fragment key={k}>
                      {i > 0 && " ou "}
                      <kbd>{label(k)}</kbd>
                    </Fragment>
                  ))
                : "aucune"}
            </span>
          </li>
        ))}
      </ul>
      <p className="bricks-touch">
        Au doigt : glisse sur le plateau pour déplacer la pièce, touche-le pour la tourner, glisse doucement vers le bas pour la faire
        descendre et balaie vers le bas pour la lâcher{s.hold ? ", vers le haut pour la réserve" : ""}. Sur téléphone, des boutons à l'écran
        font aussi tout ça.
      </p>
      <div>
        <button type="button" className="btn btn-sm" onClick={() => setKeysOpen(true)}>
          <Icon name="settings" size={16} /> Touches et réglages
        </button>
      </div>
      <KeysModal open={keysOpen} onClose={() => setKeysOpen(false)} />

      {!s.sprint && <AttackMemo />}
    </div>
  );
}

interface Props {
  room: BricksRoomView;
  send: (msg: BricksClientMessage) => void;
  unread: number;
  onOpenChat: () => void;
  onLeave: () => void;
  onBackToGame?: () => void;
}

type Toggle = "hold" | "speedUp" | "messy" | "teams";

/** Le salon d'une table de Briques : le salon commun, et les règles de la partie. */
export function BricksLobby({ room, send, ...rest }: Props) {
  // Règles au hasard : ce que le tirage décide s'affiche tel qu'il sera joué, et ne se règle plus à la main
  const s = applyDrawnRules("bricks", room.settings.bricks, DEFAULT_SETTINGS, tableDraw(room));
  const locked = drawLock(room, "bricks");
  const isHost = room.you.isHost;
  const update = (patch: Partial<BricksSettings>) => send({ t: "settings", settings: patch });
  const teamsReady = !s.sprint && s.teams && room.settings.maxPlayers === 4;
  const crews = crewsOf(room.seats);
  const balanced = crews[0]!.length === 2 && crews[1]!.length === 2;
  const canStart = s.sprint ? room.seats.length === 1 : room.seats.length >= 2 && (!teamsReady || balanced);

  const toggles: { key: Toggle; label: string; desc: string; disabled?: boolean }[] = [
    { key: "hold", label: "Réserve", desc: "On peut mettre une pièce de côté, une fois par pièce." },
    { key: "speedUp", label: "Accélération", desc: "Les pièces tombent de plus en plus vite au fil de la manche." },
    { key: "messy", label: "Lignes grises en vrac", desc: "Chaque ligne reçue a son propre trou : plus dur à déblayer." },
    {
      key: "teams",
      label: "Équipes 2 contre 2",
      desc:
        room.settings.maxPlayers === 4
          ? `${BRICK_TEAMS[0]} contre ${BRICK_TEAMS[1]} : on partage ses victoires.`
          : "Possible à 4 joueurs exactement.",
      disabled: room.settings.maxPlayers !== 4,
    },
  ];
  // Les équipes changent la partie et restent en vue ; réserve, accélération et lignes en vrac vont avec les réglages fins
  const toggleList = (keys: Toggle[]) => (
    <div className="rule-list">
      {toggles
        .filter((r) => keys.includes(r.key) && !(s.sprint && (r.key === "messy" || r.key === "teams")))
        .map((r) => {
          const off = !isHost || r.disabled || locked(r.key);
          return (
            <div
              key={r.key}
              className={`rule-row ${r.disabled || locked(r.key) ? "is-forced" : ""}`}
              onClick={() => !off && update({ [r.key]: !s[r.key] })}
            >
              <Check label={r.label} checked={s[r.key] && !r.disabled} disabled={off} onChange={() => {}} />
              <span>
                <strong>{r.label}</strong>
                <span className="hint">{r.desc}</span>
              </span>
            </div>
          );
        })}
    </div>
  );

  const holdLabel = s.hold ? "avec réserve" : "sans réserve";
  const summary = (
    s.sprint
      ? ["Solo 40 lignes", holdLabel, s.previews > 1 ? `${s.previews} pièces suivantes` : "1 pièce suivante"]
      : [
          s.win === "ko" ? `Aux K.O. en ${s.minutes} min` : "Dernier debout",
          s.series === 1 ? "1 manche" : `${s.series} manches gagnantes`,
          teamsReady ? "2 contre 2" : null,
          holdLabel,
        ]
  )
    .filter(Boolean)
    .join(" · ");

  return (
    <TableLobby
      room={room}
      send={send}
      {...rest}
      shareTitle="Viens jouer à Briques"
      startLabel={s.sprint ? "Lancer le chrono" : "Lancer la partie"}
      hostWillStart="va lancer la partie"
      canStart={canStart}
      startHint={
        s.sprint
          ? "Le solo se joue seul à la table."
          : teamsReady
            ? room.seats.length < 4
              ? "Il faut quatre joueurs pour jouer en équipes : ajoute des bots."
              : "Il faut deux joueurs dans chaque équipe."
            : undefined
      }
      seatNote={teamsReady ? (seat) => `équipe ${BRICK_TEAMS[(seat.team ?? 0) as 0 | 1]}` : undefined}
      aside={teamsReady ? <TeamsPanel room={room} send={send} names={BRICK_TEAMS} colors={["#e0574a", "#5b8fe8"]} /> : undefined}
      summary={summary}
      rules={
        <>
          {/* En premier comme ailleurs ; le solo n'a pas de tirage, le champ dit pourquoi au lieu de disparaître */}
          <RandomRulesField
            room={room}
            game="bricks"
            send={send}
            off={s.sprint ? "Pas de tirage au sort pour le solo 40 lignes." : undefined}
          />

          <div className="field">
            <span className="field-label">Partie</span>
            <Options<"battle" | "sprint">
              label="Partie"
              value={s.sprint ? "sprint" : "battle"}
              disabled={!isHost}
              onChange={(v) => update({ sprint: v === "sprint" })}
              options={[
                { value: "battle", label: "Bataille" },
                { value: "sprint", label: "Solo 40 lignes" },
              ]}
            />
            <p className="hint" style={{ margin: 0 }}>
              {s.sprint
                ? "Seul contre la montre : 40 lignes le plus vite possible, et ton record au classement."
                : "Faire des lignes envoie des lignes grises chez les autres. La première pile qui déborde perd."}
            </p>
          </div>

          {!s.sprint && (
            <>
              <div className="field">
                <span className="field-label">Victoire</span>
                <Options<BricksWin>
                  label="Victoire"
                  value={s.win}
                  disabled={!isHost || locked("win")}
                  onChange={(win) => update({ win })}
                  options={[
                    { value: "survival", label: "Dernier debout" },
                    { value: "ko", label: "Au chrono, aux K.O." },
                  ]}
                />
                <p className="hint" style={{ margin: 0 }}>
                  {WIN_HINTS[s.win]}
                </p>
              </div>

              <div className="rules-two">
                {s.win === "ko" && (
                  <div className="field">
                    <span className="field-label">Durée d'une manche</span>
                    <Options<2 | 3>
                      label="Durée d'une manche"
                      value={s.minutes}
                      disabled={!isHost || locked("minutes")}
                      onChange={(minutes) => update({ minutes })}
                      options={[
                        { value: 2, label: "2 min" },
                        { value: 3, label: "3 min" },
                      ]}
                    />
                  </div>
                )}
                <div className="field">
                  <span className="field-label">Série</span>
                  <Options<1 | 2 | 3>
                    label="Série"
                    value={s.series}
                    disabled={!isHost}
                    onChange={(series) => update({ series })}
                    options={[
                      { value: 1, label: "1 manche" },
                      { value: 2, label: "2 gagnantes" },
                      { value: 3, label: "3 gagnantes" },
                    ]}
                  />
                </div>
              </div>

              {toggleList(["teams"])}
            </>
          )}
        </>
      }
      moreRules={
        <>
          {toggleList(["hold", "speedUp", "messy"])}

          <div className="field">
            <span className="field-label">Pièces suivantes affichées</span>
            <Options<1 | 3 | 5>
              label="Pièces suivantes affichées"
              value={s.previews}
              disabled={!isHost || locked("previews")}
              onChange={(previews) => update({ previews })}
              options={[
                { value: 1, label: "1" },
                { value: 3, label: "3" },
                { value: 5, label: "5" },
              ]}
            />
          </div>

          {!s.sprint && (
            <div className="field">
              <span className="field-label">Niveau des bots</span>
              <Options<BotLevel>
                label="Niveau des bots"
                value={s.botLevel}
                disabled={!isHost}
                onChange={(botLevel) => update({ botLevel })}
                options={[
                  { value: "apprenti", label: "Apprenti" },
                  { value: "confirme", label: "Confirmé" },
                  { value: "expert", label: "Expert" },
                ]}
              />
              <p className="hint" style={{ margin: 0 }}>
                {BOT_HINTS[s.botLevel]}
              </p>
            </div>
          )}

          {!s.sprint && <TableSize room={room} send={send} max={BRICKS_MAX_PLAYERS} />}
        </>
      }
      help={<BricksHelp s={s} />}
    />
  );
}
