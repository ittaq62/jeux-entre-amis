import type { Variant } from "../../shared/games/billard/rules.ts";

const RULES: Record<Variant, { title: string; lines: string[] }> = {
  huit: {
    title: "Pleines et rayées",
    lines: [
      "La table est ouverte après la casse : la première bille que tu rentres te donne ta famille, les pleines (1 à 7) ou les rayées (9 à 15).",
      "Tu rejoues tant que tu rentres une de tes billes. Une fois ta famille rentrée, tu annonces une poche et tu y mets la noire : la manche est à toi.",
      "Faute (la blanche tombe, rien de touché, une bille de l'autre famille d'abord, aucune bande après le contact) : l'adversaire a la bille en main, n'importe où.",
      "La noire trop tôt, sur une faute, ou dans une autre poche que celle annoncée : la manche est perdue.",
    ],
  },
  neuf: {
    title: "La bille 9",
    lines: [
      "Touche toujours d'abord la plus petite bille du tapis. Si une bille tombe sans faute, tu rejoues.",
      "Celui qui rentre la 9 sans faute gagne la manche, même par ricochet, même à la casse.",
      "Faute : le suivant a la bille en main, n'importe où. Une 9 tombée sur une faute revient sur son point.",
    ],
  },
  killer: {
    title: "Le Killer",
    lines: [
      "Chacun a ses vies et joue un coup à son tour : il faut rentrer une bille, n'importe laquelle, sinon tu perds une vie.",
      "Une faute (la blanche tombe, rien de touché) coûte une vie. Rentrer la noire sans faute rapporte une vie.",
      "Quand le tapis est vide, on remet le triangle. Le dernier encore en vie gagne.",
    ],
  },
  carambole: {
    title: "Trois billes",
    lines: [
      "Pas de poches : chacun joue sa bille, la blanche ou la jaune. Tu marques un point quand ta bille touche les deux autres.",
      "Tu rejoues tant que tu marques. À la casse, ta bille doit toucher la rouge d'abord.",
      "En « une bande » ou « trois bandes », ta bille doit avoir touché autant de bandes avant la seconde bille.",
    ],
  },
};

export function HowToPlay({ variant }: { variant?: Variant }) {
  const list = variant ? [variant] : (Object.keys(RULES) as Variant[]);
  return (
    <div className="bl-help-text">
      <h3>Le coup</h3>
      <ul>
        <li>
          <strong>Viser</strong> : glisse sur la table pour tourner la queue autour de la blanche (lentement, c'est plus fin), ou touche une
          bille pour la viser en plein. La ligne montre la bille fantôme, la direction de la bille visée et celle de la blanche.
        </li>
        <li>
          <strong>La force</strong> : tire la queue vers toi sur la réglette de droite ; plus tu recules, plus c'est fort. Lâche pour
          frapper, reviens tout en haut pour annuler.
        </li>
        <li>
          <strong>L'effet</strong> : touche la petite bille en bas à gauche. En bas, du rétro (la blanche revient) ; en haut, du coulé (elle
          suit) ; sur le côté, de l'effet, qui change son rebond sur les bandes.
        </li>
        <li>
          <strong>La bille en main</strong> : fais glisser la blanche où tu veux avant de viser.
        </li>
        <li>
          <strong>La vue</strong> : le bouton « Vue » passe de la vue de la queue à la vue de dessus ; la molette ou deux doigts rapprochent
          la caméra.
        </li>
      </ul>
      {list.map((v) => (
        <div key={v}>
          <h3>{RULES[v].title}</h3>
          <ul>
            {RULES[v].lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
