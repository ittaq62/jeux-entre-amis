// La carte de fin de tournée, à partager en image : qui a gagné, le classement, et chaque jeu avec son vainqueur. Dessinée
// sur une toile au format d'une story (1080 × 1350), avec les polices du site, puis partagée (téléphone) ou enregistrée.

import { GAME_NAMES } from "../../shared/protocol.ts";
import { teamScores, TOUR_TEAMS, type TourView } from "../../shared/tour.ts";
import { playedGames, rulesName, standingsOf } from "./TourParts.tsx";

const W = 1080;
const H = 1350;
const GOLD = "#e2bd6e";
const CREAM = "#f4ecda";
const SOFT = "rgba(244, 236, 218, 0.72)";
const TITLE = '"Young Serif", Georgia, serif';
const TEXT = '"Libre Franklin Variable", "Segoe UI", sans-serif';

/** Ce que dit la carte en tête : le vainqueur, l'équipe gagnante, ou l'égalité */
export function tourHeadline(view: TourView): string {
  if (view.settings.teams) {
    const [red, blue] = teamScores(view.members);
    if (red === blue) return `Égalité parfaite, ${red} partout`;
    return `Victoire des ${TOUR_TEAMS[red > blue ? 0 : 1]}, ${Math.max(red, blue)} à ${Math.min(red, blue)}`;
  }
  const first = standingsOf(view, null)[0];
  return first ? `${first.member.name} remporte la tournée` : "La tournée est finie";
}

/** Coupe un texte trop long pour sa largeur, avec des points de suspension */
function fit(ctx: CanvasRenderingContext2D, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

export async function drawTourCard(view: TourView, now = new Date()): Promise<Blob> {
  await document.fonts?.ready;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Le tapis vert de la table, un liseré doré
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#14382a");
  bg.addColorStop(1, "#07130d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(226, 189, 110, 0.55)";
  ctx.lineWidth = 4;
  ctx.strokeRect(36, 36, W - 72, H - 72);

  ctx.textAlign = "center";
  ctx.fillStyle = GOLD;
  ctx.font = `600 34px ${TEXT}`;
  ctx.fillText("LA TABLÉE", W / 2, 118);
  ctx.fillStyle = CREAM;
  ctx.font = `96px ${TITLE}`;
  ctx.fillText("La Tournée", W / 2, 228);
  ctx.fillStyle = GOLD;
  ctx.font = `44px ${TITLE}`;
  ctx.fillText(fit(ctx, tourHeadline(view), W - 160), W / 2, 306);

  // Le classement
  const rows = standingsOf(view, null).slice(0, 8);
  let y = 400;
  ctx.textAlign = "left";
  for (const r of rows) {
    const podium = r.rank <= 3;
    ctx.fillStyle = podium ? GOLD : SOFT;
    ctx.font = `700 40px ${TEXT}`;
    ctx.fillText(`${r.rank}`, 120, y);
    ctx.fillStyle = CREAM;
    ctx.font = `${podium ? 600 : 400} 40px ${TEXT}`;
    const team = view.settings.teams && r.member.team !== null ? ` · ${TOUR_TEAMS[r.member.team]}` : "";
    ctx.fillText(fit(ctx, `${r.member.name}${team}`, 640), 190, y);
    ctx.textAlign = "right";
    ctx.fillStyle = podium ? GOLD : CREAM;
    ctx.font = `700 40px ${TEXT}`;
    ctx.fillText(`${r.member.points} pts`, W - 120, y);
    ctx.textAlign = "left";
    y += 62;
  }

  // Jeu par jeu
  const games = playedGames(view);
  y = Math.max(y + 40, 940);
  ctx.strokeStyle = "rgba(226, 189, 110, 0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(120, y - 56);
  ctx.lineTo(W - 120, y - 56);
  ctx.stroke();
  ctx.font = `30px ${TEXT}`;
  for (const g of games.slice(0, 6)) {
    const winner = g.results?.find((r) => r.rank === 1)?.name;
    const rules = rulesName(g.game, g.variant);
    const line = `${g.index}. ${GAME_NAMES[g.game]}${rules ? ` · ${rules}` : ""}${winner ? ` — ${winner}` : ""}`;
    ctx.fillStyle = SOFT;
    ctx.fillText(fit(ctx, line, W - 240), 120, y);
    y += 46;
  }
  if (games.length > 6) {
    ctx.fillText(`et ${games.length - 6} autre${games.length - 6 > 1 ? "s" : ""}`, 120, y);
  }

  ctx.textAlign = "center";
  ctx.fillStyle = GOLD;
  ctx.font = `28px ${TEXT}`;
  ctx.fillText(now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }), W / 2, H - 80);

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Image impossible"))), "image/png"),
  );
}

/** Partage la carte (feuille de partage du téléphone), ou l'enregistre quand l'appareil ne sait pas partager une image */
export async function shareTourCard(view: TourView): Promise<"shared" | "saved" | "cancelled"> {
  const blob = await drawTourCard(view);
  const file = new File([blob], `tournee-${view.code}.png`, { type: "image/png" });
  const data = { files: [file], title: "La Tournée", text: `${tourHeadline(view)} !` };
  if (navigator.canShare?.(data)) {
    try {
      await navigator.share(data);
      return "shared";
    } catch (err) {
      if ((err as Error).name === "AbortError") return "cancelled";
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "saved";
}
