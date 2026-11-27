// Les petits dessins des ingrédients et des plats (les bons de commande, l'aide, la carte) : des formes simples et
// franches, lisibles en tout petit. Un aliment coupé porte un couteau en coin, ce qui cuit à la poêle une poêle, ce qui
// mijote une marmite, ce qui frit une friteuse, ce qui va au four un four.

import type { ReactElement } from "react";
import { CHOP, FRY, PAN, POT, splitBaked, type FoodId, type Part, type RecipeId, RECIPES } from "../../shared/games/toque/food.ts";

type Tool = "couteau" | "poele" | "marmite" | "friteuse" | "four" | null;

/** Le poste par lequel passe ce morceau d'assiette */
export function toolOf(part: Part): Tool {
  if (splitBaked(part)) return "four";
  if (Object.values(POT).includes(part as never)) return "marmite";
  if (Object.values(FRY).some((v) => v!.to === part)) return "friteuse";
  if (Object.values(PAN).some((v) => v!.to === part)) return "poele";
  if (Object.values(CHOP).some((v) => !v!.base && v!.to === part)) return "couteau";
  return null;
}

/** L'aliment cru d'où vient ce morceau (pour le dessiner) */
function rawOf(part: Part): string {
  for (const [k, v] of Object.entries(CHOP)) if (!v!.base && v!.to === part) return k;
  for (const [k, v] of Object.entries(PAN)) if (v!.to === part) return k;
  for (const [k, v] of Object.entries(FRY)) if (v!.to === part) return rawOf(k as Part);
  for (const [k, v] of Object.entries(POT)) if (v === part) return rawOf(k as Part);
  return part;
}

function Shape({ f }: { f: string }) {
  switch (f) {
    case "tomate":
      return (
        <>
          <circle cx="16" cy="18" r="10" fill="#e0392b" />
          <path d="M11 9l5 3 5-3-2 5-3-2-3 2z" fill="#3f8a2e" />
          <ellipse cx="12" cy="15" rx="2.5" ry="1.6" fill="#ff8a7a" opacity="0.7" />
        </>
      );
    case "laitue":
      return (
        <>
          <circle cx="16" cy="17" r="11" fill="#6cbf3c" />
          <path d="M8 18c3-6 13-6 16 0M10 22c3-4 9-4 12 0" stroke="#b9e27a" strokeWidth="2" fill="none" />
        </>
      );
    case "oignon":
      return (
        <>
          <path d="M16 5c2 4 10 7 10 15a10 10 0 0 1-20 0c0-8 8-11 10-15z" fill="#c08a4a" />
          <path d="M16 9v18M11 13c2 4 2 10 0 13M21 13c-2 4-2 10 0 13" stroke="#8a5a2a" strokeWidth="1" fill="none" />
        </>
      );
    case "champi":
      return (
        <>
          <path d="M5 16a11 9 0 0 1 22 0z" fill="#e9e0cf" stroke="#b8a888" />
          <rect x="12" y="16" width="8" height="10" rx="3" fill="#f4eee2" stroke="#c8b898" />
        </>
      );
    case "patate":
      return <ellipse cx="16" cy="17" rx="12" ry="8" fill="#b98a52" />;
    case "fromage":
      return (
        <>
          <path d="M4 22l22-12v12z" fill="#f2c94a" />
          <circle cx="15" cy="18" r="1.8" fill="#d8a82a" />
          <circle cx="21" cy="17" r="1.4" fill="#d8a82a" />
        </>
      );
    case "jambon":
      return (
        <>
          <ellipse cx="16" cy="17" rx="12" ry="9" fill="#f6e4d8" />
          <ellipse cx="16" cy="17" rx="10" ry="7" fill="#e88a8a" />
        </>
      );
    case "steak":
      return <ellipse cx="16" cy="17" rx="12" ry="8" fill="#b8323a" />;
    case "saucisse":
      return <rect x="4" y="13" width="24" height="9" rx="4.5" fill="#d98a8a" />;
    case "poisson":
      return (
        <>
          <ellipse cx="15" cy="16" rx="10" ry="6" fill="#9db8c8" />
          <path d="M24 16l6-5v10z" fill="#7f9db0" />
          <circle cx="9" cy="15" r="1.3" fill="#101214" />
        </>
      );
    case "pateCrepe":
      return (
        <>
          <path d="M6 14h20l-3 11H9z" fill="#e9e4d8" />
          <ellipse cx="16" cy="14" rx="10" ry="3" fill="#f2d48a" />
        </>
      );
    case "patePizza":
    case "pateTarte":
      return <ellipse cx="16" cy="18" rx="11" ry="7" fill={f === "patePizza" ? "#f2e2b8" : "#ecd09a"} />;
    case "pain":
      return (
        <>
          <rect x="3" y="12" width="26" height="9" rx="4.5" fill="#d49a4a" />
          <path d="M9 13l2 7M15 13l2 7M21 13l2 7" stroke="#f0d090" strokeWidth="1.5" />
        </>
      );
    case "sucre":
      return (
        <>
          <rect x="7" y="14" width="8" height="8" fill="#fbfbf7" stroke="#c8c8c0" />
          <rect x="16" y="14" width="8" height="8" fill="#fbfbf7" stroke="#c8c8c0" />
          <rect x="11.5" y="6" width="8" height="8" fill="#fbfbf7" stroke="#c8c8c0" />
        </>
      );
    case "moules":
      return (
        <>
          <ellipse cx="11" cy="17" rx="7" ry="4" fill="#25222e" transform="rotate(-20 11 17)" />
          <ellipse cx="21" cy="17" rx="7" ry="4" fill="#25222e" transform="rotate(20 21 17)" />
        </>
      );
    case "pomme":
      return (
        <>
          <circle cx="16" cy="18" r="10" fill="#c83a2e" />
          <path d="M16 8v4" stroke="#5a3a1a" strokeWidth="2" />
          <path d="M17 9c3-3 6-1 6-1-2 2-4 3-6 1z" fill="#4f9a34" />
        </>
      );
    case "crepe":
      return (
        <>
          <path d="M4 22a12 12 0 0 1 24 0z" fill="#e0a04a" />
          <circle cx="12" cy="18" r="1.2" fill="#b8702c" />
          <circle cx="19" cy="16" r="1.2" fill="#b8702c" />
        </>
      );
    case "frites":
      return (
        <>
          <path d="M8 14h16l-2 14H10z" fill="#d8402e" />
          {[10, 13, 16, 19, 22].map((x, i) => (
            <rect key={x} x={x - 1.2} y={6 + (i % 2) * 2} width="2.4" height="10" fill="#f2c65a" />
          ))}
        </>
      );
    default:
      return <circle cx="16" cy="17" r="9" fill="#bbb" />;
  }
}

