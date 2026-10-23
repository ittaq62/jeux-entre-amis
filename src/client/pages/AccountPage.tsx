import { useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { PSEUDO_MAX, validatePseudo } from "../../shared/app.ts";
import type { MeResponse } from "../../shared/protocol.ts";
import { AppHeader } from "../components/AppHeader.tsx";
import { Avatar } from "../components/Avatar.tsx";
import { AvatarEditor } from "../components/AvatarEditor.tsx";
import { Icon } from "../components/Icon.tsx";
import { Modal, Switch } from "../components/ui.tsx";
import { api, ApiError } from "../lib/api.ts";
import { play } from "../lib/sound.ts";
import { toast } from "../lib/toast.ts";
import { useHub } from "../stores/hub.ts";
import { usePrefs } from "../stores/prefs.ts";
import { useSession } from "../stores/session.ts";

/** Redimensionne une image en carre 256 px (WebP) avant l'envoi. */
async function toSquareWebp(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const side = Math.min(bitmap.width, bitmap.height);
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.82));
  if (blob && blob.type === "image/webp") return blob;
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("image"))), "image/jpeg", 0.82));
}

export function AccountPage() {
  const user = useSession((s) => s.user)!;
  const apply = useSession((s) => s.apply);
  const logout = useSession((s) => s.logout);
  const disconnectHub = useHub((s) => s.disconnect);
  const prefs = usePrefs();
  const [, navigate] = useLocation();
  const [pseudo, setPseudo] = useState(user.pseudo);
  const [avatar, setAvatar] = useState(user.avatar);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dirty = pseudo.trim() !== user.pseudo || JSON.stringify(avatar) !== JSON.stringify(user.avatar);

  async function save() {
    const problem = validatePseudo(pseudo);
    if (problem) return setError(problem);
    setSaving(true);
    setError(null);
    try {
      apply(await api.patch<MeResponse>("/me", { pseudo, avatar }));
      toast({ icon: "✨", title: "Profil enregistré" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Une erreur est survenue.");
    } finally {
      setSaving(false);
    }
  }

  async function upload(file: File) {
    try {
      const blob = await toSquareWebp(file);
      apply(await api.put<MeResponse>("/me/photo", blob));
      toast({ icon: "📸", title: "Photo mise à jour" });
    } catch (err) {
      toast({ tone: "danger", title: err instanceof ApiError ? err.message : "Cette image n'a pas pu être utilisée." });
    }
  }

  async function removePhoto() {
    apply(await api.del<MeResponse>("/me/photo"));
  }

  async function signOut() {
    disconnectHub();
    await logout();
    navigate("/connexion");
  }

  async function deleteAccount() {
    await api.del("/me");
    disconnectHub();
    useSession.setState({ user: null, pending: null });
    navigate("/connexion");
  }

  return (
    <div className="felt page">
      <AppHeader />
      <main className="narrow">
        <div className="page-heading">
          <h1>Mon compte</h1>
          <Link href={`/joueur/${encodeURIComponent(user.pseudo)}`} className="btn btn-sm">
            Voir mon profil
          </Link>
        </div>

        <section className="panel panel-pad stack">
          <h3 className="section-title">Profil</h3>
          <label className="field">
            <span className="field-label">Pseudo</span>
            <input className="input" value={pseudo} maxLength={PSEUDO_MAX} onChange={(e) => setPseudo(e.target.value)} />
          </label>
          <div className="photo-row">
            <Avatar avatar={avatar} userId={user.id} photo={user.photo} size={64} />
            <div className="stack-sm">
              <strong>Photo de profil</strong>
              <span className="hint">Facultative : elle remplace ton avatar dessiné.</span>
              <span className="row-actions">
                <button className="btn btn-sm" onClick={() => fileRef.current?.click()}>
                  <Icon name="camera" size={16} /> {user.photo ? "Changer" : "Ajouter une photo"}
                </button>
                {user.photo > 0 && (
                  <button className="btn btn-sm btn-ghost" onClick={() => void removePhoto()}>
                    Retirer
                  </button>
                )}
              </span>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
                e.target.value = "";
              }}
            />
          </div>
          <AvatarEditor value={avatar} onChange={setAvatar} />
          {error && <p className="error-text">{error}</p>}
          <button className="btn btn-primary" disabled={!dirty || saving} onClick={() => void save()}>
            {saving ? <span className="spinner" /> : "Enregistrer"}
          </button>
        </section>

        <section className="panel panel-pad stack">
          <h3 className="section-title">Son et confort</h3>
          <PrefRow label="Effets sonores" desc="Bruits de cartes, UNO, victoire…">
            <Switch label="Effets sonores" checked={prefs.sound} onChange={(v) => prefs.set({ sound: v })} />
          </PrefRow>
          <PrefRow label="Volume" desc={`${Math.round(prefs.volume * 100)} %`}>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={prefs.volume}
              onChange={(e) => prefs.set({ volume: Number(e.target.value) })}
              onPointerUp={() => play("cardPlace")}
              className="range"
              aria-label="Volume"
            />
          </PrefRow>
          <PrefRow label="Vibrations" desc="Sur les téléphones qui le permettent (pas sur iPhone).">
            <Switch label="Vibrations" checked={prefs.haptics} onChange={(v) => prefs.set({ haptics: v })} />
          </PrefRow>
          <PrefRow label="Symboles de couleur" desc="Ajoute ● ▲ ■ ◆ sur les cartes, pour les daltoniens.">
            <Switch label="Symboles de couleur" checked={prefs.colorblind} onChange={(v) => prefs.set({ colorblind: v })} />
          </PrefRow>
          <PrefRow label="Effets réduits" desc="Pas de secousses ni de confettis.">
            <Switch label="Effets réduits" checked={prefs.reducedEffects} onChange={(v) => prefs.set({ reducedEffects: v })} />
          </PrefRow>
        </section>

        <section className="panel panel-pad stack">
          <h3 className="section-title">Compte</h3>
          <p className="hint">Connecté avec {user.email}</p>
          <div className="row-actions">
            <button className="btn" onClick={() => void signOut()}>
              <Icon name="logout" size={18} /> Me déconnecter
            </button>
            <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
              <Icon name="trash" size={18} /> Supprimer mon compte
            </button>
          </div>
          <p className="hint">
            <Link href="/confidentialite">Ce que le site garde sur toi</Link>
          </p>
        </section>
      </main>

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Supprimer ton compte ?">
        <div className="stack">
          <p>
            Ton profil, tes statistiques, tes succès et tes amis seront effacés définitivement. Tes anciens adversaires verront juste ton
            pseudo dans leurs historiques.
          </p>
          <div className="row-actions">
            <button className="btn btn-danger" onClick={() => void deleteAccount()}>
              Oui, tout supprimer
            </button>
            <button className="btn" onClick={() => setConfirmDelete(false)}>
              Annuler
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function PrefRow({ label, desc, children }: { label: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="pref-row">
      <span>
        <strong>{label}</strong>
        <span className="hint">{desc}</span>
      </span>
      {children}
    </div>
  );
}
