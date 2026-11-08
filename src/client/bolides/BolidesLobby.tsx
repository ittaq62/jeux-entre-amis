import { useMemo } from "react";
import type { BotLevel } from "../../shared/games/bolides/bot.ts";
import type { SpeedClass } from "../../shared/games/bolides/physics.ts";
import { ITEM_KINDS, ITEM_NAMES, ITEM_TIPS } from "../../shared/games/bolides/items.ts";
import { LAP_CHOICES, type BolidesSettings } from "../../shared/games/bolides/race.ts";
import { getTrack, TRACK_IDS, TRACKS, type TrackId } from "../../shared/games/bolides/track.ts";
import { BOLIDES_MAX_PLAYERS, type BolidesClientMessage, type BolidesRoomView } from "../../shared/protocol.ts";
import { Check, Options } from "../components/ui.tsx";
import { RulesHeading, TableLobby, TableSize } from "../game/TableLobby.tsx";
import { Garage } from "./Garage.tsx";
import { ItemIcon } from "./ItemIcon.tsx";

const SPEED_HINTS: Record<SpeedClass, string> = {
  balade: "Les karts vont moins vite : idéal pour découvrir les circuits.",
  normal: "La vitesse habituelle.",
  bolide: "Les karts vont bien plus vite : il faut freiner et déraper juste.",
};

const BOT_HINTS: Record<BotLevel, string> = {
  facile: "Ils roulent tranquillement et oublient leurs objets.",
  moyen: "Ils dérapent dans les virages et savent viser.",
  fort: "Ils prennent les meilleures trajectoires et ne font pas de cadeau.",
};

interface Props {
  room: BolidesRoomView;
  send: (msg: BolidesClientMessage) => void;
  unread: number;
  onOpenChat: () => void;
  onLeave: () => void;
  onBackToGame?: () => void;
}

/** Le tracé d'un circuit en petit, pour le choisir */
export function TrackMap({ id, className = "" }: { id: TrackId; className?: string }) {
  const path = useMemo(() => {
    const t = getTrack(id);
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < t.n; i++) {
      minX = Math.min(minX, t.x[i]!);
      maxX = Math.max(maxX, t.x[i]!);
      minZ = Math.min(minZ, t.z[i]!);
      maxZ = Math.max(maxZ, t.z[i]!);
    }
    const size = Math.max(maxX - minX, maxZ - minZ) + 20;
    const ox = (minX + maxX) / 2 - size / 2;
    const oz = (minZ + maxZ) / 2 - size / 2;
    const pts: string[] = [];
    for (let i = 0; i < t.n; i += 3)
      pts.push(`${(((t.x[i]! - ox) / size) * 100).toFixed(1)},${(((t.z[i]! - oz) / size) * 100).toFixed(1)}`);
    return { d: `M${pts.join("L")}Z`, sx: ((t.x[0]! - ox) / size) * 100, sz: ((t.z[0]! - oz) / size) * 100 };
  }, [id]);
  return (
    <svg className={`track-map ${className}`} viewBox="-4 -4 108 108" aria-hidden="true">
      <path d={path.d} className="track-map-edge" />
      <path d={path.d} className="track-map-road" />
      <circle cx={path.sx} cy={path.sz} r="4" className="track-map-start" />
    </svg>
  );
}

