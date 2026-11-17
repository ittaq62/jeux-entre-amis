import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { SQUARES } from "../../shared/games/capitale/board.ts";
import {
  annexable,
  annexCost,
  annexedOf,
  areaOf,
  BUILD_ORDER,
  buildCost,
  builderRight,
  BUILDS,
  cityRent,
  footprint,
  kindProblem,
  lotOf,
  NUISANCE_REACH,
  placeProblem,
  refundOf,
  relocateProblem,
  type BuildKind,
  type Placed,
} from "../../shared/games/capitale/builder.ts";
import {
  baseSize,
  cellIndex,
  cellX,
  cellZ,
  MAP,
  MAP_CITIES,
  maxAnnex,
  rectCells,
  rectGap,
} from "../../shared/games/capitale/builderMap.ts";
import type { CapitaleAction } from "../../shared/games/capitale/engine.ts";
import type { CapitaleView } from "../../shared/games/capitale/view.ts";
import { Icon } from "../components/Icon.tsx";
import { asState, colorOf, money } from "./boardUi.ts";
import type { BuilderPreview } from "./scene/builderCity.ts";
import { buildThumb } from "./scene/thumbs.ts";

// Capitale Builder : le chantier d'une ville. On choisit un bâtiment, on le promène sur la carte (vert : il tient,
// rouge : il déborde ou chevauche), on le tourne, on le pose ; on choisit un bâtiment posé pour le déplacer, le tourner
// ou le démolir ; on annexe le terrain vague doré qui touche la frontière.
// À la souris, le bâtiment suit le pointeur et un clic le pose ; au doigt, on touche une case pour l'y mettre, puis
// « Poser ici » (ou on touche la même case une seconde fois).

export type CellHandler = (kind: "hover" | "tap", cell: number | null) => void;

type Tool =
  { kind: "look" } | { kind: "place"; build: BuildKind; rot: number } | { kind: "move"; id: number; rot: number } | { kind: "annex" };

interface Props {
  g: CapitaleView;
  square: number;
  me: string;
  phone: boolean;
  act: (a: CapitaleAction) => void;
  /** La scène nous passe les cases visées par ici */
  cells: { current: CellHandler | null };
  onPreview: (p: BuilderPreview | null) => void;
  /** Une autre de mes villes touchée sur la carte : le chantier y passe */
  onSwitch: (square: number) => void;
  onClose: () => void;
}

/** Le coin d'un bâtiment centré sur une case (le milieu de son emprise sous le doigt) */
function anchor(kind: BuildKind, rot: number, cell: number): { x: number; z: number } {
  const info = BUILDS[kind];
  const w = rot & 1 ? info.d : info.w;
  const d = rot & 1 ? info.w : info.d;
  return { x: cellX(cell) - Math.floor((w - 1) / 2), z: cellZ(cell) - Math.floor((d - 1) / 2) };
}

/** Les cases à portée d'une nuisance posée là, hors de son emprise */
function reachCells(r: { x: number; z: number; w: number; d: number }): number[] {
  const out: number[] = [];
  for (let z = r.z - NUISANCE_REACH; z < r.z + r.d + NUISANCE_REACH; z++)
    for (let x = r.x - NUISANCE_REACH; x < r.x + r.w + NUISANCE_REACH; x++) {
      if (x < 0 || z < 0 || x >= MAP || z >= MAP) continue;
      if (x >= r.x && x < r.x + r.w && z >= r.z && z < r.z + r.d) continue;
      out.push(cellIndex(x, z));
    }
  return out;
}

