import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { seededAvatar, type AvatarConfig } from "../../shared/avatar.ts";
import {
  needLabel,
  NO_PROGRESS,
  SKIN_IDS,
  skinUnlocked,
  SKINS,
  VEHICLE_IDS,
  vehicleBars,
  vehicleUnlocked,
  VEHICLES,
  type SkinId,
  type VehicleId,
} from "../../shared/games/bolides/garage.ts";
import { newKart } from "../../shared/games/bolides/physics.ts";
import { getTrack } from "../../shared/games/bolides/track.ts";
import type { BolidesClientMessage, BolidesRoomView } from "../../shared/protocol.ts";
import { Icon } from "../components/Icon.tsx";
import { usePrefs } from "../stores/prefs.ts";
import { headCanvas } from "./scene/faces.ts";
import { KART_COLORS, KartModel } from "./scene/kart.ts";

/** Le véhicule choisi, en 3D, qui tourne sur son socle */
function VehiclePreview({
  vehicle,
  skin,
  color,
  avatar,
  name,
}: {
  vehicle: VehicleId;
  skin: SkinId;
  color: string;
  avatar: AvatarConfig;
  name: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const stage = useRef<{ scene: THREE.Scene; holder: THREE.Group } | null>(null);
  const model = useRef<KartModel | null>(null);
  const reduced = usePrefs((s) => s.reducedEffects);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    scene.environment = env;
    scene.environmentIntensity = 0.6;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x4a4238, 1.4));
    const sun = new THREE.DirectionalLight(0xfff1d6, 2);
    sun.position.set(4, 8, 5);
    scene.add(sun);
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(2.9, 3.1, 0.18, 48),
      new THREE.MeshStandardMaterial({ color: 0x2a3a30, roughness: 0.6 }),
    );
    base.position.y = -0.09;
    scene.add(base);
    const holder = new THREE.Group();
    scene.add(holder);
    stage.current = { scene, holder };
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    const fit = () => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    const k = newKart(getTrack("port"), 0, 0, 0);
    Object.assign(k, { x: 0, z: 0, y: 0, h: 0, v: 0 });
    let frame = 0;
    let last = performance.now();
    const t0 = last;
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const time = (now - t0) / 1000;
      holder.rotation.y = reduced ? 2.5 : 2.5 + time * 0.55;
      model.current?.update(k, dt, { steer: Math.sin(time * 1.1) * 0.5, shield: false, done: false }, time);
      camera.position.set(0, 2.9, 8.2);
      camera.lookAt(0, 1.0, 0);
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      model.current?.dispose();
      model.current = null;
      stage.current = null;
      base.geometry.dispose();
      (base.material as THREE.Material).dispose();
      env.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [reduced]);

  // Le véhicule change : on reconstruit le modèle (son pilote a la tête de l'avatar du joueur)
  useEffect(() => {
    let cancelled = false;
    void headCanvas(avatar).then((head) => {
      const s = stage.current;
      if (cancelled || !s) return;
      model.current?.group.removeFromParent();
      model.current?.dispose();
      const m = new KartModel({ color, name, face: null, avatar, head, vehicle, skin, me: true }, false);
      s.holder.add(m.group);
      model.current = m;
    });
    return () => {
      cancelled = true;
    };
  }, [vehicle, skin, color, avatar, name]);

  return <div ref={box} className="garage-preview" aria-hidden="true" />;
}

interface Props {
  room: BolidesRoomView;
  send: (msg: BolidesClientMessage) => void;
}

