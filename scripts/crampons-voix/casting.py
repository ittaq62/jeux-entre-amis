# Le casting : plusieurs voix dessinées pour chaque intervenant, sur un texte de référence assez long (le clonage
# s'en sert ensuite pour toutes les répliques). On les mesure ensuite pour garder la meilleure.
import os, sys, time
import soundfile as sf
import torch
from qwen_tts import Qwen3TTSModel

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "casting")
os.makedirs(OUT, exist_ok=True)
VOICE = {
    "c": "A French man in his forties with a deep, warm baritone voice, a professional TV football commentator. Rich, "
         "resonant low voice, crisp diction, native standard French accent from France, no foreign accent.",
    "k": "A French man in his fifties with a low, slightly husky voice, a former professional footballer now a TV pundit. "
         "Relaxed, thoughtful delivery, native standard French accent from France, no foreign accent.",
}
MOOD = {
    0: "Calm, natural, conversational tone at a relaxed pace, like live TV commentary between two actions.",
    3: "He explodes with joy and shouts at the top of his lungs, very loud and passionate, like calling a goal live on TV.",
}
TEXT = {
    ("c", 0): "Bonsoir à tous. On joue la soixantième minute, le score est toujours de un partout, et ce match reste très "
              "ouvert. Les deux équipes se cherchent, on attend la petite étincelle.",
    ("c", 3): "But ! But ! Mais quel but ! Il l'a mise en pleine lucarne, le gardien n'a rien pu faire ! C'est extraordinaire !",
    ("k", 0): "Je trouve que les deux équipes se neutralisent. Il manque un peu de mouvement devant, et surtout de la vitesse "
              "dans les transmissions. Il faudra prendre plus de risques.",
}
which = sys.argv[1:] or ["c0", "k0"]
n = int(os.environ.get("N", "8"))
m = Qwen3TTSModel.from_pretrained(os.path.join(os.environ.get("VOIX_MODELES", os.path.join(HERE, "modeles")), "qwen-voicedesign"), device_map="cuda:0",
                                  dtype=torch.bfloat16, attn_implementation="sdpa")
for w in which:
    who, lvl = w[0], int(w[1])
    for i in range(n):
        torch.manual_seed(100 + i * 31)
        t = time.time()
        wavs, sr = m.generate_voice_design(text=TEXT[(who, lvl)], language="French", instruct=VOICE[who] + " " + MOOD[lvl])
        sf.write(os.path.join(OUT, f"{w}-{i}.wav"), wavs[0], sr)
        print(w, i, round(time.time() - t, 1), "s", flush=True)
