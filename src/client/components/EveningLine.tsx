import { useEffect, useState } from "react";
import type { TableGame } from "../../shared/protocol.ts";
import { api } from "../lib/api.ts";
import "./eveningLine.css";

/**
 * Sous le résultat d'une partie, pour qui vient de la jouer : une ligne tirée des chiffres (« Basile te bat pour la 3e
 * fois d'affilée au UNO »), ou rien. La partie s'enregistre au moment où la feuille de fin s'ouvre : on demande un peu
 * après, et une seconde fois si elle n'était pas encore là.
 */
export function EveningLine({ game }: { game: TableGame }) {
  const [line, setLine] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const ask = () =>
      api
        .get<{ line: string | null }>(`/evening?game=${game}`)
        .then((r) => {
          if (!cancelled && r.line) setLine(r.line);
          return Boolean(r.line);
        })
        .catch(() => false);
    const first = setTimeout(() => {
      void ask().then((found) => {
        if (!found && !cancelled) second = setTimeout(() => void ask(), 3000);
      });
    }, 1200);
    let second: ReturnType<typeof setTimeout> | undefined;
    return () => {
      cancelled = true;
      clearTimeout(first);
      if (second) clearTimeout(second);
    };
  }, [game]);
  if (!line) return null;
  return (
    <p className="evening-line rise" aria-live="polite">
      {line}
    </p>
  );
}
