import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { CHAT_MAX, REACTIONS, TAUNTS, type ChatMessage } from "../../shared/protocol.ts";
import { Icon } from "../components/Icon.tsx";

export function ChatPanel({
  open,
  messages,
  meId,
  onSend,
  onClose,
}: {
  open: boolean;
  messages: ChatMessage[];
  meId: string;
  onSend: (text: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, open]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    onSend(value);
    setText("");
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          className="chat-panel panel"
          initial={{ x: 40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 40, opacity: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 34 }}
        >
          <div className="chat-head">
            <strong>Discussion</strong>
            <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Fermer la discussion">
              <Icon name="close" />
            </button>
          </div>
          <div className="chat-list" ref={listRef}>
            {messages.length === 0 && <p className="hint chat-empty">Personne n'a encore rien dit. Lance les hostilités !</p>}
            {messages.map((m) =>
              m.system ? (
                <p key={m.id} className="chat-system">
                  {m.text}
                </p>
              ) : (
                <p key={m.id} className={`chat-msg ${m.userId === meId ? "is-me" : ""}`}>
                  <strong>{m.name}</strong>
                  <span>{m.text}</span>
                </p>
              ),
            )}
          </div>
          <form className="chat-form" onSubmit={submit}>
            <input
              className="input"
              value={text}
              maxLength={CHAT_MAX}
              onChange={(e) => setText(e.target.value)}
              placeholder="Écris un message…"
              aria-label="Message"
            />
            <button className="btn btn-primary btn-icon" aria-label="Envoyer" disabled={!text.trim()}>
              <Icon name="play" size={16} />
            </button>
          </form>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

export function EmotePicker({ open, onPick, onClose }: { open: boolean; onPick: (emote: string) => void; onClose: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <div className="emote-catcher" onClick={onClose} />
          <motion.div
            className="emote-picker panel"
            initial={{ y: 16, scale: 0.9, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 10, opacity: 0 }}
            transition={{ type: "spring", stiffness: 480, damping: 30 }}
          >
            <div className="emote-grid">
              {REACTIONS.map((r) => (
                <button key={r} className="emote-btn" onClick={() => onPick(r)} aria-label={`Réaction ${r}`}>
                  {r}
                </button>
              ))}
            </div>
            <div className="taunt-list">
              {TAUNTS.map((t) => (
                <button key={t} className="taunt-btn" onClick={() => onPick(t)}>
                  {t}
                </button>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