export function BuilderPanel({ g, square, me, phone, act, cells, onPreview, onSwitch, onClose }: Props) {
  const s = asState(g);
  const sq = SQUARES[square]!;
  const deed = g.deeds[square];
  const lot = lotOf(deed);
  const right = builderRight(s, me);
  const area = areaOf(s, square);
  const color = colorOf(g, me);
  const [tool, setTool] = useState<Tool>({ kind: "look" });
  const [cursor, setCursor] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [confirmDemolish, setConfirmDemolish] = useState(false);
  const rent = cityRent(s, square);
  const used = lot.reduce((n, b) => n + BUILDS[b.kind].w * BUILDS[b.kind].d, 0);
  const sel = selected !== null ? (lot.find((b) => b.id === selected) ?? null) : null;

  // Le bâtiment choisi a disparu (démoli, abattu) : on le lâche
  useEffect(() => {
    if (selected !== null && !sel) setSelected(null);
    if (tool.kind === "move" && !lot.some((b) => b.id === tool.id)) setTool({ kind: "look" });
  }, [selected, sel, tool, lot]);

  /** Ce qu'on s'apprête à poser (ou à déplacer) sous le curseur, et si ça tient */
  const plan = useMemo(() => {
    if (tool.kind !== "place" && tool.kind !== "move") return null;
    const moving = tool.kind === "move" ? lot.find((b) => b.id === tool.id) : undefined;
    const kind = tool.kind === "place" ? tool.build : moving?.kind;
    if (!kind) return null;
    const at = cursor ?? (moving ? cellIndex(moving.x, moving.z) : null);
    if (at === null) return { kind, rot: tool.rot, x: null, z: null, problem: phone ? null : "Vise une case de la ville.", gain: 0 };
    const { x, z } = moving && cursor === null ? { x: moving.x, z: moving.z } : anchor(kind, tool.rot, at);
    const problem =
      tool.kind === "place" ? placeProblem(s, me, square, kind, x, z, tool.rot) : relocateProblem(s, me, square, tool.id, x, z, tool.rot);
    let gain = 0;
    if (!problem) {
      const extra: Placed = { id: -1, kind, x, z, rot: tool.rot };
      const after = cityRent(s, square, { extra, ...(moving ? { skip: moving.id } : {}) }).total;
      gain = after - rent.total;
    }
    return { kind, rot: tool.rot, x, z, problem, gain };
  }, [tool, cursor, g, square, me, phone]);

  /** Une nuisance : ce qu'elle ferait perdre aux villes d'à côté */
  const harm = useMemo(() => {
    if (!plan || plan.x === null || !BUILDS[plan.kind].nuisance) return null;
    const rect = footprint({ kind: plan.kind, x: plan.x, z: plan.z!, rot: plan.rot });
    let mine = 0;
    let others = 0;
    for (const i of MAP_CITIES) {
      if (i === square) continue;
      const d = g.deeds[i];
      if (!d?.owner || lotOf(d).length === 0) continue;
      if (!lotOf(d).some((b) => rectGap(footprint(b), rect) <= NUISANCE_REACH)) continue;
      const loss = cityRent(s, i).total - cityRent(s, i, { extraNuisance: { rect, owner: me } }).total;
      if (d.owner === me) mine += loss;
      else others += loss;
    }
    return { mine, others };
  }, [plan, g, square, me]);

  // L'aperçu sur la carte
  useEffect(() => {
    const out: BuilderPreview = { cells: [], ghost: null, selected: null };
    if (plan && plan.x !== null && plan.z !== null) {
      const rect = footprint({ kind: plan.kind, x: plan.x, z: plan.z, rot: plan.rot });
      const ignore = tool.kind === "move" ? tool.id : null;
      const taken = new Set(lot.filter((b) => b.id !== ignore).flatMap((b) => rectCells(footprint(b))));
      for (let z = rect.z; z < rect.z + rect.d; z++)
        for (let x = rect.x; x < rect.x + rect.w; x++) {
          if (x < 0 || z < 0 || x >= MAP || z >= MAP) continue;
          const c = cellIndex(x, z);
          out.cells.push({ cell: c, tone: area.has(c) && !taken.has(c) ? "ok" : "bad" });
        }
      if (BUILDS[plan.kind].nuisance) for (const c of reachCells(rect)) out.cells.push({ cell: c, tone: "reach" });
      out.ghost = { id: -1, kind: plan.kind, x: plan.x, z: plan.z, rot: plan.rot, square, ok: plan.problem === null, color };
    } else if (tool.kind === "annex") {
      for (const c of annexable(s, square)) out.cells.push({ cell: c, tone: "annex" });
    }
    if (sel && tool.kind === "look") out.selected = footprint(sel);
    onPreview(out);
  }, [plan, tool, sel, g, square]);
  useEffect(() => () => onPreview(null), []);

  /** Poser (ou déplacer) le bâtiment là où il est, ou centré sur une case précise (le clic de la souris) */
  const place = (at?: number) => {
    if (tool.kind !== "place" && tool.kind !== "move") return;
    let x: number;
    let z: number;
    if (at !== undefined) {
      const kind = tool.kind === "place" ? tool.build : lot.find((b) => b.id === tool.id)?.kind;
      if (!kind) return;
      ({ x, z } = anchor(kind, tool.rot, at));
      const problem =
        tool.kind === "place" ? placeProblem(s, me, square, kind, x, z, tool.rot) : relocateProblem(s, me, square, tool.id, x, z, tool.rot);
      if (problem) return setCursor(at);
    } else {
      if (!plan || plan.x === null || plan.z === null || plan.problem) return;
      x = plan.x;
      z = plan.z;
    }
    if (tool.kind === "place") {
      act({ type: "build", square, kind: tool.build, x, z, rot: tool.rot });
      // Au doigt, on repart d'une case vide ; à la souris, le bâtiment suivant suit le pointeur
      if (phone) setCursor(null);
    } else {
      act({ type: "relocate", square, id: tool.id, x, z, rot: tool.rot });
      setSelected(tool.id);
      setTool({ kind: "look" });
      setCursor(null);
    }
  };

  // Les cases visées sur la carte
  const handler = useRef<CellHandler>(() => {});
  handler.current = (kind, cell) => {
    if (tool.kind === "place" || tool.kind === "move") {
      if (kind === "hover") {
        if (!phone) setCursor(cell);
        return;
      }
      if (cell === null) return;
      // Au doigt : une première touche place le bâtiment, une seconde sur la même case le pose
      if (phone && cell !== cursor) {
        setCursor(cell);
        return;
      }
      // À la souris : on pose là où l'on clique (ou l'on montre pourquoi ça ne tient pas)
      if (!phone) return place(cell);
      place();
      return;
    }
    if (kind !== "tap" || cell === null) return;
    if (tool.kind === "annex") {
      if (annexable(s, square).includes(cell)) act({ type: "annex", square, cell });
      return;
    }
    // Choisir un bâtiment de la ville, ou passer au chantier d'une autre de ses villes
    const hit = lot.find((b) => rectCells(footprint(b)).includes(cell));
    if (hit) {
      setSelected(hit.id === selected ? null : hit.id);
      setConfirmDemolish(false);
      return;
    }
    if (area.has(cell)) {
      setSelected(null);
      return;
    }
    const other = MAP_CITIES.find((i) => i !== square && g.deeds[i]?.owner === me && areaOf(s, i).has(cell));
    if (other !== undefined) onSwitch(other);
    else setSelected(null);
  };
  useEffect(() => {
    cells.current = (kind, cell) => handler.current(kind, cell);
    return () => {
      cells.current = null;
    };
  }, [cells]);

  // Une confirmation de démolition ne vaut que pour le bâtiment choisi à ce moment
  useEffect(() => setConfirmDemolish(false), [sel?.id, square]);

  // Au clavier : R tourne, Échap annule (ou ferme), Suppr démolit le bâtiment choisi, après confirmation comme le bouton
  // (un premier appui demande « Démolir ? », un second démolit ; une touche tenue ne compte qu'une fois)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
      if (t instanceof HTMLElement && t.isContentEditable) return;
      if (e.key === "r" || e.key === "R") {
        if (tool.kind === "place" || tool.kind === "move") setTool({ ...tool, rot: (tool.rot + 1) & 3 });
      } else if (e.key === "Escape") {
        if (tool.kind !== "look") setTool({ kind: "look" });
        else if (selected !== null) setSelected(null);
        else onClose();
      } else if ((e.key === "Delete" || e.key === "Backspace") && sel && !e.repeat) {
        if (!confirmDemolish) return setConfirmDemolish(true);
        act({ type: "demolish", square, id: sel.id });
        setConfirmDemolish(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tool, selected, sel, square, confirmDemolish]);

  const kinds = BUILD_ORDER.filter((k) => g.settings.specials || !BUILDS[k].special);
  const annexed = annexedOf(deed).length;
  const blocked = right === null ? (g.step === "auction" ? "Pas de travaux pendant une enchère." : "Pas de travaux pour l'instant.") : null;
  const selRent = sel ? rent.buildings.find((b) => b.id === sel.id) : undefined;

  return (
    <motion.div
      className={`cap-build ${phone ? "is-phone" : ""}`}
      initial={{ y: 30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 30, opacity: 0 }}
      role="region"
      aria-label={`Le chantier de ${sq.name}`}
    >
      <header className="cap-build-head">
        <strong>{sq.name}</strong>
        <span className="cap-build-stat">
          loyer <b className="num">{money(rent.total)}</b>
        </span>
        <span className="cap-build-stat">
          <b className="num">{used}</b>/{area.size} cases
        </span>
        {rent.full && <span className="cap-build-full">quartier complet : ×2</span>}
        <span className="cap-build-spacer" />
        <button
          className={`cap-small ${tool.kind === "annex" ? "is-on" : ""}`}
          disabled={right !== "full" || annexed >= maxAnnex(square)}
          onClick={() => setTool(tool.kind === "annex" ? { kind: "look" } : { kind: "annex" })}
          title={`Une case de terrain vague : ${money(annexCost(square))} (${annexed}/${maxAnnex(square)} annexées)`}
        >
          <Icon name="plus" size={16} /> Annexer
        </button>
        <button className="cap-small" onClick={onClose} aria-label="Fermer le chantier">
          <Icon name="check" size={16} /> Terminé
        </button>
      </header>

      {blocked && <p className="cap-build-note">{blocked}</p>}
      {right === "raise" && (
        <p className="cap-build-note is-bad">Tu dois de l'argent : tu peux seulement démolir (la banque rend la moitié).</p>
      )}

      <>
        {tool.kind === "annex" ? (
          <motion.div key="annex" className="cap-build-row" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <p className="cap-build-hint">
              {phone ? "Touche" : "Clique"} une case dorée pour repousser la frontière : <b className="num">{money(annexCost(square))}</b>{" "}
              la case, {annexed}/{maxAnnex(square)} déjà prises ({baseSize(square)} cases au départ).
              {annexable(s, square).length === 0 && " Plus aucune case libre ne touche la ville."}
            </p>
            <button className="cap-small" onClick={() => setTool({ kind: "look" })}>
              Fini
            </button>
          </motion.div>
        ) : tool.kind === "place" || tool.kind === "move" ? (
          <motion.div key="place" className="cap-build-row" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <img className="cap-build-thumb" src={buildThumb(plan?.kind ?? "maison", square, color, 96)} alt="" width={44} height={44} />
            <p className="cap-build-hint">
              <strong>
                {tool.kind === "move" ? "Déplacer : " : ""}
                {BUILDS[plan?.kind ?? "maison"].name}
              </strong>{" "}
              {tool.kind === "place" && <b className="num">{money(buildCost(tool.build, square))}</b>}
              {plan?.problem ? (
                <span className="cap-build-why">{plan.problem}</span>
              ) : plan && plan.x !== null ? (
                <span className="cap-build-gain">
                  loyer {plan.gain >= 0 ? "+" : "−"}
                  {money(Math.abs(plan.gain))}
                  {harm && harm.others > 0 && <> · voisins −{money(harm.others)}</>}
                  {harm && harm.mine > 0 && <> · tes villes −{money(harm.mine)}</>}
                </span>
              ) : (
                <span className="cap-build-why">{phone ? "Touche une case de la ville." : "Vise une case de la ville."}</span>
              )}
            </p>
            <button
              className="cap-small"
              onClick={() => setTool({ ...tool, rot: (tool.rot + 1) & 3 })}
              title="Tourner d'un quart de tour (touche R)"
            >
              <Icon name="rotate" size={16} /> Tourner
            </button>
            {phone && (
              <button className="cap-small is-go" disabled={!plan || plan.x === null || plan.problem !== null} onClick={() => place()}>
                <Icon name="check" size={16} /> {tool.kind === "move" ? "Ici" : "Poser"}
              </button>
            )}
            <button className="cap-small" onClick={() => (setTool({ kind: "look" }), setCursor(null))} aria-label="Annuler">
              <Icon name="close" size={16} />
            </button>
          </motion.div>
        ) : sel ? (
          <motion.div
            key={`sel${sel.id}`}
            className="cap-build-row"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <img className="cap-build-thumb" src={buildThumb(sel.kind, square, color, 96)} alt="" width={44} height={44} />
            <p className="cap-build-hint">
              <strong>{BUILDS[sel.kind].name}</strong> rapporte <b className="num">{money(selRent?.rent ?? 0)}</b>
              {selRent && selRent.parcs > 0 && <span className="cap-build-gain"> · parc +{selRent.parcs * 30} %</span>}
              {selRent && selRent.neighbors > 0 && <span className="cap-build-gain"> · {selRent.neighbors} voisin(s)</span>}
              {selRent && selRent.nuisances > 0 && (
                <span className="cap-build-why"> · nuisance −{Math.min(60, selRent.nuisances * 30)} %</span>
              )}
            </p>
            {!BUILDS[sel.kind].nuisance && (
              <button
                className="cap-small"
                disabled={right !== "full"}
                onClick={() => (setTool({ kind: "move", id: sel.id, rot: sel.rot }), setCursor(null))}
              >
                <Icon name="swap" size={16} /> Déplacer
              </button>
            )}
            {!BUILDS[sel.kind].nuisance && (
              <button
                className="cap-small"
                disabled={right !== "full" || relocateProblem(s, me, square, sel.id, sel.x, sel.z, (sel.rot + 1) & 3) !== null}
                onClick={() => act({ type: "relocate", square, id: sel.id, x: sel.x, z: sel.z, rot: (sel.rot + 1) & 3 })}
                title={relocateProblem(s, me, square, sel.id, sel.x, sel.z, (sel.rot + 1) & 3) ?? "Un quart de tour, sur place"}
              >
                <Icon name="rotate" size={16} /> Tourner
              </button>
            )}
            <button
              className={`cap-small ${confirmDemolish ? "is-bad" : ""}`}
              disabled={right === null}
              onClick={() => {
                if (!confirmDemolish) return setConfirmDemolish(true);
                act({ type: "demolish", square, id: sel.id });
                setConfirmDemolish(false);
              }}
            >
              <Icon name="trash" size={16} /> {confirmDemolish ? `Démolir ? +${money(refundOf(sel.kind, square))}` : "Démolir"}
            </button>
          </motion.div>
        ) : (
          <motion.div key="palette" className="cap-build-palette" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {kinds.map((k) => {
              const why = kindProblem(s, me, square, k);
              const info = BUILDS[k];
              return (
                <button
                  key={k}
                  className={`cap-build-card ${info.nuisance ? "is-nuisance" : ""}`}
                  disabled={why !== null}
                  onClick={() => (setTool({ kind: "place", build: k, rot: 0 }), setSelected(null), setCursor(null))}
                  title={why ?? info.effect}
                >
                  <img src={buildThumb(k, square, color, 96)} alt="" width={phone ? 32 : 48} height={phone ? 32 : 48} draggable={false} />
                  <span className="cap-build-card-name">{info.name}</span>
                  <span className="cap-build-card-meta">
                    {!phone && `${info.w}×${info.d} · `}
                    <span className="num">{money(buildCost(k, square))}</span>
                  </span>
                </button>
              );
            })}
            {!phone && (
              <p className="cap-build-tip hint">
                Touche un bâtiment posé pour le déplacer, le tourner ou le démolir. R tourne, Échap annule.
              </p>
            )}
          </motion.div>
        )}
      </>
    </motion.div>
  );
}
