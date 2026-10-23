import { motion } from "motion/react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocation, useSearch } from "wouter";
import { APP_TAGLINE } from "../../shared/app.ts";
import type { Card } from "../../shared/games/uno/cards.ts";
import type { MeResponse } from "../../shared/protocol.ts";
import { CardFace } from "../components/Card.tsx";
import { Logo } from "../components/ui.tsx";
import { api, ApiError } from "../lib/api.ts";
import { unlockAudio } from "../lib/sound.ts";
import { useSession } from "../stores/session.ts";

const DECOR: Card[] = [
  { id: 1, kind: "wild4", color: null },
  { id: 2, kind: "number", color: "red", value: 7 },
  { id: 3, kind: "reverse", color: "yellow" },
  { id: 4, kind: "number", color: "blue", value: 2 },
  { id: 5, kind: "draw2", color: "green" },
];

const LAST_EMAIL = "tablee:last-email";

export function LoginPage() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const next = new URLSearchParams(search).get("suite") ?? "/";
  const apply = useSession((s) => s.apply);
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState(() => {
    try {
      return localStorage.getItem(LAST_EMAIL) ?? "";
    } catch {
      return "";
    }
  });
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function sendCode(e?: FormEvent) {
    e?.preventDefault();
    unlockAudio();
    setError(null);
    setBusy(true);
    try {
      const res = await api.post<{ ok: true; devCode?: string }>("/auth/request", { email });
      try {
        localStorage.setItem(LAST_EMAIL, email.trim());
      } catch {
        // rien
      }
      setDevCode(res.devCode ?? null);
      setStep("code");
      setCode("");
      setCooldown(45);
      setTimeout(() => codeRef.current?.focus(), 60);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Une erreur est survenue.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(value: string) {
    if (value.length !== 6 || busy) return;
    setError(null);
    setBusy(true);
    try {
      const res = await api.post<MeResponse>("/auth/verify", { email, code: value });
      apply(res);
      navigate(res.user ? next : `/bienvenue?suite=${encodeURIComponent(next)}`, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Une erreur est survenue.");
      setCode("");
      codeRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="felt login">
      <div className="login-decor" aria-hidden="true">
        {DECOR.map((card, i) => (
          <motion.div
            key={card.id}
            className="login-decor-card"
            initial={{ y: 60, opacity: 0, rotate: 0 }}
            animate={{ y: 0, opacity: 1, rotate: (i - 2) * 13 }}
            transition={{ delay: 0.15 + i * 0.07, type: "spring", stiffness: 140, damping: 16 }}
            style={{ zIndex: i }}
          >
            <CardFace card={card} width={92} />
          </motion.div>
        ))}
      </div>

      <motion.div className="login-box" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <div className="login-brand">
          <Logo size={40} withIcon={false} />
          <p className="login-tagline">{APP_TAGLINE}</p>
        </div>

        <div className="panel login-panel">
          {step === "email" ? (
            <form onSubmit={sendCode} className="stack">
              <div>
                <h2>Connexion</h2>
                <p className="hint">Pas de mot de passe : tu reçois un code par email.</p>
              </div>
              <label className="field">
                <span className="field-label">Ton adresse email</span>
                <input
                  className="input"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="prenom@exemple.fr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </label>
              {error && <p className="error-text">{error}</p>}
              <button className="btn btn-primary btn-lg btn-block" disabled={busy || !email.includes("@")}>
                {busy ? <span className="spinner" /> : "Recevoir mon code"}
              </button>
            </form>
          ) : (
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                void verify(code);
              }}
            >
              <div>
                <h2>Regarde tes emails</h2>
                <p className="hint">
                  On a envoyé un code à <strong>{email}</strong>. S'il n'arrive pas, regarde dans les spams.
                </p>
              </div>
              <CodeInput
                value={code}
                inputRef={codeRef}
                disabled={busy}
                onChange={(v) => {
                  setCode(v);
                  if (v.length === 6) void verify(v);
                }}
              />
              {devCode && (
                <button type="button" className="dev-code" onClick={() => void verify(devCode).then(() => setCode(devCode))}>
                  Développement : code <strong>{devCode}</strong>, touche pour l'utiliser
                </button>
              )}
              {error && <p className="error-text">{error}</p>}
              <button className="btn btn-primary btn-lg btn-block" disabled={busy || code.length !== 6}>
                {busy ? <span className="spinner" /> : "Me connecter"}
              </button>
              <div className="login-links">
                <button type="button" className="link-btn" onClick={() => setStep("email")}>
                  Changer d'adresse
                </button>
                <button type="button" className="link-btn" disabled={cooldown > 0 || busy} onClick={() => void sendCode()}>
                  {cooldown > 0 ? `Renvoyer (${cooldown} s)` : "Renvoyer un code"}
                </button>
              </div>
            </form>
          )}
        </div>
        <p className="login-foot hint">
          En te connectant, tu acceptes que l'on garde ton email et tes parties pour faire fonctionner le site.{" "}
          <a href="/confidentialite">Confidentialité</a>
        </p>
      </motion.div>
    </div>
  );
}

function CodeInput({
  value,
  onChange,
  inputRef,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  disabled?: boolean;
}) {
  const [focused, setFocused] = useState(true);
  return (
    <label className="code-input">
      <span className="visually-hidden">Code à 6 chiffres</span>
      <input
        ref={inputRef}
        value={value}
        disabled={disabled}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={6}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
      />
      <div className="code-boxes" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <span
            key={i}
            className={`code-box ${focused && i === Math.min(value.length, 5) ? "is-active" : ""} ${value[i] ? "is-filled" : ""}`}
          >
            {value[i] ?? ""}
          </span>
        ))}
      </div>
    </label>
  );
}
