import type { BotLevel, BricksSettings, BricksWin } from "../../shared/games/bricks/engine.ts";
import { BRICKS_MAX_PLAYERS, type BricksClientMessage, type BricksRoomView } from "../../shared/protocol.ts";
import { Check, Options } from "../components/ui.tsx";
import { RulesHeading, TableLobby, TableSize } from "../game/TableLobby.tsx";
import { crewsOf, TeamsPanel } from "../game/TeamsPanel.tsx";

export const BRICK_TEAMS = ["Rubis", "Saphir"] as const;

const BOT_HINTS: Record<BotLevel, string> = {
  apprenti: "Pose lentement et laisse des trous.",
  confirme: "Pose proprement et envoie des lignes.",
  expert: "Rapide, garde un puits pour les quatre lignes et tente les T-spins.",
};

interface Props {
  room: BricksRoomView;
  send: (msg: BricksClientMessage) => void;
  unread: number;
  onOpenChat: () => void;
  onLeave: () => void;
  onBackToGame?: () => void;
}

/** Le salon d'une table de Briques : le salon commun, et les règles de la partie. */
export function BricksLobby({ room, send, ...rest }: Props) {
  const s = room.settings.bricks;
  const isHost = room.you.isHost;
  const update = (patch: Partial<BricksSettings>) => send({ t: "settings", settings: patch });
  const teamsReady = !s.sprint && s.teams && room.settings.maxPlayers === 4;
  const crews = crewsOf(room.seats);
  const balanced = crews[0]!.length === 2 && crews[1]!.length === 2;
  const canStart = s.sprint ? room.seats.length === 1 : room.seats.length >= 2 && (!teamsReady || balanced);

  const toggles: { key: "hold" | "speedUp" | "messy" | "teams"; label: string; desc: string; disabled?: boolean }[] = [
    { key: "hold", label: "Réserve", desc: "On peut mettre une pièce de côté, une fois par pièce." },
    { key: "speedUp", label: "Accélération", desc: "Les pièces tombent de plus en plus vite au fil de la manche." },
    { key: "messy", label: "Lignes grises en vrac", desc: "Chaque ligne reçue a son propre trou : plus dur à déblayer." },
    {
      key: "teams",
      label: "Équipes 2 contre 2",
      desc:
        room.settings.maxPlayers === 4
          ? `${BRICK_TEAMS[0]} contre ${BRICK_TEAMS[1]} : on partage ses victoires.`
          : "Possible à 4 joueurs exactement.",
      disabled: room.settings.maxPlayers !== 4,
    },
  ];

  return (
    <TableLobby
      room={room}
      send={send}
      {...rest}
      shareTitle="Viens jouer à Briques"
      startLabel={s.sprint ? "Lancer le chrono" : "Lancer la partie"}
      hostWillStart="va lancer la partie"
      canStart={canStart}
      startHint={
        s.sprint
          ? "Le solo se joue seul à la table."
          : teamsReady
            ? room.seats.length < 4
              ? "Il faut quatre joueurs pour jouer en équipes : ajoute des bots."
              : "Il faut deux joueurs dans chaque équipe."
            : undefined
      }
      seatNote={teamsReady ? (seat) => `équipe ${BRICK_TEAMS[seat.team ?? 0]}` : undefined}
      aside={teamsReady ? <TeamsPanel room={room} send={send} names={BRICK_TEAMS} colors={["#e0574a", "#5b8fe8"]} /> : undefined}
      rules={
        <section className="rules-sheet panel">
          <RulesHeading room={room} />

          <div className="field">
            <span className="field-label">Partie</span>
            <Options<"battle" | "sprint">
              label="Partie"
              value={s.sprint ? "sprint" : "battle"}
              disabled={!isHost}
              onChange={(v) => update({ sprint: v === "sprint" })}
              options={[
                { value: "battle", label: "Bataille" },
                { value: "sprint", label: "Solo 40 lignes" },
              ]}
            />
            <p className="hint" style={{ margin: 0 }}>
              {s.sprint
                ? "Seul contre la montre : 40 lignes le plus vite possible, et ton record au classement."
                : "Faire des lignes envoie des lignes grises chez les autres. La première pile qui déborde perd."}
            </p>
          </div>

          {!s.sprint && (
            <>
              <div className="field">
                <span className="field-label">Victoire</span>
                <Options<BricksWin>
                  label="Victoire"
                  value={s.win}
                  disabled={!isHost}
                  onChange={(win) => update({ win })}
                  options={[
                    { value: "survival", label: "Dernier debout" },
                    { value: "ko", label: "Au chrono, aux K.O." },
                  ]}
                />
                <p className="hint" style={{ margin: 0 }}>
                  {s.win === "ko"
                    ? "Une pile qui déborde repart de zéro et compte un K.O. pour celui qui l'a fait tomber. À la fin du chrono, le plus de K.O. gagne."
                    : "Une seule vie. Après 3 minutes, la marée monte : une ligne grise toutes les 5 secondes pour tout le monde."}
                </p>
              </div>

              <div className="rules-two">
                {s.win === "ko" && (
                  <div className="field">
                    <span className="field-label">Durée d'une manche</span>
                    <Options<2 | 3>
                      label="Durée d'une manche"
                      value={s.minutes}
                      disabled={!isHost}
                      onChange={(minutes) => update({ minutes })}
                      options={[
                        { value: 2, label: "2 min" },
                        { value: 3, label: "3 min" },
                      ]}
                    />
                  </div>
                )}
                <div className="field">
                  <span className="field-label">Série</span>
                  <Options<1 | 2 | 3>
                    label="Série"
                    value={s.series}
                    disabled={!isHost}
                    onChange={(series) => update({ series })}
                    options={[
                      { value: 1, label: "1 manche" },
                      { value: 2, label: "2 gagnantes" },
                      { value: 3, label: "3 gagnantes" },
                    ]}
                  />
                </div>
              </div>
            </>
          )}

          <div className="rule-list">
            {toggles
              .filter((r) => !(s.sprint && (r.key === "messy" || r.key === "teams")))
              .map((r) => {
                const off = !isHost || r.disabled;
                return (
                  <div
                    key={r.key}
                    className={`rule-row ${r.disabled ? "is-forced" : ""}`}
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

          <div className="field">
            <span className="field-label">Pièces suivantes affichées</span>
            <Options<1 | 3 | 5>
              label="Pièces suivantes affichées"
              value={s.previews}
              disabled={!isHost}
              onChange={(previews) => update({ previews })}
              options={[
                { value: 1, label: "1" },
                { value: 3, label: "3" },
                { value: 5, label: "5" },
              ]}
            />
          </div>

          {!s.sprint && (
            <div className="field">
              <span className="field-label">Niveau des bots</span>
              <Options<BotLevel>
                label="Niveau des bots"
                value={s.botLevel}
                disabled={!isHost}
                onChange={(botLevel) => update({ botLevel })}
                options={[
                  { value: "apprenti", label: "Apprenti" },
                  { value: "confirme", label: "Confirmé" },
                  { value: "expert", label: "Expert" },
                ]}
              />
              <p className="hint" style={{ margin: 0 }}>
                {BOT_HINTS[s.botLevel]}
              </p>
            </div>
          )}

          {!s.sprint && <TableSize room={room} send={send} max={BRICKS_MAX_PLAYERS} />}
        </section>
      }
    />
  );
}
