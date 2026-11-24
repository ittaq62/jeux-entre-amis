import {
  DEFAULT_SETTINGS,
  FLEETS,
  SHIP_LENGTH,
  SHIP_NAME,
  type BotLevel,
  type GridSize,
  type NavalSettings,
  type ShotRule,
  type Targeting,
} from "../../shared/games/naval/engine.ts";
import { NAVAL_MAX_PLAYERS, type NavalClientMessage, type NavalRoomView } from "../../shared/protocol.ts";
import { applyDrawnRules } from "../../shared/randomRules.ts";
import { drawLock, RandomRulesField, tableDraw } from "../game/RandomRules.tsx";
import { Check, Options } from "../components/ui.tsx";
import { usePrefs } from "../stores/prefs.ts";
import { SkinPicker } from "./SkinPicker.tsx";
import { TableLobby, TableSize } from "../game/TableLobby.tsx";
import { crewsOf, TeamsPanel } from "../game/TeamsPanel.tsx";

export const TEAM_NAMES = ["Bâbord", "Tribord"] as const;

const SHOT_HINTS: Record<ShotRule, string> = {
  single: "Un tir chacun son tour, touché ou pas.",
  replay: "Celui qui touche rejoue, jusqu'à tomber à l'eau.",
  salvo: "À chaque tour, autant de tirs que de navires encore à flot.",
};

/** Les tirs en quelques mots, pour la ligne à côté du départ */
const SHOT_SUMMARY: Record<ShotRule, string> = {
  single: "un tir chacun",
  replay: "on rejoue si touché",
  salvo: "tirs en salve",
};

const TARGET_HINTS: Record<Targeting, string> = {
  free: "Chacun choisit la flotte qu'il attaque.",
  random: "On ne choisit pas : à chaque tour, le hasard désigne la flotte à attaquer.",
  leader: "On doit attaquer en priorité la flotte qui a le plus de navires à flot.",
};

const BOT_HINTS: Record<BotLevel, string> = {
  mousse: "Tire un peu au hasard.",
  chasseur: "Quadrille la mer et s'acharne sur ce qu'il touche.",
  amiral: "Calcule où tes navires ont le plus de chances d'être.",
};

interface Props {
  room: NavalRoomView;
  send: (msg: NavalClientMessage) => void;
  unread: number;
  onOpenChat: () => void;
  onLeave: () => void;
  onBackToGame?: () => void;
}

type Toggle = "touching" | "arsenal" | "teams";

