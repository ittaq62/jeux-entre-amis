import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import type { GameId } from "../../shared/protocol.ts";
import {
  baseVariant,
  findVariant,
  gameVariants,
  tallyVotes,
  voteNeed,
  type TourClientMessage,
  type TourMemberView,
  type TourView,
} from "../../shared/tour.ts";
import { Avatar } from "../components/Avatar.tsx";
import { play } from "../lib/sound.ts";
import { usePrefs } from "../stores/prefs.ts";

interface Props {
  view: TourView;
  send: (msg: TourClientMessage) => void;
  /** Le tirage a fini de révéler le jeu */
  revealed: boolean;
}

/** Les règles du jeu tiré : une carte qui se retourne (de base ou au hasard), ou le vote tant qu'il est ouvert. */
export function TourRules({ view, send, revealed }: Props) {
  const next = view.next;
  if (!next) return null;
  const mode = view.settings.rules;
  if (mode === "base") {
    // Rien à deviner : la carte s'affiche une fois le jeu connu
    return revealed ? <RulesCard game={next.game} variant={baseVariant(next.game)} label="Règles de base" open quiet /> : null;
  }
  if (mode === "vote" && next.variant === null) {
    return revealed ? (
      <RulesVote view={view} send={send} />
    ) : (
      <RulesCard game={next.game} variant={null} label="Règles votées" open={false} />
    );
  }
  return (
    <RulesCard
      key={`${view.games.length}-${next.game}-${next.variant}`}
      game={next.game}
      variant={next.variant}
      label={mode === "random" ? "Règles tirées au sort" : "Règles adoptées"}
      open={revealed}
    />
  );
}

/** La carte des règles : le dos d'abord, puis elle se retourne sur la variante */
function RulesCard({
  game,
  variant,
  label,
  open,
  quiet = false,
}: {
  game: GameId;
  variant: string | null;
  label: string;
  open: boolean;
  /** Sans suspense : déjà retournée, sans son */
  quiet?: boolean;
}) {
  const reduced = usePrefs((s) => s.reducedEffects);
  const v = findVariant(game, variant);
  const known = v !== null;
  const [flipped, setFlipped] = useState(open && (quiet || reduced));

  // Seulement des valeurs simples en dépendances : l'écran se redessine 4 fois par seconde (compte à rebours),
  // et le retournement ne doit pas repartir à chaque fois
  useEffect(() => {
    if (!open || !known || flipped) return;
    if (quiet || reduced) {
      setFlipped(true);
      return;
    }
    const timers = [
      setTimeout(() => {
        setFlipped(true);
        play("tourFlip");
      }, 450),
      setTimeout(() => play("tourRules"), 820),
    ];
    return () => timers.forEach(clearTimeout);
  }, [open, quiet, reduced, known]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="rules-card-wrap" aria-live="polite">
      <motion.div
        className={`rules-card ${flipped ? "is-flipped" : ""}`}
        initial={false}
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={quiet || reduced ? { duration: 0 } : { duration: 0.65, ease: [0.25, 1.35, 0.5, 1] }}
      >
        <div className="rules-face rules-back" aria-hidden={flipped}>
          <span className="rules-label">{label}</span>
          <span className="rules-mark" aria-hidden="true">
            ?
          </span>
        </div>
        <div className="rules-face rules-front" aria-hidden={!flipped}>
          <span className="rules-label">{label}</span>
          <strong className="rules-name">{v?.name}</strong>
          <span className="rules-blurb">{v?.blurb}</span>
        </div>
      </motion.div>
    </div>
  );
}

/** Le vote des règles : chaque joueur choisit une variante ; à la moitié des voix, elle est adoptée */
function RulesVote({ view, send }: { view: TourView; send: (msg: TourClientMessage) => void }) {
  const next = view.next!;
  const me = view.you.userId;
  const canVote = view.voters.includes(me);
  const counts = tallyVotes(next.votes, view.voters);
  const need = voteNeed(view.voters.length);
  const mine = next.votes[me];
  const votersOf = (variant: string) =>
    Object.entries(next.votes)
      .filter(([, v]) => v === variant)
      .map(([id]) => view.members.find((m) => m.userId === id))
      .filter((m): m is TourMemberView => Boolean(m));

  return (
    <div className="rules-vote">
      <p className="rules-vote-head">
        <strong>Les règles, on vote !</strong>
        <span className="hint">
          {need === 1 ? "Une voix suffit" : `${need} voix pour adopter`}
          {canVote ? "" : " · seuls les joueurs votent"}
          {view.you.isHost ? " · ou impose-les" : ""}. Sans majorité, la plus votée au départ.
        </span>
      </p>
      <ul className="rules-vote-list">
        {gameVariants(next.game).map((v) => {
          const n = counts.get(v.id) ?? 0;
          return (
            <li key={v.id} className="rules-vote-row">
              <button
                type="button"
                className={`rules-option ${mine === v.id ? "is-mine" : ""}`}
                disabled={!canVote}
                aria-pressed={mine === v.id}
                onClick={() => {
                  if (mine === v.id) return;
                  play("tourVote");
                  send({ t: "vote", variant: v.id });
                }}
              >
                <span className="rules-option-text">
                  <strong>{v.name}</strong>
                  <span className="hint">{v.blurb}</span>
                </span>
                <span className="rules-option-votes">
                  <span className="rules-faces">
                    <AnimatePresence initial={false}>
                      {votersOf(v.id).map((m) => (
                        <motion.span
                          key={m.userId}
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0, opacity: 0 }}
                          transition={{ type: "spring", stiffness: 520, damping: 22 }}
                        >
                          <Avatar avatar={m.avatar} userId={m.userId} photo={m.photo} size={22} />
                        </motion.span>
                      ))}
                    </AnimatePresence>
                  </span>
                  <span className="num">
                    {n}/{need}
                  </span>
                </span>
                <span className="rules-option-bar" style={{ ["--fill" as string]: `${Math.min(100, (n / need) * 100)}%` }} />
              </button>
              {view.you.isHost && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => send({ t: "pickVariant", variant: v.id })}>
                  Imposer
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
