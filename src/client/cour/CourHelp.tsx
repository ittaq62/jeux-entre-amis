import { EPREUVE_INFO, EPREUVES, type EpreuveId } from "../../shared/games/cour/epreuves.ts";

/** Comment jouer : le principe, puis chaque épreuve (celle en cours d'abord) */
export function HowToPlay({ focus = null }: { focus?: EpreuveId | null }) {
  const order: EpreuveId[] = [...EPREUVES, "polochons"];
  const list = focus ? [focus, ...order.filter((e) => e !== focus)] : order;
  return (
    <div className="cg-howto">
      <p>
        Une foule de candidats (vous, et des bots pour compléter), une suite d'épreuves tirées de la cour de récré, et à chaque épreuve des
        éliminés… bon enfant : peinture, mousse, piscine à balles. Les deux derniers s'affrontent aux polochons pour la Cloche d'or.
        Éliminé, on regarde la suite depuis les gradins (et à l'Épervier, on revient en épervier !).
      </p>
      {list.map((id) => {
        const e = EPREUVE_INFO[id];
        return (
          <section key={id} className={id === focus ? "is-focus" : ""}>
            <h3 style={{ color: e.dark }}>{e.name}</h3>
            <p>{e.rules.join(" ")}</p>
            <p className="hint">{e.controls}</p>
          </section>
        );
      })}
    </div>
  );
}
