// Le salon d'une brigade : la carte de la route de la roulotte (chaque cuisine et ses étoiles), le mode (en brigade ou
// l'un contre l'autre), ce qui se passe quand on est seul (un commis, ou deux chefs à soi), le coup de feu, la tenue.
// La première fois, Mémé raconte d'où part la roulotte ; après le banquet, elle conclut.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { BOT_LEVELS, type BotLevel } from "../../shared/games/toque/bot.ts";
import { isOpen, type StarBook } from "../../shared/games/toque/campaign.ts";
import { KITCHENS, type KitchenId } from "../../shared/games/toque/kitchens.ts";
import { APRONS } from "../../shared/games/toque/looks.ts";
import {
  DEFAULT_CONFIG,
  MODE_NAMES,
  TOQUE_MAX_PLAYERS,
  type ToqueClientMessage,
  type ToqueConfig,
  type ToqueMode,
  type ToqueRoomView,
} from "../../shared/games/toque/net.ts";
import { chefWeight } from "../../shared/games/toque/sim.ts";
import { applyDrawnRules } from "../../shared/randomRules.ts";
import { Check, Options } from "../components/ui.tsx";
import { drawLock, RandomRulesField, tableDraw } from "../game/RandomRules.tsx";
import { TableLobby, TableSize } from "../game/TableLobby.tsx";
import { useGameStars } from "../stores/stars.ts";
import { Cinematic, markStorySeen, storySeen } from "./Cinematic.tsx";
import { LookPicker } from "./LookPicker.tsx";
import { HowToPlay } from "./ToqueHelp.tsx";
import { WorldMap } from "./WorldMap.tsx";

const BOT_HINTS: Record<BotLevel, string> = {
  facile: "Ils prennent leur temps et oublient parfois la marmite sur le feu.",
  moyen: "Ils suivent les commandes, coupent, cuisent et servent sans traîner.",
  fort: "Ils pensent à la commande suivante, lavent sans qu'on le demande et éteignent les feux.",
};

const MODE_HINTS: Record<ToqueMode, string> = {
  service: "Tout le monde dans la même cuisine : les étoiles de la route se gagnent ensemble.",
  duel: "Deux brigades, deux cuisines face à face, les mêmes commandes : la meilleure recette l'emporte.",
};

const TEAM_NAMES = ["Brigade de gauche", "Brigade de droite"] as const;

interface Props {
  room: ToqueRoomView;
  send: (msg: ToqueClientMessage) => void;
  unread: number;
  onOpenChat: () => void;
  onLeave: () => void;
  onBackToGame?: () => void;
}

/** Les étoiles du joueur, cuisine par cuisine */
export function useStarBook(): StarBook {
  const stars = useGameStars("toque");
  const book: StarBook = {};
  for (const [k, v] of Object.entries(stars?.maps ?? {})) book[k as KitchenId] = v.stars;
  return book;
}

/** Combien pèse la brigade de ce salon (pour annoncer les bons seuils d'étoiles) */
function lobbyWeight(room: ToqueRoomView, s: ToqueConfig): number {
  const humans = room.seats.filter((x) => x.kind === "human");
  const owners = room.seats.map((x) => ({ team: 0, bot: x.kind === "bot", chefs: 1 as 1 | 2 }));
  if (humans.length === 1 && room.seats.length === 1) {
    if (s.solo === "commis") owners.push({ team: 0, bot: true, chefs: 1 });
    else owners[0]!.chefs = 2;
  }
  return chefWeight(owners, 0);
}

