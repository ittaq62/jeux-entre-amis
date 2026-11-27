// Les cinématiques de la campagne, jouées dans le moteur du jeu : Mémé (ou le patron de la cuisine) en 3D devant son
// décor, qui parle dans une bulle pendant que la caméra s'approche doucement ; la brigade répond. L'intro (Mémé confie
// sa roulotte), l'arrivée dans chaque nouvelle cuisine, le grand final. On passe une réplique d'un toucher, ou tout
// d'un coup avec « Passer ».

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ARRIVALS, FINALE, HOSTS, INTRO, MEME, type Host, type Line } from "../../shared/games/toque/campaign.ts";
import { KITCHENS, type KitchenId } from "../../shared/games/toque/kitchens.ts";
import type { AvatarConfig } from "../../shared/avatar.ts";
import { headCanvas } from "../bolides/scene/faces.ts";
import { releaseRenderer } from "../lib/releaseGl.ts";
import { useSession } from "../stores/session.ts";
import { ChefModel } from "./scene/chef.ts";
import { THEMES } from "./scene/themes.ts";

const SEEN_KEY = "tq-vu";

function seen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

/** Cette cinématique a déjà été vue sur cet appareil */
export function storySeen(id: string): boolean {
  return seen().has(id);
}

export function markStorySeen(id: string) {
  const s = seen();
  s.add(id);
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...s]));
  } catch {
    // le navigateur refuse : on la reverra
  }
}

export const arrivalSeen = (k: KitchenId) => storySeen(`arrivee:${k}`);
export const markArrivalSeen = (k: KitchenId) => markStorySeen(`arrivee:${k}`);

const hostAvatar = (h: Host): AvatarConfig => ({ ...h.look });

/** La scène de la cinématique : le personnage qui parle, son décor, une caméra qui glisse */
class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
  private speakers: ChefModel[] = [];
  private raf = 0;
  private t = 0;
  private last = performance.now();
  private talking = -1;
  private disposables: { dispose: () => void }[] = [];

  constructor(
    private host: HTMLElement,
    theme: (typeof THEMES)[KitchenId],
    cast: { avatar: AvatarConfig; apron: string; toque: string }[],
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.domElement.className = "tq-cine-canvas";
    host.appendChild(this.renderer.domElement);
    // Le fond : le ciel ou le mur de la cuisine, un sol, une lumière chaude
    const grad = document.createElement("canvas");
    grad.width = 4;
    grad.height = 256;
    const g = grad.getContext("2d")!;
    const lg = g.createLinearGradient(0, 0, 0, 256);
    lg.addColorStop(0, theme.sky);
    lg.addColorStop(1, theme.fog?.[0] ?? "#2a1a14");
    g.fillStyle = lg;
    g.fillRect(0, 0, 4, 256);
    const bg = new THREE.CanvasTexture(grad);
    bg.colorSpace = THREE.SRGBColorSpace;
    this.disposables.push(bg);
    this.scene.background = bg;
    this.scene.add(new THREE.HemisphereLight(theme.hemi[0], theme.hemi[1], theme.hemi[2]));
    const sun = new THREE.DirectionalLight(theme.sun[0], theme.sun[1]);
    sun.position.set(-2, 5, 4);
    sun.castShadow = true;
    this.scene.add(sun);
    const floorGeo = new THREE.CircleGeometry(6, 40);
    const floorMat = new THREE.MeshStandardMaterial({ color: theme.body, roughness: 0.85 });
    this.disposables.push(floorGeo, floorMat);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    // Un plan de travail derrière, avec quelques ustensiles
    const counterGeo = new THREE.BoxGeometry(4, 0.6, 0.8);
    const counterMat = new THREE.MeshStandardMaterial({ color: "#8a5a3a", roughness: 0.7 });
    this.disposables.push(counterGeo, counterMat);
    const counter = new THREE.Mesh(counterGeo, counterMat);
    counter.position.set(0, 0.3, -1.4);
    counter.castShadow = counter.receiveShadow = true;
    this.scene.add(counter);
    cast.forEach((c, i) => {
      const chef = new ChefModel({ avatar: c.avatar, look: { apron: c.apron, toque: c.toque, knife: "office" }, color: "#e2483d" });
      const n = cast.length;
      chef.group.position.set((i - (n - 1) / 2) * 0.95, 0, i === 0 ? 0.2 : 0);
      chef.group.rotation.y = n > 1 ? (i === 0 ? 0.25 : -0.15 * Math.sign(i - (n - 1) / 2) || 0) : 0;
      this.scene.add(chef.group);
      this.speakers.push(chef);
      void headCanvas(c.avatar).then((cv) => chef.setHead(cv));
    });
    this.resize();
    window.addEventListener("resize", this.resize);
    this.raf = requestAnimationFrame(this.loop);
  }

  /** Qui parle (−1 : personne ; toute la brigade : plusieurs) */
  setTalking(i: number) {
    this.talking = i;
  }

  private resize = () => {
    const w = this.host.clientWidth || window.innerWidth;
    const h = this.host.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.t += dt;
    // La caméra s'approche lentement et tourne un peu autour (un travelling)
    const k = Math.min(1, this.t / 14);
    const ease = k * k * (3 - 2 * k);
    const portrait = this.camera.aspect < 0.9;
    const dist = (portrait ? 5.4 : 3.8) - ease * 0.9;
    const a = -0.35 + ease * 0.5;
    this.camera.position.set(Math.sin(a) * dist, 1.15 + ease * 0.05, Math.cos(a) * dist);
    this.camera.lookAt(0, 0.82, 0);
    this.speakers.forEach((s, i) => {
      const speaking = this.talking === i || this.talking === 99;
      s.animate(
        { speed: 0, carrying: false, act: 0, dash: false, stun: false, cheer: speaking && this.talking === 99 ? this.t % 1.4 : -1 },
        this.t + i,
        dt,
      );
      // Celui qui parle s'anime : la tête qui hoche, un petit sautillement
      s.group.position.y = speaking ? Math.abs(Math.sin(this.t * 7)) * 0.025 : 0;
      s.root.rotation.y = speaking ? Math.sin(this.t * 2.4) * 0.12 : 0;
    });
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.resize);
    for (const s of this.speakers) s.dispose();
    for (const d of this.disposables) d.dispose();
    this.renderer.domElement.remove();
    releaseRenderer(this.renderer);
  }
}

