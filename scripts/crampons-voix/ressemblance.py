# Chaque réplique ressemble-t-elle à la voix de son personnage ? L'empreinte vocale de chaque fichier (l'encodeur de voix
# de Chatterbox) comparée à celle de la référence posée du commentateur ou du consultant : en dessous du seuil, ce n'est
# plus tout à fait la même personne, la réplique est à refaire (atelier.py <sortie> <clés...>).
# usage : ressemblance.py <dossier des mp3> [seuil]
import os, sys
import numpy as np, librosa, torch
from chatterbox.models.voice_encoder import VoiceEncoder

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from repliques import LINES  # noqa: E402

DIR = sys.argv[1]
SEUIL = float(sys.argv[2]) if len(sys.argv) > 2 else 0.75
CASTING = os.environ.get("VOIX_CASTING", os.path.join(HERE, "casting"))
ve = VoiceEncoder()
ve.load_state_dict(torch.load(os.path.join(os.environ.get("VOIX_MODELES", "modeles"), "chatterbox", "ve.pt"), map_location="cpu"))
ve.eval()


def emb(paths):
    wavs = [librosa.load(p, sr=16000)[0] for p in paths]
    e = ve.embeds_from_wavs(wavs, sample_rate=16000)
    return e / np.linalg.norm(e, axis=1, keepdims=True)


ref = {"c": emb([os.path.join(CASTING, "c0-4.flac")])[0], "k": emb([os.path.join(CASTING, "k0-3.flac")])[0]}
keys = [k for k in LINES if os.path.exists(os.path.join(DIR, f"{k}.mp3"))]
low = []
for i in range(0, len(keys), 32):
    lot = keys[i:i + 32]
    e = emb([os.path.join(DIR, f"{k}.mp3") for k in lot])
    for k, v in zip(lot, e):
        sim = float(v @ ref[LINES[k][1]])
        if sim < SEUIL:
            low.append((sim, k))
low.sort()
print(f"{len(keys)} répliques, {len(low)} sous {SEUIL}")
for sim, k in low:
    print(f"{sim:.2f} {k:30} « {LINES[k][0]} »")
print(" ".join(k for _, k in low))