export function ToqueLobby({ room, send, ...rest }: Props) {
  const s: ToqueConfig = applyDrawnRules("toque", { ...DEFAULT_CONFIG, ...room.settings.toque }, DEFAULT_CONFIG, tableDraw(room));
  const locked = drawLock(room, "toque");
  const isHost = room.you.isHost;
  const update = (patch: Partial<ToqueConfig>) => send({ t: "settings", settings: patch });
  const book = useStarBook();
  const [peek, setPeek] = useState<KitchenId | null>(null);
  const duel = s.mode === "duel";
  const humans = room.seats.filter((x) => x.kind === "human");
  const alone = humans.length === 1 && room.seats.length === 1;
  const mine = room.you.seatId ? room.teams[room.you.seatId] : undefined;
  const open = duel || isOpen(s.kitchen, book);
  // L'histoire : Mémé la raconte une fois, au premier salon ; et conclut une fois le banquet réussi
  const [story, setStory] = useState<"intro" | "finale" | null>(() => (room.tour || storySeen("intro") ? null : "intro"));
  const banquet = book.banquet ?? 0;
  useEffect(() => {
    if (!room.tour && banquet >= 1 && !storySeen("finale")) setStory((now) => now ?? "finale");
  }, [banquet, room.tour]);
  const weight = lobbyWeight(room, s);
  const summary = [
    MODE_NAMES[s.mode],
    KITCHENS[s.kitchen].name,
    s.rush ? "coup de feu" : null,
    !duel && alone ? (s.solo === "commis" ? "avec un commis" : "deux chefs à toi") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const pick = (k: KitchenId) => {
    if (!isHost || locked("kitchen")) return setPeek(k);
    if (duel || isOpen(k, book)) {
      setPeek(null);
      update({ kitchen: k });
    } else setPeek(k);
  };

  return (
    <>
      <TableLobby
        room={room}
        send={send}
        {...rest}
        shareTitle="Viens cuisiner avec moi"
        startLabel="En cuisine !"
        hostWillStart="va lancer le service"
        canStart={room.seats.length >= 1 && open}
        startHint={
          open
            ? "Il faut au moins un chef à la table."
            : `« ${KITCHENS[s.kitchen].name} » n'est pas encore ouverte pour toi : choisis une étape ouverte sur la carte.`
        }
        seatNote={(seat) => {
          const look = room.seats.find((x) => x.id === seat.id)?.look;
          const apron = look ? `Tablier ${APRONS.find((a) => a.id === look.apron)?.name.toLowerCase() ?? ""}` : null;
          return duel ? `${apron ?? ""} · ${TEAM_NAMES[room.teams[seat.id] ?? 0]}` : apron;
        }}
        summary={summary}
        aside={
          room.you.seatId && duel ? (
            <section className="lobby-section panel field">
              <span className="field-label">Ta brigade</span>
              <Options<0 | 1>
                label="Ta brigade"
                value={mine ?? 0}
                onChange={(team) => send({ t: "team", team })}
                options={[
                  { value: 0, label: TEAM_NAMES[0] },
                  { value: 1, label: TEAM_NAMES[1] },
                ]}
              />
              <p className="hint" style={{ margin: 0 }}>
                Une brigade sans assez de chefs reçoit un commis, pour que les deux soient du même nombre.
              </p>
            </section>
          ) : null
        }
        rules={
          <>
            <RandomRulesField room={room} game="toque" send={send} />

            <div className="field">
              <span className="field-label">Le service</span>
              <Options<ToqueMode>
                label="Le service"
                value={s.mode}
                disabled={!isHost || Boolean(room.tour) || locked("mode")}
                onChange={(mode) => update({ mode })}
                options={(Object.keys(MODE_NAMES) as ToqueMode[]).map((m) => ({ value: m, label: MODE_NAMES[m] }))}
              />
              <p className="hint" style={{ margin: 0 }}>
                {MODE_HINTS[s.mode]}
              </p>
            </div>

            <div className="field tq-lobby-map">
              <span className="field-label">{duel ? "La cuisine" : "La route de la roulotte"}</span>
              <WorldMap book={book} selected={peek ?? s.kitchen} onPick={pick} chefs={weight} canPick allOpen={duel} />
              {peek && peek !== s.kitchen && isHost && !duel && !isOpen(peek, book) && (
                <p className="hint" style={{ margin: 0 }}>
                  Le service se fera à « {KITCHENS[s.kitchen].name} » tant qu'une étape ouverte n'est pas choisie.
                </p>
              )}
              {!isHost && (
                <p className="hint" style={{ margin: 0 }}>
                  L'hôte choisit la cuisine ; la carte montre tes étoiles à toi.
                </p>
              )}
              {!room.tour && !duel && (
                <button className="btn btn-sm btn-ghost tq-story-again" onClick={() => setStory("intro")}>
                  Revoir l'histoire de Mémé
                </button>
              )}
            </div>

            {!duel && alone && (
              <div className="field">
                <span className="field-label">Seul en cuisine</span>
                <Options<"commis" | "deux">
                  label="Seul en cuisine"
                  value={s.solo}
                  disabled={!isHost}
                  onChange={(solo) => update({ solo })}
                  options={[
                    { value: "commis", label: "Avec un commis" },
                    { value: "deux", label: "Deux chefs à moi" },
                  ]}
                />
                <p className="hint" style={{ margin: 0 }}>
                  {s.solo === "commis"
                    ? "Un commis (un bot) prend sa part du travail : il suit les commandes, coupe et fait la plonge."
                    : "Tu as deux chefs et tu passes de l'un à l'autre (Tab, ou le bouton ⇄) ; celui que tu laisses finit de couper ou de laver."}
                </p>
              </div>
            )}

            <div className="field">
              <span className="field-label">Le rythme</span>
              <div className="rule-list">
                <div
                  className={`rule-row ${locked("rush") ? "is-forced" : ""}`}
                  onClick={() => isHost && !locked("rush") && update({ rush: !s.rush })}
                >
                  <Check label="Coup de feu" checked={s.rush} disabled={!isHost || locked("rush")} onChange={() => {}} />
                  <span>
                    <strong>Coup de feu</strong>
                    <span className="hint">Les commandes tombent plus vite et attendent moins : le vrai rush d'un samedi soir.</span>
                  </span>
                </div>
              </div>
            </div>
          </>
        }
        moreRules={
          <>
            <div className="field">
              <span className="field-label">Niveau des commis</span>
              <Options<BotLevel>
                label="Niveau des commis"
                value={s.botLevel}
                disabled={!isHost}
                onChange={(botLevel) => update({ botLevel })}
                options={BOT_LEVELS.map((v) => ({ value: v, label: v === "facile" ? "Facile" : v === "moyen" ? "Moyen" : "Fort" }))}
              />
              <p className="hint" style={{ margin: 0 }}>
                {BOT_HINTS[s.botLevel]}
              </p>
            </div>
            <TableSize room={room} send={send} max={TOQUE_MAX_PLAYERS} />
          </>
        }
        look={room.you.seatId ? <LookPicker room={room} send={send} /> : undefined}
        help={
          <div className="lobby-help">
            <h2>Comment jouer</h2>
            <HowToPlay kitchen={s.kitchen} twoChefs={!duel && alone && s.solo === "deux"} />
          </div>
        }
      />
      {story &&
        createPortal(
          <Cinematic
            kind={story}
            onDone={() => {
              markStorySeen(story);
              setStory(null);
            }}
          />,
          document.body,
        )}
    </>
  );
}
