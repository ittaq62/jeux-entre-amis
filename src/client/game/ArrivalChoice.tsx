import { useEffect, useState } from "react";
import { JOINS_STARTED } from "../../shared/lateJoin.ts";
import { GAME_NAMES, type GameId, type TableGame } from "../../shared/protocol.ts";
import { Modal } from "../components/ui.tsx";
import { arrivalIntent } from "../lib/arrival.ts";

const STARTED: Partial<Record<TableGame, string>> = {
  tour: "La tournée a commencé",
  crampons: "Le match a commencé",
  bolides: "La course a commencé",
  naval: "La bataille a commencé",
};

interface Props {
  code: string;
  game: TableGame;
  /** La partie (ou la tournée) est lancée */
  started: boolean;
  /** Il y a déjà sa place */
  seated: boolean;
  /** « Rejoindre en cours de route » */
  lateJoin: boolean;
  /** Une place libre, ou un bot qui la cède */
  room: boolean;
  onJoin: () => void;
}

/**
 * À l'arrivée pendant une partie : jouer ou regarder, quand le jeu et l'hôte le permettent ; sinon, pourquoi on
 * regarde seulement. Une seule fois, et pas pour qui a déjà choisi « Regarder ». Le serveur décide de toute façon.
 */
export function ArrivalChoice({ code, game, started, seated, lateJoin, room, onJoin }: Props) {
  const [open, setOpen] = useState(() => started && !seated && arrivalIntent(code) !== "watch");
  useEffect(() => {
    if (seated) setOpen(false);
  }, [seated]);
  const tour = game === "tour";
  const join = lateJoin && JOINS_STARTED[game] && room;
  const close = () => setOpen(false);

  const why = !lateJoin
    ? tour
      ? "La tournée n'accepte plus de joueurs une fois lancée : tu peux la suivre, sans y entrer."
      : "La table n'accepte plus personne une fois la partie lancée : tu peux la regarder, et t'asseoir à la suivante."
    : JOINS_STARTED[game]
      ? "Toutes les places sont prises : tu regardes en attendant qu'une se libère."
      : `On n'entre pas dans une partie de ${GAME_NAMES[game as GameId]} déjà lancée : tu la regardes, et tu pourras t'asseoir à la suivante.`;

  return (
    <Modal open={open} onClose={close} title={STARTED[game] ?? "La partie a commencé"}>
      {join ? (
        <div className="create-options">
          <button
            className="create-option"
            onClick={() => {
              onJoin();
              close();
            }}
          >
            <strong>{tour ? "Jouer la tournée" : "Entrer sur le terrain"}</strong>
            <span>
              {tour
                ? "Tu entres dans la tournée : tu joues dès le prochain jeu."
                : "Tout de suite : l'ordinateur te confie un joueur de l'équipe qui a le moins de monde."}
            </span>
          </button>
          <button className="create-option" onClick={close}>
            <strong>Regarder</strong>
            <span>
              {tour
                ? "Tu suis la tournée sans jouer. Tu pourras y entrer entre deux jeux."
                : "Tu regardes le match. Tu pourras entrer en jeu depuis le salon de la table."}
            </span>
          </button>
        </div>
      ) : (
        <div className="stack">
          <p className="hint" style={{ margin: 0 }}>
            {why}
          </p>
          <button className="btn btn-primary btn-block" onClick={close}>
            Regarder
          </button>
        </div>
      )}
    </Modal>
  );
}
