/** L'illustration de Capitale sur l'accueil : une vue du plateau en 3D, en image (la 3D ne se charge qu'à table) */
export function CapitalePreview({ px }: { px: number }) {
  return (
    <img
      className="capitale-preview"
      src="/capitale-apercu.webp"
      width={px}
      height={Math.round(px * 0.75)}
      alt=""
      loading="lazy"
      decoding="async"
    />
  );
}
