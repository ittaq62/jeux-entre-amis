// L'illustration de Crampons sur l'accueil : un but joué par le vrai moteur du jeu et filmé avec sa 3D (DevAffiche, &film) —
// un soir de match, le numéro 9 file vers le but, frappe en lucarne, le gardien s'envole pour rien, puis le gros plan du
// buteur qui fête avec les siens devant la tribune qui saute. La 3D ne se charge qu'à table : ici, c'est une courte vidéo
// muette en boucle (public/crampons-film.mp4), posée sur son affiche (public/crampons-apercu.webp, l'image où le ballon
// arrive en lucarne, par laquelle la vidéo commence et finit).
// La vidéo ne se charge et ne joue que quand la fiche est à l'écran (HomePage, useStageMotion) ; avec « Effets réduits »,
// on ne voit que l'affiche.

import { useState } from "react";
import "./crampons.css";

export function CramponsPreview() {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="crampons-preview">
      <div className="crampons-preview-frame">
        <img src="/crampons-apercu.webp" width={1200} height={900} alt="" loading="lazy" decoding="async" />
        <video
          className={`crampons-preview-film ${playing ? "is-playing" : ""}`}
          src="/crampons-film.mp4"
          width={800}
          height={600}
          muted
          loop
          playsInline
          preload="none"
          disablePictureInPicture
          disableRemotePlayback
          onPlaying={() => setPlaying(true)}
        />
      </div>
    </div>
  );
}
