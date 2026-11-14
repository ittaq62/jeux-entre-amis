import { useMemo, useState } from "react";
import { BALLS, FETES, type BallId, type FeteId } from "../../shared/games/crampons/boutique.ts";
import { CLUBS, FORMATION_NAMES, isLegend, type Club, type FormationId } from "../../shared/games/crampons/clubs.ts";
import {
  HALF_CHOICES,
  LEVEL_NAMES,
  SIDE_CHOICES,
  type Ambience,
  type CramponsConfig,
  type WeatherId,
} from "../../shared/games/crampons/view.ts";
import { CRAMPONS_MAX_PLAYERS, type CramponsClientMessage, type CramponsRoomView } from "../../shared/protocol.ts";
import { ballItem, clubItem, feteItem, SHOP_BY_ID, type ShopItem } from "../../shared/shop.ts";
import { Icon } from "../components/Icon.tsx";
import { Check, Options } from "../components/ui.tsx";
import { RulesHeading, TableLobby, TableSize } from "../game/TableLobby.tsx";
import { BuyModal } from "../shop/BuyModal.tsx";
import { usePrefs } from "../stores/prefs.ts";
import { useMyItems } from "../stores/shop.ts";
import { CramponsLook } from "./CramponsLook.tsx";
import { ballThumbnail } from "./scene/balls.ts";

const LEVEL_HINTS = [
  "L'ordinateur lit mal le jeu et rate ses passes : pour découvrir.",
  "Il joue simplement, sans presser très fort.",
  "Il presse, coupe les passes et ne pardonne pas les erreurs.",
  "Tout va vite, il lit tout : bon courage.",
];

const clubBy = (id: string): Club => CLUBS.find((c) => c.id === id) ?? CLUBS[0]!;
const REGULAR = CLUBS.filter((c) => !isLegend(c));
const LEGENDS = CLUBS.filter(isLegend);
const points = (n: number) => `${n} point${n > 1 ? "s" : ""}`;

