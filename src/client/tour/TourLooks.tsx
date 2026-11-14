// Les skins dans une tournée : on n'y passe pas par le salon de chaque jeu, alors on les choisit ici, au salon de la
// tournée et à l'entracte. Ce sont ceux de cet appareil (les mêmes qu'au salon de chaque jeu) : la tournée les confie à
// chaque table, et chacun retrouve ses choix habituels dès le départ.

import { lazy, Suspense, useState } from "react";
import { SKINS as KART_SKINS, VEHICLES, type SkinId as KartSkinId, type VehicleId } from "../../shared/games/bolides/garage.ts";
import { TOKEN_BY_ID, type TokenId } from "../../shared/games/capitale/tokens.ts";
import { BALL_BY_ID, FETE_BY_ID, type BallId, type FeteId } from "../../shared/games/crampons/boutique.ts";
import { SKIN_BY_ID as NAVAL_SKIN_BY_ID, type SkinId as NavalSkinId } from "../../shared/games/naval/skins.ts";
import { BACK_BY_ID, type BackId } from "../../shared/games/uno/backs.ts";
import { GAME_NAMES, type GameId } from "../../shared/protocol.ts";
import { ballItem, feteItem, kartItem, navalItem, tokenItem, unoItem, vehicleItem } from "../../shared/shop.ts";
import { Modal } from "../components/ui.tsx";
import { usePrefs } from "../stores/prefs.ts";
import { useMyItems } from "../stores/shop.ts";
import { GameTicket } from "./TourParts.tsx";

// Les choix eux-mêmes (avec leurs aperçus en 3D) ne se chargent qu'à l'ouverture
const LooksSheet = lazy(() => import("./LooksSheet.tsx").then((m) => ({ default: m.LooksSheet })));

/** Les jeux où l'on a des skins à choisir */
const LOOK_GAMES: GameId[] = ["uno", "naval", "capitale", "bolides", "crampons"];

/** Les jeux du programme qui ont des skins, dans l'ordre habituel */
export const gamesWithLooks = (games: GameId[]) => LOOK_GAMES.filter((g) => games.includes(g));

export interface CurrentLooks {
  unoBack: BackId;
  navalSkin: NavalSkinId;
  capitaleToken: TokenId;
  bolidesVehicle: VehicleId;
  bolidesSkin: KartSkinId;
  cramponsBall: BallId;
  cramponsFete: FeteId;
}

/** Ce qu'on aura à chaque jeu : le choix de cet appareil s'il est à soi, sinon celui de tout le monde */
export function useCurrentLooks(): CurrentLooks {
  const { has } = useMyItems();
  const unoBack = usePrefs((p) => p.unoBack);
  const navalSkin = usePrefs((p) => p.navalSkin);
  const capitaleToken = usePrefs((p) => p.capitaleToken);
  const bolidesVehicle = usePrefs((p) => p.bolidesVehicle);
  const bolidesSkin = usePrefs((p) => p.bolidesSkin);
  const cramponsBall = usePrefs((p) => p.cramponsBall);
  const cramponsFete = usePrefs((p) => p.cramponsFete);
  return {
    unoBack: unoBack && has(unoItem(unoBack)) ? unoBack : "classique",
    navalSkin: navalSkin && has(navalItem(navalSkin)) ? navalSkin : "marine",
    capitaleToken: capitaleToken && has(tokenItem(capitaleToken)) ? capitaleToken : "pion",
    bolidesVehicle: bolidesVehicle && has(vehicleItem(bolidesVehicle)) ? bolidesVehicle : "kart",
    bolidesSkin: bolidesSkin && has(kartItem(bolidesSkin)) ? bolidesSkin : "usine",
    cramponsBall: cramponsBall && has(ballItem(cramponsBall)) ? cramponsBall : "classique",
    cramponsFete: cramponsFete && has(feteItem(cramponsFete)) ? cramponsFete : "maison",
  };
}

