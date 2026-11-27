import { useState } from "react";
import type { BotLevel } from "../../shared/games/bolides/bot.ts";
import { CUPS, chronoKey, cupOpen, EMPTY_PROGRESS } from "../../shared/games/bolides/campaign.ts";
import type { SpeedClass } from "../../shared/games/bolides/physics.ts";
import { ITEM_KINDS, ITEM_NAMES, ITEM_TIPS } from "../../shared/games/bolides/items.ts";
import { DEFAULT_SETTINGS, LAP_CHOICES, type BolidesSettings } from "../../shared/games/bolides/race.ts";
import { mirrorOf, TRACKS } from "../../shared/games/bolides/track.ts";
import { BOLIDES_MAX_PLAYERS, type BolidesClientMessage, type BolidesRoomView } from "../../shared/protocol.ts";
import { applyDrawnRules } from "../../shared/randomRules.ts";
import { drawLock, RandomRulesField, tableDraw } from "../game/RandomRules.tsx";
import { Check, Options } from "../components/ui.tsx";
import { TableLobby, TableSize } from "../game/TableLobby.tsx";
import { Garage } from "./Garage.tsx";
import { ItemIcon } from "./ItemIcon.tsx";
import { CupIntro } from "./solo/CupIntro.tsx";
import { ChronoTargets, CupGrid, ModePicker, TrackGrid } from "./solo/SoloRules.tsx";

const SPEED_HINTS: Record<SpeedClass, string> = {
  balade: "Les karts vont moins vite : idéal pour découvrir les circuits.",
  normal: "La vitesse habituelle.",
  bolide: "Les karts vont bien plus vite : il faut freiner et déraper juste.",
};

const BOT_HINTS: Record<BotLevel, string> = {
  facile: "Ils roulent tranquillement et oublient leurs objets.",
  moyen: "Ils dérapent de temps en temps et visent à peu près : une belle course les bat.",
  fort: "Ils prennent les meilleures trajectoires et ne font pas de cadeau.",
};

const LEVEL_NAMES: Record<BotLevel, string> = { facile: "faciles", moyen: "moyens", fort: "forts" };

interface Props {
  room: BolidesRoomView;
  send: (msg: BolidesClientMessage) => void;
  unread: number;
  onOpenChat: () => void;
  onLeave: () => void;
  onBackToGame?: () => void;
}

