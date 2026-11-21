import { useMemo, useState } from "react";
import {
  BUYOUT_RATE,
  DISASTERS,
  GO_SALARY,
  GROUPS,
  JAIL_FINE,
  SPECIAL_ORDER,
  specialPrice,
  SPECIALS,
  START_CASH,
  teamName,
  type DisasterKind,
} from "../../shared/games/capitale/board.ts";
import {
  DEFAULT_SETTINGS,
  type BotLevel,
  type CapitaleSettings,
  type EndMode,
  type TeamCount,
} from "../../shared/games/capitale/engine.ts";
import { applyDrawnRules } from "../../shared/randomRules.ts";
import { drawLock, RandomRulesField, tableDraw } from "../game/RandomRules.tsx";
import { TOKENS, type TokenId } from "../../shared/games/capitale/tokens.ts";
import { SHOP_BY_ID, tokenItem } from "../../shared/shop.ts";
import { CAPITALE_MAX_PLAYERS, type CapitaleClientMessage, type CapitaleRoomView } from "../../shared/protocol.ts";
import { Avatar } from "../components/Avatar.tsx";
import { Icon } from "../components/Icon.tsx";
import { Check, Options } from "../components/ui.tsx";
import { TableLobby, TableSize } from "../game/TableLobby.tsx";
import { BuyModal } from "../shop/BuyModal.tsx";
import { usePrefs } from "../stores/prefs.ts";
import { useMyItems } from "../stores/shop.ts";
import { money } from "./boardUi.ts";
import { tokenThumbnails } from "./scene/tokens.ts";
import { pawnColor, seatTeams, teamColor, TeamMark } from "./teamsUi.tsx";
import { MONOPOLY_RULE, TeamRules } from "./TeamRules.tsx";
import { BuilderRules } from "./BuilderRules.tsx";

const BOT_HINTS: Record<BotLevel, string> = {
  facile: "Prudent jusqu'à l'excès : il garde son argent et bâtit peu.",
  moyen: "Achète raisonnablement, améliore ses rues, pose parfois une nuisance, accepte les échanges équitables.",
  fort: "Rafle les terrains, monte vite ses rues, pose ses nuisances chez le plus riche et négocie.",
};

type HouseRule = "freeParking" | "doubleGo" | "noRentInJail" | "quickStart" | "specials" | "buyout" | "disasters" | "evenBuild";

const HOUSE_RULES: { key: HouseRule; label: string; desc: string }[] = [
  {
    key: "evenBuild",
    label: "Construction équilibrée",
    desc: "Sans tout le quartier, deux maisons au plus ; dans un quartier complet, aucune rue ne prend plus d'un niveau d'avance.",
  },
  {
    key: "buyout",
    label: "Rachat des villes",
    desc: `Arrêté chez un adversaire, le loyer payé, on peut lui racheter sa ville : sa valeur plus ${Math.round((BUYOUT_RATE - 1) * 100)} %.`,
  },
  {
    key: "disasters",
    label: "Catastrophes",
    desc: "Dans les paquets : séisme, incendie, tempête, crue, arrêté de péril, expropriation, cession forcée.",
  },
  {
    key: "specials",
    label: "Bâtiments spéciaux",
    desc: "Obélisque (loyers du quartier doublés), parc, stade, et des nuisances à poser chez les autres : décharge, centrale.",
  },
  {
    key: "freeParking",
    label: "Cagnotte de l'Aire de repos",
    desc: "Taxes et amendes s'entassent sur l'Aire de repos : celui qui s'y arrête rafle tout.",
  },
  { key: "doubleGo", label: "Double salaire sur Départ", desc: "Tomber pile sur Départ rapporte 400 au lieu de 200." },
  { key: "noRentInJail", label: "Pas de loyer en prison", desc: "Un propriétaire derrière les barreaux ne touche plus ses loyers." },
  { key: "quickStart", label: "Départ rapide", desc: "Chacun reçoit deux titres tirés au sort pour commencer." },
];

