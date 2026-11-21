import { CAMO_BY_ID, CAMOS, type CamoId } from "../../shared/games/escarmouche/camos.ts";
import { UNIFORM_BY_ID, UNIFORMS, type UniformId } from "../../shared/games/escarmouche/uniforms.ts";
import { MAP_IDS, MAP_NAMES, type MapId } from "../../shared/games/escarmouche/maps.ts";
import {
  ARSENAL_NAMES,
  DEFAULT_SETTINGS,
  goalOf,
  MINUTE_CHOICES,
  MODE_INFO,
  MODES,
  type Arsenal,
  type BotLevel,
  type EscarmoucheSettings,
  type Mode,
} from "../../shared/games/escarmouche/rules.ts";
import {
  PRIMARY_IDS,
  SECONDARY_IDS,
  WEAPONS,
  type PrimaryId,
  type SecondaryId,
  type WeaponId,
  EXTRA_BY_ID,
  EXTRAS,
  MUZZLE_BY_ID,
  MUZZLES,
  type ExtraId,
  type MuzzleId,
} from "../../shared/games/escarmouche/weapons.ts";
import { TABLE_TEAMS } from "../../shared/games/teams.ts";
import { ESCARMOUCHE_MAX_PLAYERS, type EscarmoucheClientMessage, type EscarmoucheRoomView } from "../../shared/protocol.ts";
import { applyDrawnRules } from "../../shared/randomRules.ts";
import { attachmentItem, camoItem, uniformItem, weaponItem } from "../../shared/shop.ts";
import { toast } from "../lib/toast.ts";
import { Avatar } from "../components/Avatar.tsx";
import { Check, Options } from "../components/ui.tsx";
import { drawLock, RandomRulesField, tableDraw } from "../game/RandomRules.tsx";
import { TableLobby, TableSize } from "../game/TableLobby.tsx";
import { usePrefs } from "../stores/prefs.ts";
import { useMyItems } from "../stores/shop.ts";
import { lazy, Suspense } from "react";
import { AttachmentIcon, CamoSwatch, TenueSwatch, WeaponBars, WeaponIcon } from "./WeaponIcon.tsx";

const EscPreview3D = lazy(() => import("./EscPreview3D.tsx"));

const BOT_HINTS: Record<BotLevel, string> = {
  facile: "Lents à réagir, ils visent large et oublient vite où tu es : idéal pour découvrir.",
  moyen: "Ils tirent par courtes rafales et te cherchent un peu : reste à couvert.",
  fort: "Ils visent bien, parfois la tête, et te traquent : à découvert, on ne tient pas longtemps.",
};

export const TEAM_NAMES = [TABLE_TEAMS[0].name, TABLE_TEAMS[1].name] as const;
export const TEAM_COLORS = [TABLE_TEAMS[0].color, TABLE_TEAMS[1].color] as const;

interface Props {
  room: EscarmoucheRoomView;
  send: (msg: EscarmoucheClientMessage) => void;
  unread: number;
  onOpenChat: () => void;
  onLeave: () => void;
  onBackToGame?: () => void;
}

function WeaponCard({
  id,
  on,
  locked,
  camo,
  disabled,
  onPick,
}: {
  id: WeaponId;
  on: boolean;
  locked: boolean;
  camo: CamoId;
  disabled: boolean;
  onPick: () => void;
}) {
  const w = WEAPONS[id];
  return (
    <button
      className={`esc-weapon ${on ? "is-on" : ""} ${locked ? "is-locked" : ""}`}
      disabled={disabled}
      onClick={onPick}
      aria-pressed={on}
      title={locked ? `${w.name} : ${w.price} points à la boutique` : w.blurb}
    >
      <WeaponIcon weapon={id} camo={camo} />
      <strong>{w.name}</strong>
      <WeaponBars weapon={id} />
      <small>{w.blurb}</small>
      {locked && <span className="esc-lock">Boutique · {w.price} pts</span>}
    </button>
  );
}

