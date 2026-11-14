// L'éditeur du personnage de profil : un aperçu en grand (et aux tailles où les autres le verront), les parties du
// portrait et la garde-robe par catégorie. Tout s'essaie avant d'être acheté ; ce qui n'est pas encore à soi s'achète
// sur place, et rien ne change pour les autres tant qu'on n'a pas enregistré.

import { useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import {
  AVATAR_BACKGROUNDS,
  AVATAR_HAIR_COLORS,
  AVATAR_PARTS,
  AVATAR_SKINS,
  randomAvatar,
  wearing,
  type AvatarConfig,
  type AvatarPart,
} from "../../shared/avatar.ts";
import type { MeResponse } from "../../shared/protocol.ts";
import { SHOP_BY_ID, wearItem, type ShopItem } from "../../shared/shop.ts";
import { WEAR_BY_ID, WEAR_SLOTS, wearOf, wornItems, type WearSlot } from "../../shared/wardrobe.ts";
import { AppHeader } from "../components/AppHeader.tsx";
import { AvatarDrawing } from "../components/Avatar.tsx";
import { Icon } from "../components/Icon.tsx";
import { api, ApiError } from "../lib/api.ts";
import { toast } from "../lib/toast.ts";
import { BuyModal } from "../shop/BuyModal.tsx";
import { useSession } from "../stores/session.ts";
import { useMyItems } from "../stores/shop.ts";

interface Tab {
  key: string;
  label: string;
  /** La partie du portrait de base que choisit cet onglet */
  base?: AvatarPart;
  /** La place de la garde-robe qu'il propose (elle remplace la partie de base quand on y porte quelque chose) */
  slot?: WearSlot;
  /** Des couleurs plutôt que des dessins */
  swatches?: string[];
  /** Le nom de l'option « rien » quand la place n'a pas de partie de base */
  none?: string;
}

const TABS: Tab[] = [
  { key: "skin", label: "Teint", base: "skin", swatches: AVATAR_SKINS },
  { key: "hair", label: "Coiffure", base: "hair", slot: "hair" },
  { key: "hairColor", label: "Couleur", base: "hairColor", swatches: AVATAR_HAIR_COLORS },
  { key: "eyes", label: "Yeux", base: "eyes", slot: "eyes" },
  { key: "mouth", label: "Bouche", base: "mouth", slot: "mouth" },
  { key: "face", label: "Visage", slot: "face", none: "Rien" },
  { key: "extra", label: "Accessoires", base: "extra", slot: "extra" },
  { key: "hat", label: "Couvre-chef", base: "hat", slot: "hat" },
  { key: "outfit", label: "Tenue", slot: "outfit", none: "Sans" },
  { key: "bg", label: "Fond", base: "bg", slot: "bg", swatches: AVATAR_BACKGROUNDS, none: "Uni" },
  { key: "frame", label: "Cadre", slot: "frame", none: "Aucun" },
  { key: "fx", label: "Effet", slot: "fx", none: "Aucun" },
];

const withWear = wearing;

/** Le même personnage, quel que soit l'ordre dans lequel on a fait ses choix */
const same = (a: AvatarConfig, b: AvatarConfig) =>
  (Object.keys(AVATAR_PARTS) as AvatarPart[]).every((k) => a[k] === b[k]) && WEAR_SLOTS.every((s) => a.wear?.[s] === b.wear?.[s]);

/** Pour bien voir une coiffure, on enlève ce qu'il a sur la tête */
const bareHead = (a: AvatarConfig): AvatarConfig => ({ ...withWear(a, "hat", null), hat: 0 });

export function CharacterPage() {
  const user = useSession((s) => s.user)!;
  const apply = useSession((s) => s.apply);
  const [, navigate] = useLocation();
  const params = new URLSearchParams(useSearch());
  // Revenir d'où l'on vient : seulement une page du site
  const asked = params.get("retour");
  const back = asked && /^\/(?!\/)/.test(asked) ? asked : `/joueur/${encodeURIComponent(user.pseudo)}`;
  const { balance, has } = useMyItems();
  const saved = user.avatar;
  // Arrivé depuis la boutique avec une chose à essayer : elle est déjà sur lui
  const [draft, setDraft] = useState<AvatarConfig>(() => {
    const tryOn = WEAR_BY_ID.get(params.get("essai") ?? "");
    return tryOn ? withWear(saved, tryOn.slot, tryOn.id) : saved;
  });
  const [tab, setTab] = useState<Tab>(() => {
    const tryOn = WEAR_BY_ID.get(params.get("essai") ?? "");
    return (tryOn && TABS.find((t) => t.slot === tryOn.slot)) || TABS[1]!;
  });
  const [buying, setBuying] = useState<ShopItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trying = wornItems(draft.wear).filter((i) => !has(wearItem(i.id)));
  const dirty = !same(draft, saved);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      apply(await api.patch<MeResponse>("/me", { avatar: draft }));
      toast({ title: "Personnage enregistré" });
      navigate(back);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Une erreur est survenue.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="felt page">
      <AppHeader />
      <main className="perso">
        <div className="page-heading">
          <h1>Mon personnage</h1>
          <span className="perso-balance">
            <Icon name="coin" size={18} /> <strong className="num">{balance}</strong> point{balance > 1 ? "s" : ""}
            <Link href="/boutique">la boutique</Link>
          </span>
        </div>

        <div className="perso-layout">
          <section className="perso-stage panel">
            <div className="perso-preview">
              <AvatarDrawing avatar={draft} size={176} title="Ton personnage" />
            </div>
            <div className="perso-sizes" aria-label="Comme les autres le verront">
              <span>
                <AvatarDrawing avatar={draft} size={58} />À table
              </span>
              <span>
                <AvatarDrawing avatar={draft} size={36} />
                Liste d'amis
              </span>
              <span>
                <AvatarDrawing avatar={draft} size={22} />
                En petit
              </span>
            </div>
            {user.photo > 0 && (
              <p className="hint perso-photo">
                Ta photo s'affiche à la place de ton personnage. <Link href="/compte">Retire-la</Link> pour qu'on le voie.
              </p>
            )}
            {trying.length > 0 && (
              <div className="perso-trying">
                <p className="perso-trying-title">
                  <Icon name="eye" size={16} /> À l'essai
                </p>
                <ul>
                  {trying.map((i) => (
                    <li key={i.id}>
                      <span>{i.name}</span>
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        onClick={() => setBuying(SHOP_BY_ID.get(wearItem(i.id)) ?? null)}
                      >
                        <Icon name="coin" size={14} /> {i.price}
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        aria-label={`Retirer ${i.name}`}
                        onClick={() =>
                          setDraft((d) =>
                            withWear(d, i.slot, saved.wear?.[i.slot] && has(wearItem(saved.wear[i.slot]!)) ? saved.wear[i.slot]! : null),
                          )
                        }
                      >
                        <Icon name="close" size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="hint">Achète-le pour l'enregistrer, ou retire-le.</p>
              </div>
            )}
            <div className="perso-actions">
              {error && <p className="error-text">{error}</p>}
              <button
                type="button"
                className="btn btn-primary btn-block"
                disabled={!dirty || trying.length > 0 || saving}
                onClick={() => void save()}
              >
                {saving ? <span className="spinner" /> : "Enregistrer"}
              </button>
              <div className="row-actions">
                <button type="button" className="btn btn-sm" onClick={() => navigate(back)}>
                  Annuler
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setDraft((d) => ({ ...randomAvatar(), ...(d.wear ? { wear: d.wear } : {}) }))}
                >
                  <Icon name="dice" size={16} /> Au hasard
                </button>
                {dirty && (
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => setDraft(saved)}>
                    <Icon name="refresh" size={16} /> Comme avant
                  </button>
                )}
              </div>
            </div>
          </section>

          <section className="perso-controls">
            <div className="perso-tabs" role="tablist">
              {TABS.map((t) => (
                <button key={t.key} type="button" role="tab" aria-selected={t.key === tab.key} onClick={() => setTab(t)}>
                  {t.label}
                </button>
              ))}
            </div>
            <Options tab={tab} draft={draft} setDraft={setDraft} has={has} />
          </section>
        </div>
      </main>
      <BuyModal item={buying} preview={buying ? <AvatarDrawing avatar={draft} size={150} /> : undefined} onClose={() => setBuying(null)} />
    </div>
  );
}

function Options({
  tab,
  draft,
  setDraft,
  has,
}: {
  tab: Tab;
  draft: AvatarConfig;
  setDraft: (a: AvatarConfig) => void;
  has: (item: string) => boolean;
}) {
  const { base, slot, swatches } = tab;
  const worn = slot ? draft.wear?.[slot] : undefined;
  const items = useMemo(() => (slot ? wearOf(slot) : []), [slot]);
  // Les dessins des options : le personnage tel qu'il est, avec seulement cette partie changée
  const thumb = (a: AvatarConfig) => (tab.key === "hair" ? bareHead(a) : a);
  return (
    <div className="perso-options">
      {swatches && base && (
        <div className="perso-grid is-swatches">
          {swatches.map((color, i) => {
            const selected = draft[base] === i;
            return (
              <button
                key={i}
                type="button"
                className={`perso-option ${selected ? "is-selected" : ""}`}
                aria-pressed={selected}
                aria-label={`${tab.label} ${i + 1}`}
                onClick={() => setDraft({ ...draft, [base]: i })}
              >
                <span className="swatch" style={{ background: color }} />
              </button>
            );
          })}
        </div>
      )}
      {slot && (
        <div className="perso-grid">
          {tab.none && (
            <Option
              label={tab.none}
              selected={!worn}
              onClick={() => setDraft(withWear(draft, slot, null))}
              avatar={thumb(withWear(draft, slot, null))}
            />
          )}
          {base &&
            !swatches &&
            Array.from({ length: AVATAR_PARTS[base] }, (_, i) => {
              const a = { ...withWear(draft, slot, null), [base]: i };
              return (
                <Option
                  key={i}
                  label={`${tab.label} ${i + 1}`}
                  selected={!worn && draft[base] === i}
                  onClick={() => setDraft(a)}
                  avatar={thumb(a)}
                />
              );
            })}
          {items.map((item) => {
            const mine = has(wearItem(item.id));
            const a = withWear(draft, slot, item.id);
            return (
              <Option
                key={item.id}
                label={item.name}
                selected={worn === item.id}
                onClick={() => setDraft(a)}
                avatar={thumb(a)}
                price={mine ? null : item.price}
                named
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function Option({
  label,
  selected,
  onClick,
  avatar,
  price = null,
  named = false,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  avatar: AvatarConfig;
  price?: number | null;
  named?: boolean;
}) {
  return (
    <button
      type="button"
      className={`perso-option ${selected ? "is-selected" : ""} ${named ? "is-named" : ""}`}
      aria-pressed={selected}
      aria-label={price !== null ? `${label}, ${price} points` : label}
      title={label}
      onClick={onClick}
    >
      <AvatarDrawing avatar={avatar} size={56} />
      {named && <span className="perso-option-name">{label}</span>}
      {price !== null && (
        <span className="perso-option-price num">
          <Icon name="lock" size={11} /> {price}
        </span>
      )}
    </button>
  );
}
