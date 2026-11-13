# La voix du commentaire de Crampons

Deux voix : le **commentateur**, qui raconte l'action, et le **consultant**, ancien joueur, qui l'analyse. Toutes leurs
répliques sont des fichiers mp3 dans `public/sounds/commentaire/`, que le jeu assemble selon le match (`src/client/crampons/commentary.ts`).

## Les fichiers

- `repliques.py` : le catalogue, chaque réplique avec son texte, sa voix (`c` ou `k`) et son intensité (0 posé → 3 explosion).
  Les répliques sont des morceaux : « La frappe de… » + « Vasseur ! », « Et c'est le but ! » + « Vasseur ! » + « Le score est
  ouvert ! ». Chaque situation a plusieurs variantes, numérotées (`but-1`, `but-2`…).
- `voix.py` : les deux voix (leur description, leurs références) et les corrections de prononciation.
- `casting/` : les références des deux voix (le commentateur posé, le commentateur survolté, le consultant). Toutes les
  répliques les clonent : c'est ce qui garde la même personne d'un bout à l'autre du match. La référence survoltée
  (`c3-clone.flac`) est elle-même un clone de la posée qui crie un but : même voix, plus haut et plus fort. L'ancienne
  (`c3-0.flac`, dessinée à part) montait à plus de 300 Hz et ne ressemblait pas plus au commentateur que le consultant :
  on entendait deux personnes dans une même phrase.
- `casting.py` : comment ces voix ont été choisies (Qwen3-TTS, voix décrites en mots, plusieurs essais).
- `references.py` : la référence vive du consultant (`k1-vive.flac`), clone de sa voix posée qui s'enthousiasme. Cloner la
  posée donnait des avis dits presque sur une seule note (moins d'un demi-ton d'écart, contre trois à quatre pour le
  commentateur) ; même voix, même hauteur, plus de vie.
- `atelier.py` : génère les répliques. Au moins trois prises par réplique ; `verifier.py` transcrit chaque prise
  (faster-whisper) et mesure sa hauteur, sa vivacité (de combien la voix monte et descend) et ses silences (parselmouth) ;
  on garde la mieux comprise, à la bonne intensité, et la plus vivante : une phrase récitée sur une seule note sonne faux.
- `manifeste.py` : écrit `src/client/crampons/voixLignes.ts`, le nombre de variantes de chaque réplique.
- `timbre.py` : compare des voix entre elles (même personne ou non).
- `ressemblance.py` : compare chaque réplique générée à la voix posée de son personnage ; celles qui s'en écartent sont à
  refaire (les noms seuls, trop courts, se mesurent mal : on juge sur les répliques de trois mots et plus).

## Refaire ou ajouter des répliques

1. Ajouter les répliques dans `repliques.py`, puis `python manifeste.py`.
2. Un environnement avec PyTorch (carte graphique) et `qwen-tts` ; un autre avec `faster-whisper` et `praat-parselmouth`.
3. Les modèles dans un dossier `VOIX_MODELES` : `qwen-base` (Qwen/Qwen3-TTS-12Hz-1.7B-Base), `whisper-base`.
4. `VOIX_VERIF_PY=<python de l'environnement whisper> python atelier.py <sortie> 'but-*' nom-vasseur …`
   (sans clés : tout le catalogue), puis copier les mp3 de `<sortie>` dans `public/sounds/commentaire/`.
