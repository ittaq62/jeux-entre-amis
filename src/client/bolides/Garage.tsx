import "./bolides.css";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { seededAvatar, type AvatarConfig } from "../../shared/avatar.ts";
import { SKIN_IDS, SKINS, VEHICLE_IDS, vehicleBars, VEHICLES, type SkinId, type VehicleId } from "../../shared/games/bolides/garage.ts";
import { newKart } from "../../shared/games/bolides/physics.ts";
import { getTrack } from "../../shared/games/bolides/track.ts";
import type { BolidesClientMessage, BolidesRoomView } from "../../shared/protocol.ts";
import { kartItem, SHOP_BY_ID, vehicleItem, type ShopItem } from "../../shared/shop.ts";
import { Icon } from "../components/Icon.tsx";
import { BuyModal } from "../shop/BuyModal.tsx";
import { usePrefs } from "../stores/prefs.ts";
import { useMyItems } from "../stores/shop.ts";
import { headCanvas } from "./scene/faces.ts";
import { KART_COLORS, KartModel } from "./scene/kart.ts";

/** Le véhicule choisi, en 3D, qui tourne sur son socle */
export function VehiclePreview({
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
  const { balance, has } = useMyItems();
  const [buying, setBuying] = useState<ShopItem | null>(null);
  const set = usePrefs((s) => s.set);
  const savedVehicle = usePrefs((s) => s.bolidesVehicle);
  const savedSkin = usePrefs((s) => s.bolidesSkin);
  const [pending, setPending] = useState<{ vehicle?: VehicleId; skin?: SkinId }>({});
  /** Ce qu'on regarde sans l'avoir (un véhicule ou un skin verrouillé) */
  const [peek, setPeek] = useState<{ vehicle?: VehicleId; skin?: SkinId }>({});
  const vehicle = peek.vehicle ?? pending.vehicle ?? choice?.vehicle ?? "kart";
  const skin = peek.skin ?? pending.skin ?? choice?.skin ?? "usine";
  const applied = useRef(false);

  // À l'arrivée à la table, on reprend le dernier choix de cet appareil (le serveur vérifie qu'on le possède)
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

  const applyVehicle = (id: VehicleId) => {
    setPeek((p) => ({ ...p, vehicle: undefined }));
    setPending((p) => ({ ...p, vehicle: id }));
    set({ bolidesVehicle: id });
    send({ t: "garage", vehicle: id });
  };
  const applySkin = (id: SkinId) => {
    setPeek((p) => ({ ...p, skin: undefined }));
    setPending((p) => ({ ...p, skin: id }));
    set({ bolidesSkin: id });
    send({ t: "garage", skin: id });
  };
  const pickVehicle = (id: VehicleId) => (has(vehicleItem(id)) ? applyVehicle(id) : setPeek((p) => ({ ...p, vehicle: id })));
  const pickSkin = (id: SkinId) => (has(kartItem(id)) ? applySkin(id) : setPeek((p) => ({ ...p, skin: id })));
  const info = VEHICLES[vehicle];
  const ownedSkins = SKIN_IDS.filter((id) => has(kartItem(id))).length;

  return (
    <section className="rules-sheet panel garage">
      <h2 className="garage-title">Ton garage</h2>
      <div className="garage-top">
        <VehiclePreview vehicle={vehicle} skin={skin} color={color} avatar={avatar} name={seat?.name ?? ""} />
        <div className="garage-info">
          <strong className="garage-name">{info.name}</strong>
          <p className="hint">{info.blurb}</p>
          {!has(vehicleItem(vehicle)) && (
            <button
              type="button"
              className="btn btn-sm btn-primary garage-buy"
              onClick={() => setBuying(SHOP_BY_ID.get(vehicleItem(vehicle))!)}
            >
              <Icon name="coin" size={15} /> Acheter pour {info.price} points
            </button>
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
            {balance} point{balance > 1 ? "s" : ""} à dépenser
          </small>
        </span>
        <div className="garage-chips">
          {VEHICLE_IDS.map((id) => {
            const v = VEHICLES[id];
            const open = has(vehicleItem(id));
            return (
              <button
                key={id}
                type="button"
                className={`garage-chip ${id === vehicle ? "is-on" : ""} ${open ? "" : "is-locked"}`}
                onClick={() => pickVehicle(id)}
              >
                {open ? v.name : <Locked label={v.name} price={v.price} />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="field">
        <span className="field-label">
          Skin{" "}
          <small className="hint">
            {ownedSkins} sur {SKIN_IDS.length}
          </small>
        </span>
        <div className="garage-skins">
          {SKIN_IDS.map((id) => {
            const s = SKINS[id];
            const open = has(kartItem(id));
            const label = open ? s.name : `${s.name} : ${s.price} points`;
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
                {!open && <Icon name="coin" size={14} />}
              </button>
            );
          })}
        </div>
        <p className="hint" style={{ margin: 0 }}>
          {SKINS[skin].name}
        </p>
        {!has(kartItem(skin)) && (
          <button type="button" className="btn btn-sm btn-primary garage-buy" onClick={() => setBuying(SHOP_BY_ID.get(kartItem(skin))!)}>
            <Icon name="coin" size={15} /> Acheter pour {SKINS[skin].price} points
          </button>
        )}
      </div>
      <BuyModal
        item={buying}
        onClose={() => setBuying(null)}
        onBought={(item) => (item.kind === "vehicle" ? applyVehicle(item.ref as VehicleId) : applySkin(item.ref as SkinId))}
      />
    </section>
  );
}

function Locked({ label, price }: { label: string; price: number }) {
  return (
    <span className="garage-locked">
      {label}
      <span className="garage-price num">
        <Icon name="coin" size={12} /> {price}
      </span>
    </span>
  );
}
