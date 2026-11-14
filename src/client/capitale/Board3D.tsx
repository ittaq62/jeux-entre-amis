import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { BUYABLE, type DeckId } from "../../shared/games/capitale/board.ts";
import type { Deed } from "../../shared/games/capitale/engine.ts";
import type { TokenId } from "../../shared/games/capitale/tokens.ts";
import type { CapitaleView } from "../../shared/games/capitale/view.ts";
import { Icon } from "../components/Icon.tsx";
import { toast } from "../lib/toast.ts";
import { usePrefs } from "../stores/prefs.ts";
import { colorOf } from "./boardUi.ts";
import { CapitaleScene, type OwnerFilter } from "./scene/CapitaleScene.ts";
import { teamName } from "../../shared/games/capitale/board.ts";
import { teamIn, TeamMark } from "./teamsUi.tsx";

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
  /** La case sous la souris, pour la bulle qui l'explique */
  onHover: (square: number | null, x: number, y: number) => void;
  /** L'étiquette au-dessus de chaque case achetable */
  tagOf: (square: number) => { text: string; color: string | null; level: number; muted: boolean; mark?: number | null };
  /** Le pion de chaque joueur */
  tokens: Record<string, TokenId | undefined>;
  /** Le nom de chaque joueur (pour le filtre des villes) */
  name: (id: string) => string;
  /** Un joueur à montrer sur le plateau (un clic sur son portrait) ; n change à chaque demande */
  look: { id: string; n: number } | null;
}

/** Les villes qu'on regarde : toutes, les siennes, celles des adversaires, celles d'une équipe, ou celles d'un joueur */
type View = { kind: "mine" } | { kind: "others" } | { kind: "team"; team: number } | { kind: "player"; id: string } | null;