/** En Builder, les bâtiments spéciaux se posent sur la carte, dans ses propres villes */
const BUILDER_SPECIALS = "Le parc, le stade et deux nuisances (décharge, centrale) qui font perdre leurs voisins, à poser dans tes villes.";

/** L'obélisque vaut quatre niveaux de son quartier : de 200 (brun, ciel) à 800 (vert, bleu) */
const LEVEL_COSTS = Object.values(GROUPS).map((g) => g.houseCost);
const MONUMENT_PRICES = `${4 * Math.min(...LEVEL_COSTS)} à ${4 * Math.max(...LEVEL_COSTS)}`;

/** Les bâtiments spéciaux, leur prix et leur effet, repliés sous les règles maison */
function SpecialRules({ monopoly }: { monopoly: boolean }) {
  return (
    <details className="cap-special-rules">
      <summary>Les cinq bâtiments, leur prix et leur effet</summary>
      <ul>
        {SPECIAL_ORDER.map((k) => (
          <li key={k} className={SPECIALS[k].nuisance ? "is-nuisance" : ""}>
            <strong>{SPECIALS[k].name}</strong>
            <span className="num">{k === "monument" ? MONUMENT_PRICES : specialPrice(k, 0)} ₣</span>
            <span className="hint">
              {SPECIALS[k].where} {SPECIALS[k].effect}
            </span>
          </li>
        ))}
        <li className="cap-special-limits hint">
          Un bâtiment par rue et un seul par tour, un stade par joueur, rien sur une rue hypothéquée. Le propriétaire fait raser une
          nuisance à son prix ; ses propres bâtiments se revendent à moitié prix et bloquent l'échange et l'hypothèque de leur rue.
          {monopoly && " Au Monopole, seuls les titres comptent : un bâtiment ne remplace pas une rue."}
        </li>
      </ul>
    </details>
  );
}

const DISASTER_ORDER: DisasterKind[] = ["seisme", "incendie", "tempete", "crue", "peril", "expropriation", "cession"];

/** Le rachat et les catastrophes, en détail, repliés sous les règles maison */
function NewRules({ s }: { s: CapitaleSettings }) {
  return (
    <>
      {s.buyout && (
        <details className="cap-special-rules">
          <summary>Le rachat : le prix et ce qui protège une ville</summary>
          <ul>
            <li className="cap-special-limits hint">
              Le prix : le titre, ses niveaux et le bâtiment du propriétaire (parc, stade), au prix coûtant, plus{" "}
              {Math.round((BUYOUT_RATE - 1) * 100)} %. Tout va au propriétaire. Proposé seulement si l'on a l'argent, juste après le loyer ;
              les niveaux et le bâtiment suivent la ville.
            </li>
            <li className="cap-special-limits hint">
              Protégées : un monument (niveau 5), une ville hypothéquée, tout le quartier d'un obélisque, et la ville d'un coéquipier. Pas
              de second stade.{s.monopoly && " Au Monopole, un rachat peut faire gagner : surveillez vos rues."}
            </li>
          </ul>
        </details>
      )}
      {s.disasters && (
        <details className="cap-special-rules">
          <summary>Les catastrophes : qui est touché</summary>
          <ul className="is-two">
            {DISASTER_ORDER.map((k) => (
              <li key={k} className={k === "peril" ? "" : "is-nuisance"}>
                <strong>{DISASTERS[k].name}</strong>
                <span className="hint">{DISASTERS[k].who}.</span>
              </li>
            ))}
            <li className="cap-special-limits hint">
              Une catastrophe abat des niveaux, jamais un bâtiment spécial ; un niveau perdu ne se rembourse pas. L'arrêté de péril épargne
              les monuments (classés) et les coéquipiers. Expropriation et cession ne prennent qu'un titre sans construction ni obélisque
              {s.builder ? ", ni tour ni monument dans son quartier" : ""}
              {s.monopoly ? ", et la cession évite de faire gagner l'adversaire au Monopole quand elle le peut" : ""}.
              {s.builder && " L'expropriation paie aussi le terrain annexé, au prix payé."}
            </li>
          </ul>
        </details>
      )}
    </>
  );
}

