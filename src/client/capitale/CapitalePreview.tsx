import { seededAvatar } from "../../shared/avatar.ts";
import { createGame, DEFAULT_SETTINGS } from "../../shared/games/capitale/engine.ts";
import { viewFor } from "../../shared/games/capitale/view.ts";
import type { SeatView } from "../../shared/protocol.ts";
import { Board } from "./Board.tsx";
import "./capitale.css";

// Une partie en cours, figée : des groupes achetés, des maisons, un hôtel, trois pions en route
const SAMPLE = (() => {
  const { state } = createGame(["a", "b", "c"], DEFAULT_SETTINGS, 11);
  const own = (id: string, ...squares: number[]) => squares.forEach((i) => (state.deeds[i]!.owner = id));
  own("a", 37, 39, 5, 12);
  own("b", 16, 18, 19, 25);
  own("c", 21, 23, 24, 6, 8, 9);
  state.deeds[37]!.houses = 3;
  state.deeds[39]!.houses = 5;
  for (const i of [16, 18, 19]) state.deeds[i]!.houses = 2;
  for (const i of [21, 23, 24]) state.deeds[i]!.houses = 1;
  state.deeds[8]!.mortgaged = true;
  state.players[0]!.position = 24;
  state.players[1]!.position = 7;
  state.players[2]!.position = 33;
  state.turn = 0;
  return viewFor(state, null);
})();

const NAMES: Record<string, string> = { a: "Hubert", b: "Odile", c: "Colette" };
const SEATS = Object.fromEntries(
  Object.entries(NAMES).map(([id, name]) => [
    id,
    { id, name, avatar: seededAvatar(`apercu-${name}`), userId: null, photo: 0 } as unknown as SeatView,
  ]),
);

/** L'illustration de Capitale sur l'accueil : un vrai plateau de jeu, en petit. */
export function CapitalePreview({ px }: { px: number }) {
  return (
    <div className="capitale-preview cap-root" style={{ width: px, height: px }}>
      <div className="cap-board-box" style={{ width: px, height: px }}>
        <Board
          g={SAMPLE}
          shown={{}}
          dice={{ values: [4, 2], rollId: 0 }}
          tilted={false}
          compact
          seat={(id) => SEATS[id]}
          highlight={null}
          onSquare={() => {}}
        />
      </div>
    </div>
  );
}