/** Le garage, dans le salon : choisir son véhicule et son skin, voir ce qu'il reste à débloquer */
export function Garage({ room, send }: Props) {
  const seatId = room.you.seatId;
  const seat = room.seats.find((s) => s.id === seatId);
  const choice = seatId ? room.garage?.choices[seatId] : undefined;
  const progress = room.garage?.progress ?? NO_PROGRESS;
  const set = usePrefs((s) => s.set);
  const savedVehicle = usePrefs((s) => s.bolidesVehicle);
  const savedSkin = usePrefs((s) => s.bolidesSkin);
  const [pending, setPending] = useState<{ vehicle?: VehicleId; skin?: SkinId }>({});
  /** Ce qu'on regarde sans l'avoir (un véhicule ou un skin verrouillé) */
  const [peek, setPeek] = useState<{ vehicle?: VehicleId; skin?: SkinId }>({});
  const vehicle = peek.vehicle ?? pending.vehicle ?? choice?.vehicle ?? "kart";
  const skin = peek.skin ?? pending.skin ?? choice?.skin ?? "usine";
  const applied = useRef(false);

  // À l'arrivée à la table, on reprend le dernier choix de cet appareil (le serveur vérifie qu'il est débloqué)
  useEffect(() => {
    if (!seatId || applied.current) return;
    applied.current = true;
    if (savedVehicle || savedSkin) send({ t: "garage", vehicle: savedVehicle ?? undefined, skin: savedSkin ?? undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seatId]);

  useEffect(() => setPending({}), [choice?.vehicle, choice?.skin]);

  const avatar = useMemo(() => seat?.avatar ?? seededAvatar("garage"), [seat?.avatar]);
  const color =
    KART_COLORS[
      Math.max(
        0,
        room.seats.findIndex((s) => s.id === seatId),
      ) % KART_COLORS.length
    ]!;

  if (!seatId) return null;

  const pickVehicle = (id: VehicleId) => {
    if (!vehicleUnlocked(id, progress)) return setPeek((p) => ({ ...p, vehicle: id }));
    setPeek((p) => ({ ...p, vehicle: undefined }));
    setPending((p) => ({ ...p, vehicle: id }));
    set({ bolidesVehicle: id });
    send({ t: "garage", vehicle: id });
  };
  const pickSkin = (id: SkinId) => {
    if (!skinUnlocked(id, progress)) return setPeek((p) => ({ ...p, skin: id }));
    setPeek((p) => ({ ...p, skin: undefined }));
    setPending((p) => ({ ...p, skin: id }));
    set({ bolidesSkin: id });
    send({ t: "garage", skin: id });
  };
  const info = VEHICLES[vehicle];
  const next = VEHICLE_IDS.map((id) => VEHICLES[id]).find((v) => !vehicleUnlocked(v.id, progress));
  const unlockedSkins = SKIN_IDS.filter((id) => skinUnlocked(id, progress)).length;

  return (
    <section className="rules-sheet panel garage">
      <h2 className="garage-title">Ton garage</h2>
      <div className="garage-top">
        <VehiclePreview vehicle={vehicle} skin={skin} color={color} avatar={avatar} name={seat?.name ?? ""} />
        <div className="garage-info">
          <strong className="garage-name">{info.name}</strong>
          <p className="hint">{info.blurb}</p>
          {!vehicleUnlocked(vehicle, progress) && (
            <p className="garage-need">
              <Icon name="lock" size={13} /> À débloquer : {needLabel("won", info.wins)}
            </p>
          )}
          <div className="garage-bars">
            {vehicleBars(vehicle).map((b) => (
              <div className="garage-bar" key={b.label}>
                <span>{b.label}</span>
                <span className="garage-bar-track">
                  <span className="garage-bar-fill" style={{ "--v": b.value } as CSSProperties} />
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="field">
        <span className="field-label">
          Véhicule{" "}
          <small className="hint">
            {progress.won} victoire{progress.won > 1 ? "s" : ""}
            {next ? `, prochain : ${next.name} à ${next.wins}` : " : tout est débloqué !"}
          </small>
        </span>
        <div className="garage-chips">
          {VEHICLE_IDS.map((id) => {
            const v = VEHICLES[id];
            const open = vehicleUnlocked(id, progress);
            return (
              <button
                key={id}
                type="button"
                className={`garage-chip ${id === vehicle ? "is-on" : ""} ${open ? "" : "is-locked"}`}
                onClick={() => pickVehicle(id)}
              >
                {open ? v.name : <Locked label={v.name} />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="field">
        <span className="field-label">
          Skin{" "}
          <small className="hint">
            {unlockedSkins} sur {SKIN_IDS.length}
          </small>
        </span>
        <div className="garage-skins">
          {SKIN_IDS.map((id) => {
            const s = SKINS[id];
            const open = skinUnlocked(id, progress);
            const label = open ? s.name : `${s.name} : ${progress[s.stat]}/${needLabel(s.stat, s.need)}`;
            return (
              <button
                key={id}
                type="button"
                title={label}
                aria-label={label}
                className={`garage-skin ${id === skin ? "is-on" : ""} ${open ? "" : "is-locked"}`}
                onClick={() => pickSkin(id)}
                style={{ "--a": s.swatch[0], "--b": s.swatch[1] } as CSSProperties}
              >
                {!open && <Icon name="lock" size={14} />}
              </button>
            );
          })}
        </div>
        <p className="hint" style={{ margin: 0 }}>
          {SKINS[skin].name}
          {!skinUnlocked(skin, progress) &&
            ` : ${progress[SKINS[skin].stat]} sur ${needLabel(SKINS[skin].stat, SKINS[skin].need)} pour le débloquer`}
        </p>
      </div>
    </section>
  );
}

function Locked({ label }: { label: string }) {
  return (
    <span className="garage-locked">
      <Icon name="lock" size={13} /> {label}
    </span>
  );
}