/** Les armes, la tenue et le camouflage de son soldat : ce qu'il emporte à chaque retour au combat */
export function ArsenalPanel({ room, send }: { room: EscarmoucheRoomView; send: (msg: EscarmoucheClientMessage) => void }) {
  const seatId = room.you.seatId;
  const mine = seatId ? room.arsenal[seatId] : undefined;
  const { has } = useMyItems();
  const setPrefs = usePrefs((p) => p.set);
  const forced = room.settings.escarmouche.arsenal !== "libre" ? room.settings.escarmouche.arsenal : null;
  if (!seatId || !mine) return null;
  const locked = (item: string, name: string, price: number) => {
    if (has(item)) return false;
    toast({ title: `${name} se débloque à la boutique`, body: `${price} points, avec ceux gagnés en jouant.`, duration: 3200 });
    return true;
  };
  const pickPrimary = (primary: PrimaryId) => {
    if (locked(weaponItem(primary), WEAPONS[primary].name, WEAPONS[primary].price)) return;
    setPrefs({ escarmouchePrimary: primary });
    send({ t: "arsenal", primary });
  };
  const pickSecondary = (secondary: SecondaryId) => {
    if (locked(weaponItem(secondary), WEAPONS[secondary].name, WEAPONS[secondary].price)) return;
    setPrefs({ escarmoucheSecondary: secondary });
    send({ t: "arsenal", secondary });
  };
  const pickMuzzle = (muzzle: MuzzleId) => {
    const a = MUZZLE_BY_ID.get(muzzle)!;
    if (locked(attachmentItem(muzzle), a.name, a.price)) return;
    setPrefs({ escarmoucheMuzzle: muzzle });
    send({ t: "arsenal", muzzle });
  };
  const pickExtra = (extra: ExtraId) => {
    const a = EXTRA_BY_ID.get(extra)!;
    if (locked(attachmentItem(extra), a.name, a.price)) return;
    setPrefs({ escarmoucheExtra: extra });
    send({ t: "arsenal", extra });
  };
  const pickCamo = (camo: CamoId) => {
    const c = CAMO_BY_ID.get(camo)!;
    if (locked(camoItem(camo), `Le camouflage ${c.name}`, c.price)) return;
    setPrefs({ escarmoucheCamo: camo });
    send({ t: "arsenal", camo });
  };
  const pickTenue = (tenue: UniformId) => {
    const u = UNIFORM_BY_ID.get(tenue)!;
    if (locked(uniformItem(tenue), `La tenue ${u.name}`, u.price)) return;
    setPrefs({ escarmoucheTenue: tenue });
    send({ t: "arsenal", tenue });
  };
  return (
    <section className="lobby-section panel esc-arsenal" aria-label="Ton arsenal">
      <h2>
        Ton arsenal <span className="hint">une grenade et le couteau en plus</span>
      </h2>
      {forced && (
        <p className="hint">Pour cette partie, tout le monde a la même arme : {ARSENAL_NAMES[forced as Arsenal].toLowerCase()}.</p>
      )}
      <div className="esc-soldier-preview">
        <Suspense fallback={<TenueSwatch tenue={mine.tenue} size={120} />}>
          <EscPreview3D
            tenue={mine.tenue}
            weapon={mine.primary}
            camo={mine.camo}
            gear={{ muzzle: mine.muzzle, extra: mine.extra }}
            width={200}
            height={250}
          />
        </Suspense>
      </div>
      <h3 className="esc-camo-title">Arme principale</h3>
      <div className="esc-weapons">
        {PRIMARY_IDS.map((id) => (
          <WeaponCard
            key={id}
            id={id}
            on={mine.primary === id}
            locked={!has(weaponItem(id))}
            camo={mine.camo}
            disabled={forced !== null}
            onPick={() => pickPrimary(id)}
          />
        ))}
      </div>
      <h3 className="esc-camo-title">Accessoires de l'arme principale</h3>
      <div className="esc-camos">
        {MUZZLES.map((a) => {
          const owned = has(attachmentItem(a.id));
          return (
            <button
              key={a.id}
              className={`esc-camo ${mine.muzzle === a.id ? "is-on" : ""} ${owned ? "" : "is-locked"}`}
              onClick={() => pickMuzzle(a.id)}
              title={owned ? a.blurb : `${a.name} : ${a.price} points à la boutique`}
              aria-pressed={mine.muzzle === a.id}
            >
              <AttachmentIcon id={a.id} />
              <span>{a.name}</span>
              {!owned && <small>{a.price} pts</small>}
            </button>
          );
        })}
        {EXTRAS.map((a) => {
          const owned = has(attachmentItem(a.id));
          return (
            <button
              key={`x-${a.id}`}
              className={`esc-camo ${mine.extra === a.id ? "is-on" : ""} ${owned ? "" : "is-locked"}`}
              onClick={() => pickExtra(a.id)}
              title={owned ? a.blurb : `${a.name} : ${a.price} points à la boutique`}
              aria-pressed={mine.extra === a.id}
            >
              <AttachmentIcon id={a.id} />
              <span>{a.name}</span>
              {!owned && <small>{a.price} pts</small>}
            </button>
          );
        })}
      </div>
      <h3 className="esc-camo-title">Arme de poing</h3>
      <div className="esc-weapons is-small">
        {SECONDARY_IDS.map((id) => (
          <WeaponCard
            key={id}
            id={id}
            on={mine.secondary === id}
            locked={!has(weaponItem(id))}
            camo={mine.camo}
            disabled={forced === "pistolet"}
            onPick={() => pickSecondary(id)}
          />
        ))}
      </div>
      <h3 className="esc-camo-title">Tenue</h3>
      <div className="esc-camos">
        {UNIFORMS.map((u) => {
          const owned = has(uniformItem(u.id));
          return (
            <button
              key={u.id}
              className={`esc-camo is-tenue ${mine.tenue === u.id ? "is-on" : ""} ${owned ? "" : "is-locked"}`}
              onClick={() => pickTenue(u.id)}
              title={owned ? u.blurb : `${u.name} : ${u.price} points à la boutique`}
              aria-pressed={mine.tenue === u.id}
            >
              <TenueSwatch tenue={u.id} />
              <span>{u.name}</span>
              {!owned && <small>{u.price} pts</small>}
            </button>
          );
        })}
      </div>
      <h3 className="esc-camo-title">Camouflage des armes</h3>
      <div className="esc-camos">
        {CAMOS.map((c) => {
          const owned = has(camoItem(c.id));
          return (
            <button
              key={c.id}
              className={`esc-camo ${mine.camo === c.id ? "is-on" : ""} ${owned ? "" : "is-locked"}`}
              onClick={() => pickCamo(c.id)}
              title={owned ? c.blurb : `${c.name} : ${c.price} points à la boutique`}
              aria-pressed={mine.camo === c.id}
            >
              <CamoSwatch camo={c.id} />
              <span>{c.name}</span>
              {!owned && <small>{c.price} pts</small>}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** Les deux camps : chacun choisit le sien, l'hôte peut placer les bots */
function TeamsSection({ room, send }: { room: EscarmoucheRoomView; send: (msg: EscarmoucheClientMessage) => void }) {
  const me = room.you.seatId;
  const crews = [0, 1].map((t) => room.seats.filter((s) => (room.teams[s.id] ?? 0) === t));
  return (
    <section
      className="lobby-section panel teams-panel"
      aria-label="Les équipes"
      style={{ ["--team-a" as string]: TEAM_COLORS[0], ["--team-b" as string]: TEAM_COLORS[1] }}
    >
      <h2>
        Les équipes <span className="hint">un camp de chaque côté de la carte</span>
      </h2>
      <div className="teams-grid">
        {([0, 1] as const).map((t) => (
          <div key={t} className={`team-col ${t === 0 ? "is-a" : "is-b"}`}>
            <h3 className="team-name">{TEAM_NAMES[t]}</h3>
            <ul className="team-crew">
              {crews[t]!.map((seat) => (
                <li key={seat.id}>
                  <Avatar avatar={seat.avatar} userId={seat.userId} photo={seat.photo} size={30} />
                  <span className="team-member">
                    {seat.name}
                    {seat.id === me && <span className="hint"> (toi)</span>}
                  </span>
                  {room.you.isHost && seat.id !== me && (
                    <button
                      className="btn btn-ghost btn-sm team-move"
                      onClick={() => send({ t: "team", seatId: seat.id, team: t === 0 ? 1 : 0 })}
                      aria-label={`Envoyer ${seat.name} chez les ${TEAM_NAMES[t === 0 ? 1 : 0]}`}
                    >
                      <span className="arrow-side">{t === 0 ? "→" : "←"}</span>
                      <span className="arrow-stack">{t === 0 ? "↓" : "↑"}</span>
                    </button>
                  )}
                </li>
              ))}
              {crews[t]!.length === 0 && (
                <li className="is-empty">
                  <span className="team-empty-mark" />
                  personne pour l'instant
                </li>
              )}
            </ul>
            {me && (room.teams[me] ?? 0) !== t && (
              <button className="btn btn-sm btn-block" onClick={() => send({ t: "team", team: t })}>
                Passer chez les {TEAM_NAMES[t]}
              </button>
            )}
          </div>
        ))}
      </div>
      {crews.some((c) => c.length === 0) && (
        <p className="hint teams-warning">Chaque camp doit avoir au moins un soldat : ajoute un bot.</p>
      )}
    </section>
  );
}

/** Ce que font les touches, au clavier et au doigt */
export function HowTo() {
  return (
    <div className="esc-howto">
      <p>
        <strong>Élimine tes adversaires sans te faire avoir.</strong> Ta santé revient quand tu restes à l'abri quelques secondes. Après une
        élimination, tu reviens au combat au bout de quatre secondes, avec l'arme de ton choix.
      </p>
      <p className="hint">
        Au clavier : <kbd>Z</kbd> <kbd>Q</kbd> <kbd>S</kbd> <kbd>D</kbd> (ou les flèches) pour avancer, la souris pour viser, clic gauche
        pour tirer, clic droit pour viser à l'épaule, <kbd>Maj</kbd> pour courir, <kbd>Ctrl</kbd> ou <kbd>C</kbd> pour s'accroupir,{" "}
        <kbd>Espace</kbd> pour sauter, <kbd>R</kbd> pour recharger, <kbd>A</kbd> ou la molette pour changer d'arme, <kbd>G</kbd> pour la
        grenade, <kbd>V</kbd> pour le couteau, <kbd>Tab</kbd> pour le tableau des scores. Clique dans le jeu pour prendre la souris,{" "}
        <kbd>Échap</kbd> pour la rendre.
      </p>
      <p className="hint">
        En pleine course, s'accroupir lance une glissade. Sauter en avançant devant un muret, une caisse ou un quai fait se hisser dessus. À
        la lunette, <kbd>Maj</kbd> retient son souffle pour que la visée ne bouge plus. <kbd>E</kbd> (ou le clic de la molette) repère
        l'ennemi visé pour ton équipe. Trois éliminations d'affilée te donnent les jumelles (tous les ennemis repérés), cinq un tir de
        mortier. Les bidons rouges sautent quand on tire dessus. En équipe, accroupis-toi près d'un coéquipier tombé (la croix verte) pour
        le relever ; une fois tombé, tu peux choisir de revenir auprès d'un coéquipier plutôt qu'à la base. Au silencieux, tu n'apparais
        plus au radar de l'ennemi quand tu tires.
      </p>
      <p className="hint">
        Au téléphone, couché : le pouce gauche se pose n'importe où à gauche pour avancer, le pouce droit glisse sur l'écran pour tourner la
        vue. Les boutons sont sous le pouce droit. Une petite aide à la visée t'accompagne au doigt.
      </p>
    </div>
  );
}

/** Comment jouer : le but du mode choisi, puis les touches et les gestes du combat */
function EscarmoucheHelp({ mode, hardcore }: { mode: Mode; hardcore: boolean }) {
  const info = MODE_INFO[mode];
  return (
    <div className="lobby-help">
      <h2>Comment jouer</h2>
      <p>
        <strong>Le but ({info.name}) :</strong> {info.blurb}
      </p>
      {hardcore && <p>Sans filet : pas de réticule, pas de santé qui revient, et des balles qui font plus mal.</p>}
      <HowTo />
    </div>
  );
}

/** Le salon d'une table d'Escarmouche : le salon commun, l'arsenal de chacun et les règles de la partie. */
export function EscarmoucheLobby({ room, send, ...rest }: Props) {
  const s = applyDrawnRules("escarmouche", { ...DEFAULT_SETTINGS, ...room.settings.escarmouche }, DEFAULT_SETTINGS, tableDraw(room));
  const locked = drawLock(room, "escarmouche");
  const isHost = room.you.isHost;
  const update = (patch: Partial<EscarmoucheSettings>) => send({ t: "settings", settings: patch });
  const info = MODE_INFO[s.mode];
  const empty = info.teams && [0, 1].some((t) => !room.seats.some((x) => (room.teams[x.id] ?? 0) === t));
  // L'arsenal n'existe que pour un soldat assis : sinon, pas d'onglet « Mon look »
  const armed = room.you.seatId !== null && Boolean(room.arsenal[room.you.seatId]);

  const summary = [
    info.name,
    s.map === "hasard" ? "carte au hasard" : MAP_NAMES[s.map].name,
    `${s.minutes} min ou ${goalOf(s)} ${info.unit}`,
    s.arsenal !== "libre" ? ARSENAL_NAMES[s.arsenal].toLowerCase() : null,
    s.hardcore ? "sans filet" : null,
    s.night ? "de nuit" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <TableLobby
      room={room}
      send={send}
      {...rest}
      shareTitle="Viens te battre sur Escarmouche"
      startLabel="Au combat !"
      hostWillStart="va lancer le combat"
      canStart={room.seats.length >= 2 && !empty}
      startHint={
        room.seats.length < 2 ? "Il faut au moins deux soldats : ajoute un bot !" : empty ? "Chaque camp doit avoir un soldat." : undefined
      }
      seatNote={(seat) => {
        const a = room.arsenal[seat.id];
        const team = info.teams ? `${TEAM_NAMES[room.teams[seat.id] ?? 0]} · ` : "";
        return a ? `${team}${WEAPONS[a.primary].name}` : null;
      }}
      // Les camps restent sous les joueurs : chacun y choisit le sien
      aside={info.teams ? <TeamsSection room={room} send={send} /> : undefined}
      summary={summary}
      rules={
        <>
          <RandomRulesField room={room} game="escarmouche" send={send} />

          <div className="field">
            <span className="field-label">Mode</span>
            <Options<Mode>
              label="Mode"
              value={s.mode}
              disabled={!isHost}
              onChange={(mode) => update({ mode })}
              options={MODES.map((m) => ({ value: m, label: MODE_INFO[m].short }))}
            />
            <p className="hint" style={{ margin: 0 }}>
              {info.blurb}
            </p>
          </div>

          <div className="field">
            <span className="field-label">Carte</span>
            <Options<MapId | "hasard">
              label="Carte"
              value={s.map}
              disabled={!isHost}
              onChange={(map) => update({ map })}
              options={[{ value: "hasard", label: "Au hasard" }, ...MAP_IDS.map((id) => ({ value: id, label: MAP_NAMES[id].name }))]}
            />
            <p className="hint" style={{ margin: 0 }}>
              {s.map === "hasard" ? "Une carte tirée au sort à chaque partie." : MAP_NAMES[s.map].blurb}
            </p>
          </div>

          <div className="field">
            <span className="field-label">Durée et score</span>
            <Options<number>
              label="Durée"
              value={s.minutes}
              disabled={!isHost}
              onChange={(minutes) => update({ minutes })}
              options={MINUTE_CHOICES.map((n) => ({ value: n, label: `${n} min` }))}
            />
            <Options<number>
              label="Score à atteindre"
              value={s.goal}
              disabled={!isHost}
              onChange={(goal) => update({ goal })}
              options={info.goals.map((g, i) => ({ value: i, label: `${g} ${info.unit}` }))}
            />
            <p className="hint" style={{ margin: 0 }}>
              La partie s'arrête au premier des deux : la fin du temps, ou le score atteint.
            </p>
          </div>
        </>
      }
      moreRules={
        <>
          <div className="field">
            <span className="field-label">Armes</span>
            <Options<Arsenal>
              label="Armes"
              value={s.arsenal}
              disabled={!isHost || locked("arsenal")}
              onChange={(arsenal) => update({ arsenal })}
              options={(["libre", "precision", "pompe", "pistolet"] as const).map((a) => ({ value: a, label: ARSENAL_NAMES[a] }))}
            />
            <div className="rule-list">
              <div
                className={`rule-row ${locked("hardcore") ? "is-forced" : ""}`}
                onClick={() => isHost && !locked("hardcore") && update({ hardcore: !s.hardcore })}
              >
                <Check label="Sans filet" checked={s.hardcore} disabled={!isHost || locked("hardcore")} onChange={() => {}} />
                <span>
                  <strong>Sans filet</strong>
                  <span className="hint">Pas de réticule, pas de santé qui revient, et des balles qui font plus mal.</span>
                </span>
              </div>
              <div
                className={`rule-row ${locked("night") ? "is-forced" : ""}`}
                onClick={() => isHost && !locked("night") && update({ night: !s.night })}
              >
                <Check label="De nuit" checked={Boolean(s.night)} disabled={!isHost || locked("night")} onChange={() => {}} />
                <span>
                  <strong>De nuit</strong>
                  <span className="hint">
                    La lune et les lampadaires pour seule lumière : les éclairs des tirs se voient de loin, les bots voient moins bien.
                  </span>
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

          <TableSize room={room} send={send} max={ESCARMOUCHE_MAX_PLAYERS} />
        </>
      }
      look={armed && <ArsenalPanel room={room} send={send} />}
      help={<EscarmoucheHelp mode={s.mode} hardcore={s.hardcore} />}
    />
  );
}
