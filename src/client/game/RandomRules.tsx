import type { GameId, LobbyRoom } from "../../shared/protocol.ts";
import { afterColon, drawnKeys, drawnLines, drawnShort } from "../../shared/randomRules.ts";
import type { RuleLine } from "../../shared/tour.ts";
import { Options } from "../components/ui.tsx";
import "../styles/tableRules.css";

type DrawRoom = LobbyRoom & { tour?: string | null };

/** Le tirage de la table, s'il y en a un (jamais à une table de tournée : c'est la tournée qui tire) */
export function tableDraw(room: DrawRoom): string | null {
  return room.tour ? null : (room.settings.randomRules ?? null);
}

/** Pendant un tirage, les réglages qu'il décide ne se choisissent plus à la main */
export function drawLock(room: DrawRoom, game: GameId): (key: string) => boolean {
  const keys = tableDraw(room) ? new Set(drawnKeys(game)) : null;
  return (key) => keys?.has(key) ?? false;
}

/**
 * En tête des règles du salon : au choix de l'hôte, ou tirées au sort par le serveur. Le tirage se lit ici avant
 * la partie ; l'hôte peut en demander un autre.
 */
export function RandomRulesField({
  room,
  game,
  send,
  off,
}: {
  room: DrawRoom;
  game: GameId;
  send: (msg: { t: "settings"; settings: Record<string, never>; randomRules: boolean }) => void;
  /** Pas de tirage possible pour ce mode (le solo de Briques) : la raison */
  off?: string;
}) {
  if (room.tour) return null;
  const isHost = room.you.isHost;
  const draw = tableDraw(room);
  const [base, ...extras] = drawnLines(game, draw);
  const set = (randomRules: boolean) => send({ t: "settings", settings: {}, randomRules });
  const finished = room.status === "finished";
  return (
    <div className="field random-rules">
      <span className="field-label">Règles</span>
      <Options<"choix" | "hasard">
        label="Règles"
        value={draw ? "hasard" : "choix"}
        // On ne change pas les règles en pleine partie (le serveur refuse aussi)
        disabled={!isHost || Boolean(off) || room.status === "playing"}
        onChange={(mode) => set(mode === "hasard")}
        options={[
          { value: "choix", label: "Au choix" },
          { value: "hasard", label: "Au hasard" },
        ]}
      />
      {off ? (
        <p className="hint" style={{ margin: 0 }}>
          {off}
        </p>
      ) : base ? (
        <div className="drawn-card" aria-live="polite">
          <span className="drawn-label">
            {room.status === "playing"
              ? "Tirées au sort pour cette partie"
              : finished
                ? "Tirées au sort pour la prochaine partie"
                : "Tirées au sort"}
          </span>
          <strong className="drawn-name">{base.name}</strong>
          <span className="drawn-blurb">{base.blurb}</span>
          <DrawnExtras lines={extras} />
          {isHost && room.status !== "playing" && (
            <button type="button" className="btn btn-sm drawn-again" onClick={() => set(true)}>
              Tirer d'autres règles
            </button>
          )}
        </div>
      ) : (
        <p className="hint" style={{ margin: 0 }}>
          Au hasard, le serveur tire les règles parmi celles de la tournée : tout le monde les lit ici avant de jouer, et de nouvelles sont
          tirées à chaque partie.
        </p>
      )}
    </div>
  );
}

/** Les règles à part tirées en plus du format, une par ligne */
function DrawnExtras({ lines }: { lines: RuleLine[] }) {
  if (lines.length === 0) return null;
  return (
    <ul className="drawn-extras">
      {lines.map((l) => (
        <li key={l.id} className={l.kind === "off" ? "is-off" : ""}>
          <strong>{l.name}</strong>&nbsp;: {afterColon(l.blurb)}
        </li>
      ))}
    </ul>
  );
}

/**
 * Les règles tirées de la partie en cours, en une ligne courte : pour l'en-tête de la table (« Classique + 2 règles »),
 * rien sans tirage
 */
export function drawnName(room: DrawRoom & { game: string }): string | null {
  if (room.status !== "playing" || room.game === "tour") return null;
  return drawnShort(room.game as GameId, tableDraw(room));
}

/** En tête du menu de la table : les règles tirées au sort de la partie en cours, pour les relire à tout moment */
export function DrawnRulesNote({ room }: { room: DrawRoom & { game: string } }) {
  if (room.status !== "playing" || room.game === "tour") return null;
  const [base, ...extras] = drawnLines(room.game as GameId, tableDraw(room));
  if (!base) return null;
  return (
    <div className="menu-drawn" role="note">
      <span className="drawn-label">Règles tirées au sort</span>
      <strong>{base.name}</strong>
      <span className="hint">{base.blurb}</span>
      <DrawnExtras lines={extras} />
    </div>
  );
}
