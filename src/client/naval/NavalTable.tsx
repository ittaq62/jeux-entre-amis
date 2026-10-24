import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { cellIndex, cellX, cellY, FLEETS, type Dir, type Weapon } from "../../shared/games/naval/engine.ts";
import type { NavalBoardView, NavalView } from "../../shared/games/naval/view.ts";
import type { NavalClientMessage, NavalRoomView, SeatView } from "../../shared/protocol.ts";
import { AdminBadge } from "../components/AdminBadge.tsx";
import { Avatar } from "../components/Avatar.tsx";
import { Icon } from "../components/Icon.tsx";
import { ConfirmButton } from "../components/ui.tsx";
import { AwayNote, awayTurnNote } from "../game/AwayNote.tsx";
import { EmotePicker } from "../game/ChatPanel.tsx";
import { TimerRing } from "../game/Seat.tsx";
import type { EmoteBubble } from "../game/useRoom.ts";
import { formatClock, useCountdown } from "../lib/countdown.ts";
import { NAVAL_SOUNDS, play, preloadSounds, startLoop, stopLoop } from "../lib/sound.ts";
import { usePrefs } from "../stores/prefs.ts";
import { Board } from "./Board.tsx";
import { NavalGameOver } from "./NavalGameOver.tsx";
import { TEAM_NAMES } from "./NavalLobby.tsx";
import { PlacementBoard } from "./Placement.tsx";

interface Props {
  room: NavalRoomView;
  send: (msg: NavalClientMessage) => void;
  emotes: EmoteBubble[];
  serverOffset: number;
  unread: number;
  onOpenChat: () => void;
  onShowLobby: () => void;
  onLeave: () => void;
}

const WEAPONS: Record<Weapon, { name: string; help: string }> = {
  radar: { name: "Radar", help: "Révèle ce qui se cache sous une zone de 3×3, sans tirer." },
  torpedo: { name: "Torpille", help: "File sur une ligne ou une colonne et frappe le premier navire." },
  barrage: { name: "Barrage", help: "Cinq obus en croix d'un coup." },
};

function useViewport() {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return size;
}

/** Cases touchées par une arme visée sur une case. */
function weaponArea(weapon: Weapon, cell: number, size: number, dir: Dir): number[] {
  const x = cellX(size, cell);
  const y = cellY(size, cell);
  const inside = ([cx, cy]: [number, number]) => cx >= 0 && cy >= 0 && cx < size && cy < size;
  if (weapon === "radar") {
    const out: [number, number][] = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) out.push([x + dx, y + dy]);
    return out.filter(inside).map(([cx, cy]) => cellIndex(size, cx, cy));
  }
  if (weapon === "barrage") {
    const cross: [number, number][] = [
      [x, y],
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ];
    return cross.filter(inside).map(([cx, cy]) => cellIndex(size, cx, cy));
  }
  return Array.from({ length: size }, (_, k) => (dir === "h" ? cellIndex(size, k, y) : cellIndex(size, x, k)));
}