const TOOL_GLYPH: Record<Exclude<Tool, null>, ReactElement> = {
  couteau: <path d="M2 2l9 9-2 2-9-9z M8 10l3 3" fill="#e8ecf0" stroke="#5a6068" strokeWidth="1" />,
  poele: (
    <>
      <circle cx="6" cy="7" r="5" fill="#2b2c30" />
      <rect x="10" y="6" width="5" height="2" fill="#3a2a1e" />
    </>
  ),
  marmite: (
    <>
      <rect x="2" y="4" width="10" height="8" rx="1.5" fill="#9aa2aa" />
      <rect x="0" y="5" width="2" height="2" fill="#2a2a2e" />
      <rect x="12" y="5" width="2" height="2" fill="#2a2a2e" />
    </>
  ),
  friteuse: (
    <>
      <rect x="1" y="4" width="12" height="8" rx="1" fill="#c4cad2" />
      <rect x="3" y="5" width="8" height="3" fill="#e0a830" />
    </>
  ),
  four: (
    <>
      <path d="M1 12a6 6 0 0 1 12 0z" fill="#b0583a" />
      <path d="M4 12a3 3 0 0 1 6 0z" fill="#ff8a3a" />
    </>
  ),
};

const SOUP: Record<string, string> = {
  soupe_tomate: "#d8452e",
  soupe_oignon: "#a8692e",
  soupe_champi: "#d8c7a6",
  puree: "#f2dc9a",
  fondue: "#f2c94a",
  moules_k: "#e8a24a",
};

/** Un morceau d'assiette (un aliment, une soupe, un fond cuit), avec le poste par lequel il passe */
export function PartIcon({ part, size = 30 }: { part: Part; size?: number }) {
  const tool = toolOf(part);
  const baked = splitBaked(part);
  const soup = SOUP[part];
  return (
    <svg className="tq-icon" viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      {baked ? (
        <>
          <ellipse cx="16" cy="18" rx="12" ry="8" fill={baked.base === "croque" ? "#d89a4a" : "#e0a85a"} />
          {baked.base === "pizza" && <ellipse cx="16" cy="18" rx="9.5" ry="6" fill="#c8342a" />}
          {baked.toppings.includes("fromage_c") && <ellipse cx="14" cy="17" rx="5" ry="3" fill="#f6d870" />}
          {baked.toppings.includes("champi_c") && <circle cx="20" cy="19" r="2" fill="#e4d8c0" />}
          {baked.toppings.includes("jambon_c") && <rect x="9" y="17" width="6" height="2.5" fill="#ec959a" />}
          {baked.toppings.includes("pomme_c") && <path d="M8 18h16" stroke="#f4e6b8" strokeWidth="3" strokeDasharray="3 1" />}
        </>
      ) : soup ? (
        <>
          <path d="M5 15h22a11 9 0 0 1-22 0z" fill="#f4f1ea" />
          <ellipse cx="16" cy="15" rx="11" ry="3.5" fill={soup} />
        </>
      ) : (
        <Shape f={rawOf(part)} />
      )}
      {tool && tool !== "four" && <g transform="translate(18 18) scale(0.9)">{TOOL_GLYPH[tool]}</g>}
    </svg>
  );
}

/** Le plat d'une commande : sur une assiette, ce qu'il y a dessus */
export function DishIcon({ recipe, size = 44 }: { recipe: RecipeId; size?: number }) {
  const parts = RECIPES[recipe].parts;
  return (
    <span className="tq-dish" style={{ width: size, height: size }}>
      <svg viewBox="0 0 44 44" width={size} height={size} aria-hidden="true">
        <ellipse cx="22" cy="25" rx="20" ry="14" fill="#fbfaf6" stroke="#ded6c4" strokeWidth="1.5" />
        <ellipse cx="22" cy="25" rx="14" ry="9" fill="none" stroke="#ece6d8" strokeWidth="1" />
      </svg>
      <span className="tq-dish-parts">
        {parts.map((p, i) => (
          <PartIcon key={i} part={p} size={parts.length > 2 ? size * 0.42 : parts.length > 1 ? size * 0.5 : size * 0.66} />
        ))}
      </span>
    </span>
  );
}

/** L'aliment brut d'une caisse */
export function FoodIcon({ food, size = 28 }: { food: FoodId; size?: number }) {
  return (
    <svg className="tq-icon" viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <Shape f={food} />
    </svg>
  );
}
