import {
  LONG_WORD,
  LIVES_CHOICES,
  type BotLevel,
  type Difficulty,
  type LetterSource,
  type MecheSettings,
  type Pace,
  type FuseChoice,
} from "../../shared/games/meche/engine.ts";
import { bombInfo } from "../../shared/games/meche/bombs.ts";
import { MECHE_MAX_PLAYERS, type MecheClientMessage, type MecheRoomView } from "../../shared/protocol.ts";
import { Check, Options } from "../components/ui.tsx";
import { RulesHeading, TableLobby, TableSize } from "../game/TableLobby.tsx";
import { BombPicker } from "./bombs/BombPicker.tsx";

/** Les trois façons de faire brûler la mèche, et ce qu'on lit sous le choix */
const MODES: { value: FuseChoice; label: string; rule: string }[] = [
  {
    value: "commune",
    label: "Classique",
    rule: "Chaque joueur reçoit une mèche neuve, dont personne ne connaît la longueur : elle peut sauter à tout moment dès que l'étincelle entre dans la zone rouge. Elle raccourcit à chaque mot, et ce qu'un joueur traîne ne retombe jamais sur le suivant.",
  },
  {
    value: "rallonge",
    label: "À rallonge",
    rule: "Une seule mèche pour tous, qui brûle de plus en plus vite. Chaque bon mot la fait reculer, et personne ne peut la refiler presque finie : le suivant en reçoit toujours au moins les quatre cinquièmes de ce que tu avais reçu.",
  },
  {
    value: "chacun",
    label: "Chacun la sienne",
    rule: "Chacun a sa propre mèche, qui ne brûle que pendant son tour : le premier qui arrive au bout perd une allumette, puis tout le monde repart avec une mèche neuve.",
  },
  {
    value: "hasard",
    label: "Au hasard",
    rule: "Le mode est tiré au sort au début de chaque partie : classique, à rallonge ou chacun sa mèche. Il est annoncé au lancement.",
  },
];

const PACE_HINTS: Record<Pace, string> = {
  pose: "La mèche brûle lentement : le temps de chercher, idéal pour découvrir.",
  normal: "Le rythme habituel, de plus en plus serré au fil de la partie.",
  nerveux: "Tout va plus vite : il faut trouver du premier coup.",
};

const DIFFICULTY_HINTS: Record<Difficulty, string> = {
  simple: "Des lettres qu'on retrouve dans beaucoup de mots.",
  normal: "Faciles au début, de plus en plus dures au fil des explosions.",
  corse: "Des lettres pas commodes dès la première mèche.",
};

const SOURCE_HINTS: Record<LetterSource, string> = {
  hasard: "Les lettres à placer sont tirées au sort à chaque mot.",
  marabout: "Les lettres à placer sont les deux dernières du mot d'avant : choisis bien comment tu finis pour embêter ton voisin.",
};

const BOT_HINTS: Record<BotLevel, string> = {
  facile: "Peu de vocabulaire, et il prend son temps.",
  moyen: "Connaît les mots courants et tape à bonne allure.",
  fort: "Beaucoup de vocabulaire, et des doigts rapides.",
};

interface Props {
  room: MecheRoomView;
  send: (msg: MecheClientMessage) => void;
  unread: number;
  onOpenChat: () => void;
  onLeave: () => void;
  onBackToGame?: () => void;
}

