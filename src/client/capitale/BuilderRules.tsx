import { SQUARES } from "../../shared/games/capitale/board.ts";
import { annexCost, BUILD_ORDER, buildCost, BUILDS, NUISANCE_MALUS, PARC_BONUS } from "../../shared/games/capitale/builder.ts";
import { baseSize, maxAnnex } from "../../shared/games/capitale/builderMap.ts";

// Capitale Builder au salon : les bâtiments, leur taille, leur prix (de la ville la moins chère à Paris), et les règles
// propres à la carte, repliés sous le choix de la version.

const CITIES = SQUARES.filter((s) => s.kind === "property").map((s) => s.index);

/** Le prix d'un bâtiment, de la ville la moins chère à la plus chère */
function priceRange(kind: (typeof BUILD_ORDER)[number]): string {
  const prices = CITIES.map((i) => buildCost(kind, i));
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  return lo === hi ? `${lo} ₣` : `${lo} à ${hi} ₣`;
}

export function BuilderRules({ specials, monopoly }: { specials: boolean; monopoly: boolean }) {
  const kinds = BUILD_ORDER.filter((k) => specials || !BUILDS[k].special);
  const annex = CITIES.map(annexCost);
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
                <span className="hint">{info.effect}</span>
              </li>
            );
          })}
          <li className="cap-special-limits hint">
            Le loyer d'une ville : son terrain nu, plus ce que rapporte chaque bâtiment, plus cher dans les grandes villes. Avec tout le
            quartier, tout est doublé. Un parc donne +{Math.round(PARC_BONUS * 100)} % aux habitations qui le touchent, une nuisance retire{" "}
            {Math.round(NUISANCE_MALUS * 100)} % à tout ce qui est à deux cases ou moins, de l'autre côté de la frontière aussi.
          </li>
        </ul>
      </details>
      <details className="cap-special-rules">
        <summary>Les frontières et ce qui change</summary>
        <ul>
          <li className="cap-special-limits hint">
            Chaque ville a son territoire, de {baseSize(1)} cases (Guéret) à {baseSize(39)} (Paris). Le terrain vague qui le touche s'annexe
            case par case, de {Math.min(...annex)} à {Math.max(...annex)} ₣ : premier arrivé, premier servi. Une ville grandit au plus de
            moitié (Paris : {baseSize(39) + maxAnnex(39)} cases).
          </li>
          <li className="cap-special-limits hint">
            On bâtit, déplace, tourne et démolit à tout moment, sauf pendant une enchère ; en dette, on peut seulement démolir (la banque
            rend la moitié). Une nuisance ne se déplace pas.
          </li>
          <li className="cap-special-limits hint">
            Une ville bâtie ne s'échange pas et ne s'hypothèque pas ; son terrain annexé la suit. Le rachat paie ses bâtiments et son
            terrain, et le monument la protège. Une catastrophe abat un bâtiment, jamais le monument.
            {monopoly && " Au Monopole, seuls les titres comptent."}
          </li>
        </ul>
      </details>
    </>
  );
}
