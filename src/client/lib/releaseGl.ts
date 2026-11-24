// Rendre son contexte WebGL à la carte graphique quand on quitte un jeu en 3D.
//
// `renderer.dispose()` vide le moteur, mais le contexte ne part qu'avec la toile, au passage du ramasse-miettes. Or une
// matière, une géométrie ou une texture gardée par un module d'une partie à l'autre (une tenue, un contour, un décor
// mis en cache) garde un écouteur de chaque moteur qui l'a dessinée, donc le moteur, donc son contexte : après quelques
// parties dans le même onglet, la carte graphique garde un contexte par partie, avec ses textures, jusqu'à ce que le
// navigateur en tue (au-delà de 16). On le perd donc exprès, tout de suite, dès que sa toile a quitté la page.

/** Ce qu'il faut d'un moteur three.js (WebGLRenderer) */
export interface DisposableRenderer {
  domElement: HTMLCanvasElement;
  dispose(): void;
  forceContextLoss(): void;
}

/**
 * Le moteur ne sert plus : on le vide, et si sa toile n'est plus dans la page (on a quitté la partie, ou la toile lui
 * appartenait et vient d'être retirée), on rend son contexte. Une toile encore affichée garde le sien : un autre moteur
 * va la reprendre (la revanche, une autre carte, le double montage de React en développement), et un contexte perdu ne
 * se retrouve pas.
 */
export function releaseRenderer(renderer: DisposableRenderer) {
  renderer.dispose();
  if (!renderer.domElement.isConnected) renderer.forceContextLoss();
}
