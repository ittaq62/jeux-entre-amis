import { ARENA_IDS, ARENAS, type ArenaId } from "../../shared/games/culbute/arenas.ts";
import type { BotLevel } from "../../shared/games/culbute/bot.ts";
import { CULBUTE_MAX_PLAYERS, type CulbuteClientMessage, type CulbuteRoomView } from "../../shared/games/culbute/net.ts";
import type { FightSettings } from "../../shared/games/culbute/model.ts";
import { DEFAULT_CONFIG, MINUTE_CHOICES, STOCK_CHOICES, type CulbuteConfig } from "../../shared/games/culbute/view.ts";
import { applyDrawnRules } from "../../shared/randomRules.ts";
import { TOUR_TEAMS } from "../../shared/tour.ts";
import { Check, Options } from "../components/ui.tsx";
import { drawLock, RandomRulesField, tableDraw } from "../game/RandomRules.tsx";
import { RulesHeading, TableLobby, TableSize } from "../game/TableLobby.tsx";
import { CommandsButton } from "./CommandsPanel.tsx";
import { HowToPlay } from "./CulbuteHelp.tsx";
import { FighterPicker, pickLabel } from "./FighterPicker.tsx";

const MODE_HINTS: Record<FightSettings["mode"], string> = {
  vies: "Chacun a ses vies ; on en perd une en sortant de l'arène. Le dernier qui en a encore gagne.",
  temps: "Un point pour chaque adversaire sorti, un de moins à chaque chute. Le meilleur score à la fin du temps gagne.",
  subite: "Une seule vie, et tout le monde commence à 100 % : le premier bon coup peut suffire.",
};

const ITEM_HINTS: Record<FightSettings["items"], string> = {
  aucun: "Rien ne tombe du ciel : seulement les combattants.",
  peu: "De temps en temps : tarte à la crème, pétard, pot de fleurs, baguette, part de gâteau, petit café.",
  beaucoup: "Ça pleut : il y a toujours quelque chose à ramasser.",
};

const BOT_HINTS: Record<BotLevel, string> = {
  facile: "Ils réagissent lentement et oublient souvent de se protéger.",
  moyen: "Ils se protègent, reviennent bien sur l'arène et savent charger un coup.",
  fort: "Ils ne laissent rien passer et viennent te chercher au bord.",
};

interface Props {
  room: CulbuteRoomView;
  send: (msg: CulbuteClientMessage) => void;
  unread: number;
  onOpenChat: () => void;
  onLeave: () => void;
  onBackToGame?: () => void;
}