/** Le plateau en 3D : la scène three.js, ses repères pour les billets, et les boutons de la vue */
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
  onHover,
  tagOf,
  tokens,
  name,
  look,
}: Props) {
  const box = useRef<HTMLDivElement>(null);
  const bank = useRef<HTMLSpanElement>(null);
  const pot = useRef<HTMLSpanElement>(null);
  const scene = useRef<CapitaleScene | null>(null);
  const [version, setVersion] = useState(0);
  const [failed, setFailed] = useState(false);
  const [moved, setMoved] = useState(false);
  const [view, setView] = useState<View>(null);
  const [menu, setMenu] = useState(false);
  const menuBox = useRef<HTMLSpanElement>(null);
  const diceZoom = usePrefs((s) => s.capDiceZoom);
  const follow = usePrefs((s) => s.capFollow);
  const hintSeen = usePrefs((s) => s.capViewHint);
  const setPrefs = usePrefs((s) => s.set);
  const [hint, setHint] = useState(false);
  const click = useRef({ onSquare, onHover, tagOf });
  click.current = { onSquare, onHover, tagOf };
  const lastDice = useRef(dice);
  const thrown = useRef(dice.rollId);
  const me = g.you;
  const gRef = useRef(g);
  gRef.current = g;
  // En équipes : les villes de chaque équipe d'un coup, la sienne d'abord
  const myTeam = teamIn(g, me);
  const teamList = [...new Set(g.players.map((p) => teamIn(g, p.id)).filter((x): x is number => x !== null))].sort(
    (a, b) => Number(b === myTeam) - Number(a === myTeam) || a - b,
  );

  useEffect(() => {
    if (!box.current) return;
    let s: CapitaleScene;
    try {
      s = new CapitaleScene(box.current, {
        phone,
        reduced,
        onSquare: (i) => click.current.onSquare(i),
        onHover: (i, x, y) => click.current.onHover(i, x, y),
        tagOf: (i) => click.current.tagOf(i),
        onView: setMoved,
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
    setMoved(false);
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
        team: teamIn(g, p.id),
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

  useEffect(() => {
    lastDice.current = dice;
    if (dice.rollId === thrown.current || !dice.values) return;
    thrown.current = dice.rollId;
    scene.current?.throwDice(dice.values);
  }, [dice]);

  useEffect(() => {
    if (card) scene.current?.drawCard(card.deck);
  }, [card]);

  useEffect(() => scene.current?.setCloseUps({ dice: diceZoom, follow }), [diceZoom, follow, version]);

  useEffect(() => {
    if (look) scene.current?.showPawn(look.id);
  }, [look]);

  useEffect(() => {
    let f: OwnerFilter = null;
    if (view?.kind === "mine") f = (owner) => owner === me;
    else if (view?.kind === "others") f = (owner) => owner !== me;
    else if (view?.kind === "player") f = (owner) => owner === view.id;
    else if (view?.kind === "team") f = (owner) => teamIn(gRef.current, owner) === view.team;
    scene.current?.setFilter(f);
  }, [view, me, version]);

  // Le menu des villes se ferme dès qu'on touche ailleurs
  useEffect(() => {
    if (!menu) return;
    const away = (e: PointerEvent) => {
      if (!menuBox.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [menu]);

  // La première fois : comment bouger la vue, quelques secondes
  useEffect(() => {
    if (hintSeen || failed) return;
    const show = setTimeout(() => setHint(true), 1500);
    const hide = setTimeout(() => {
      setHint(false);
      setPrefs({ capViewHint: true });
    }, 9000);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [hintSeen, failed, setPrefs]);

  if (failed) {
    return (
      <div className="cap-board3d is-failed">
        <p>Le plateau en 3D ne s'affiche pas sur cet appareil. Tu peux quand même jouer avec les boutons et tes titres.</p>
      </div>
    );
  }

  const titlesOf = (id: string) => BUYABLE.filter((i) => deeds[i]?.owner === id).length;
  const others = g.players.filter((p) => p.id !== me && !p.bankrupt);
  const viewLabel =
    view?.kind === "mine"
      ? "tes villes"
      : view?.kind === "others"
        ? "les villes des adversaires"
        : view?.kind === "player"
          ? `les villes de ${name(view.id)}`
          : view?.kind === "team"
            ? view.team === myTeam
              ? "les villes de ton équipe"
              : `les villes des ${teamName(view.team)}`
            : null;
  const toggle = (key: "capDiceZoom" | "capFollow", on: boolean, text: string) => {
    setPrefs({ [key]: on });
    toast({ title: on ? `${text} : activé` : `${text} : désactivé`, duration: 2200 });
  };
  const pick = (v: View) => {
    setView(v);
    setMenu(false);
  };

  return (
    <div className="cap-board3d" ref={box}>
      <span className="cap-anchor" ref={bank} data-cap-anchor="bank" />
      <span className="cap-anchor" ref={pot} data-cap-anchor="pot" />

      <div className={`cap-tools ${g.players.length > 4 ? "is-crowded" : ""}`} role="toolbar" aria-label="La vue du plateau">
        <AnimatePresence>
          {moved && (
            <motion.button
              className="cap-tool is-recenter"
              onClick={() => scene.current?.resetView()}
              data-tip="Revoir tout le plateau"
              aria-label="Recentrer la vue"
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0 }}
            >
              <Icon name="focus" size={20} />
            </motion.button>
          )}
        </AnimatePresence>
        <button className="cap-tool" onClick={() => scene.current?.rotate(1)} data-tip="Tourner le plateau" aria-label="Tourner le plateau">
          <Icon name="rotate" size={20} />
        </button>
        <button
          className={`cap-tool ${diceZoom ? "is-on" : ""}`}
          onClick={() => toggle("capDiceZoom", !diceZoom, "Dés en grand")}
          aria-pressed={diceZoom}
          data-tip="Dés en grand : la caméra s'approche à chaque lancer"
          aria-label="Dés en grand"
        >
          <Icon name="dice" size={20} />
        </button>
        <button
          className={`cap-tool ${follow ? "is-on" : ""}`}
          onClick={() => toggle("capFollow", !follow, "Suivre le pion")}
          aria-pressed={follow}
          data-tip="Suivre le pion : la caméra accompagne le pion qui avance"
          aria-label="Suivre le pion"
        >
          <Icon name="target" size={20} />
        </button>
        <span className="cap-tool-wrap" ref={menuBox}>
          <button
            className={`cap-tool ${view ? "is-on" : ""}`}
            onClick={() => setMenu(!menu)}
            aria-expanded={menu}
            data-tip="Voir les villes d'un joueur"
            aria-label="Voir les villes d'un joueur"
          >
            <Icon name="layers" size={20} />
          </button>
          <AnimatePresence>
            {menu && (
              <motion.div
                className="cap-filter-menu"
                role="menu"
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                transition={{ duration: 0.14 }}
              >
                <strong>Voir les villes de…</strong>
                <button className={`cap-filter-item ${view === null ? "is-on" : ""}`} role="menuitem" onClick={() => pick(null)}>
                  <span className="cap-filter-dot is-all" /> Tout le monde
                </button>
                {g.players.some((p) => p.id === me) && (
                  <button
                    className={`cap-filter-item ${view?.kind === "mine" ? "is-on" : ""}`}
                    role="menuitem"
                    onClick={() => pick({ kind: "mine" })}
                  >
                    <span className="cap-filter-dot" style={{ background: colorOf(g, me!) }} /> Moi
                    <em>{titlesOf(me!)}</em>
                  </button>
                )}
                {teamList.map((team) => (
                  <button
                    key={`t${team}`}
                    className={`cap-filter-item ${view?.kind === "team" && view.team === team ? "is-on" : ""}`}
                    role="menuitem"
                    onClick={() => pick({ kind: "team", team })}
                  >
                    <TeamMark team={team} size={14} /> {team === myTeam ? "Mon équipe" : `Les ${teamName(team)}`}
                    <em>{g.players.filter((p) => teamIn(g, p.id) === team).reduce((n, p) => n + titlesOf(p.id), 0)}</em>
                  </button>
                ))}
                {me && others.length > 1 && (
                  <button
                    className={`cap-filter-item ${view?.kind === "others" ? "is-on" : ""}`}
                    role="menuitem"
                    onClick={() => pick({ kind: "others" })}
                  >
                    <span className="cap-filter-dot is-others" /> Tous mes adversaires
                  </button>
                )}
                {others.map((p) => (
                  <button
                    key={p.id}
                    className={`cap-filter-item ${view?.kind === "player" && view.id === p.id ? "is-on" : ""}`}
                    role="menuitem"
                    onClick={() => pick({ kind: "player", id: p.id })}
                  >
                    <span className="cap-filter-dot" style={{ background: colorOf(g, p.id) }} /> {name(p.id)}
                    <em>{titlesOf(p.id)}</em>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </span>
      </div>

      <AnimatePresence>
        {viewLabel && (
          <motion.button
            className="cap-filter-chip"
            onClick={() => setView(null)}
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 10, opacity: 0 }}
          >
            <Icon name="layers" size={16} /> Tu vois {viewLabel}
            <span className="cap-filter-chip-x">
              <Icon name="close" size={14} />
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {hint && (
          <motion.p
            className="cap-view-hint"
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 10, opacity: 0 }}
            onClick={() => setHint(false)}
          >
            {phone ? "Glisse un doigt pour te déplacer, pince pour zoomer" : "Glisse avec la souris pour te déplacer, molette pour zoomer"}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
