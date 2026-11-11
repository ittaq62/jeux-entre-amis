# La vérification d'une prise : la reconnaissance vocale doit entendre le texte voulu, la voix doit avoir l'intensité
# demandée (une réplique criée plus haute et plus forte qu'une réplique posée), et rien ne doit traîner (silence, souffle)
# usage (serveur JSON, une requête par ligne sur l'entrée standard) : verifier.py
import json, os, re, sys, unicodedata
from difflib import SequenceMatcher
import numpy as np
import parselmouth
import subprocess
from faster_whisper import WhisperModel

HERE = os.path.dirname(os.path.abspath(__file__))
asr = WhisperModel(os.path.join(os.environ.get("VOIX_MODELES", os.path.join(HERE, "modeles")), "whisper-base"), device="cpu", compute_type="int8")
WORDS = ["zero", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf"]


def norm(s):
    s = unicodedata.normalize("NFD", s.lower()).encode("ascii", "ignore").decode()
    s = s.replace("a.s.", "as").replace("f.c.", "fc").replace("u.s.", "us").replace("j.s.", "js").replace("c.s.", "cs").replace("a.c.", "ac")
    for d, w in enumerate(WORDS):
        s = re.sub(rf"\b{d}\b", w, s)
    s = s.replace("goal", "but").replace("buuut", "but").replace("buut", "but")
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def measure(path):
    snd = parselmouth.Sound(path)
    pitch = snd.to_pitch(time_step=0.01, pitch_floor=70, pitch_ceiling=500)
    f0 = pitch.selected_array["frequency"]
    f0 = f0[f0 > 0]
    a = snd.values.mean(axis=0)
    sr = int(snd.sampling_frequency)
    # Le niveau par tranches de 10 ms
    hop = int(sr * 0.01)
    n = len(a) // hop
    rms = np.sqrt((a[: n * hop].reshape(n, hop) ** 2).mean(axis=1) + 1e-12)
    db = 20 * np.log10(rms)
    loud = db > db.max() - 35
    # Le plus long silence à l'intérieur (une pause de deux secondes au milieu d'une réplique, c'est un raté)
    idx = np.flatnonzero(loud)
    gap = 0.0
    if len(idx) > 1:
        gap = float(np.diff(idx).max() - 1) * 0.01
    return {
        "dur": len(a) / sr,
        "f0": float(np.median(f0)) if len(f0) else 0.0,
        "f0_hi": float(np.percentile(f0, 90)) if len(f0) else 0.0,
        # Le niveau des passages parlés, au-dessus du plancher : une réplique criée est plus forte
        "loud": float(np.percentile(db[loud], 75)) if loud.any() else -99.0,
        "gap": gap,
    }


def check(path, text, context=None):
    raw = subprocess.run([os.environ.get("FFMPEG", "ffmpeg"), "-v", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", "16000", "-"], capture_output=True, check=True).stdout
    a = np.frombuffer(raw, np.float32)
    pad = np.zeros(8000, np.float32)
    segs, _ = asr.transcribe(np.concatenate([pad, a.astype(np.float32), pad]), language="fr", beam_size=5)
    heard = " ".join(s.text for s in segs).strip()
    score = SequenceMatcher(None, norm(text), norm(heard)).ratio()
    m = measure(path)
    return {"score": round(score, 3), "heard": heard, **{k: round(v, 3) for k, v in m.items()}}


for line in sys.stdin:
    req = json.loads(line)
    try:
        res = check(req["path"], req["text"])
    except Exception as e:  # une prise illisible ne doit pas arrêter l'atelier
        res = {"score": 0, "heard": "", "error": str(e)}
    sys.stdout.write(json.dumps(res, ensure_ascii=False) + "\n")
    sys.stdout.flush()