export function NavalTable({ room, send, emotes, serverOffset, unread, onOpenChat, onShowLobby, onLeave }: Props) {
  const g = room.naval!;
  const me = g.you;
  const meP = me ? g.players.find((p) => p.id === me) : undefined;
  const { w, h } = useViewport();
  const phone = w < 760;
  const sound = usePrefs((s) => s.sound);
  const setPrefs = usePrefs((s) => s.set);
  const [menuOpen, setMenuOpen] = useState(false);
  const [emoteOpen, setEmoteOpen] = useState(false);
  const [resultsHidden, setResultsHidden] = useState(false);

  useEffect(() => preloadSounds(NAVAL_SOUNDS), []);
  useEffect(() => {
    if (sound && room.status === "playing") startLoop("ambience");
    else stopLoop();
  }, [sound, room.status]);
  useEffect(() => () => stopLoop(), []);
  useEffect(() => {
    if (g.phase !== "gameOver") setResultsHidden(false);
  }, [g.phase]);

  const seat = (id: string) => room.seats.find((s) => s.id === id);
  const mustPlace = g.phase === "placement" && meP && !meP.ready;

  // Tailles des plateaux selon l'écran
  const radarPx = phone ? Math.min(w - 40, 460) : Math.max(300, Math.min(600, h - 250, w - 560));
  const fleetPx = phone ? Math.min(w - 24, Math.round(radarPx * 0.72)) : Math.round(radarPx * 0.62);
  const placePx = phone ? Math.min(w - 40, 460) : Math.max(320, Math.min(560, h - 230));

  const modeLabel = g.mode === "duel" ? "Duel" : g.mode === "teams" ? "2 contre 2" : "Mêlée";

  return (
    <div className="table-root felt naval-root">
      <header className="table-top">
        <button className="btn btn-ghost btn-icon" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
          <Icon name="menu" />
        </button>
        <div className="table-title">
          <span className="table-code">{room.code}</span>
          <span className="hint">Bataille navale, {modeLabel.toLowerCase()}</span>
        </div>
        <div className="table-top-actions">
          <button
            className="btn btn-ghost btn-icon"
            onClick={() => setPrefs({ sound: !sound })}
            aria-label={sound ? "Couper le son" : "Activer le son"}
          >
            <Icon name={sound ? "volume" : "mute"} />
          </button>
          <button className="btn btn-ghost btn-icon chat-toggle" onClick={onOpenChat} aria-label="Discussion">
            <Icon name="chat" />
            {unread > 0 && <span className="badge badge-red">{unread}</span>}
          </button>
        </div>
        <AnimatePresence>
          {menuOpen && (
            <>
              <div className="emote-catcher" onClick={() => setMenuOpen(false)} />
              <motion.div
                className="table-menu panel"
                initial={{ y: -8, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -8, opacity: 0 }}
              >
                <button className="menu-item" onClick={() => (setMenuOpen(false), onShowLobby())}>
                  <Icon name="users" size={18} /> Voir le salon et les règles
                </button>
                <button className="menu-item is-danger" onClick={onLeave}>
                  <Icon name="door" size={18} /> Quitter la table
                </button>
                {room.you.isAdmin && (
                  <ConfirmButton
                    className="menu-item is-danger"
                    confirm="Fermer la table pour tous ?"
                    onConfirm={() => send({ t: "close" })}
                  >
                    <Icon name="shield" size={18} /> Fermer la table (admin)
                  </ConfirmButton>
                )}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </header>

      <main className="naval-stage">
        {mustPlace ? (
          <PlacementBoard room={room} g={g} me={me!} send={send} px={placePx} serverOffset={serverOffset} />
        ) : (
          <Battle room={room} g={g} send={send} serverOffset={serverOffset} radarPx={radarPx} fleetPx={fleetPx} phone={phone} seat={seat} />
        )}
      </main>

      <div className="naval-emotes" aria-live="polite">
        <AnimatePresence>
          {emotes.map((e) => {
            const who = room.seats.find((s) => s.id === e.seatId || s.userId === e.userId);
            return (
              <motion.div
                key={e.id}
                className={`naval-emote ${e.emote.length <= 2 ? "is-emoji" : ""}`}
                initial={{ x: 30, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {who && <Avatar avatar={who.avatar} userId={who.userId} photo={who.photo} size={26} />}
                <span>{e.emote}</span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {me && (
        <div className="naval-react">
          <button className="round-btn" onClick={() => setEmoteOpen(!emoteOpen)} aria-label="Réagir">
            <Icon name="smile" size={20} />
          </button>
          <EmotePicker
            open={emoteOpen}
            onClose={() => setEmoteOpen(false)}
            onPick={(emote) => {
              send({ t: "emote", emote });
              setEmoteOpen(false);
            }}
          />
        </div>
      )}

      {g.phase === "gameOver" && !resultsHidden && (
        <NavalGameOver
          room={room}
          onRematch={() => send(room.you.isHost ? { t: "start" } : { t: "rematch" })}
          onLobby={onShowLobby}
          onLeave={onLeave}
          onInspect={() => setResultsHidden(true)}
        />
      )}
      {g.phase === "gameOver" && resultsHidden && (
        <button className="btn btn-primary naval-results-back" onClick={() => setResultsHidden(false)}>
          Revoir le journal de bord
        </button>
      )}
    </div>
  );
}

function Battle({
  room,
  g,
  send,
  serverOffset,
  radarPx,
  fleetPx,
  phone,
  seat,
}: {
  room: NavalRoomView;
  g: NavalView;
  send: (msg: NavalClientMessage) => void;
  serverOffset: number;
  radarPx: number;
  fleetPx: number;
  phone: boolean;
  seat: (id: string) => SeatView | undefined;
}) {
  const me = g.you;
  const meP = me ? g.players.find((p) => p.id === me) : undefined;
  const ally = (id: string) => meP && (id === meP.id || (meP.team !== null && g.players.find((p) => p.id === id)?.team === meP.team));
  const enemies = g.players.filter((p) => !ally(p.id));
  const [targetId, setTargetId] = useState<string | null>(null);
  const target = enemies.find((p) => p.id === targetId && !p.out) ?? enemies.find((p) => !p.out) ?? enemies[0];
  const targetBoard = target ? g.boards.find((b) => b.owner === target.id)! : null;
  const myBoard = me ? g.boards.find((b) => b.owner === me) : undefined;
  const mate = meP && meP.team !== null ? g.players.find((p) => p.id !== meP.id && p.team === meP.team) : undefined;
  const mateBoard = mate ? g.boards.find((b) => b.owner === mate.id) : undefined;
  const myTurn = g.phase === "battle" && g.turn === me && me !== null;
  const [weapon, setWeapon] = useState<Weapon | null>(null);
  const [dir, setDir] = useState<Dir>("h");
  const [hover, setHover] = useState<number | null>(null);
  const [sentFor, setSentFor] = useState(-1);
  const mySeat = me ? seat(me) : undefined;
  const turnSeat = g.turn ? seat(g.turn) : undefined;
  const turnLeft = useCountdown(turnSeat?.awayAt ?? null, serverOffset);
  const placementLeft = useCountdown(room.placementDeadline, serverOffset);

  useEffect(() => {
    if (!myTurn) setWeapon(null);
  }, [myTurn]);

  // Sur téléphone, un seul plateau à la fois : le radar quand on tire, sa flotte quand les autres tirent.
  // On attend que l'obus en vol soit tombé avant de changer de plateau.
  const [view, setView] = useState<"radar" | "fleet">("radar");
  useEffect(() => {
    if (!phone || !me) return;
    const next = g.phase === "battle" && g.turn !== me ? "fleet" : "radar";
    const t = setTimeout(() => setView(next), 1000);
    return () => clearTimeout(t);
  }, [phone, me, g.turn, g.phase]);
  const showRadar = !phone || !me || view === "radar";
  const showFleet = !phone || view === "fleet";

  const size = g.settings.grid;
  const shotOn = (b: NavalBoardView) => new Set([...b.misses, ...b.hits]);
  const canFire = myTurn && sentFor !== g.turnId && target && !target.out && targetBoard;

  function fireAt(cell: number) {
    if (!canFire || !targetBoard || !target) return;
    if (weapon) {
      send({ t: "action", action: { type: "weapon", weapon, target: target.id, cell, dir } });
      setWeapon(null);
    } else {
      if (shotOn(targetBoard).has(cell)) {
        play("buzzer", { volume: 0.2 });
        return;
      }
      send({ t: "action", action: { type: "fire", target: target.id, cell } });
    }
    setSentFor(g.turnId);
  }

  const preview = weapon && hover !== null && canFire ? { cells: weaponArea(weapon, hover, size, dir), ok: true } : null;

  // Ce qu'on lit au-dessus des plateaux
  let status: string;
  if (g.phase === "placement") {
    const waiting = g.players.filter((p) => !p.ready).map((p) => seat(p.id)?.name ?? "?");
    status = waiting.length > 0 ? `Ta flotte est prête. On attend ${waiting.join(", ")}.` : "Toutes les flottes sont prêtes.";
  } else if (g.phase === "gameOver") status = "La bataille est terminée.";
  else if (mySeat?.autoplay) status = "Un bot tient la barre pour toi.";
  else if (myTurn) {
    const shots = g.settings.shots === "salvo" && g.shotsLeft > 1 ? `, ${g.shotsLeft} tirs` : "";
    status = enemies.filter((p) => !p.out).length > 1 ? `À toi de tirer${shots} : choisis ta cible.` : `À toi de tirer${shots} !`;
  } else if (meP?.out)
    status =
      mate && !mate.out
        ? `Ta flotte est au fond : ${seat(mate.id)?.name ?? "ton équipier"} continue seul.`
        : "Ta flotte est au fond. Tu regardes la fin de la bataille.";
  else status = `Au tour de ${turnSeat?.name ?? "?"}${awayTurnNote(turnSeat, turnLeft)}`;

  const arsenal = meP?.arsenal ?? [];
  const counts = (["radar", "torpedo", "barrage"] as Weapon[]).map((k) => ({ k, n: arsenal.filter((a) => a === k).length }));

  return (
    <section className={`naval-battle ${phone ? "is-phone" : ""}`}>
      <div className={`naval-status ${myTurn ? "is-turn" : ""}`}>
        {myTurn && room.turnDeadline && (
          <span className="naval-timer">
            <TimerRing size={30} deadline={room.turnDeadline} total={g.settings.turnSeconds} offset={serverOffset} />
          </span>
        )}
        <span className="naval-status-text">{status}</span>
        {g.phase === "placement" && placementLeft !== null && <span className="placement-clock num">{formatClock(placementLeft)}</span>}
        {mySeat?.autoplay && (
          <button className="btn btn-sm" onClick={() => send({ t: "takeBack" })}>
            Reprendre la barre
          </button>
        )}
      </div>

      {phone && me && (
        <div className="options naval-view" role="radiogroup" aria-label="Plateau affiché">
          <button type="button" aria-pressed={view === "radar"} onClick={() => setView("radar")}>
            Radar
          </button>
          <button type="button" aria-pressed={view === "fleet"} onClick={() => setView("fleet")}>
            Ta flotte
            <FleetPips total={FLEETS[size].length} afloat={myBoard?.afloat ?? 0} />
          </button>
        </div>
      )}

      <div className="naval-boards">
        <div className="naval-target" hidden={!showRadar}>
          {enemies.length > 1 || !me ? (
            <div className="naval-targets" role="tablist" aria-label="Choisir la flotte visée">
              {enemies.map((p) => {
                const s = seat(p.id);
                const b = g.boards.find((x) => x.owner === p.id)!;
                const active = target?.id === p.id;
                return (
                  <button
                    key={p.id}
                    role="tab"
                    aria-selected={active}
                    className={`naval-target-tab ${active ? "is-active" : ""} ${p.out ? "is-out" : ""} ${g.turn === p.id ? "is-turn" : ""}`}
                    onClick={() => setTargetId(p.id)}
                    disabled={p.out && !active}
                  >
                    {s && <Avatar avatar={s.avatar} userId={s.userId} photo={s.photo} size={28} />}
                    <span className="naval-target-name">{s?.name}</span>
                    {s && <AwayNote seat={s} serverOffset={serverOffset} compact />}
                    <FleetPips total={FLEETS[size].length} afloat={b.afloat} />
                  </button>
                );
              })}
            </div>
          ) : (
            target && (
              <div className="naval-opponent">
                {seat(target.id) && (
                  <Avatar avatar={seat(target.id)!.avatar} userId={seat(target.id)!.userId} photo={seat(target.id)!.photo} size={34} />
                )}
                <span className="naval-opponent-name">
                  {seat(target.id)?.name}
                  {seat(target.id)?.admin && <AdminBadge />}
                </span>
                {seat(target.id) && <AwayNote seat={seat(target.id)!} serverOffset={serverOffset} />}
                <FleetPips total={FLEETS[size].length} afloat={targetBoard?.afloat ?? 0} />
              </div>
            )
          )}

          {targetBoard && (
            <div className={`naval-scope ${canFire ? "is-armed" : ""}`}>
              <Board
                board={targetBoard}
                mode="radar"
                px={radarPx}
                label={`Radar sur la flotte de ${seat(targetBoard.owner)?.name ?? "l'adversaire"}`}
                aiming={Boolean(canFire)}
                preview={preview}
                onHover={setHover}
                onCell={fireAt}
              />
            </div>
          )}

          {g.settings.arsenal && me && g.phase !== "gameOver" && (
            <div className="naval-arsenal">
              {arsenal.length === 0 ? (
                <p className="hint">Coule un navire pour gagner une arme.</p>
              ) : (
                <>
                  {counts
                    .filter((c) => c.n > 0)
                    .map(({ k, n }) => (
                      <button
                        key={k}
                        className={`weapon-btn ${weapon === k ? "is-active" : ""}`}
                        disabled={!canFire}
                        onClick={() => setWeapon(weapon === k ? null : k)}
                        title={WEAPONS[k].help}
                      >
                        <WeaponIcon weapon={k} />
                        <span>{WEAPONS[k].name}</span>
                        {n > 1 && <span className="weapon-count num">×{n}</span>}
                      </button>
                    ))}
                  {weapon === "torpedo" && (
                    <div className="options weapon-dir" role="radiogroup" aria-label="Sens de la torpille">
                      <button type="button" aria-pressed={dir === "h"} onClick={() => setDir("h")}>
                        Ligne
                      </button>
                      <button type="button" aria-pressed={dir === "v"} onClick={() => setDir("v")}>
                        Colonne
                      </button>
                    </div>
                  )}
                  {weapon && <p className="hint weapon-help">{WEAPONS[weapon].help}</p>}
                </>
              )}
            </div>
          )}
        </div>

        {myBoard && showFleet && (
          <div className="naval-fleet">
            {!phone && (
              <div className="naval-fleet-head">
                <h3>
                  Ta flotte
                  {meP?.team !== null && meP?.team !== undefined && <span className="hint"> équipe {TEAM_NAMES[meP.team]}</span>}
                </h3>
                <FleetPips total={FLEETS[size].length} afloat={myBoard.afloat} />
              </div>
            )}
            <Board board={myBoard} mode="sea" px={phone ? radarPx : mateBoard ? Math.round(fleetPx * 0.8) : fleetPx} label="Ta flotte" />
            {mateBoard && mate && (
              <>
                <div className="naval-fleet-head">
                  <h3>Flotte de {seat(mate.id)?.name}</h3>
                  {seat(mate.id) && <AwayNote seat={seat(mate.id)!} serverOffset={serverOffset} compact />}
                  <FleetPips total={FLEETS[size].length} afloat={mateBoard.afloat} />
                </div>
                <Board
                  board={mateBoard}
                  mode="sea"
                  px={Math.round(fleetPx * (phone ? 0.7 : 0.5))}
                  label={`Flotte de ${seat(mate.id)?.name ?? "ton équipier"}`}
                />
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/** Petits navires : pleins s'ils flottent encore, vides s'ils sont coulés. */
function FleetPips({ total, afloat }: { total: number; afloat: number }) {
  return (
    <span className="fleet-pips" aria-label={`${afloat} navire${afloat > 1 ? "s" : ""} à flot sur ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={i < afloat ? "is-afloat" : ""} />
      ))}
    </span>
  );
}

function WeaponIcon({ weapon }: { weapon: Weapon }) {
  return (
    <svg
      className="weapon-icon"
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      aria-hidden="true"
    >
      {weapon === "radar" && (
        <>
          <circle cx={12} cy={12} r={9} />
          <circle cx={12} cy={12} r={5} />
          <path d="M12 12 L19 6" strokeLinecap="round" />
        </>
      )}
      {weapon === "torpedo" && (
        <>
          <rect x={5} y={9.5} width={13} height={5} rx={2.5} />
          <path d="M5 9.5 L2.5 7.5 M5 14.5 L2.5 16.5" strokeLinecap="round" />
        </>
      )}
      {weapon === "barrage" && (
        <>
          {[
            [12, 12],
            [12, 5],
            [12, 19],
            [5, 12],
            [19, 12],
          ].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r={2.2} fill="currentColor" stroke="none" />
          ))}
        </>
      )}
    </svg>
  );
}
