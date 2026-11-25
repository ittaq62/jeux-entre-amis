import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link, useLocation } from "wouter";
import { REPORT_VARIANT_MAX } from "../../shared/report.ts";
import { useHub } from "../stores/hub.ts";
import { useReport } from "../stores/report.ts";
import { useSession } from "../stores/session.ts";
import { Avatar } from "./Avatar.tsx";
import { Icon } from "./Icon.tsx";

/** Le nom de la page où l'on est, joint à un signalement envoyé d'ailleurs que d'une partie */
export function pageName(path: string): string {
  const named: Record<string, string> = {
    "/": "Accueil",
    "/amis": "Amis",
    "/compte": "Mon compte",
    "/personnage": "Personnage",
    "/boutique": "Boutique",
    "/album": "Album",
    "/classement": "Classement",
    "/admin": "Administration",
    "/confidentialite": "Confidentialité",
  };
  if (named[path]) return `Page : ${named[path]}`;
  if (path.startsWith("/joueur/"))
    return `Page : profil de ${decodeURIComponent(path.slice("/joueur/".length))}`.slice(0, REPORT_VARIANT_MAX);
  if (path.startsWith("/tournee/")) return "Page : feuille d'une tournée";
  return `Page : ${path}`.slice(0, REPORT_VARIANT_MAX);
}

/**
 * L'avatar de l'en-tête : il ouvre le menu du compte (son profil, son personnage, l'album, les réglages, signaler un
 * problème, se déconnecter). Au clavier : Entrée ou flèche bas l'ouvre, les flèches passent d'une ligne à l'autre,
 * Échap le referme et rend la main à l'avatar.
 */
export function AccountMenu() {
  const user = useSession((s) => s.user)!;
  const logout = useSession((s) => s.logout);
  const disconnectHub = useHub((s) => s.disconnect);
  const openReport = useReport((s) => s.open);
  const [location, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  // Ouvert au clavier, la première ligne prend la main ; à la souris ou au doigt, c'est le menu lui-même (sans cadre)
  const byKeyboard = useRef(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);

  // Une autre page : le menu se referme
  useEffect(() => setOpen(false), [location]);

  // Un clic ailleurs le referme ; à l'ouverture, la première ligne prend la main
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", away);
    const first = list.current?.querySelector<HTMLElement>("[role=menuitem]");
    (byKeyboard.current ? first : list.current)?.focus();
    return () => window.removeEventListener("pointerdown", away);
  }, [open]);

  function close(refocus: boolean) {
    setOpen(false);
    if (refocus) button.current?.focus();
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const items = [...(list.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => {
      e.preventDefault();
      items[(i + items.length) % items.length]?.focus();
    };
    if (e.key === "Escape") {
      e.preventDefault();
      close(true);
    } else if (e.key === "ArrowDown") go(at + 1);
    else if (e.key === "ArrowUp") go(at - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(items.length - 1);
    else if (e.key === "Tab") setOpen(false);
  }

  async function signOut() {
    setOpen(false);
    disconnectHub();
    await logout();
    navigate("/connexion");
  }

  function report() {
    // L'avatar reprend la main d'abord : la fenêtre de signalement la lui rendra en se fermant
    close(true);
    openReport({ game: null, variant: pageName(location), code: null, tour: null, role: null });
  }

  const profile = `/joueur/${encodeURIComponent(user.pseudo)}`;
  return (
    <div className="account-menu" ref={box}>
      <button
        ref={button}
        type="button"
        className="nav-avatar"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Mon compte"
        title={user.pseudo}
        onClick={(e) => {
          // Entrée ou Espace sur le bouton donnent un clic sans pointeur (detail 0)
          byKeyboard.current = e.detail === 0;
          setOpen((o) => !o);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            byKeyboard.current = true;
            setOpen(true);
          }
        }}
      >
        <Avatar avatar={user.avatar} userId={user.id} photo={user.photo} size={34} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            ref={list}
            className="account-pop panel"
            role="menu"
            aria-label="Mon compte"
            tabIndex={-1}
            onKeyDown={onKey}
            initial={{ y: -6, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -6, opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div className="account-pop-who" aria-hidden="true">
              <Avatar avatar={user.avatar} userId={user.id} photo={user.photo} size={40} />
              <strong>{user.pseudo}</strong>
            </div>
            <Link href={profile} role="menuitem" className={`menu-item ${location === profile ? "is-here" : ""}`}>
              <Icon name="user" size={18} /> Mon profil
            </Link>
            <Link href="/personnage" role="menuitem" className={`menu-item ${location === "/personnage" ? "is-here" : ""}`}>
              <Icon name="smile" size={18} /> Mon personnage
            </Link>
            <Link href="/album" role="menuitem" className={`menu-item ${location === "/album" ? "is-here" : ""}`}>
              <Icon name="cards" size={18} /> L'album
            </Link>
            <Link href="/compte" role="menuitem" className={`menu-item ${location === "/compte" ? "is-here" : ""}`}>
              <Icon name="settings" size={18} /> Réglages et compte
            </Link>
            <span className="account-pop-line" role="separator" />
            <button type="button" role="menuitem" className="menu-item" onClick={report}>
              <Icon name="flag" size={18} /> Signaler un problème
            </button>
            <button type="button" role="menuitem" className="menu-item" onClick={() => void signOut()}>
              <Icon name="logout" size={18} /> Me déconnecter
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
