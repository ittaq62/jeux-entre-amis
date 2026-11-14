// Le choix des skins d'un jeu, dans l'attente d'une tournée : les mêmes choix qu'au salon de chaque jeu, gardés sur cet
// appareil. Chargé seulement quand on ouvre la fenêtre des skins (les aperçus en 3D sont lourds).

import "../capitale/capitale.css";
import "../crampons/crampons.css";
import "../naval/naval.css";
import { useState } from "react";
import { seededAvatar } from "../../shared/avatar.ts";
import type { BallId, FeteId } from "../../shared/games/crampons/boutique.ts";
import { CLUBS } from "../../shared/games/crampons/clubs.ts";
import type { GameId } from "../../shared/protocol.ts";
import type { ShopItem } from "../../shared/shop.ts";
import { GarageSheet } from "../bolides/Garage.tsx";
import { KART_COLORS } from "../bolides/scene/kart.ts";
import { PAWN_COLORS } from "../capitale/boardUi.ts";
import { TokenPicker } from "../capitale/CapitaleLobby.tsx";
import { CramponsLook } from "../crampons/CramponsLook.tsx";
import { Locker } from "../crampons/CramponsLobby.tsx";
import { BackPicker } from "../game/BackPicker.tsx";
import { SkinPicker } from "../naval/SkinPicker.tsx";
import { BuyModal } from "../shop/BuyModal.tsx";
import { usePrefs } from "../stores/prefs.ts";
import { useSession } from "../stores/session.ts";
import { useCurrentLooks } from "./TourLooks.tsx";

/** Le maillot de l'aperçu de la célébration : celui du premier club (à chaque match de la tournée, les clubs sont tirés) */
const KIT = CLUBS[0]!.home;

export function LooksSheet({ game }: { game: GameId }) {
  const set = usePrefs((p) => p.set);
  const me = useSession((s) => s.user);
  const looks = useCurrentLooks();
  const [buying, setBuying] = useState<ShopItem | null>(null);

  switch (game) {
    case "uno":
      return <BackPicker current={looks.unoBack} onPick={(back) => set({ unoBack: back })} />;
    case "naval":
      return <SkinPicker current={looks.navalSkin} onPick={(skin) => set({ navalSkin: skin })} />;
    case "capitale":
      return <TokenPicker color={PAWN_COLORS[0]!} current={looks.capitaleToken} onPick={(token) => set({ capitaleToken: token })} />;
    case "bolides":
      return (
        <GarageSheet
          vehicle={looks.bolidesVehicle}
          skin={looks.bolidesSkin}
          color={KART_COLORS[0]!}
          avatar={me?.avatar ?? seededAvatar("garage")}
          name={me?.pseudo ?? ""}
          onVehicle={(id) => set({ bolidesVehicle: id })}
          onSkin={(id) => set({ bolidesSkin: id })}
        />
      );
    case "crampons":
      return (
        <>
          <Locker kit={KIT} onBuy={setBuying} />
          <BuyModal
            item={buying}
            preview={buying ? <CramponsLook item={buying} big kit={KIT} /> : undefined}
            onClose={() => setBuying(null)}
            onBought={(item) => {
              if (item.kind === "ballon") set({ cramponsBall: item.ref as BallId });
              if (item.kind === "fete") set({ cramponsFete: item.ref as FeteId });
            }}
          />
        </>
      );
    default:
      return null;
  }
}