/** Le salon d'une table de Mèche : le salon commun et les règles de la partie. */
export function MecheLobby({ room, send, ...rest }: Props) {
  const s = room.settings.meche;
  const isHost = room.you.isHost;
  const mode = MODES.find((m) => m.value === s.mode) ?? MODES[0]!;
  const update = (patch: Partial<MecheSettings>) => send({ t: "settings", settings: patch });

  return (
    <TableLobby
      room={room}
      send={send}
      {...rest}
      shareTitle="Viens jouer à Mèche"
      startLabel="Allumer la mèche"
      hostWillStart="va allumer la mèche"
      // La bombe de chacun, vue de toute la table (la dynamite, celle de tout le monde, ne se dit pas)
      seatNote={(seat) => (seat.bomb ? bombInfo(seat.bomb).name : null)}
      aside={room.you.seatId ? <BombPicker /> : null}
      rules={
        <section className="rules-sheet panel">
          <RulesHeading room={room} />

          <div className="meche-howto">
            <p>
              <strong>La mèche passe de main en main.</strong> Quand elle est chez toi, écris un mot qui contient les lettres affichées :
              elle part chez le voisin. Si elle saute dans tes mains, tu perds une allumette. Le dernier à en avoir gagne.
            </p>
            <p className="hint">Les accents ne comptent pas.</p>
          </div>

          <div className="field">
            <span className="field-label">Mode de jeu</span>
            <Options<FuseChoice>
              label="Mode de jeu"
              value={mode.value}
              disabled={!isHost}
              onChange={(next) => update({ mode: next })}
              options={MODES.map(({ value, label }) => ({ value, label }))}
            />
            <p className="hint" style={{ margin: 0 }}>
              {mode.rule}
            </p>
          </div>

          <div className="field">
            <span className="field-label">Allumettes de chacun</span>
            <Options<number>
              label="Allumettes de chacun"
              value={s.lives}
              disabled={!isHost}
              onChange={(lives) => update({ lives })}
              options={LIVES_CHOICES.map((n) => ({ value: n, label: String(n) }))}
            />
          </div>

          <div className="field">
            <span className="field-label">Rythme de la mèche</span>
            <Options<Pace>
              label="Rythme de la mèche"
              value={s.pace}
              disabled={!isHost}
              onChange={(pace) => update({ pace })}
              options={[
                { value: "pose", label: "Posé" },
                { value: "normal", label: "Normal" },
                { value: "nerveux", label: "Nerveux" },
              ]}
            />
            <p className="hint" style={{ margin: 0 }}>
              {PACE_HINTS[s.pace]}
            </p>
          </div>

          <div className="field">
            <span className="field-label">Difficulté des lettres</span>
            <Options<Difficulty>
              label="Difficulté des lettres"
              value={s.difficulty}
              disabled={!isHost}
              onChange={(difficulty) => update({ difficulty })}
              options={[
                { value: "simple", label: "Simples" },
                { value: "normal", label: "Normales" },
                { value: "corse", label: "Corsées" },
              ]}
            />
            <p className="hint" style={{ margin: 0 }}>
              {DIFFICULTY_HINTS[s.difficulty]}
            </p>
          </div>

          <div className="field">
            <span className="field-label">D'où viennent les lettres</span>
            <Options<LetterSource>
              label="D'où viennent les lettres"
              value={s.source}
              disabled={!isHost}
              onChange={(source) => update({ source })}
              options={[
                { value: "hasard", label: "Au hasard" },
                { value: "marabout", label: "Marabout" },
              ]}
            />
            <p className="hint" style={{ margin: 0 }}>
              {SOURCE_HINTS[s.source]}
            </p>
          </div>

          <div className="field">
            <span className="field-label">Règle maison</span>
            <div className="rule-list">
              <div className="rule-row" onClick={() => isHost && update({ passes: !s.passes })}>
                <Check label="Les passes" checked={s.passes} disabled={!isHost} onChange={() => {}} />
                <span>
                  <strong>Les passes</strong>
                  <span className="hint">
                    Un mot de {LONG_WORD} lettres ou plus te donne une passe : elle envoie la mèche au suivant sans écrire de mot. Deux au
                    plus.
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

          <TableSize room={room} send={send} max={MECHE_MAX_PLAYERS} />

          <p className="hint meche-credit">
            Dictionnaire tiré du lexique{" "}
            <a href="https://grammalecte.net" target="_blank" rel="noreferrer">
              Grammalecte
            </a>{" "}
            (licence{" "}
            <a href="https://www.mozilla.org/MPL/2.0/" target="_blank" rel="noreferrer">
              MPL 2.0
            </a>
            ).
          </p>
        </section>
      }
    />
  );
}
