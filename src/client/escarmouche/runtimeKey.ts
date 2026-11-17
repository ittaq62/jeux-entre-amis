// Quand refaire le moteur du combat : une autre carte, une autre table, ou une nouvelle partie (la revanche sur la même
// carte en est une : le premier sang, les séries, les alertes repartent de zéro).

import type { EscarmoucheRoomView } from "../../shared/protocol.ts";

export function runtimeKey(room: Pick<EscarmoucheRoomView, "code" | "escarmouche" | "startedAt">): string {
  return `${room.escarmouche?.map}:${room.code}:${room.startedAt ?? ""}`;
}