interface Props {
  room: CapitaleRoomView;
  send: (msg: CapitaleClientMessage) => void;
  unread: number;
  onOpenChat: () => void;
  onLeave: () => void;
  onBackToGame?: () => void;
}

/** Le salon d'une table de Capitale : le salon commun et les règles de la partie. */
export function CapitaleLobby({ room, send, ...rest }: Props) {
  // Règles au hasard : ce que le tirage décide s'affiche tel qu'il sera joué, et ne se règle plus à la main
  const s = applyDrawnRules("capitale", room.settings.capitale, DEFAULT_SETTINGS, tableDraw(room));
  const locked = drawLock(room, "capitale");
  const isHost = room.you.isHost;
  const update = (patch: Partial<CapitaleSettings>) => send({ t: "settings", settings: patch });
  const seatIndex = room.seats.findIndex((x) => x.id === room.you.seatId);
  const mine = seatIndex >= 0 ? room.seats[seatIndex] : undefined;
  const setPrefs = usePrefs((p) => p.set);
  const count = s.teamCount ?? 0;
  const teams = count ? seatTeams(room.seats) : null;
  const ids = room.seats.map((x) => x.id);
  // En équipes : autant de joueurs dans chacune, au moins deux
  const sizes = Array.from({ length: count }, (_, k) => room.seats.filter((x) => x.team === k).length);
  const teamsOk = !count || (sizes.every((n) => n === sizes[0]) && (sizes[0] ?? 0) >= 2);

  const endLabel =
    (s.end === "timed" ? (s.minutes === 60 ? "partie d'une heure" : `partie de ${s.minutes} min`) : "jusqu'à la faillite") +
    (s.monopoly ? " ou Monopole" : "");
  const turnLabel = s.turnSeconds ? `${s.turnSeconds < 60 ? `${s.turnSeconds} s` : "1 min"} par décision` : "sans limite de temps";
  const summary = [s.builder ? "Capitale Builder" : "Capitale classique", endLabel, turnLabel, count ? `${count} équipes` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <TableLobby
      room={room}
      send={send}
      {...rest}
      shareTitle="Viens jouer à Capitale"
      startLabel="Distribuer les billets"
      hostWillStart="va distribuer les billets"
      canStart={room.seats.length >= 2 && teamsOk}
      startHint={
        teamsOk
          ? undefined
          : `En équipes, il faut au moins deux joueurs par équipe, autant dans chacune : c'est ${sizes.join(" contre ")} pour l'instant.`
      }
      seatNote={count ? (seat) => (seat.team !== undefined ? teamName(seat.team) : null) : undefined}
      aside={count ? <CapTeamsPanel room={room} send={send} count={count} /> : undefined}
      summary={summary}
      rules={
        <>
          <RandomRulesField room={room} game="capitale" send={send} />

          <div className="field">
            <span className="field-label">Version</span>
            <Options<"classique" | "builder">
              label="Version"
              value={s.builder ? "builder" : "classique"}
              disabled={!isHost || locked("builder")}
              onChange={(v) => update({ builder: v === "builder" })}
              options={[
                { value: "classique", label: "Classique" },
                { value: "builder", label: "Builder" },
              ]}
            />
            <p className="hint" style={{ margin: 0 }}>
              {s.builder
                ? "Builder : au centre du plateau, chaque ville a son territoire en cases. Tu y poses tes bâtiments où tu veux, à tout moment, même pendant le tour des autres, et tu repousses tes frontières sur le terrain vague."
                : "Classique : chaque rue s'améliore d'un bouton, de la maison au monument de la ville."}
            </p>
            {s.builder && <BuilderRules specials={s.specials} monopoly={Boolean(s.monopoly)} />}
          </div>

          <div className="field">
            <span className="field-label">Fin de la partie</span>
            <Options<EndMode>
              label="Fin de la partie"
              value={s.end}
              disabled={!isHost}
              onChange={(end) => update({ end })}
              options={[
                { value: "timed", label: "Partie rapide" },
                { value: "bankrupt", label: "Jusqu'à la faillite" },
              ]}
            />
            {s.end === "timed" && (
              <Options<number>
                label="Durée"
                value={s.minutes}
                disabled={!isHost}
                onChange={(minutes) => update({ minutes })}
                options={[
                  { value: 30, label: "30 min" },
                  { value: 45, label: "45 min" },
                  { value: 60, label: "1 h" },
                ]}
              />
            )}
            <p className="hint" style={{ margin: 0 }}>
              {s.end === "timed"
                ? `Au bout de ${s.minutes} minutes, le tour en cours est le dernier : le plus riche gagne (argent, titres et constructions).`
                : "Le dernier joueur à ne pas avoir fait faillite gagne. Compte une à trois heures."}
            </p>
            <div className="rule-list">
              <div
                className={`rule-row ${locked("monopoly") ? "is-forced" : ""}`}
                onClick={() => isHost && !locked("monopoly") && update({ monopoly: !s.monopoly })}
              >
                <Check label="Monopole" checked={Boolean(s.monopoly)} disabled={!isHost || locked("monopoly")} onChange={() => {}} />
                <span>
                  <strong>Monopole</strong>
                  <span className="hint">{MONOPOLY_RULE} En plus de la fin choisie : la table montre à chacun où il en est.</span>
                </span>
              </div>
            </div>
          </div>

          <div className="field">
            <span className="field-label">Équipes</span>
            <Options<TeamCount>
              label="Équipes"
              value={count}
              disabled={!isHost}
              onChange={(teamCount) => update({ teamCount })}
              options={[
                { value: 0, label: "Chacun pour soi" },
                { value: 2, label: "2 équipes" },
                { value: 3, label: "3 équipes" },
              ]}
            />
            <p className="hint" style={{ margin: 0 }}>
              {count === 0
                ? "Chacun joue pour lui. En équipes : 2 contre 2, 3 contre 3, ou trois équipes de deux."
                : count === 2
                  ? "Deux équipes de même taille : 2 contre 2 ou 3 contre 3."
                  : "Trois équipes de deux : il faut six joueurs."}
            </p>
            {/* En équipes, leurs règles (loyer, dons, héritage, victoire ensemble) se voient tout de suite, sous le choix */}
            {count > 0 && <TeamRules s={s} disabled={!isHost} update={update} />}
          </div>
        </>
      }
      moreRules={
        <>
          <div className="field">
            <span className="field-label">Règles maison</span>
            <div className="rule-list">
              {HOUSE_RULES.filter((r) => !(s.builder && r.key === "evenBuild")).map((r) => (
                <div
                  key={r.key}
                  className={`rule-row ${locked(r.key) ? "is-forced" : ""}`}
                  onClick={() => isHost && !locked(r.key) && update({ [r.key]: !s[r.key] })}
                >
                  <Check label={r.label} checked={s[r.key]} disabled={!isHost || locked(r.key)} onChange={() => {}} />
                  <span>
                    <strong>{r.label}</strong>
                    <span className="hint">{s.builder && r.key === "specials" ? BUILDER_SPECIALS : r.desc}</span>
                  </span>
                </div>
              ))}
            </div>
            <NewRules s={s} />
            {s.specials && !s.builder && <SpecialRules monopoly={Boolean(s.monopoly)} />}
            {!s.builder && (
              <p className="hint" style={{ margin: 0 }}>
                La ville : chaque rue s'améliore d'un bouton, une fois par tour, de la maison au monument de la ville (la tour Eiffel à
                Paris). {s.evenBuild ? "Sans tout le quartier, deux maisons au plus." : "Au-delà de l'immeuble, il faut tout le quartier."}{" "}
                Le reste suit la règle : enchères, prison, hypothèques.
              </p>
            )}
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

          <div className="field">
            <span className="field-label">Temps par décision</span>
            <Options
              label="Temps par décision"
              value={s.turnSeconds}
              disabled={!isHost}
              onChange={(turnSeconds) => update({ turnSeconds })}
              options={[
                { value: 30, label: "30 s" },
                { value: 60, label: "1 min" },
                { value: 0, label: "Illimité" },
              ]}
            />
            <p className="hint" style={{ margin: 0 }}>
              Passé ce temps, les dés se lancent tout seuls et le terrain part aux enchères.
            </p>
          </div>

          <TableSize room={room} send={send} max={CAPITALE_MAX_PLAYERS} />
        </>
      }
      look={
        mine && (
          <TokenPicker
            color={pawnColor(ids, teams, mine.id)}
            current={mine.token ?? "pion"}
            onPick={(token) => {
              setPrefs({ capitaleToken: token });
              send({ t: "token", token });
            }}
          />
        )
      }
      help={<CapitaleHelp s={s} teams={count > 0} />}
    />
  );
}

