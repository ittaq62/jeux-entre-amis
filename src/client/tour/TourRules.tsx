import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import type { GameId } from "../../shared/protocol.ts";
import {
  baseVariant,
  findVariant,
  gameVariants,
  ruleLines,
  tallyRule,
  tallyVotes,
  voteNeed,
  type TourAskedRule,
  type TourClientMessage,
  type TourMemberView,
  type TourView,
  votedRules,
} from "../../shared/tour.ts";
import { Avatar } from "../components/Avatar.tsx";
import { play } from "../lib/sound.ts";
import { usePrefs } from "../stores/prefs.ts";
import { teamRulesText } from "../capitale/teamsUi.tsx";

interface Props {
  view: TourView;
  send: (msg: TourClientMessage) => void;
  /** Le tirage a fini de révéler le jeu */
  revealed: boolean;
}

/**
 * Les règles du jeu tiré : une carte qui se retourne (de base ou au hasard), ou le vote tant qu'il est ouvert. Au UNO,
 * « pas de UNO d'avance » en fait partie : tiré au sort ou voté oui ou non, et dit sur la carte, retenu ou non. À Capitale
 * en équipes, les règles d'équipe se rappellent dessous : un réglage à part de l'hôte, ni tiré ni voté.
 */
export function TourRules({ view, send, revealed }: Props) {
  const next = view.next;
  if (!next) return null;
  const capTeams = revealed && next.game === "capitale" && view.settings.teams && view.settings.capitaleTeam;
  return (
    <>
      <RulesOf view={view} send={send} revealed={revealed} />
      {capTeams && (
        <p className="rules-fixed">
          <strong>En équipes</strong> : {teamRulesText({ settings: view.settings.capitaleTeam }).join(", ")}. Réglé à part par l'hôte.
        </p>
      )}
    </>
  );
}

