import { useState } from "react";
import { BOMBS, DEFAULT_BOMB, type BombId } from "../../../shared/games/meche/bombs.ts";
import { bombItem, SHOP_BY_ID, type ShopItem } from "../../../shared/shop.ts";
import { Icon } from "../../components/Icon.tsx";
import { unlockAudio } from "../../lib/sound.ts";
import { BuyModal } from "../../shop/BuyModal.tsx";
import { usePrefs } from "../../stores/prefs.ts";
import { useMyItems } from "../../stores/shop.ts";
import { useSession } from "../../stores/session.ts";
import { BombArt } from "./BombArt.tsx";
import { BombShow } from "./BombShow.tsx";

const points = (n: number) => `${n} point${n > 1 ? "s" : ""}`;

/** La bombe choisie sur cet appareil, si elle est à soi (sinon la dynamite) */
export function useMyBomb(): BombId {
  const saved = usePrefs((p) => p.mecheBomb);
  const { has } = useMyItems();
  return saved && has(bombItem(saved)) ? saved : DEFAULT_BOMB;
}

/**
 * Sa bombe : ce qui saute au bout de la mèche quand c'est soi qui l'allume, et que toute la table voit. On touche une
 * bombe pour la voir jouer jusqu'à sa fin (et l'entendre) ; celles qu'on n'a pas s'achètent sur place. Le choix est
 * gardé sur l'appareil, et la table le reprend (voir MecheRoom). Au salon de Mèche, et juste avant une partie de tournée.
 */
export function BombPicker() {
  const { balance, has } = useMyItems();
  const set = usePrefs((p) => p.set);
  const user = useSession((s) => s.user);
  const bomb = useMyBomb();
  /** Ce qu'on regarde sans l'avoir encore */
  const [peek, setPeek] = useState<BombId | null>(null);
  const [heard, setHeard] = useState(0);
  const [buying, setBuying] = useState<ShopItem | null>(null);
  const shown = BOMBS.find((b) => b.id === (peek ?? bomb))!;
  const owned = BOMBS.filter((b) => has(bombItem(b.id))).length;
  const pick = (id: BombId) => {
    unlockAudio();
    setHeard((n) => n + 1);
    if (has(bombItem(id))) {
      setPeek(null);
      set({ mecheBomb: id });
    } else setPeek(id);
  };
  return (
    <section className="lobby-section panel bomb-picker">
      <div className="field">
        <span className="field-label">
          Ta bombe{" "}
          <small className="hint">
            {owned} sur {BOMBS.length} · {points(balance)} à dépenser
          </small>
        </span>
        <div className="bomb-choices">
          {BOMBS.map((b) => {
            const open = has(bombItem(b.id));
            const on = b.id === (peek ?? bomb);
            const label = open ? b.name : `${b.name} : ${points(b.price)}`;
            return (
              <button
                key={b.id}
                type="button"
                title={label}
                aria-label={label}
                aria-pressed={on}
                className={`bomb-choice ${on ? "is-on" : ""} ${open ? "" : "is-locked"}`}
                onClick={() => pick(b.id)}
              >
                <BombArt id={b.id} className="bomb-thumb" />
                {!open && (
                  <span className="bomb-lock">
                    <Icon name="coin" size={12} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <BombShow bomb={shown.id} audible={heard} avatar={user?.avatar} className="bomb-picker-show" />
        <p className="hint bomb-pick-line">
          <span>
            <strong>{shown.name}</strong> · {shown.blurb}
          </span>
          {!has(bombItem(shown.id)) && (
            <button type="button" className="btn btn-sm btn-primary" onClick={() => setBuying(SHOP_BY_ID.get(bombItem(shown.id))!)}>
              <Icon name="coin" size={15} /> {points(shown.price)}
            </button>
          )}
        </p>
        <p className="hint bomb-pick-note">Toute la table la voit quand c'est toi qui allumes la mèche.</p>
      </div>
      <BuyModal
        item={buying}
        preview={buying ? <BombShow bomb={buying.ref as BombId} loud avatar={user?.avatar} /> : undefined}
        onClose={() => setBuying(null)}
        onBought={(item) => {
          setPeek(null);
          set({ mecheBomb: item.ref as BombId });
        }}
      />
    </section>
  );
}