/** Ses skins à un jeu, en quelques mots */
export function looksLabel(game: GameId, l: CurrentLooks): string {
  switch (game) {
    case "uno":
      return `Dos ${quoted(BACK_BY_ID.get(l.unoBack)!.name)}`;
    case "naval":
      return `Flotte ${quoted(NAVAL_SKIN_BY_ID.get(l.navalSkin)!.name)}`;
    case "capitale":
      return `Pion ${quoted(TOKEN_BY_ID.get(l.capitaleToken)!.name)}`;
    case "bolides":
      return `${VEHICLES[l.bolidesVehicle].name}, skin ${quoted(KART_SKINS[l.bolidesSkin].name)}`;
    case "crampons":
      return `Ballon ${quoted(BALL_BY_ID.get(l.cramponsBall)!.name)}, célébration ${quoted(FETE_BY_ID.get(l.cramponsFete)!.name)}`;
    default:
      return "";
  }
}

/** Un nom entre guillemets, qui ne se sépare jamais de ses guillemets en passant à la ligne */
const quoted = (name: string) => `« ${name} »`;

/** La fenêtre des skins : un onglet par jeu du programme qui en a, et le choix de ce jeu */
function LooksModal({
  games,
  game,
  onGame,
  onClose,
}: {
  games: GameId[];
  game: GameId | null;
  onGame: (g: GameId) => void;
  onClose: () => void;
}) {
  return (
    <Modal open={game !== null} onClose={onClose} title="Tes skins" wide>
      {game && (
        <div className="looks-modal">
          {games.length > 1 && (
            <div className="looks-tabs" role="tablist" aria-label="Le jeu">
              {games.map((g) => (
                <button
                  key={g}
                  type="button"
                  role="tab"
                  aria-selected={g === game}
                  className={`looks-tab ${g === game ? "is-active" : ""}`}
                  onClick={() => onGame(g)}
                >
                  {GAME_NAMES[g]}
                </button>
              ))}
            </div>
          )}
          <Suspense
            fallback={
              <p className="lobby-wait looks-loading">
                <span className="spinner" /> Ouverture…
              </p>
            }
          >
            <div className="looks-sheet">
              <LooksSheet game={game} />
            </div>
          </Suspense>
          <p className="hint looks-note">
            Gardés sur cet appareil : tu les retrouves à chaque jeu de la tournée, et au salon de chaque jeu.
          </p>
        </div>
      )}
    </Modal>
  );
}

/** Au salon de la tournée : ses skins pour chaque jeu du programme, et de quoi les changer */
export function TourLooksPanel({ games }: { games: GameId[] }) {
  const list = gamesWithLooks(games);
  const looks = useCurrentLooks();
  const [open, setOpen] = useState<GameId | null>(null);
  if (list.length === 0) return null;
  return (
    <section className="lobby-section panel tour-looks">
      <h2>Tes skins</h2>
      <p className="hint" style={{ margin: 0 }}>
        Ceux choisis sur cet appareil : tu les retrouves à chaque jeu de la tournée.
      </p>
      <ul className="tour-looks-list">
        {list.map((g) => (
          <li key={g}>
            <button type="button" className="tour-game-pick tour-looks-row" onClick={() => setOpen(g)}>
              <GameTicket game={g} size="sm" />
              <span className="tour-game-text">
                <strong>{GAME_NAMES[g]}</strong>
                <span className="hint">{looksLabel(g, looks)}</span>
              </span>
              <span className="btn btn-sm btn-ghost looks-change">Changer</span>
            </button>
          </li>
        ))}
      </ul>
      <LooksModal games={list} game={open} onGame={setOpen} onClose={() => setOpen(null)} />
    </section>
  );
}

/** À l'entracte, une fois le jeu tiré : ses skins pour ce jeu, à changer avant le départ */
export function NextGameLooks({ game, games }: { game: GameId; games: GameId[] }) {
  const looks = useCurrentLooks();
  const [open, setOpen] = useState<GameId | null>(null);
  if (!LOOK_GAMES.includes(game)) return null;
  const list = gamesWithLooks(games.includes(game) ? games : [...games, game]);
  return (
    <div className="next-looks">
      <span className="next-looks-text">
        <span className="hint">Tes skins :</span> {looksLabel(game, looks)}
      </span>
      <button type="button" className="btn btn-sm" onClick={() => setOpen(game)}>
        Changer
      </button>
      <LooksModal games={list} game={open} onGame={setOpen} onClose={() => setOpen(null)} />
    </div>
  );
}