export interface CinematicProps {
  kind: "intro" | "arrival" | "finale";
  /** La cuisine (l'arrivée) */
  kitchen?: KitchenId;
  onDone: () => void;
}

/** Les répliques, et qui les dit (le patron, Mémé, la brigade) */
function script(kind: CinematicProps["kind"], kitchen: KitchenId): { lines: Line[]; host: Host; theme: KitchenId } {
  if (kind === "intro") return { lines: INTRO, host: MEME, theme: "bistrot" };
  if (kind === "finale") return { lines: FINALE, host: MEME, theme: "banquet" };
  return { lines: ARRIVALS[kitchen], host: HOSTS[kitchen], theme: kitchen };
}

export function Cinematic({ kind, kitchen = "bistrot", onDone }: CinematicProps) {
  const box = useRef<HTMLDivElement>(null);
  const stage = useRef<Stage | null>(null);
  const me = useSession((s) => s.user);
  const { lines, host, theme } = script(kind, kitchen);
  const [i, setI] = useState(0);
  const [typed, setTyped] = useState(0);
  const line = lines[Math.min(i, lines.length - 1)]!;
  const done = useRef(false);
  const finish = () => {
    if (done.current) return;
    done.current = true;
    onDone();
  };

  useEffect(() => {
    if (!box.current) return;
    const cast = [
      { avatar: hostAvatar(host), apron: host === MEME ? "fleuri" : "bistrot", toque: host === MEME ? "beret" : "classique" },
      ...(me ? [{ avatar: me.avatar, apron: "vichy", toque: "classique" }] : []),
    ];
    stage.current = new Stage(box.current, THEMES[theme], cast);
    return () => {
      stage.current?.dispose();
      stage.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // La bulle s'écrit lettre à lettre ; un toucher la finit, un second passe à la réplique suivante
  useEffect(() => {
    setTyped(0);
    stage.current?.setTalking(line.who === "brigade" ? 99 : line.who === "voix" ? -1 : 0);
    const t = window.setInterval(() => setTyped((n) => (n >= line.text.length ? n : n + 2)), 28);
    return () => window.clearInterval(t);
  }, [i, line]);
  useEffect(() => {
    if (typed < line.text.length) return;
    const t = window.setTimeout(() => (i + 1 >= lines.length ? finish() : setI(i + 1)), Math.max(1800, line.text.length * 45));
    return () => window.clearTimeout(t);
  }, [typed, i]); // eslint-disable-line react-hooks/exhaustive-deps

  const next = () => {
    if (typed < line.text.length) setTyped(line.text.length);
    else if (i + 1 >= lines.length) finish();
    else setI(i + 1);
  };
  const who = line.who === "brigade" ? "La brigade" : line.who === "voix" ? "" : host.name;
  const title = kind === "arrival" ? KITCHENS[kitchen].name : kind === "intro" ? "La roulotte de Mémé" : "Le banquet de la fête";

  return (
    <div className={`tq-cine is-${kind}`} onClick={next} role="dialog" aria-label={title}>
      <div ref={box} className="tq-cine-stage" />
      <div className="tq-cine-bars" aria-hidden="true" />
      <header className="tq-cine-title">
        <span>{title}</span>
        {kind === "arrival" && <small>{KITCHENS[kitchen].place}</small>}
      </header>
      <div
        className={`tq-cine-bubble ${line.who === "voix" ? "is-voice" : ""} ${line.who === "brigade" ? "is-brigade" : ""}`}
        aria-live="polite"
      >
        {who && <strong>{who}</strong>}
        <p>{line.text.slice(0, typed)}</p>
        {host !== MEME && line.who === "patron" && i === 0 && <span className="tq-cine-role">{host.role}</span>}
      </div>
      <button
        className="btn btn-sm tq-cine-skip"
        onClick={(e) => {
          e.stopPropagation();
          finish();
        }}
      >
        Passer
      </button>
    </div>
  );
}