/** Le salon d'une table de bataille navale : le salon commun et les réglages de la bataille. */
export function NavalLobby({ room, send, ...rest }: Props) {
  const setPrefs = usePrefs((p) => p.set);
  // Règles au hasard : ce que le tirage décide s'affiche tel qu'il sera joué, et ne se règle plus à la main
  const s = applyDrawnRules("naval", room.settings.naval, DEFAULT_SETTINGS, tableDraw(room));
  const locked = drawLock(room, "naval");
  const isHost = room.you.isHost;
  const update = (patch: Partial<NavalSettings>) => send({ t: "settings", settings: patch });
  const teamsReady = s.teams && room.settings.maxPlayers === 4;
  const crews = crewsOf(room.seats);
  const balanced = crews[0].length === 2 && crews[1].length === 2;
  const fleet = FLEETS[s.grid].map((k) => `${SHIP_NAME[k]} (${SHIP_LENGTH[k]})`).join(", ");
  const targeting = s.targeting ?? "free";
  const alone = room.settings.maxPlayers === 2;
  const mine = room.seats.find((seat) => seat.id === room.you.seatId);

  const toggles: { key: Toggle; label: string; desc: string; disabled?: boolean }[] = [
    { key: "touching", label: "Navires collés", desc: "Deux navires peuvent se toucher. Sinon, une case d'eau les sépare toujours." },
    { key: "arsenal", label: "Mode Arsenal", desc: "Couler un navire rapporte une arme : radar, torpille ou barrage." },
    {
      key: "teams",
      label: "Équipes 2 contre 2",
      desc: room.settings.maxPlayers === 4 ? "Bâbord contre Tribord : on partage ses victoires." : "Possible à 4 joueurs exactement.",
      disabled: room.settings.maxPlayers !== 4,
    },
  ];
  // Les équipes changent la partie et restent en vue ; navires collés et Arsenal vont avec les réglages fins
  const toggleList = (keys: Toggle[]) => (
    <div className="rule-list">
      {toggles
        .filter((r) => keys.includes(r.key))
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

  const timeLabel = s.turnSeconds ? `${s.turnSeconds < 60 ? `${s.turnSeconds} s` : "1 min"} pour tirer` : "sans limite de temps";
  const parts = [
    `Grille ${s.grid}×${s.grid}`,
    SHOT_SUMMARY[s.shots],
    teamsReady ? "2 contre 2" : null,
    s.arsenal ? "Arsenal" : null,
  ].filter(Boolean);
  // Le temps pour tirer ferme la ligne quand il reste de la place
  const summary = (parts.length < 4 ? [...parts, timeLabel] : parts).join(" · ");

  return (
    <TableLobby
      room={room}
      send={send}
      {...rest}
      shareTitle="Viens jouer à la bataille navale"
      startLabel="Lever l'ancre"
      hostWillStart="va donner le signal du départ"
      canStart={room.seats.length >= 2 && (!teamsReady || balanced)}
      startHint={
        !teamsReady
          ? undefined
          : room.seats.length < 4
            ? "Il faut quatre joueurs pour jouer en équipes : ajoute des bots."
            : "Il faut deux marins dans chaque équipe."
      }
      seatNote={teamsReady ? (seat) => `équipe ${TEAM_NAMES[(seat.team ?? 0) as 0 | 1]}` : undefined}
      aside={teamsReady ? <TeamsPanel room={room} send={send} names={TEAM_NAMES} colors={["#e0574a", "#4fbf83"]} /> : undefined}
      summary={summary}
      rules={
        <>
          <RandomRulesField room={room} game="naval" send={send} />

          <div className="field">
            <span className="field-label">Grille</span>
            <Options<GridSize>
              label="Grille"
              value={s.grid}
              disabled={!isHost || locked("grid")}
              onChange={(grid) => update({ grid })}
              options={[
                { value: 8, label: "Petite, 8×8" },
                { value: 10, label: "Classique, 10×10" },
                { value: 12, label: "Grande, 12×12" },
              ]}
            />
            <p className="hint" style={{ margin: 0 }}>
              Flotte : {fleet}.
            </p>
          </div>

          <div className="field">
            <span className="field-label">Tirs</span>
            <Options<ShotRule>
              label="Tirs"
              value={s.shots}
              disabled={!isHost || locked("shots")}
              onChange={(shots) => update({ shots })}
              options={[
                { value: "single", label: "Un tir chacun" },
                { value: "replay", label: "On rejoue si touché" },
                { value: "salvo", label: "Salve" },
              ]}
            />
            <p className="hint" style={{ margin: 0 }}>
              {SHOT_HINTS[s.shots]}
            </p>
          </div>

          <div className="field">
            <span className="field-label">Qui on attaque</span>
            <Options<Targeting>
              label="Qui on attaque"
              value={targeting}
              disabled={!isHost || alone}
              onChange={(next) => update({ targeting: next })}
              options={[
                { value: "free", label: "Au choix" },
                { value: "random", label: "Au hasard" },
                { value: "leader", label: "Plus de navires" },
              ]}
            />
            <p className="hint" style={{ margin: 0 }}>
              {alone ? "À deux, il n'y a qu'une flotte à viser." : TARGET_HINTS[targeting]}
            </p>
          </div>

          {toggleList(["teams"])}
        </>
      }
      moreRules={
        <>
          {toggleList(["touching", "arsenal"])}

          <div className="field">
            <span className="field-label">Niveau des bots</span>
            <Options<BotLevel>
              label="Niveau des bots"
              value={s.botLevel}
              disabled={!isHost}
              onChange={(botLevel) => update({ botLevel })}
              options={[
                { value: "mousse", label: "Mousse" },
                { value: "chasseur", label: "Chasseur" },
                { value: "amiral", label: "Amiral" },
              ]}
            />
            <p className="hint" style={{ margin: 0 }}>
              {BOT_HINTS[s.botLevel]}
            </p>
          </div>

          <div className="field">
            <span className="field-label">Temps pour tirer</span>
            <Options
              label="Temps pour tirer"
              value={s.turnSeconds}
              disabled={!isHost}
              onChange={(turnSeconds) => update({ turnSeconds })}
              options={[
                { value: 15, label: "15 s" },
                { value: 30, label: "30 s" },
                { value: 60, label: "1 min" },
                { value: 0, label: "Illimité" },
              ]}
            />
          </div>

          <TableSize room={room} send={send} max={NAVAL_MAX_PLAYERS} />
        </>
      }
      look={
        room.you.seatId ? (
          <SkinPicker
            current={mine?.skin ?? "marine"}
            onPick={(skin) => {
              setPrefs({ navalSkin: skin });
              send({ t: "skin", skin });
            }}
          />
        ) : undefined
      }
      help={<NavalHelp s={s} fleet={fleet} alone={alone} teams={teamsReady} />}
    />
  );
}

/** Comment jouer à la bataille navale : placer sa flotte, puis tirer selon les règles de la table (d'après le moteur) */
function NavalHelp({ s, fleet, alone, teams }: { s: NavalSettings; fleet: string; alone: boolean; teams: boolean }) {
  const time = s.turnSeconds < 60 ? `${s.turnSeconds} secondes` : "1 minute";
  return (
    <div className="lobby-help">
      <h2>Comment jouer</h2>
      <p>
        <strong>Le but :</strong>{" "}
        {teams
          ? "couler les deux flottes de l'équipe adverse. Si la tienne coule, ton coéquipier peut encore gagner pour vous deux."
          : "couler tous les navires adverses. Le dernier à garder un navire à flot gagne."}
      </p>

      <h3>Placer ta flotte</h3>
      <ul>
        <li>
          Ta flotte, avec la longueur de chaque navire en cases : {fleet}. Glisse un navire pour le déplacer, touche-le pour le tourner, ou
          laisse faire « Au hasard ».{" "}
          {s.touching ? "Les navires peuvent se toucher." : "Deux navires ne se touchent jamais, même par un coin."}
        </li>
        <li>
          Tu as 1 min 30 pour appuyer sur <strong>Prêt au combat</strong> : passé ce temps, ta flotte part comme le hasard l'avait placée.
        </li>
      </ul>

      <h3>Tirer</h3>
      <ul>
        <li>
          Vise une case chez l'adversaire : à l'eau, touché ou coulé. Un navire coulé se montre en entier. {SHOT_HINTS[s.shots]}
          {s.shots === "salvo" && teams ? " En 2 contre 2, on compte les navires de toute son équipe." : ""}
        </li>
        {!alone && <li>{TARGET_HINTS[s.targeting ?? "free"]}</li>}
        {s.arsenal && (
          <li>
            Couler un navire rapporte une arme, dans l'ordre radar, torpille, barrage (trois en réserve au plus). Le <strong>radar</strong>{" "}
            révèle une zone de 3×3 sans tirer, la <strong>torpille</strong> part du bord gauche (en ligne) ou du haut (en colonne) et frappe
            le premier navire sur son chemin, le <strong>barrage</strong> tire cinq obus en croix. Une arme remplace ton tir et finit ton
            tour.
          </li>
        )}
        {s.turnSeconds > 0 && <li>Tu as {time} pour chaque tir ; sinon, il part au hasard.</li>}
      </ul>
    </div>
  );
}
