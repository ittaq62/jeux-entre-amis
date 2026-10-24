import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "wouter";
import { APP_NAME } from "../../shared/app.ts";
import { useToasts } from "../lib/toast.ts";
import { COLOR_HEX } from "./Card.tsx";
import { Icon } from "./Icon.tsx";

/** Logotype : quatre cartes en éventail et le nom en caractères d'imprimerie. */
export function Logo({ size = 24, withName = true, withIcon = true }: { size?: number; withName?: boolean; withIcon?: boolean }) {
  return (
    <span className="logo" style={{ fontSize: size }}>
      {withIcon && (
        <svg viewBox="0 0 48 40" width={size * 1.3} height={size * 1.08} aria-hidden="true">
          <g transform="translate(24 38)">
            {[
              [-24, COLOR_HEX.blue],
              [-8, COLOR_HEX.green],
              [8, COLOR_HEX.yellow],
              [24, COLOR_HEX.red],
            ].map(([angle, color]) => (
              <g key={String(angle)} transform={`rotate(${angle}) translate(-8 -30)`}>
                <rect width="16" height="24" rx="2" fill="#f2ecdf" />
                <rect x="1.6" y="1.6" width="12.8" height="20.8" rx="1.2" fill={color as string} />
              </g>
            ))}
          </g>
        </svg>
      )}
      {withName && <span className="logo-name">{APP_NAME}</span>}
    </span>
  );
}

export function Modal({
  open,
  onClose,
  children,
  title,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            className={`modal panel ${wide ? "modal-wide" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 8, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <div className="modal-head">
              {title && <h2>{title}</h2>}
              <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Fermer">
                <Icon name="close" />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function Toasts() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="toasts" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            className={`toast toast-${t.tone ?? "default"}`}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            {t.icon && <span className="toast-icon">{t.icon}</span>}
            <div className="toast-text">
              <strong>{t.title}</strong>
              {t.body && <span>{t.body}</span>}
            </div>
            {t.action && (
              <button
                className="btn btn-sm btn-primary"
                onClick={() => {
                  t.action!.run();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Fermer">
              <Icon name="close" size={15} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/** Case à cocher imprimée. */
export function Check({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      className="check"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    />
  );
}

/** Bouton qui demande un second clic avant d'agir, pour ce qu'on ne peut pas défaire. */
export function ConfirmButton({
  children,
  confirm = "Tu confirmes ?",
  onConfirm,
  className = "btn btn-danger",
  disabled,
}: {
  children: ReactNode;
  confirm?: string;
  onConfirm: () => void;
  className?: string;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      className={`${className} ${armed ? "is-armed" : ""}`}
      disabled={disabled}
      onClick={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        onConfirm();
      }}
    >
      {armed ? confirm : children}
    </button>
  );
}

/** Choix exclusif présenté comme des options imprimées. */
export function Options<T extends string | number>({
  value,
  options,
  onChange,
  disabled,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div className="options" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          aria-pressed={o.value === value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function PageShell({ children, back, title, actions }: { children: ReactNode; back?: string; title?: string; actions?: ReactNode }) {
  return (
    <div className="felt page">
      <header className="page-top">
        {back ? (
          <Link href={back} className="btn btn-ghost btn-icon" aria-label="Retour">
            <Icon name="back" />
          </Link>
        ) : (
          <Link href="/" className="logo-link" aria-label="Accueil">
            <Logo size={22} />
          </Link>
        )}
        {title && <h1 className="page-title">{title}</h1>}
        <div className="page-top-actions">{actions}</div>
      </header>
      <main className="page-body">{children}</main>
    </div>
  );
}

export function Loading({ label = "Chargement…" }: { label?: string }) {
  return (
    <div className="felt center-screen">
      <div className="loading">
        <div className="spinner" />
        <span>{label}</span>
      </div>
    </div>
  );
}

export function timeAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return "à l'instant";
  const m = Math.round(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  if (d < 30) return `il y a ${d} j`;
  return new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}
