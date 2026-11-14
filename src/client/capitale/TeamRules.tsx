import type { CapitaleSettings, TeamRent } from "../../shared/games/capitale/engine.ts";
import { Check, Options } from "../components/ui.tsx";

// Les règles d'équipe et le Monopole, en mots : au salon de la table, à celui de la tournée et avant la partie.
// Un fichier léger : la tournée l'utilise sans charger le plateau en 3D.

/** Le Monopole, en une phrase : on le lit au salon, dans la tournée et sur la carte des règles */
export const MONOPOLY_RULE = `La partie s'arrête net pour qui réunit trois quartiers complets, toutes les rues d'un côté du plateau ou les quatre gares (même hypothéqués).`;

const TEAM_RENTS: { value: TeamRent; label: string }[] = [
  { value: "free", label: "Gratuit" },
  { value: "half", label: "Moitié" },
  { value: "full", label: "Plein" },
];

/** Les règles d'équipe, réglables au salon de la table comme à celui de la tournée */
export function TeamRules({
  s,
  disabled,
  update,
}: {
  s: Pick<CapitaleSettings, "teamRent" | "teamGifts" | "teamHeir" | "teamWin">;
  disabled: boolean;
  update: (patch: Partial<CapitaleSettings>) => void;
}) {
  const checks: { key: "teamGifts" | "teamHeir" | "teamWin"; label: string; desc: string }[] = [
    {
      key: "teamGifts",
      label: "Dons entre coéquipiers",
      desc: "Donner de l'argent, un titre ou une carte de prison à son coéquipier, à tout moment, sans contrepartie : pour l'aider à payer une dette ou à compléter son quartier.",
    },
    {
      key: "teamHeir",
      label: "Héritage d'équipe",
      desc: "En faillite, ses titres passent à son coéquipier encore en jeu ; le créancier ne touche que l'argent qui reste.",
    },
    {
      key: "teamWin",
      label: "Victoire d'équipe",
      desc: "On gagne ensemble : à la fin, les fortunes de l'équipe s'additionnent, et au Monopole ses titres comptent ensemble. Sinon, chacun son classement.",
    },
  ];
  return (
    <>
      <span className="field-sub">Loyer entre coéquipiers (stade compris)</span>
      <Options<TeamRent>
        label="Loyer entre coéquipiers"
        value={s.teamRent}
        disabled={disabled}
        onChange={(teamRent) => update({ teamRent })}
        options={TEAM_RENTS}
      />
      <div className="rule-list">
        {checks.map((r) => (
          <div key={r.key} className="rule-row" onClick={() => !disabled && update({ [r.key]: !s[r.key] })}>
            <Check label={r.label} checked={s[r.key]} disabled={disabled} onChange={() => {}} />
            <span>
              <strong>{r.label}</strong>
              <span className="hint">{r.desc}</span>
            </span>
          </div>
        ))}
      </div>
      <p className="hint" style={{ margin: 0 }}>
        Toujours en équipes : pas de nuisance chez un coéquipier, et le tour passe d'une équipe à l'autre.
      </p>
    </>
  );
}