/** Le salon d'une table de Culbute : le salon commun, son combattant, et les règles du combat. */
export function CulbuteLobby({ room, send, ...rest }: Props) {
  const s: CulbuteConfig = applyDrawnRules("culbute", { ...DEFAULT_CONFIG, ...room.settings.culbute }, DEFAULT_CONFIG, tableDraw(room));
  const locked = drawLock(room, "culbute");
  const isHost = room.you.isHost;
  const update = (patch: Partial<CulbuteConfig>) => send({ t: "settings", settings: patch });
  const mine = room.you.seatId ? room.teams[room.you.seatId] : undefined;
  const fighterOf = (id: string) => room.seats.find((x) => x.id === id)?.fighter;

  return (
    <TableLobby
      room={room}
      send={send}
      {...rest}
      shareTitle="Viens te bagarrer sur Culbute"
      startLabel="En garde !"
      hostWillStart="va lancer le combat"
      seatNote={(seat) => {
        const f = fighterOf(seat.id);
        const label = f ? pickLabel(f) : null;
        return s.teams ? `${label ?? ""} · ${TOUR_TEAMS[room.teams[seat.id] ?? 0]}` : label;
      }}
      aside={
        room.you.seatId ? (
          <>
            <FighterPicker room={room} send={send} />
            {s.teams && (
              <section className="lobby-section panel field">
                <span className="field-label">Ton équipe</span>
                <Options<0 | 1>
                  label="Ton équipe"
                  value={mine ?? 0}
                  onChange={(team) => send({ t: "team", team })}
                  options={[
                    { value: 0, label: TOUR_TEAMS[0] },
                    { value: 1, label: TOUR_TEAMS[1] },
                  ]}
                />
              </section>
            )}
          </>
        ) : null
      }
      rules={
        <section className="rules-sheet panel">
          <RulesHeading room={room} />
          <HowToPlay compact />
          <CommandsButton />

          <RandomRulesField room={room} game="culbute" send={send} />

          <div className="field">
            <span className="field-label">Mode</span>
            <Options<FightSettings["mode"]>
              label="Mode"
              value={s.mode}
              disabled={!isHost || locked("mode")}
              onChange={(mode) => update({ mode })}
              options={[
                { value: "vies", label: "Aux vies" },
                { value: "temps", label: "Au temps" },
                { value: "subite", label: "Mort subite" },
              ]}
            />
            <p className="hint" style={{ margin: 0 }}>
              {MODE_HINTS[s.mode]}
            </p>
          </div>

          {s.mode === "vies" && (
            <div className="field">
              <span className="field-label">Vies</span>
              <Options<number>
                label="Vies"
                value={s.stocks}
                disabled={!isHost || locked("stocks")}
                onChange={(stocks) => update({ stocks })}
                options={STOCK_CHOICES.map((n) => ({ value: n, label: String(n) }))}
              />
            </div>
          )}
          {s.mode === "temps" && (
            <div className="field">
              <span className="field-label">Durée</span>
              <Options<number>
                label="Durée"
                value={s.minutes}
                disabled={!isHost || locked("minutes")}
                onChange={(minutes) => update({ minutes })}
                options={MINUTE_CHOICES.map((n) => ({ value: n, label: `${n} min` }))}
              />
            </div>
          )}

          <div className="field">
            <span className="field-label">Arène</span>
            <Options<ArenaId | "hasard">
              label="Arène"
              value={s.arena}
              disabled={!isHost}
              onChange={(arena) => update({ arena })}
              options={[{ value: "hasard", label: "Au hasard" }, ...ARENA_IDS.map((id) => ({ value: id, label: ARENAS[id].name }))]}
            />
            <p className="hint" style={{ margin: 0 }}>
              {s.arena === "hasard" ? "Une arène tirée au sort à chaque combat." : ARENAS[s.arena].blurb}
            </p>
          </div>

          <div className="field">
            <span className="field-label">Objets</span>
            <Options<FightSettings["items"]>
              label="Objets"
              value={s.items}
              disabled={!isHost || locked("items")}
              onChange={(items) => update({ items })}
              options={[
                { value: "aucun", label: "Aucun" },
                { value: "peu", label: "Un peu" },
                { value: "beaucoup", label: "Beaucoup" },
              ]}
            />
            <p className="hint" style={{ margin: 0 }}>
              {ITEM_HINTS[s.items]}
            </p>
          </div>

          <div className="field">
            <span className="field-label">Règle maison</span>
            <div className="rule-list">
              <div
                className={`rule-row ${locked("lune") ? "is-forced" : ""}`}
                onClick={() => isHost && !locked("lune") && update({ lune: !s.lune })}
              >
                <Check label="Sur la lune" checked={s.lune} disabled={!isHost || locked("lune")} onChange={() => {}} />
                <span>
                  <strong>Sur la lune</strong>
                  <span className="hint">La pesanteur fond : on saute plus haut et on retombe lentement. Les combats durent en l'air.</span>
                </span>
              </div>
            </div>
          </div>

          {!room.tour && (
            <div className="field">
              <span className="field-label">Équipes</span>
              <div className="rule-list">
                <div className="rule-row" onClick={() => isHost && update({ teams: !s.teams })}>
                  <Check label="En équipes" checked={s.teams} disabled={!isHost} onChange={() => {}} />
                  <span>
                    <strong>En équipes</strong>
                    <span className="hint">
                      Les {TOUR_TEAMS[0]} contre les {TOUR_TEAMS[1]} : chacun choisit la sienne. L'équipe qui garde quelqu'un en jeu gagne.
                    </span>
                  </span>
                </div>
                {s.teams && (
                  <div className="rule-row" onClick={() => isHost && update({ friendlyFire: !s.friendlyFire })}>
                    <Check label="Coups entre coéquipiers" checked={s.friendlyFire} disabled={!isHost} onChange={() => {}} />
                    <span>
                      <strong>Coups entre coéquipiers</strong>
                      <span className="hint">On peut aussi toucher (et sortir) ses coéquipiers. Attention où tu frappes.</span>
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

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

          <TableSize room={room} send={send} max={CULBUTE_MAX_PLAYERS} />
        </section>
      }
    />
  );
}