/** Le salon d'une table de Bolides : le salon commun et les règles de la course. */
export function BolidesLobby({ room, send, ...rest }: Props) {
  const s = room.settings.bolides;
  const isHost = room.you.isHost;
  const update = (patch: Partial<BolidesSettings>) => send({ t: "settings", settings: patch });
  const shown = s.track === "hasard" ? null : s.track;

  return (
    <TableLobby
      room={room}
      send={send}
      {...rest}
      shareTitle="Viens faire la course sur Bolides"
      startLabel="En piste !"
      hostWillStart="va donner le départ"
      rules={
        <>
          <Garage room={room} send={send} />
          <section className="rules-sheet panel">
            <RulesHeading room={room} />

            <div className="bolides-howto">
              <p>
                <strong>Le premier sur la ligne gagne.</strong> Dérape dans les virages : plus tu tiens, plus le turbo est gros (étincelles
                bleues, puis orange, puis violettes). Au tremplin, appuie sur déraper en l'air pour une figure : encore un turbo à
                l'atterrissage. Passe sur les flèches, et casse les caisses pour gagner des objets.
              </p>
              <p className="hint">
                Au clavier : <kbd>↑</kbd> accélérer, <kbd>←</kbd> <kbd>→</kbd> tourner, <kbd>Espace</kbd> déraper (et figure en l'air),{" "}
                <kbd>E</kbd> ou un clic pour l'objet (avec <kbd>↓</kbd>, il part derrière toi), <kbd>B</kbd> pour regarder derrière (ZQSD
                marche aussi). Sur téléphone, le kart accélère tout seul, et l'objet se lance avec le gros bouton, en touchant le milieu de
                l'écran, ou en glissant le pouce vers le haut sur Dérapage. Une manette marche aussi.
              </p>
              <p className="hint">
                Tiens Dérapage sans tourner puis lâche : ton kart bondit par-dessus les obstacles. Sur un tremplin bleu, le deltaplane
                s'ouvre : tourne pour viser les anneaux, freine pour plonger. Reste juste derrière un kart : son aspiration finit par te
                lancer. Tu peux garder deux objets, et le sol te montre où part celui que tu tiens. Dans le menu de la course, les objets
                peuvent partir tout seuls.
              </p>
            </div>

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

            <div className="field">
              <span className="field-label">Circuit</span>
              <Options<TrackId | "hasard">
                label="Circuit"
                value={s.track}
                disabled={!isHost}
                onChange={(track) => update({ track })}
                options={[{ value: "hasard", label: "Au hasard" }, ...TRACK_IDS.map((id) => ({ value: id, label: TRACKS[id].name }))]}
              />
              <div className="bolides-track">
                {shown ? (
                  <>
                    <TrackMap id={shown} />
                    <p className="hint" style={{ margin: 0 }}>
                      {TRACKS[shown].blurb}
                    </p>
                  </>
                ) : (
                  <>
                    <div className="bolides-track-maps">
                      {TRACK_IDS.map((id) => (
                        <TrackMap key={id} id={id} className="is-small" />
                      ))}
                    </div>
                    <p className="hint" style={{ margin: 0 }}>
                      Un circuit tiré au sort à chaque course.
                    </p>
                  </>
                )}
              </div>
            </div>

            <div className="field">
              <span className="field-label">Tours</span>
              <Options<number>
                label="Tours"
                value={s.laps}
                disabled={!isHost}
                onChange={(laps) => update({ laps })}
                options={LAP_CHOICES.map((n) => ({ value: n, label: String(n) }))}
              />
            </div>

            <div className="field">
              <span className="field-label">Vitesse</span>
              <Options<SpeedClass>
                label="Vitesse"
                value={s.speed}
                disabled={!isHost}
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

            <div className="field">
              <span className="field-label">Règle maison</span>
              <div className="rule-list">
                <div className="rule-row" onClick={() => isHost && update({ items: !s.items })}>
                  <Check label="Les caisses d'objets" checked={s.items} disabled={!isHost} onChange={() => {}} />
                  <span>
                    <strong>Les caisses d'objets</strong>
                    <span className="hint">
                      Tarte à la crème, boule de bowling, bombe, fusée, orage, potion géante, aimant, ressort… : plus on est loin, meilleurs
                      sont les objets. Sans elles, c'est une course pure.
                    </span>
                  </span>
                </div>
                {!room.tour && (
                  <div className="rule-row" onClick={() => isHost && update({ cup: !s.cup })}>
                    <Check label="Grand Prix" checked={s.cup} disabled={!isHost} onChange={() => {}} />
                    <span>
                      <strong>Grand Prix</strong>
                      <span className="hint">
                        Quatre circuits tirés au sort, à la suite, avec des points à chaque arrivée. Le meilleur total l'emporte.
                      </span>
                    </span>
                  </div>
                )}
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
          </section>
        </>
      }
    />
  );
}