function ClubPicker({
  label,
  value,
  formation,
  disabled,
  owns,
  onClub,
  onFormation,
}: {
  label: string;
  value: string;
  formation: FormationId;
  disabled: boolean;
  /** Ce club de légende est-il débloqué (pour l'hôte, qui choisit) ? */
  owns: (club: Club) => boolean;
  onClub: (id: string) => void;
  onFormation: (id: FormationId) => void;
}) {
  const club = clubBy(value);
  return (
    <div className="field">
      <label className="field-label" htmlFor={`club-${label}`}>
        {label}
      </label>
      <div className="cr-club">
        <span
          className="cr-crest"
          style={{ background: club.home.shirt, color: club.home.sleeves !== club.home.shirt ? club.home.sleeves : club.home.shorts }}
        >
          {club.short}
        </span>
        <select id={`club-${label}`} className="input" value={value} disabled={disabled} onChange={(e) => onClub(e.target.value)}>
          {REGULAR.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.rating})
            </option>
          ))}
          <optgroup label="Clubs de légende">
            {LEGENDS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.rating}){owns(c) || c.id === value ? "" : ` · ${points(c.price ?? 0)}`}
              </option>
            ))}
          </optgroup>
        </select>
        <select
          className="input cr-form"
          aria-label={`Dispositif, ${label}`}
          value={formation}
          disabled={disabled}
          onChange={(e) => onFormation(e.target.value as FormationId)}
        >
          {(Object.keys(FORMATION_NAMES) as FormationId[]).map((f) => (
            <option key={f} value={f}>
              {FORMATION_NAMES[f]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/**
 * Le vestiaire de chacun : son ballon (qu'il est seul à voir) et la célébration de ses buts (que toute la table voit).
 * Ce qui est verrouillé s'achète sur place, avec ses points.
 */
function Locker({ onBuy }: { onBuy: (item: ShopItem) => void }) {
  const { balance, has } = useMyItems();
  const set = usePrefs((p) => p.set);
  const savedBall = usePrefs((p) => p.cramponsBall);
  const savedFete = usePrefs((p) => p.cramponsFete);
  const ball: BallId = savedBall && has(ballItem(savedBall)) ? savedBall : "classique";
  const fete: FeteId = savedFete && has(feteItem(savedFete)) ? savedFete : "maison";
  /** Ce qu'on regarde sans l'avoir encore */
  const [peekBall, setPeekBall] = useState<BallId | null>(null);
  const [peekFete, setPeekFete] = useState<FeteId | null>(null);
  const thumbs = useMemo(() => new Map(BALLS.map((b) => [b.id, ballThumbnail(b.id, 22)])), []);
  const shownBall = BALLS.find((b) => b.id === (peekBall ?? ball))!;
  const shownFete = FETES.find((f) => f.id === (peekFete ?? fete))!;
  const pickBall = (id: BallId) => {
    if (has(ballItem(id))) {
      setPeekBall(null);
      set({ cramponsBall: id });
    } else setPeekBall(id);
  };
  const pickFete = (id: FeteId) => {
    if (has(feteItem(id))) {
      setPeekFete(null);
      set({ cramponsFete: id });
    } else setPeekFete(id);
  };
  const ownedBalls = BALLS.filter((b) => has(ballItem(b.id))).length;
  const ownedFetes = FETES.filter((f) => has(feteItem(f.id))).length;
  return (
    <section className="lobby-section panel cr-locker">
      <div className="field">
        <span className="field-label">
          Ton ballon{" "}
          <small className="hint">
            {ownedBalls} sur {BALLS.length} · {points(balance)} à dépenser
          </small>
        </span>
        <div className="cr-balls">
          {BALLS.map((b) => {
            const open = has(ballItem(b.id));
            const label = open ? b.name : `${b.name} : ${points(b.price)}`;
            return (
              <button
                key={b.id}
                type="button"
                title={label}
                aria-label={label}
                aria-pressed={b.id === (peekBall ?? ball)}
                className={`cr-ball ${b.id === (peekBall ?? ball) ? "is-on" : ""} ${open ? "" : "is-locked"}`}
                onClick={() => pickBall(b.id)}
              >
                <img src={thumbs.get(b.id)} alt="" width={44} height={44} draggable={false} />
                {!open && (
                  <span className="cr-lock">
                    <Icon name="coin" size={12} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <p className="hint cr-pick-line">
          <span>
            <strong>{shownBall.name}</strong> · toi seul le vois
          </span>
          {!has(ballItem(shownBall.id)) && (
            <button type="button" className="btn btn-sm btn-primary" onClick={() => onBuy(SHOP_BY_ID.get(ballItem(shownBall.id))!)}>
              <Icon name="coin" size={15} /> {points(shownBall.price)}
            </button>
          )}
        </p>
      </div>
      <div className="field">
        <span className="field-label">
          Ta célébration{" "}
          <small className="hint">
            {ownedFetes} sur {FETES.length}
          </small>
        </span>
        <div className="cr-fetes">
          {FETES.map((f) => {
            const open = has(feteItem(f.id));
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={f.id === (peekFete ?? fete)}
                className={`cr-fete ${f.id === (peekFete ?? fete) ? "is-on" : ""} ${open ? "" : "is-locked"}`}
                onClick={() => pickFete(f.id)}
              >
                {f.name}
                {!open && (
                  <span className="cr-price num">
                    <Icon name="coin" size={12} /> {f.price}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <p className="hint cr-pick-line">
          <span>{shownFete.blurb}</span>
          {!has(feteItem(shownFete.id)) && (
            <button type="button" className="btn btn-sm btn-primary" onClick={() => onBuy(SHOP_BY_ID.get(feteItem(shownFete.id))!)}>
              <Icon name="coin" size={15} /> {points(shownFete.price)}
            </button>
          )}
        </p>
      </div>
    </section>
  );
}

interface Props {
  room: CramponsRoomView;
  send: (msg: CramponsClientMessage) => void;
  unread: number;
  onOpenChat: () => void;
  onLeave: () => void;
  onBackToGame?: () => void;
}

export function CramponsLobby({ room, send, unread, onOpenChat, onLeave, onBackToGame }: Props) {
  const s = room.settings.crampons;
  const isHost = room.you.isHost;
  const update = (settings: Partial<CramponsConfig>) => send({ t: "settings", settings });
  const mine = room.you.seatId ? room.teams[room.you.seatId] : undefined;
  const { has } = useMyItems();
  const set = usePrefs((p) => p.set);
  const [buying, setBuying] = useState<{ item: ShopItem; team?: 0 | 1 } | null>(null);
  const owns = (c: Club) => !isLegend(c) || has(clubItem(c.id));
  // Un club de légende pas encore débloqué : on propose de l'acheter, et il entre en jeu une fois à soi
  const chooseClub = (t: 0 | 1, id: string) => {
    if (owns(clubBy(id))) setClub(t, id);
    else setBuying({ item: SHOP_BY_ID.get(clubItem(id))!, team: t });
  };
  const bought = (item: ShopItem) => {
    if (item.kind === "club" && buying?.team !== undefined) setClub(buying.team, item.ref);
    if (item.kind === "ballon") set({ cramponsBall: item.ref as BallId });
    if (item.kind === "fete") set({ cramponsFete: item.ref as FeteId });
  };
  const setClub = (t: 0 | 1, id: string) => {
    const clubs: [string, string] = [...s.clubs];
    clubs[t] = id;
    const formations: [FormationId, FormationId] = [...s.formations];
    formations[t] = clubBy(id).formation;
    update({ clubs, formations });
  };
  const setFormation = (t: 0 | 1, f: FormationId) => {
    const formations: [FormationId, FormationId] = [...s.formations];
    formations[t] = f;
    update({ formations });
  };
  return (
    <TableLobby
      room={room}
      send={send}
      unread={unread}
      onOpenChat={onOpenChat}
      onLeave={onLeave}
      onBackToGame={onBackToGame}
      shareTitle="Viens jouer à Crampons"
      startLabel="Coup d'envoi"
      hostWillStart="va donner le coup d'envoi"
      canStart={room.seats.length >= 1}
      noBots
      seatNote={(seat) => `${clubBy(s.clubs[room.teams[seat.id] ?? 0]).name}`}
      aside={
        room.you.seatId ? (
          <>
            <section className="lobby-section panel field">
              <span className="field-label">Ton équipe</span>
              <Options<0 | 1>
                label="Ton équipe"
                value={mine ?? 0}
                onChange={(team) => send({ t: "team", team })}
                options={[
                  { value: 0, label: clubBy(s.clubs[0]).short },
                  { value: 1, label: clubBy(s.clubs[1]).short },
                ]}
              />
              <p className="hint" style={{ margin: 0 }}>
                L'ordinateur joue les postes laissés libres, et toute une équipe s'il n'y a personne dedans.
              </p>
            </section>
            <Locker onBuy={(item) => setBuying({ item })} />
          </>
        ) : null
      }
      rules={
        <>
          <section className="rules-sheet panel">
            <RulesHeading room={room} />
            <ClubPicker
              label="Domicile"
              value={s.clubs[0]}
              formation={s.formations[0]}
              disabled={!isHost}
              owns={owns}
              onClub={(id) => chooseClub(0, id)}
              onFormation={(f) => setFormation(0, f)}
            />
            <ClubPicker
              label="Extérieur"
              value={s.clubs[1]}
              formation={s.formations[1]}
              disabled={!isHost}
              owns={owns}
              onClub={(id) => chooseClub(1, id)}
              onFormation={(f) => setFormation(1, f)}
            />

            <div className="field">
              <span className="field-label">Durée d'une mi-temps</span>
              <Options<number>
                label="Durée d'une mi-temps"
                value={s.halfMinutes}
                disabled={!isHost}
                onChange={(halfMinutes) => update({ halfMinutes })}
                options={HALF_CHOICES.map((n) => ({ value: n, label: `${n} min` }))}
              />
            </div>

            <div className="field">
              <span className="field-label">Joueurs par équipe</span>
              <Options<number>
                label="Joueurs par équipe"
                value={s.side}
                disabled={!isHost}
                onChange={(side) => update({ side })}
                options={SIDE_CHOICES.map((n) => ({ value: n, label: `${n} contre ${n}` }))}
              />
            </div>

            <div className="field">
              <span className="field-label">Niveau de l'ordinateur</span>
              <Options<number>
                label="Niveau de l'ordinateur"
                value={s.level}
                disabled={!isHost}
                onChange={(level) => update({ level })}
                options={LEVEL_NAMES.map((name, value) => ({ value, label: name }))}
              />
              <p className="hint" style={{ margin: 0 }}>
                {LEVEL_HINTS[s.level]}
              </p>
            </div>

            <div className="field">
              <span className="field-label">En cas de match nul</span>
              <Options<CramponsConfig["draw"]>
                label="En cas de match nul"
                value={s.draw}
                disabled={!isHost}
                onChange={(draw) => update({ draw })}
                options={[
                  { value: "none", label: "Match nul" },
                  { value: "penalties", label: "Tirs au but" },
                  { value: "extra", label: "Prolongations" },
                ]}
              />
            </div>

            <div className="field">
              <span className="field-label">Ambiance</span>
              <Options<Ambience>
                label="Ambiance"
                value={s.ambience}
                disabled={!isHost}
                onChange={(ambience) => update({ ambience })}
                options={[
                  { value: "jour", label: "Plein jour" },
                  { value: "soir", label: "Coucher de soleil" },
                  { value: "nuit", label: "Nocturne" },
                ]}
              />
            </div>

            <div className="field">
              <span className="field-label">Météo</span>
              <Options<WeatherId>
                label="Météo"
                value={s.weather}
                disabled={!isHost}
                onChange={(weather) => update({ weather })}
                options={[
                  { value: "clair", label: "Dégagé" },
                  { value: "pluie", label: "Pluie" },
                  { value: "neige", label: "Neige" },
                ]}
              />
            </div>

            <div className="field">
              <span className="field-label">Règles</span>
              <div className="rule-list">
                <div className="rule-row" onClick={() => isHost && update({ offside: !s.offside })}>
                  <Check label="Hors-jeu" checked={s.offside} disabled={!isHost} onChange={() => {}} />
                  <span>
                    <strong>Hors-jeu</strong>
                    <span className="hint">L'attaquant doit rester derrière le dernier défenseur au départ de la passe.</span>
                  </span>
                </div>
                <div className="rule-row" onClick={() => isHost && update({ fouls: !s.fouls })}>
                  <Check label="Fautes et cartons" checked={s.fouls} disabled={!isHost} onChange={() => {}} />
                  <span>
                    <strong>Fautes et cartons</strong>
                    <span className="hint">Un tacle en retard, c'est un coup franc, un penalty, voire un carton.</span>
                  </span>
                </div>
              </div>
            </div>

            <TableSize room={room} send={send} max={CRAMPONS_MAX_PLAYERS} />
          </section>

          <BuyModal
            item={buying?.item ?? null}
            preview={buying ? <CramponsLook item={buying.item} big /> : undefined}
            onClose={() => setBuying(null)}
            onBought={bought}
          />
          <section className="rules-sheet panel cr-help">
            <h3>Comment jouer</h3>
            <p className="hint">
              Flèches ou ZQSD pour courir, Maj pour sprinter. Espace (ou clic gauche) pour passer, C (ou clic droit) pour tirer : plus tu
              tiens, plus c'est fort. Sans le ballon, Espace presse et tacle, C tente un tacle glissé, E change de joueur. X passe en
              profondeur, V lobe ou centre. Tout est rappelé à l'écran pendant le match, et ça marche aussi à la manette et sur téléphone.
            </p>
          </section>
        </>
      }
    />
  );
}