/** Comment jouer à Capitale : le but selon la fin choisie, le tour, les achats, les loyers, et quand l'argent manque */
function CapitaleHelp({ s, teams }: { s: CapitaleSettings; teams: boolean }) {
  // En équipes, la victoire d'équipe additionne les fortunes ; sans elle, chacun garde son classement
  const together = teams && s.teamWin;
  return (
    <div className="lobby-help">
      <h2>Comment jouer</h2>
      <p>
        <strong>Le but :</strong>{" "}
        {s.end === "timed"
          ? `${together ? "que ton équipe soit la plus riche" : "être le plus riche"} à la fin. Au bout de ${s.minutes} minutes, le tour en cours est le dernier ; on compte l'argent, les titres et les constructions${together ? " de toute l'équipe" : ""}.`
          : together
            ? "ruiner les autres équipes. La dernière équipe encore en jeu gagne, ensemble."
            : teams
              ? "ruiner les autres équipes. Quand il n'en reste qu'une en jeu, le plus riche de ses joueurs gagne."
              : "ruiner les autres. Le dernier à ne pas avoir fait faillite gagne."}
      </p>
      {s.monopoly && (
        <p>
          <strong>Monopole :</strong> {MONOPOLY_RULE}
        </p>
      )}
      <ul>
        <li>
          Chacun part avec {money(START_CASH)}. À ton tour, lance les dés, avance ton pion, puis finis ton tour ; chaque passage par Départ
          rapporte {money(GO_SALARY)}.
        </li>
        <li>
          Un double te fait rejouer ; au troisième double de suite, c'est la prison. Pour en sortir : paie {money(JAIL_FINE)}, joue une
          carte « sortie de prison » ou fais un double (au troisième essai raté, tu paies et tu sors).
        </li>
        <li>Arrêté sur une ville, une gare ou un réseau libre : achète-le à son prix, ou laisse-le aux enchères, où tout le monde mise.</li>
        <li>
          Arrêté chez un adversaire : tu lui paies le loyer, qui grimpe s'il a tout le quartier et avec ce qu'il y a bâti. Plus on a de
          gares, plus elles rapportent ; un titre hypothéqué ne rapporte rien.
        </li>
        <li>
          {s.builder
            ? "Builder : pose tes bâtiments sur le territoire de tes villes, où tu veux et à tout moment, même pendant le tour des autres (sauf pendant une enchère). Le loyer suit ce que tu as bâti, doublé avec tout le quartier."
            : `Pendant ton tour, améliore tes rues d'un niveau à la fois, une fois par rue et par tour, de la maison au monument ; ${s.evenBuild ? "au-delà de deux maisons" : "au-delà de l'immeuble"}, il faut tout le quartier.`}
        </li>
        <li>Propose des échanges (argent, titres, cartes de prison) quand tu veux, sauf pendant une enchère.</li>
        <li>
          Pas de quoi payer : revends ce que tu as bâti (à moitié prix) ou hypothèque des titres ; si ça ne suffit pas, c'est la faillite.
        </li>
      </ul>
    </div>
  );
}

