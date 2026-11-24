import { SQUARES, upgradeCost } from "../../shared/games/capitale/board.ts";
import { annexCost, BUILD_ORDER, buildCost, BUILDS, NUISANCE_MALUS, PARC_BONUS } from "../../shared/games/capitale/builder.ts";
import { baseSize, maxAnnex } from "../../shared/games/capitale/builderMap.ts";
import { fr } from "../../shared/typo.ts";

// Capitale Builder au salon : les bâtiments, leur taille, leur prix (de la ville la moins chère à Paris), et les règles
// propres à la carte, repliés sous le choix de la version.

const CITIES = SQUARES.filter((s) => s.kind === "property").map((s) => s.index);

/** Le prix d'un bâtiment, de la ville la moins chère à la plus chère */
function priceRange(kind: (typeof BUILD_ORDER)[number]): string {
  const prices = CITIES.map((i) => buildCost(kind, i));
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  return lo === hi ? `${lo} ₣` : `${lo} à ${hi} ₣`;
}

export function BuilderRules({ specials, monopoly }: { specials: boolean; monopoly: boolean }) {
  const kinds = BUILD_ORDER.filter((k) => specials || !BUILDS[k].special);
  const annex = CITIES.map(annexCost);
  // Une tranche bâtie : le prix d'un niveau du quartier en Classique, de la moins chère à la plus chère des villes
  const tranche = CITIES.map(upgradeCost);
  return (
    <>
      <details className="cap-special-rules">
        <summary>Les bâtiments de Builder, leur taille et leur prix</summary>
        <ul>
          {kinds.map((k) => {
            const info = BUILDS[k];
            return (
              <li key={k} className={info.nuisance ? "is-nuisance" : ""}>
                <strong>
                  {info.name}{" "}
                  <span className="hint">
                    {info.w}×{info.d}
                  </span>
                </strong>
                <span className="num">{priceRange(k)}</span>
                <span className="hint">{fr(info.effect)}</span>
              </li>
            );
          })}
          <li className="cap-special-limits hint">
            Le loyer d'une ville&nbsp;: son terrain nu, plus ce que rapporte chaque bâtiment, plus cher dans les grandes villes. Avec tout
            le quartier, tout est doublé. Un parc donne +{Math.round(PARC_BONUS * 100)}&nbsp;% aux habitations qui le touchent, une nuisance
            retire {Math.round(NUISANCE_MALUS * 100)}&nbsp;% à tout ce qui est à deux cases ou moins, de l'autre côté de la frontière aussi.
          </li>
        </ul>
      </details>
      <details className="cap-special-rules">
        <summary>Les frontières et ce qui change</summary>
        <ul>
          <li className="cap-special-limits hint">
            Chaque ville a sa parcelle dans son quartier, numérotée comme sa case du plateau, de {baseSize(1)}&nbsp;cases (Guéret) à{" "}
            {baseSize(39)} (Paris). La réserve hachurée du quartier s'annexe case par case, seulement par ses villes, de{" "}
            {Math.min(...annex)} à {Math.max(...annex)}&nbsp;₣&nbsp;: premier arrivé, premier servi. Une ville grandit au plus de moitié
            (Paris&nbsp;: {baseSize(39) + maxAnnex(39)}&nbsp;cases). Les squares, le fleuve et l'avenue ne s'annexent pas.
          </li>
          <li className="cap-special-limits hint">
            On bâtit, déplace, tourne et démolit à tout moment, sauf pendant une enchère&nbsp;; en dette, on peut seulement démolir (la
            banque rend la moitié). Une nuisance ne se déplace pas.
          </li>
          <li className="cap-special-limits hint">
            Une ville bâtie ne s'échange pas et ne s'hypothèque pas&nbsp;; son terrain annexé la suit. Tant qu'une tour ou un monument est
            debout dans un quartier, aucune ville de ce quartier ne s'échange. Le rachat paie les bâtiments et le terrain, et le monument
            protège sa ville&nbsp;; l'expropriation paie le terrain annexé au prix payé. Une catastrophe abat un bâtiment, jamais le
            monument. Les cartes de travaux et de primes comptent vos bâtiments par tranches bâties&nbsp;: une tranche pour chaque{" "}
            {Math.min(...tranche)} à {Math.max(...tranche)}&nbsp;₣ dépensés selon le quartier (le prix d'un niveau en Classique), le
            monument compté à part.
            {monopoly && " Au Monopole, seuls les titres comptent."}
          </li>
        </ul>
      </details>
    </>
  );
}
