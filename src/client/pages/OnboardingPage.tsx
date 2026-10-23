import { useState, type FormEvent } from "react";
import { useLocation, useSearch } from "wouter";
import { PSEUDO_MAX, validatePseudo } from "../../shared/app.ts";
import { randomAvatar } from "../../shared/avatar.ts";
import type { MeResponse } from "../../shared/protocol.ts";
import { AvatarEditor } from "../components/AvatarEditor.tsx";
import { Logo } from "../components/ui.tsx";
import { api, ApiError } from "../lib/api.ts";
import { useSession } from "../stores/session.ts";

export function OnboardingPage() {
  const [, navigate] = useLocation();
  const next = new URLSearchParams(useSearch()).get("suite") ?? "/";
  const pending = useSession((s) => s.pending);
  const apply = useSession((s) => s.apply);
  const [pseudo, setPseudo] = useState(() => suggestPseudo(pending?.email ?? ""));
  const [avatar, setAvatar] = useState(randomAvatar);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = validatePseudo(pseudo);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      const res = await api.patch<MeResponse>("/me", { pseudo, avatar });
      apply(res);
      navigate(next, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Une erreur est survenue.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="felt onboarding">
      <form className="onboarding-box" onSubmit={submit}>
        <Logo size={24} />
        <div className="panel panel-pad stack">
          <div>
            <p className="eyebrow">Bienvenue à table</p>
            <h2>Qui es-tu ?</h2>
            <p className="hint">Choisis ton pseudo et compose ta tête. Tu pourras tout changer plus tard.</p>
          </div>
          <label className="field">
            <span className="field-label">Pseudo</span>
            <input
              className="input"
              value={pseudo}
              maxLength={PSEUDO_MAX}
              onChange={(e) => setPseudo(e.target.value)}
              placeholder="Ton surnom à la table"
              autoFocus
            />
          </label>
          <AvatarEditor value={avatar} onChange={setAvatar} />
          {error && <p className="error-text">{error}</p>}
          <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
            {busy ? <span className="spinner" /> : "C'est parti !"}
          </button>
        </div>
      </form>
    </div>
  );
}

function suggestPseudo(email: string): string {
  const base = email.split("@")[0] ?? "";
  const clean = base.replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" ")[0] ?? "";
  if (clean.length < 3) return "";
  return (clean.charAt(0).toUpperCase() + clean.slice(1)).slice(0, PSEUDO_MAX);
}