function RulesOf({ view, send, revealed }: Props) {
  const next = view.next!;
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

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * La carte des règles : le dos d'abord, puis elle se retourne sur le format et, dessous, chaque règle à part tirée ou
 * votée (au UNO, « pas de UNO d'avance » se dit aussi quand il n'est pas retenu)
 */
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
  const [base, ...rest] = ruleLines(game, variant);
  const known = base !== undefined;
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
          <strong className="rules-name">{base?.name}</strong>
          <span className="rules-blurb">{base?.blurb}</span>
          {rest.map((line) => (
            <span key={line.id} className={`rules-asked ${line.kind === "off" ? "is-off" : "is-on"}`}>
              <strong>{line.name}</strong>
              <span>{line.blurb}</span>
            </span>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

/**
 * Le vote des règles : chaque joueur choisit une variante ; à la moitié des voix, elle est adoptée. Au UNO, on vote aussi
 * « pas de UNO d'avance » oui ou non, de la même façon, juste dessous.
 */
function RulesVote({ view, send }: { view: TourView; send: (msg: TourClientMessage) => void }) {
  const next = view.next!;
  const me = view.you.userId;
  const canVote = view.voters.includes(me);
  const counts = tallyVotes(next.votes, view.voters);
  const need = voteNeed(view.voters.length);
  const mine = next.votes[me];
  const adopted = next.base ? findVariant(next.game, next.base) : null;
  // Chaque règle à part se vote oui ou non, sous le format
  const asked = votedRules(next.game).filter((r) => next.extras?.[r.id]);
  const formats = gameVariants(next.game);
  const facesOf = (ids: string[]) =>
    ids.map((id) => view.members.find((m) => m.userId === id)).filter((m): m is TourMemberView => Boolean(m));
  const votersOf = (variant: string) =>
    facesOf(
      Object.entries(next.votes)
        .filter(([, v]) => v === variant)
        .map(([id]) => id),
    );

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
      {adopted ? (
        <p className="rules-vote-done">
          Règles adoptées : <strong>{adopted.name}</strong>
        </p>
      ) : (
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
                  <VoteCount faces={votersOf(v.id)} n={n} need={need} />
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
      )}
      {asked.length > 1 && <p className="rules-ask-intro hint">Et chaque règle en plus, oui ou non : à égalité, la règle habituelle.</p>}
      {asked.map((rule) => (
        <AskedVote
          key={rule.id}
          view={view}
          send={send}
          rule={rule}
          facesOf={facesOf}
          compact={asked.length > 1}
          only={rule.bases?.map((b) => formats.find((f) => f.id === b)?.name ?? b).join(" ou ")}
        />
      ))}
    </div>
  );
}

/** Les visages de ceux qui ont voté, et les voix obtenues sur celles qu'il faut */
function VoteCount({ faces, n, need }: { faces: TourMemberView[]; n: number; need: number }) {
  return (
    <>
      <span className="rules-option-votes">
        <span className="rules-faces">
          <AnimatePresence initial={false}>
            {faces.map((m) => (
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
    </>
  );
}

/** Une règle à part votée oui ou non : même compte que les variantes */
function AskedVote({
  view,
  send,
  rule,
  facesOf,
  only,
  compact = false,
}: {
  view: TourView;
  send: (msg: TourClientMessage) => void;
  rule: TourAskedRule;
  facesOf: (ids: string[]) => TourMemberView[];
  /** Les seuls formats avec lesquels elle se joue */
  only?: string;
  /** Plusieurs règles à voter : une ligne chacune (la question à gauche, oui et non à droite, sur un grand écran) */
  compact?: boolean;
}) {
  const vote = view.next!.extras![rule.id]!;
  const me = view.you.userId;
  const canVote = view.voters.includes(me);
  const need = voteNeed(view.voters.length);
  const { yes, no } = tallyRule(vote.votes, view.voters);
  const mine = vote.votes[me];
  const base = view.next!.base;
  if (vote.value !== null) {
    // Écartée d'office par le format adopté : on dit pourquoi
    const unfit = !vote.value && base && rule.bases && !rule.bases.includes(base);
    return (
      <p className="rules-vote-done">
        {capitalize(rule.name)} : <strong>{vote.value ? "oui" : "non"}</strong>
        <span className="hint">
          {" "}
          · {vote.value ? rule.blurb : unfit ? capitalize(rule.unfit ?? "ne va pas avec ce format") + "." : rule.offBlurb}
        </span>
      </p>
    );
  }
  const choices = [
    { on: true, label: "Oui", n: yes },
    { on: false, label: "Non", n: no },
  ];
  return (
    <div className={`rules-ask ${compact ? "is-compact" : ""}`}>
      <p className="rules-ask-head">
        <strong>{rule.question}</strong>
        <span className="hint">
          {rule.blurb}
          {only ? ` Seulement avec ${only}.` : ""}
          {compact ? "" : " À égalité, la règle habituelle."}
        </span>
      </p>
      <div className="rules-ask-row">
        {choices.map((c) => (
          <button
            key={c.label}
            type="button"
            className={`rules-option ${mine === c.on ? "is-mine" : ""}`}
            disabled={!canVote}
            aria-pressed={mine === c.on}
            onClick={() => {
              if (mine === c.on) return;
              play("tourVote");
              send({ t: "voteRule", rule: rule.id, on: c.on });
            }}
          >
            <span className="rules-option-text">
              <strong>{c.label}</strong>
            </span>
            <VoteCount
              faces={facesOf(
                Object.entries(vote.votes)
                  .filter(([, v]) => v === c.on)
                  .map(([id]) => id),
              )}
              n={c.n}
              need={need}
            />
          </button>
        ))}
      </div>
      {view.you.isHost && (
        <p className="rules-ask-host">
          <span className="hint">Imposer :</span>
          {choices.map((c) => (
            <button
              key={c.label}
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => send({ t: "pickRule", rule: rule.id, on: c.on })}
            >
              {c.label}
            </button>
          ))}
        </p>
      )}
    </div>
  );
}