/** Le choix du pion : quatre pour commencer, les autres s'achètent avec ses points, dans l'ordre qu'on veut */
export function TokenPicker({ color, current, onPick }: { color: string; current: string; onPick: (token: TokenId) => void }) {
  const thumbs = useMemo(() => tokenThumbnails(color), [color]);
  const { balance, has } = useMyItems();
  const [buying, setBuying] = useState<TokenId | null>(null);
  return (
    <div className="field">
      <span className="field-label">Ton pion</span>
      <div className="cap-tokens" role="radiogroup" aria-label="Ton pion">
        {TOKENS.map((t) => {
          const locked = !has(tokenItem(t.id));
          return (
            <button
              key={t.id}
              type="button"
              className={`cap-token ${current === t.id ? "is-on" : ""} ${locked ? "is-locked" : ""}`}
              aria-pressed={current === t.id}
              onClick={() => (locked ? setBuying(t.id) : onPick(t.id))}
              title={locked ? `${t.name} : ${t.price} points` : t.name}
            >
              {thumbs[t.id] ? (
                <img src={thumbs[t.id]} alt="" width={64} height={64} draggable={false} />
              ) : (
                <span className="cap-token-blank" />
              )}
              <span className="cap-token-name">{t.name}</span>
              {locked && (
                <span className="cap-token-lock">
                  <Icon name="coin" size={12} /> {t.price}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="hint" style={{ margin: 0 }}>
        Tu as {balance} point{balance > 1 ? "s" : ""}. Touche un pion pour l'acheter, dans l'ordre que tu veux.
      </p>
      <BuyModal
        item={buying ? SHOP_BY_ID.get(tokenItem(buying))! : null}
        preview={buying && thumbs[buying] ? <img src={thumbs[buying]} alt="" width={128} height={128} draggable={false} /> : undefined}
        onClose={() => setBuying(null)}
        onBought={() => buying && onPick(buying)}
      />
    </div>
  );
}

/** Les équipes du salon : chacun choisit la sienne, l'hôte place les bots et les autres joueurs */
function CapTeamsPanel({ room, send, count }: { room: CapitaleRoomView; send: (msg: CapitaleClientMessage) => void; count: number }) {
  const me = room.seats.find((seat) => seat.id === room.you.seatId);
  const size = Math.max(2, Math.ceil(room.settings.maxPlayers / count));
  return (
    <section className="lobby-section panel teams-panel cap-teams" aria-label="Les équipes">
      <h2>
        Les équipes{" "}
        <span className="hint">{count === 3 ? "trois équipes de deux" : size === 3 ? "trois contre trois" : "deux contre deux"}</span>
      </h2>
      <div className={`teams-grid cap-teams-grid is-${count}`}>
        {Array.from({ length: count }, (_, t) => {
          const crew = room.seats.filter((seat) => seat.team === t);
          return (
            <div key={t} className="team-col" style={{ ["--team-color" as string]: teamColor(t) }}>
              <h3 className="team-name">
                <TeamMark team={t} size={18} /> {teamName(t)}
              </h3>
              <ul className="team-crew">
                {crew.map((seat) => (
                  <li key={seat.id}>
                    <Avatar avatar={seat.avatar} userId={seat.userId} photo={seat.photo} size={30} />
                    <span className="team-member">
                      {seat.name}
                      {seat.id === me?.id && <span className="hint"> (toi)</span>}
                    </span>
                    {room.you.isHost &&
                      seat.id !== me?.id &&
                      Array.from({ length: count }, (_, o) => o)
                        .filter((o) => o !== t)
                        .map((o) => (
                          <button
                            key={o}
                            className="btn btn-ghost btn-sm team-move cap-team-move"
                            onClick={() => send({ t: "team", seatId: seat.id, team: o })}
                            aria-label={`Envoyer ${seat.name} chez les ${teamName(o)}`}
                            title={`Envoyer chez les ${teamName(o)}`}
                          >
                            <span aria-hidden="true">→</span>
                            <TeamMark team={o} size={14} />
                          </button>
                        ))}
                  </li>
                ))}
                {Array.from({ length: Math.max(0, size - crew.length) }, (_, i) => (
                  <li key={`libre-${i}`} className="is-empty">
                    <span className="team-empty-mark" />
                    place libre
                  </li>
                ))}
              </ul>
              {me && me.team !== t && (
                <button className="btn btn-sm btn-block" onClick={() => send({ t: "team", seatId: me.id, team: t })}>
                  Passer chez les {teamName(t)}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
