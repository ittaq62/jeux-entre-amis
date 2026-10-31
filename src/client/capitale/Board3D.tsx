import { useEffect, useRef, useState } from "react";
import type { DeckId } from "../../shared/games/capitale/board.ts";
import type { Deed } from "../../shared/games/capitale/engine.ts";
import type { TokenId } from "../../shared/games/capitale/tokens.ts";
import type { CapitaleView } from "../../shared/games/capitale/view.ts";
import { Icon } from "../components/Icon.tsx";
import { colorOf } from "./boardUi.ts";
import { CapitaleScene, type BuildMode } from "./scene/CapitaleScene.ts";

interface Props {
  g: CapitaleView;
  /** Où chaque pion est affiché (il avance case par case, en retard sur l'état) */
  shown: Record<string, number>;
  /** Les titres tels qu'on les montre (mis à jour au moment de l'achat, de la construction…) */
  deeds: (Deed | null)[];
  /** Le joueur dont c'est le tour, tel qu'on le montre */
  turn: string | null;
  dice: { values: [number, number] | null; rollId: number };
  card: { deck: DeckId; id: number } | null;
  highlight: number | null;
  phone: boolean;
  reduced: boolean;
  onSquare: (index: number) => void;
  /** Le chantier : les cases à allumer, et ce qu'on fait d'un clic ou d'un survol */
  buildMode: BuildMode | null;
  onCell: (square: number, cell: number) => void;
  onHoverCell: (at: { square: number; cell: number } | null) => void;
  /** Le pion de chaque joueur */
  tokens: Record<string, TokenId | undefined>;
}

/** Le plateau en 3D : la scène three.js, ses repères pour les billets, et le bouton pour le faire tourner */
export function Board3D({
  g,
  shown,
  deeds,
  turn,
  dice,
  card,
  highlight,
  phone,
  reduced,
  onSquare,
  buildMode,
  onCell,
  onHoverCell,
  tokens,
}: Props) {
  const box = useRef<HTMLDivElement>(null);
  const bank = useRef<HTMLSpanElement>(null);
  const pot = useRef<HTMLSpanElement>(null);
  const scene = useRef<CapitaleScene | null>(null);
  const [version, setVersion] = useState(0);
  const [failed, setFailed] = useState(false);
  const click = useRef({ onSquare, onCell, onHoverCell });
  click.current = { onSquare, onCell, onHoverCell };
  const lastDice = useRef(dice);
  const thrown = useRef(dice.rollId);

  useEffect(() => {
    if (!box.current) return;
    let s: CapitaleScene;
    try {
      s = new CapitaleScene(box.current, {
        phone,
        reduced,
        onSquare: (i) => click.current.onSquare(i),
        onCell: (sq, c) => click.current.onCell(sq, c),
        onHoverCell: (at) => click.current.onHoverCell(at),
      });
    } catch {
      setFailed(true);
      return;
    }
    scene.current = s;
    // En développement seulement : les tests de l'écran visent les cases à travers la scène
    if (import.meta.env.DEV) (window as unknown as { __capScene?: CapitaleScene }).__capScene = s;
    s.setAnchors({ bank: bank.current, pot: pot.current });
    s.restDice(lastDice.current.values);
    setVersion((v) => v + 1);
    return () => {
      s.dispose();
      scene.current = null;
    };
  }, [phone, reduced]);

  useEffect(() => {
    scene.current?.setState({
      players: g.players.map((p) => ({
        id: p.id,
        color: colorOf(g, p.id),
        token: tokens[p.id],
        position: shown[p.id] ?? p.position,
        inJail: p.inJail,
        bankrupt: p.bankrupt,
      })),
      turn,
      deeds: Object.fromEntries(deeds.flatMap((d, i) => (d ? [[i, d]] : []))),
      highlight,
      pot: g.settings.freeParking ? g.pot : null,
    });
  }, [g, shown, deeds, turn, highlight, version, tokens]);

  // Le chantier : une clé stable, pour ne pas tout rallumer à chaque image
  const buildKey = buildMode ? `${buildMode.kind}|${buildMode.cells.map((c) => `${c.square}:${c.cell}`).join(",")}` : "";
  const build = useRef(buildMode);
  build.current = buildMode;
  useEffect(() => {
    scene.current?.setBuildMode(build.current);
  }, [buildKey, version]);

  useEffect(() => {
    lastDice.current = dice;
    if (dice.rollId === thrown.current || !dice.values) return;
    thrown.current = dice.rollId;
    scene.current?.throwDice(dice.values);
  }, [dice]);

  useEffect(() => {
    if (card) scene.current?.drawCard(card.deck);
  }, [card]);

  if (failed) {
    return (
      <div className="cap-board3d is-failed">
        <p>Le plateau en 3D ne s'affiche pas sur cet appareil. Tu peux quand même jouer avec les boutons et tes titres.</p>
      </div>
    );
  }
  return (
    <div className="cap-board3d" ref={box}>
      <span className="cap-anchor" ref={bank} data-cap-anchor="bank" />
      <span className="cap-anchor" ref={pot} data-cap-anchor="pot" />
      <button
        className="round-btn cap-rotate"
        onClick={() => scene.current?.rotate(1)}
        aria-label="Tourner le plateau"
        title="Tourner le plateau"
      >
        <Icon name="rotate" size={20} />
      </button>
    </div>
  );
}
