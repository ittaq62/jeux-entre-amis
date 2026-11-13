# Les références « vives » : le commentateur et le consultant, clonés depuis leur voix posée, disent une phrase animée.
# Cloner une référence plate donnait des répliques plates (le consultant surtout, qui parlait presque sur une seule note) ;
# une référence vive, c'est la même voix qui vit davantage. On en tire plusieurs prises, puis on garde la plus vivante qui
# reste bien comprise et reconnaissable (mesures : verifier.py pour l'intonation, ressemblance au timbre posé).
# usage : references.py [c1] [k1]  (prises dans casting/, nommées c1-0.wav, c1-1.wav…)
import os, sys, time
import soundfile as sf
import torch
from qwen_tts import Qwen3TTSModel

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from voix import REFS  # noqa: E402

CASTING = os.environ.get("VOIX_CASTING", os.path.join(HERE, "casting"))
MODELES = os.environ.get("VOIX_MODELES", os.path.join(HERE, "modeles"))
TEXT = {
    # Vif, pas encore un cri : une action qui s'emballe
    "c1": ("c0", "Attention ! Il accélère sur le côté gauche, il déborde, il centre... et la défense se dégage !"),
    # Le consultant qui s'enthousiasme pour une belle action, sans crier
    "k1": ("k0", "Ah, ça, c'est très bien joué ! Il prend l'espace, il lève la tête, et il trouve le bon partenaire. Magnifique !"),
}
which = sys.argv[1:] or list(TEXT)
n = int(os.environ.get("N", "10"))
model = Qwen3TTSModel.from_pretrained(os.path.join(MODELES, "qwen-base"), device_map="cuda:0", dtype=torch.bfloat16,
                                      attn_implementation="sdpa")
for w in which:
    base, text = TEXT[w]
    f, t = REFS[base]
    prompt = model.create_voice_clone_prompt(ref_audio=os.path.join(CASTING, f), ref_text=t, x_vector_only_mode=False)
    for i in range(n):
        torch.manual_seed(500 + i * 37)
        t0 = time.time()
        wavs, sr = model.generate_voice_clone(text=text, language="French", voice_clone_prompt=prompt)
        sf.write(os.path.join(CASTING, f"{w}-{i}.wav"), wavs[0], sr)
        print(w, i, round(time.time() - t0, 1), "s", flush=True)