/** Le salon d'une table de Bolides : le salon commun, le mode de jeu, et les règles de la course. */
export function BolidesLobby({ room, send, ...rest }: Props) {
  // Règles au hasard : ce que le tirage décide s'affiche tel qu'il sera joué, et ne se règle plus à la main
  const s = applyDrawnRules("bolides", { ...DEFAULT_SETTINGS, ...room.settings.bolides }, DEFAULT_SETTINGS, tableDraw(room));
  const locked = drawLock(room, "bolides");
  const isHost = room.you.isHost;
  const update = (patch: Partial<BolidesSettings>) => send({ t: "settings", settings: patch });
  const shown = s.track === "hasard" ? null : s.track;
  // En tournée, toujours la course libre
  const mode = room.tour ? "course" : s.mode;
  const progress = room.solo?.progress ?? null;
  const humans = room.seats.filter((x) => x.kind === "human").length;
  const cup = CUPS[s.campaign];
  // Le championnat s'ouvre sur la présentation de la coupe (pas entre deux courses de la même coupe)
  const [intro, setIntro] = useState(false);
  const lobbySend = (msg: BolidesClientMessage) => {
    if (msg.t === "start" && mode === "championnat" && (!room.cup || room.cup.over)) setIntro(true);
    else send(msg);
  };

  const summary =
    mode === "championnat"
      ? `Championnat · ${cup.name} · ${cup.tracks.length} courses`
      : mode === "chrono"
        ? `Contre-la-montre · ${shown ? TRACKS[shown].name : "choisis un circuit"}${s.mirror ? " en miroir" : ""} · 3 tours`
        : [
            shown ? TRACKS[shown].name : "circuit au hasard",
            `${s.laps} tour${s.laps > 1 ? "s" : ""}`,
            s.speed === "balade" ? "vitesse balade" : s.speed === "bolide" ? "vitesse bolide" : "vitesse normale",
            s.cup && !room.tour ? "Grand Prix" : null,
            s.items ? null : "sans objets",
            s.mirror ? "en miroir" : null,
          ]
            .filter(Boolean)
            .join(" · ");

  // En solo, seul à la table, sans bots à ajouter ; le contre-la-montre veut un circuit, le championnat une coupe ouverte
  const solo = mode !== "course";
  const soloHint =
    humans > 1
      ? "Le championnat et le contre-la-montre se courent seul : les autres peuvent regarder."
      : mode === "chrono" && !shown
        ? "Choisis un circuit pour le contre-la-montre."
        : mode === "championnat" && !cupOpen(progress ?? EMPTY_PROGRESS, s.campaign)
          ? "Cette coupe n'est pas encore ouverte."
          : undefined;

  const chronoTrack = shown ? (s.mirror ? mirrorOf(shown) : shown) : null;

  return (
    <>
      <TableLobby
        room={room}
        send={lobbySend}
        {...rest}
        shareTitle="Viens faire la course sur Bolides"
        startLabel={mode === "championnat" ? "Présentation de la coupe" : mode === "chrono" ? "Chrono !" : "En piste !"}
        hostWillStart="va donner le départ"
        summary={summary}
        {...(solo ? { canStart: soloHint === undefined, startHint: soloHint, noBots: true } : {})}
        rules={
          <>
            {!room.tour && (
              <div className="field">
                <span className="field-label">Mode de jeu</span>
                <ModePicker mode={mode} progress={progress} disabled={!isHost} onChange={(next) => update({ mode: next })} />
              </div>
            )}

            {mode === "championnat" && (
              <>
                <div className="field">
                  <span className="field-label">Coupe</span>
                  <CupGrid value={s.campaign} progress={progress} disabled={!isHost} onChange={(campaign) => update({ campaign })} />
                </div>
                <p className="hint" style={{ margin: 0 }}>
                  {cup.tracks.map((t, i) => `${i + 1}. ${TRACKS[t].name}`).join(" · ")}
                  {cup.mirror ? ", en miroir" : ""}. {cup.grid} pilotes, des bots {LEVEL_NAMES[cup.bots]}, et Mistral
                  {cup.rival !== cup.bots ? " un cran au-dessus" : ", le champion"}. Une étoile pour le podium, trois pour la victoire au
                  classement de la coupe.
                </p>
              </>
            )}

            {mode === "chrono" && (
              <>
                <div className="field">
                  <span className="field-label">Circuit</span>
                  <TrackGrid
                    value={s.track}
                    mirror={s.mirror}
                    progress={progress}
                    random={false}
                    disabled={!isHost}
                    onChange={(track) => update({ track })}
                  />
                </div>
                <div className="rule-list">
                  <div className="rule-row" onClick={() => isHost && update({ mirror: !s.mirror })}>
                    <Check label="En miroir" checked={s.mirror} disabled={!isHost} onChange={() => {}} />
                    <span>
                      <strong>En miroir</strong>
                      <span className="hint">Le même circuit, gauche et droite échangées : ses étoiles se gagnent à part.</span>
                    </span>
                  </div>
                </div>
                {chronoTrack && (
                  <div className="field">
                    <span className="field-label">Les fantômes à battre</span>
                    <ChronoTargets targets={room.solo?.targets ?? null} best={progress?.best[chronoKey(chronoTrack)]} />
                    <p className="hint" style={{ margin: 0 }}>
                      Trois tours, seul et sans objets. Une étoile par fantôme battu : ils roulent avec toi, en transparence.
                    </p>
                  </div>
                )}
              </>
            )}

            {mode === "course" && (
              <>
                <RandomRulesField room={room} game="bolides" send={send} />

                <div className="field">
                  <span className="field-label">Circuit</span>
                  <TrackGrid
                    value={s.track}
                    mirror={s.mirror}
                    progress={progress}
                    random
                    disabled={!isHost || locked("track")}
                    onChange={(track) => update({ track })}
                  />
                  <p className="hint" style={{ margin: 0 }}>
                    {shown ? TRACKS[shown].blurb : "Un circuit tiré au sort à chaque course."}
                  </p>
                </div>

                <div className="field">
                  <span className="field-label">Tours</span>
                  <Options<number>
                    label="Tours"
                    value={s.laps}
                    disabled={!isHost || locked("laps")}
                    onChange={(laps) => update({ laps })}
                    options={LAP_CHOICES.map((n) => ({ value: n, label: String(n) }))}
                  />
                </div>

                <div className="field">
                  <span className="field-label">Vitesse</span>
                  <Options<SpeedClass>
                    label="Vitesse"
                    value={s.speed}
                    disabled={!isHost || locked("speed")}
                    onChange={(speed) => update({ speed })}
                    options={[
                      { value: "balade", label: "Balade" },
                      { value: "normal", label: "Normale" },
                      { value: "bolide", label: "Bolide" },
                    ]}
                  />
                  <p className="hint" style={{ margin: 0 }}>
                    {SPEED_HINTS[s.speed]}
                  </p>
                </div>

                {/* Le Grand Prix change toute la partie (quatre courses à la suite) : il reste dans l'essentiel */}
                {!room.tour && (
                  <div className="rule-list">
                    <div className="rule-row" onClick={() => isHost && update({ cup: !s.cup })}>
                      <Check label="Grand Prix" checked={s.cup} disabled={!isHost} onChange={() => {}} />
                      <span>
                        <strong>Grand Prix</strong>
                        <span className="hint">
                          Quatre circuits tirés au sort, à la suite, avec des points à chaque arrivée. Le meilleur total l'emporte.
                        </span>
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        }
        moreRules={
          mode !== "course" ? undefined : (
            <>
              <div className="field">
                <span className="field-label">Règles maison</span>
                <div className="rule-list">
                  <div
                    className={`rule-row ${locked("items") ? "is-forced" : ""}`}
                    onClick={() => isHost && !locked("items") && update({ items: !s.items })}
                  >
                    <Check label="Les caisses d'objets" checked={s.items} disabled={!isHost || locked("items")} onChange={() => {}} />
                    <span>
                      <strong>Les caisses d'objets</strong>
                      <span className="hint">
                        Tarte à la crème, boule de bowling, bombe, fusée, orage, potion géante, aimant, ressort… : plus on est loin,
                        meilleurs sont les objets. Sans elles, c'est une course pure.
                      </span>
                    </span>
                  </div>
                  <div className="rule-row" onClick={() => isHost && update({ mirror: !s.mirror })}>
                    <Check label="Circuits en miroir" checked={s.mirror} disabled={!isHost} onChange={() => {}} />
                    <span>
                      <strong>Circuits en miroir</strong>
                      <span className="hint">Les mêmes circuits, gauche et droite échangées : tout est à réapprendre.</span>
                    </span>
                  </div>
                </div>
              </div>

              <div className="field">
                <span className="field-label">Niveau des bots</span>
                <Options<BotLevel>
                  label="Niveau des bots"
                  value={s.botLevel}
                  disabled={!isHost}
                  onChange={(botLevel) => update({ botLevel })}
                  options={[
                    { value: "facile", label: "Facile" },
                    { value: "moyen", label: "Moyen" },
                    { value: "fort", label: "Fort" },
                  ]}
                />
                <p className="hint" style={{ margin: 0 }}>
                  {BOT_HINTS[s.botLevel]}
                </p>
              </div>

              <TableSize room={room} send={send} max={BOLIDES_MAX_PLAYERS} />
            </>
          )
        }
        look={room.you.seatId ? <Garage room={room} send={send} /> : undefined}
        help={<BolidesHelp />}
      />
      {intro && (
        <CupIntro
          cup={s.campaign}
          onDone={() => {
            setIntro(false);
            send({ t: "start" });
          }}
          onCancel={() => setIntro(false)}
        />
      )}
    </>
  );
}

/** Comment jouer à Bolides : le but, le dérapage et les figures, les touches, et les objets un par un */
function BolidesHelp() {
  return (
    <div className="lobby-help bolides-howto">
      <h2>Comment jouer</h2>
      <p>
        <strong>Le premier sur la ligne gagne.</strong> Dérape dans les virages : plus tu tiens, plus le turbo est gros (étincelles bleues,
        puis orange, puis violettes). Au tremplin, appuie sur déraper en l'air pour une figure : encore un turbo à l'atterrissage. Passe sur
        les flèches, et casse les caisses pour gagner des objets.
      </p>
      <p className="hint">
        Au clavier : <kbd>↑</kbd> accélérer, <kbd>←</kbd> <kbd>→</kbd> tourner, <kbd>Espace</kbd> déraper (et figure en l'air), <kbd>E</kbd>{" "}
        ou un clic pour l'objet (avec <kbd>↓</kbd>, il part derrière toi), <kbd>B</kbd> pour regarder derrière (ZQSD marche aussi). Sur
        téléphone, le kart accélère tout seul, et l'objet se lance avec le gros bouton, en touchant le milieu de l'écran, ou en glissant le
        pouce vers le haut sur Dérapage. Une manette marche aussi.
      </p>
      <p className="hint">
        Tiens Dérapage sans tourner puis lâche : ton kart bondit par-dessus les obstacles. Sur un tremplin bleu, le deltaplane s'ouvre :
        tourne pour viser les anneaux, freine pour plonger. Reste juste derrière un kart : son aspiration finit par te lancer. Tu peux
        garder deux objets, et le sol te montre où part celui que tu tiens.
      </p>
      <p className="hint">
        Sur la route, gare à ce qui traverse (un engin, une file de bêtes, ce qui tombe d'une grue ou d'un arbre) : le croiser, c'est le
        tête-à-queue. Un îlot au milieu se contourne d'un côté ou de l'autre ; la boue, le sable, les algues ou les feuilles freinent, le
        verglas et les flaques font glisser, un trampoline fait sauter. Tombé à l'eau ou coincé, un drone te repose sur la piste (ou appuie
        sur <kbd>R</kbd>). Dans le menu de la course, les objets peuvent partir tout seuls, et la conduite assistée te ramène vers la route.
      </p>
      <details className="bolides-items">
        <summary>Les objets, un par un</summary>
        <ul>
          {ITEM_KINDS.map((k) => (
            <li key={k}>
              <ItemIcon item={k} size={34} />
              <span>
                <strong>{ITEM_NAMES[k]}</strong>
                <small>{ITEM_TIPS[k]}</small>
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
