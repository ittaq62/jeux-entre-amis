# La ressemblance des voix : l'empreinte vocale de chaque fichier (l'encodeur de voix de Chatterbox), comparée deux à deux
import os, sys
import numpy as np, librosa, torch
from chatterbox.models.voice_encoder import VoiceEncoder

ve = VoiceEncoder()
ve.load_state_dict(torch.load(os.path.join(os.environ.get("VOIX_MODELES", "modeles"), "chatterbox", "ve.pt"), map_location="cpu"))
ve.eval()
files = sys.argv[1:]
wavs = [librosa.load(f, sr=16000)[0] for f in files]
emb = ve.embeds_from_wavs(wavs, sample_rate=16000)
emb = emb / np.linalg.norm(emb, axis=1, keepdims=True)
sim = emb @ emb.T
names = [f.split("/")[-1].replace(".wav", "") for f in files]
print("      " + " ".join(f"{n:>7}" for n in names))
for i, n in enumerate(names):
    print(f"{n:>7} " + " ".join(f"{sim[i, j]:7.2f}" for j in range(len(names))))
