// Les vignettes de la boutique pour Toque ! : le tablier, la toque et le couteau dessinés, posés sur un petit fond de
// carrelage de cuisine.

import { ApronSwatch, KnifeSwatch, ToqueSwatch } from "./LookPicker.tsx";
import "./toque.css";

export function ToqueShopLook({ kind, id, big = false }: { kind: string; id: string; big?: boolean }) {
  const size = big ? 110 : 50;
  return (
    <span className={`tq-shop-look ${big ? "is-big" : ""}`} aria-hidden="true">
      {kind === "tqtablier" ? (
        <ApronSwatch id={id} size={size} />
      ) : kind === "tqtoque" ? (
        <ToqueSwatch id={id} size={size} />
      ) : (
        <KnifeSwatch id={id} size={size} />
      )}
    </span>
  );
}
