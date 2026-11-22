// Ce qui éclate à l'écran quand on fait un strike (un article de la boutique) : des confettis, une pluie d'étoiles, des
// bulles, des cœurs, un feu d'artifice, des éclairs, une pluie de pièces. Rien avec « Effets réduits ».

import confetti from "canvas-confetti";

const base = { disableForReducedMotion: true, zIndex: 60 };

function emojiShape(text: string) {
  return confetti.shapeFromText({ text, scalar: 2.2 });
}

/** Le strike de quelqu'un : l'effet de son choix (`mine` : en grand, sinon plus discret) */
export function strikeBurst(fx: string, mine: boolean) {
  const n = mine ? 1 : 0.55;
  switch (fx) {
    case "etoiles":
      void confetti({
        ...base,
        particleCount: Math.round(90 * n),
        spread: 120,
        startVelocity: 38,
        gravity: 0.6,
        origin: { y: 0.35 },
        shapes: ["star"],
        colors: ["#ffd166", "#fff6c8", "#ffffff"],
        scalar: 1.3,
      });
      break;
    case "bulles":
      void confetti({
        ...base,
        particleCount: Math.round(60 * n),
        spread: 140,
        startVelocity: 22,
        gravity: -0.25,
        drift: 0.4,
        ticks: 260,
        origin: { y: 0.75 },
        shapes: ["circle"],
        colors: ["#bfeaff", "#e8fbff", "#9fe0ff"],
        scalar: 1.8,
      });
      break;
    case "coeurs":
      void confetti({
        ...base,
        particleCount: Math.round(50 * n),
        spread: 110,
        startVelocity: 34,
        origin: { y: 0.4 },
        shapes: [emojiShape("💖"), emojiShape("💕")],
        scalar: 2,
      });
      break;
    case "feu":
      // Un feu d'artifice : plusieurs gerbes en l'air, l'une après l'autre
      for (let i = 0; i < (mine ? 5 : 3); i++) {
        setTimeout(() => {
          void confetti({
            ...base,
            particleCount: 70,
            spread: 360,
            startVelocity: 26,
            gravity: 0.7,
            ticks: 120,
            origin: { x: 0.2 + Math.random() * 0.6, y: 0.2 + Math.random() * 0.25 },
            colors: ["#ff4f4f", "#ffd166", "#4fa3ff", "#a06bff", "#5fd06a"],
          });
        }, i * 260);
      }
      break;
    case "eclairs":
      void confetti({
        ...base,
        particleCount: Math.round(36 * n),
        spread: 160,
        startVelocity: 40,
        gravity: 1.2,
        origin: { y: 0.3 },
        shapes: [emojiShape("⚡")],
        scalar: 2.2,
      });
      break;
    case "pieces":
      void confetti({
        ...base,
        particleCount: Math.round(60 * n),
        spread: 90,
        startVelocity: 18,
        gravity: 0.9,
        origin: { y: -0.1 },
        angle: 270,
        shapes: [emojiShape("🪙")],
        scalar: 1.9,
        ticks: 240,
      });
      break;
    default:
      // Les confettis : deux canons, de chaque côté
      for (const x of [0.1, 0.9]) {
        void confetti({
          ...base,
          particleCount: Math.round(80 * n),
          spread: 60,
          angle: x < 0.5 ? 60 : 120,
          startVelocity: 55,
          origin: { x, y: 0.75 },
          colors: ["#ff4fa3", "#37e0d0", "#ffd166", "#ffffff", "#a06bff"],
        });
      }
  }
}
