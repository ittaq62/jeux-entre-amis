import { RECIPES } from "../../shared/games/toque/food.ts";
import { KITCHENS, menuOf, type KitchenId } from "../../shared/games/toque/kitchens.ts";
import { DishIcon, PartIcon } from "./FoodIcon.tsx";

/** Ce qui rend chaque cuisine difficile, en une phrase */
const HAZARD_HELP: Record<string, string> = {
  tangage: "Le bateau tangue : à chaque vague, tout le monde glisse d'un bord à l'autre.",
  tables: "Les tables de la cantine glissent sur leurs rails : ne reste pas dans leur chemin.",
  vent: "Sur les toits, le drapeau annonce la rafale : ne traverse pas la planche à ce moment-là.",
  charrettes: "Les charrettes du marché traversent l'allée : attends qu'elles soient passées.",
  verglas: "La terrasse est verglacée : on y glisse, on y freine mal.",
  wagons: "Quand le train siffle, les deux wagons se séparent un moment : on lance par-dessus l'écart.",
  radeau: "Le radeau fait la navette entre les deux rives ; on peut aussi lancer les ingrédients d'une rive à l'autre.",
  banquet: "Les tables du banquet glissent, et tout le village a faim.",
};

/** Comment jouer : les gestes, les postes, et les plats de cette cuisine */
export function HowToPlay({ kitchen, twoChefs = false }: { kitchen: KitchenId; twoChefs?: boolean }) {
  const def = KITCHENS[kitchen];
  return (
    <div className="tq-howto">
      <p>
        Les commandes tombent en haut de l'écran : prépare chaque plat, dresse-le sur une assiette et pose-le sur le <strong>passe</strong>{" "}
        avant que son temps soit écoulé. Servir vite rapporte un pourboire ; servir les commandes dans l'ordre fait grimper l'
        <strong>enchaînement</strong> (jusqu'à ×4). Une commande ratée coûte des points.
      </p>
      <h3>Les gestes</h3>
      <ul>
        <li>
          <strong>Prendre / poser</strong> (Espace, A à la manette) : prendre ce qui est devant toi, ou le poser. Une assiette en main
          ramasse ce qui va dessus ; une marmite se verse dans l'assiette.
        </li>
        <li>
          <strong>Utiliser</strong> (E, X) : couper sur la planche, laver à l'évier, tenir l'extincteur. Avec un ingrédient en main : le{" "}
          <strong>lancer</strong> (un autre chef peut le rattraper).
        </li>
        <li>
          <strong>Élan</strong> (Maj, B) : une petite accélération (et on bouscule).
        </li>
        {twoChefs && (
          <li>
            <strong>Changer de chef</strong> (Tab, Y) : passer à ton autre chef. Celui que tu laisses continue de couper ou de laver.
          </li>
        )}
      </ul>
      <h3>La cuisine</h3>
      <ul>
        <li>On coupe sur la planche, on cuit à la poêle, on mijote dans la marmite (trois fois la même chose), on frit, on enfourne.</li>
        <li>Ce qui est cuit finit par brûler : un bip prévient, puis le feu prend et gagne les voisins. L'extincteur l'éteint.</li>
        {def.washing && <li>Les assiettes servies reviennent sales au retour : à l'évier, puis elles sèchent sur l'égouttoir.</li>}
        {def.hazard && <li>{HAZARD_HELP[def.hazard]}</li>}
      </ul>
      <h3>Au menu</h3>
      <ul className="tq-howto-menu">
        {menuOf(kitchen).map((r) => (
          <li key={r}>
            <DishIcon recipe={r} size={40} />
            <span>
              <strong>{RECIPES[r].name}</strong>
              <span className="tq-howto-parts">
                {RECIPES[r].parts.map((p, i) => (
                  <PartIcon key={i} part={p} size={24} />
                ))}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
