import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
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
import { useNavalFx } from "./fx.ts";
import { NavalGameOver } from "./NavalGameOver.tsx";
import { TEAM_NAMES } from "./NavalLobby.tsx";
import { PlacementBoard } from "./Placement.tsx";
import { useTourBridge } from "../tour/bridge.ts";
import { useBoxSize, useViewport } from "../lib/viewport.ts";

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

/** Ce qu'il faut garder à côté de la grille sur un écran bas : le statut, les cibles, les armes */
export const SIDE_MIN = 280;
/** L'en-tête du plateau de l'équipier, et l'écart qui le sépare du nôtre */
const MATE_HEAD = 36;

/** Sa flotte et celle de l'équipier, l'une au-dessus de l'autre, dans la place donnée */
function stackFleets(width: number, height: number, withMate: boolean) {
  if (!withMate) return { mine: Math.min(width, height), mate: 0 };
  const mine = Math.min(width, Math.round((height - MATE_HEAD) * 0.62));
  return { mine, mate: Math.min(width, height - MATE_HEAD - mine) };
}

export function NavalTable({ room, send, emotes, serverOffset, unread, onOpenChat, onShowLobby, onLeave }: Props) {
  const inTour = useTourBridge() !== null;
  const g = room.naval!;
  const me = g.you;
  const meP = me ? g.players.find((p) => p.id === me) : undefined;
  const { w, h } = useViewport();
  // Écran étroit : une seule grille à la fois. Écran bas (téléphone couché) : tout ce qui n'est pas la grille passe à côté.
  const phone = w < 760;
  const short = h < 560 && w > h;
  const compact = phone || short;
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

  const modeLabel = g.mode === "duel" ? "Duel" : g.mode === "teams" ? "2 contre 2" : "Mêlée";

  // L'en-tête va tout en haut, ou en tête de la colonne de côté sur un écran bas ; sur petit écran, `center` prend la place du titre
  const header = (center?: ReactNode) => (
    <header className="table-top">
      <button className="btn btn-ghost btn-icon" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
        <Icon name="menu" />
      </button>
      {center ?? (
        <div className="table-title">
          <span className="table-code">{room.code}</span>
          <span className="hint">Bataille navale, {modeLabel.toLowerCase()}</span>
        </div>
      )}
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
              {!inTour && (
                <button className="menu-item" onClick={() => (setMenuOpen(false), onShowLobby())}>
                  <Icon name="users" size={18} /> Voir le salon et les règles
                </button>
              )}
              <button className="menu-item is-danger" onClick={onLeave}>
                <Icon name="door" size={18} /> {inTour ? "Quitter la tournée" : "Quitter la table"}
              </button>
              {room.you.isAdmin && (
                <ConfirmButton className="menu-item is-danger" confirm="Fermer la table pour tous ?" onConfirm={() => send({ t: "close" })}>
                  <Icon name="shield" size={18} /> Fermer la table (admin)
                </ConfirmButton>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </header>
  );

  const screen = { w, h, phone, short, header };

  return (
    <div className={`table-root felt naval-root ${compact ? "is-compact" : ""}`}>
      {mustPlace ? (
        <PlacementBoard room={room} g={g} me={me!} send={send} serverOffset={serverOffset} {...screen} />
      ) : (
        <Battle room={room} g={g} send={send} serverOffset={serverOffset} seat={seat} {...screen} />
      )}

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
  seat,
  w,
  h,
  phone,
  short,
  header,
}: {
  room: NavalRoomView;
  g: NavalView;
  send: (msg: NavalClientMessage) => void;
  serverOffset: number;
  seat: (id: string) => SeatView | undefined;
  w: number;
  h: number;
  phone: boolean;
  short: boolean;
  header: (center?: ReactNode) => ReactNode;
}) {
  const me = g.you;
  const meP = me ? g.players.find((p) => p.id === me) : undefined;
  const ally = (id: string) => meP && (id === meP.id || (meP.team !== null && g.players.find((p) => p.id === id)?.team === meP.team));
  // Chacun voit ses adversaires dans son ordre à lui : le premier de la liste n'est pas le même pour tout le monde
  const rank = (id: string) => {
    const i = g.order?.indexOf(id) ?? -1;
    return i < 0 ? g.players.length : i;
  };
  const enemies = g.players.filter((p) => !ally(p.id)).sort((a, b) => rank(a.id) - rank(b.id));
  const myTurn = g.phase === "battle" && g.turn === me && me !== null;
  const [targetId, setTargetId] = useState<string | null>(null);
  // La règle de la table : à son tour, on ne peut viser que les flottes permises
  const allowed = myTurn ? (g.allowed ?? null) : null;
  const canAim = (id: string, out: boolean) => !out && (!allowed || allowed.includes(id));
  const target = enemies.find((p) => p.id === targetId && canAim(p.id, p.out)) ?? enemies.find((p) => canAim(p.id, p.out)) ?? enemies[0];
  // Le plateau qu'on regarde pendant que les autres tirent, à part celui qu'on a choisi pour soi
  const [watch, setWatch] = useState<string | null>(null);
  const shown = enemies.find((p) => p.id === watch) ?? target;
  const targetBoard = shown ? g.boards.find((b) => b.owner === shown.id)! : null;
  const myBoard = me ? g.boards.find((b) => b.owner === me) : undefined;
  const mate = meP && meP.team !== null ? g.players.find((p) => p.id !== meP.id && p.team === meP.team) : undefined;
  const mateBoard = mate ? g.boards.find((b) => b.owner === mate.id) : undefined;
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

  // On suit la bataille : le plateau montré est celui que le tireur vise, sa propre flotte seulement si c'est elle
  // qu'on attaque. Un tir qui part se montre tout de suite ; pour le reste, on laisse d'abord voir l'obus tomber.
  const [view, setView] = useState<"radar" | "fleet">("radar");
  const lastShot = useNavalFx((s) => s.last);
  const watchUntil = useRef(0);
  const lookAt = (id: string | null) => {
    if (id !== null && !ally(id)) {
      setWatch(id);
      setView("radar");
    } else {
      setWatch(null);
      setView(id === null ? "radar" : "fleet");
    }
  };
  useEffect(() => {
    if (!lastShot) return;
    watchUntil.current = lastShot.until;
    if (lastShot.by !== me) lookAt(lastShot.target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastShot?.id]);
  useEffect(() => {
    if (g.phase === "placement") return;
    const others = g.phase === "battle" && g.turn !== me;
    // On ne sait pas encore ce qu'il vise : on reste où on est
    if (others && !g.aim) return;
    const t = setTimeout(() => lookAt(others ? g.aim : null), Math.max(0, watchUntil.current - performance.now()));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, g.turn, g.turnId, g.aim, g.phase]);
  const showRadar = !phone || !me || view === "radar";
  const showFleet = !phone || view === "fleet";

  const size = g.settings.grid;
  const shotOn = (b: NavalBoardView) => new Set([...b.misses, ...b.hits]);
  const canFire = myTurn && sentFor !== g.turnId && target && !target.out && targetBoard && shown?.id === target.id;

  // À son tour, on annonce la flotte qu'on vise
  useEffect(() => {
    if (myTurn && !mySeat?.autoplay && target && !target.out && g.aim !== target.id) send({ t: "aim", target: target.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTurn, g.turnId, target?.id, g.aim, mySeat?.autoplay]);

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
    const only = allowed?.length === 1 ? (seat(allowed[0]!)?.name ?? "?") : null;
    const rule = g.settings.targeting ?? "free";
    if (enemies.filter((p) => !p.out).length <= 1) status = `À toi de tirer${shots} !`;
    else if (rule === "random") status = `Le sort désigne ${only ?? "une flotte"} : à toi de tirer${shots} !`;
    else if (rule === "leader")
      status = only
        ? `À toi de tirer sur ${only}, la plus grosse flotte${shots} !`
        : `À toi de tirer${shots} : vise une des plus grosses flottes.`;
    else status = `À toi de tirer${shots} : choisis ta cible.`;
  } else if (meP?.out)
    status =
      mate && !mate.out
        ? `Ta flotte est au fond : ${seat(mate.id)?.name ?? "ton équipier"} continue seul.`
        : "Ta flotte est au fond. Tu regardes la fin de la bataille.";
  else {
    // Qui il vise, dès qu'on le sait (à deux, c'est forcément toi)
    const aimed = g.mode === "duel" || !g.aim ? null : g.aim === me ? "ta flotte" : (seat(g.aim)?.name ?? null);
    status = aimed
      ? `${turnSeat?.name ?? "?"} vise ${aimed}${awayTurnNote(turnSeat, turnLeft)}`
      : `Au tour de ${turnSeat?.name ?? "?"}${awayTurnNote(turnSeat, turnLeft)}`;
  }

  const arsenal = meP?.arsenal ?? [];
  const counts = (["radar", "torpedo", "barrage"] as Weapon[]).map((k) => ({ k, n: arsenal.filter((a) => a === k).length }));

  // Le plateau prend exactement ce qui reste une fois posé tout le reste : jamais rien à faire défiler
  const compact = phone || short;
  const [fitRef, box] = useBoxSize<HTMLDivElement>();
  const frame = compact ? 12 : 20;
  const widthForRadar = !short ? (phone ? box.w : (w - 68) / 1.62) : phone ? w - SIDE_MIN - 36 : (w - SIDE_MIN - 60) / 1.62;
  const radarPx = Math.max(0, Math.floor(Math.min(phone ? 520 : 600, box.h - frame, widthForRadar - frame)));
  const withMate = Boolean(mateBoard && mate);
  // Sur grand écran, la flotte se règle sur l'écran et pas sur le radar : sa largeur décide si les cibles passent à la ligne,
  // donc de la place du radar, et les deux se seraient renvoyé la balle sans fin
  const desktopFleet = Math.round(Math.max(200, Math.min(600, h - 262, (w - 68) / 1.62)) * 0.62);
  const fleets = phone
    ? stackFleets(short ? radarPx + frame : box.w, box.h, withMate)
    : short
      ? stackFleets(Math.min(Math.round(radarPx * 0.62), w - SIDE_MIN - radarPx - frame - 48), box.h - MATE_HEAD, withMate)
      : { mine: Math.round(desktopFleet * (withMate ? 0.8 : 1)), mate: Math.round(desktopFleet * 0.5) };

  const statusBar = (
    <div className={`naval-status ${myTurn ? "is-turn" : ""} ${!myTurn && g.aim === me && me !== null ? "is-aimed" : ""}`}>
      {myTurn && room.turnDeadline && (
        <span className="naval-timer">
          <TimerRing size={30} deadline={room.turnDeadline} total={g.settings.turnSeconds} offset={serverOffset} />
        </span>
      )}
      <span className="naval-status-text">{compact && weapon && showRadar ? WEAPONS[weapon].help : status}</span>
      {g.phase === "placement" && placementLeft !== null && <span className="placement-clock num">{formatClock(placementLeft)}</span>}
      {mySeat?.autoplay && (
        <button className="btn btn-sm" onClick={() => send({ t: "takeBack" })}>
          Reprendre la barre
        </button>
      )}
    </div>
  );

  // Sur petit écran, la bascule Radar / Ta flotte prend la place du titre dans l'en-tête
  const viewSwitch =
    phone && me ? (
      <div className="options naval-view" role="radiogroup" aria-label="Plateau affiché">
        <button type="button" aria-pressed={view === "radar"} onClick={() => setView("radar")}>
          Radar
        </button>
        <button type="button" aria-pressed={view === "fleet"} onClick={() => setView("fleet")}>
          Ta flotte
          <FleetPips total={FLEETS[size].length} afloat={myBoard?.afloat ?? 0} />
        </button>
      </div>
    ) : undefined;

  const targets =
    enemies.length > 1 || !me ? (
      <div
        className="naval-targets"
        role="tablist"
        aria-label="Choisir la flotte visée"
        style={{ "--per-row": enemies.length === 4 ? 2 : Math.min(3, enemies.length), "--count": enemies.length } as CSSProperties}
      >
        {enemies.map((p) => {
          const s = seat(p.id);
          const b = g.boards.find((x) => x.owner === p.id)!;
          const active = shown?.id === p.id;
          const locked = Boolean(allowed && !allowed.includes(p.id) && !p.out);
          const aimed = g.aim === p.id && !p.out && !myTurn;
          return (
            <button
              key={p.id}
              role="tab"
              aria-selected={active}
              className={`naval-target-tab ${active ? "is-active" : ""} ${p.out ? "is-out" : ""} ${g.turn === p.id ? "is-turn" : ""} ${
                locked ? "is-locked" : ""
              } ${aimed ? "is-aimed" : ""}`}
              onClick={() => {
                setTargetId(p.id);
                setWatch(null);
              }}
              disabled={(p.out && !active) || locked}
            >
              {s && <Avatar avatar={s.avatar} userId={s.userId} photo={s.photo} size={compact ? 24 : 28} />}
              <span className="naval-target-who">
                <span className="naval-target-name">{s?.name}</span>
                {s && <AwayNote seat={s} serverOffset={serverOffset} compact />}
                <FleetPips total={FLEETS[size].length} afloat={b.afloat} />
              </span>
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
    );

  const radar = targetBoard && radarPx > 0 && (
    <div className={`naval-scope ${canFire ? "is-armed" : ""}`} hidden={!showRadar}>
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
  );

  const showWeapons = g.settings.arsenal && me && g.phase !== "gameOver" && showRadar;
  // Sur petit écran, cette rangée existe toujours : c'est elle qui fait la place au bouton des réactions
  const arsenalRow = (showWeapons || (compact && me)) && (
    <div className="naval-arsenal">
      {showWeapons &&
        (arsenal.length === 0 ? (
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
              <button
                type="button"
                className="weapon-btn weapon-dir"
                title="Changer de sens"
                onClick={() => setDir(dir === "h" ? "v" : "h")}
              >
                <span className="weapon-dir-arrow" aria-hidden="true">
                  {dir === "h" ? "↔" : "↕"}
                </span>
                <span>{dir === "h" ? "Ligne" : "Colonne"}</span>
              </button>
            )}
            {weapon && !compact && <p className="hint weapon-help">{WEAPONS[weapon].help}</p>}
          </>
        ))}
    </div>
  );

  const fleet = myBoard && showFleet && fleets.mine > 0 && (
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
      <Board board={myBoard} mode="sea" px={fleets.mine} label="Ta flotte" skin={seat(myBoard.owner)?.skin} />
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
            px={fleets.mate}
            label={`Flotte de ${seat(mate.id)?.name ?? "ton équipier"}`}
            skin={seat(mate.id)?.skin}
          />
        </>
      )}
    </div>
  );

  // Écran bas : la grille d'un côté, tout le reste de l'autre
  if (short) {
    return (
      <main className="naval-stage is-compact">
        <section className="naval-battle is-compact is-short">
          <div className="naval-side">
            {header(viewSwitch)}
            {statusBar}
            {showRadar && targets}
            {arsenalRow}
          </div>
          {!phone && fleet}
          <div className="naval-fit" ref={fitRef} style={{ width: radarPx + frame }}>
            {radar}
            {phone && fleet}
          </div>
        </section>
      </main>
    );
  }

  // Téléphone debout : de haut en bas, avec la grille sur tout ce qui reste
  if (phone) {
    return (
      <>
        {header(viewSwitch)}
        <main className="naval-stage is-compact">
          <section className="naval-battle is-compact is-portrait">
            {statusBar}
            {showRadar && targets}
            <div className="naval-fit" ref={fitRef}>
              {radar}
              {fleet}
            </div>
            {arsenalRow}
          </section>
        </main>
      </>
    );
  }

  return (
    <>
      {header()}
      <main className="naval-stage">
        <section className="naval-battle">
          {statusBar}
          <div className="naval-boards">
            <div className="naval-target">
              {targets}
              <div className="naval-fit" ref={fitRef}>
                {radar}
              </div>
              {arsenalRow}
            </div>
            {fleet}
          </div>
        </section>
      </main>
    </>
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
