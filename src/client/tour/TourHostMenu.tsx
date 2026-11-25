import { ConfirmButton } from "../components/ui.tsx";
import { Icon } from "../components/Icon.tsx";
import { useTourBridge } from "./bridge.ts";

/**
 * Dans le menu d'une partie de tournée, pour l'hôte seulement : arrêter la tournée après ce jeu (ou se raviser), et passer
 * ce jeu quand il traîne ou ne plaît pas à la bande (il ne compte pas, deux clics). Rien ailleurs.
 */
export function TourHostMenu({ onDone }: { onDone?: () => void }) {
  const host = useTourBridge()?.host;
  if (!host) return null;
  return (
    <>
      <button
        type="button"
        className="menu-item"
        onClick={() => {
          host.toggleFinish();
          onDone?.();
        }}
      >
        <Icon name="flag" size={18} />
        {host.finishAfterCurrent ? "Finalement, continuer la tournée" : "Arrêter la tournée après ce jeu"}
      </button>
      <ConfirmButton
        className="menu-item"
        confirm="Passer ce jeu ? Il ne comptera pas"
        onConfirm={() => {
          host.skip();
          onDone?.();
        }}
      >
        <Icon name="play" size={18} /> Passer ce jeu
      </ConfirmButton>
    </>
  );
}
