# L'atelier du commentateur de Crampons : génère chaque réplique du catalogue avec Piper (voix française « siwis »),
# lui donne de l'élan (emotion.py : intonation sculptée, voyelles étirées), la traite façon retransmission, la fait
# transcrire par une reconnaissance vocale (faster-whisper) et retente avec de légères variations celles qui sont mal
# comprises. Garde la meilleure dans public/sounds/voix/.
#
# Mode d'emploi (une fois) :
#   python -m venv .venv-voix && .venv-voix/Scripts/pip install piper-tts faster-whisper praat-parselmouth
#   télécharger fr_FR-siwis-medium.onnx et .onnx.json (huggingface.co/rhasspy/piper-voices, fr/fr_FR/siwis/medium)
#   télécharger le modèle Systran/faster-whisper-base (config.json, model.bin, tokenizer.json, vocabulary.txt)
# Puis, depuis la racine du projet, avec ffmpeg installé :
#   .venv-voix/Scripts/python scripts/crampons-voix/atelier.py [clés à refaire…]
# Variables : PIPER_VOICE (le .onnx), WHISPER_MODEL (le dossier du modèle), FFMPEG (l'exécutable).
import json, os, re, shutil, subprocess, sys, unicodedata, wave
from difflib import SequenceMatcher
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from catalogue import LINES
from emotion import express
from piper import PiperVoice, SynthesisConfig
from faster_whisper import WhisperModel

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "..", "public", "sounds", "voix")
ONLY = set(sys.argv[1:])
FF = os.environ.get("FFMPEG", "ffmpeg")
TMP = os.path.join(HERE, "essais")
os.makedirs(TMP, exist_ok=True)
os.makedirs(OUT, exist_ok=True)

voice = PiperVoice.load(os.environ.get("PIPER_VOICE", "fr_FR-siwis-medium.onnx"))
asr = WhisperModel(os.environ.get("WHISPER_MODEL", "faster-whisper-base"), device="cpu", compute_type="int8")

BASE = {"calme": (0.95, 0.6, 0.7), "vif": (0.88, 0.66, 0.8), "fort": (0.84, 0.7, 0.85)}
# L'émotion vient d'emotion.py (intonation sculptée sans toucher au timbre) ; ici, plus de changement de hauteur
POST = {"calme": "", "vif": "", "fort": ""}


def stretch_for(key):
    """La voyelle finale qu'on fait durer : le cri de but (« le buuut ! »), le nom du buteur, le penalty marqué"""
    if key.startswith("but-"):
        return 1.0
    if key.startswith("nom-"):
        # Un nom de trois syllables ou plus, étiré, devient confus : on l'étire moins
        syllables = len(re.findall(r"[aeiouyéèêàâôû]+", LINES[key][0].lower()))
        return 1.0
    if key.startswith("tab-marque") or key.startswith("parade") or key.startswith("poteau") or key.startswith("barre"):
        return 1.0
    return 1.0
LOUD = {"calme": -17, "vif": -16, "fort": -14}
# Les essais successifs : un peu plus lent, un peu moins de variation, pour les mots qui passent mal
VARIANTS = [(1.0, 1.0), (1.06, 0.85), (1.1, 0.7), (0.97, 0.9), (1.14, 0.6), (1.03, 0.75)]


def render(text, tone, path, variant, key=""):
    ls, ns, nw = BASE[tone]
    k_len, k_noise = VARIANTS[variant]
    plain = path.replace(".mp3", "-plat.wav")
    raw = path.replace(".mp3", ".wav")
    with wave.open(plain, "wb") as wf:
        voice.synthesize_wav(text, wf, syn_config=SynthesisConfig(length_scale=ls * k_len, noise_scale=ns * k_noise, noise_w_scale=nw * k_noise))
    express(plain, raw, tone, stretch_for(key))
    chain = (
        # On ne coupe que le silence du début et de la fin : les pauses entre deux phrases restent
        "silenceremove=start_periods=1:start_threshold=-48dB,areverse,silenceremove=start_periods=1:start_threshold=-48dB,areverse,"
        + POST[tone]
        + "highpass=f=110,equalizer=f=2800:t=o:w=1.4:g=3,equalizer=f=220:t=o:w=1:g=1.5,"
        + "acompressor=threshold=0.12:ratio=3:attack=5:release=80:makeup=1.5,"
        + f"loudnorm=I={LOUD[tone]}:TP=-1.5:LRA=7,aresample=44100,"
        + "afade=t=in:d=0.01,areverse,afade=t=in:d=0.04,areverse"
    )
    subprocess.run([FF, "-hide_banner", "-loglevel", "error", "-y", "-i", raw, "-af", chain, "-ac", "1", "-c:a", "libmp3lame", "-b:a", "56k", path], check=True)


def load(path):
    out = subprocess.run([FF, "-v", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", "16000", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(out, np.float32)


PAD = np.zeros(8000, np.float32)
WORDS = ["zero", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf"]


def norm(s):
    s = unicodedata.normalize("NFD", s.lower()).encode("ascii", "ignore").decode()
    for said, letters in (("a-esse", "as"), ("ef-ce", "fc"), ("u-esse", "us"), ("ji esse", "js"), ("ce-esse", "cs"), ("a-ce", "ac"), ("rassinng", "racing"), ("cornere", "corner")):
        s = s.replace(said, letters)
    for d, w in enumerate(WORDS):
        s = re.sub(rf"\b{d}\b", w, s)
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def check(key, text, path):
    audio = load(path)
    # Un nom se joue après un cri de but, un score suivi de l'équipe qui mène : on les vérifie ainsi
    if key.startswith("nom-"):
        audio = np.concatenate([load(os.path.join(OUT, "but-2.mp3")), audio])
        text = "Et c'est le but ! " + text
    elif key.startswith("score-"):
        audio = np.concatenate([audio, load(os.path.join(OUT, "club-stade-clairmarais-pour.mp3"))])
        text = text + " pour le Stade Clairmarais."
    segs, _ = asr.transcribe(np.concatenate([PAD, audio, PAD]), language="fr", beam_size=5)
    heard = " ".join(s.text for s in segs).strip()
    return SequenceMatcher(None, norm(text), norm(heard)).ratio(), heard


# Les répliques qui servent de contexte d'abord
order = sorted(LINES, key=lambda k: 0 if k in ("but-2", "club-stade-clairmarais-pour") else 1)
report = []
for key in order:
    if ONLY and key not in ONLY:
        continue
    text, tone = LINES[key]
    best = (-1.0, None, "")
    for v in range(len(VARIANTS)):
        path = os.path.join(TMP, f"{key}-{v}.mp3")
        render(text, tone, path, v, key)
        if key in ("but-2", "club-stade-clairmarais-pour") and v == 0:
            shutil.copy(path, os.path.join(OUT, f"{key}.mp3"))
        score, heard = check(key, text, path)
        if score > best[0]:
            best = (score, path, heard)
        if score >= 0.85:
            break
    shutil.copy(best[1], os.path.join(OUT, f"{key}.mp3"))
    report.append({"key": key, "text": text, "score": round(best[0], 2), "heard": best[2]})
report.sort(key=lambda r: r["score"])
shutil.rmtree(TMP, ignore_errors=True)
low = [r for r in report if r["score"] < 0.75]
print(f"{len(report)} répliques ; {len(low)} sous 0,75 après essais")
for r in report[:20]:
    print(f"{r['score']:.2f} {r['key']:32} voulu « {r['text']} » | entendu « {r['heard']} »")
