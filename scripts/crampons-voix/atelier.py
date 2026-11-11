# L'atelier du commentaire : chaque réplique du catalogue, dite par sa voix — le commentateur ou le consultant, deux voix
# fixes choisies au casting (casting.py) et clonées par Qwen3-TTS, d'après une référence posée ou survoltée selon
# l'intensité. Les répliques passent par lots (la carte graphique en dit plusieurs à la fois) ; chaque prise est
# transcrite et mesurée (verifier.py, dans un autre processus). Celles qui ne sont pas réussies repassent, avec un autre
# tirage, jusqu'à quatre fois ; on garde la meilleure prise : bien comprise, à la bonne intensité, sans trou ni longueur
# anormale. Puis traitement de retransmission et mp3.
# usage : atelier.py <dossier de sortie> [clés exactes ou préfixes terminés par * ...]
import json, os, subprocess, sys, time
import soundfile as sf
import torch
from qwen_tts import Qwen3TTSModel

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from repliques import LINES  # noqa: E402
from voix import REFS, say  # noqa: E402

OUT = sys.argv[1]
ONLY = sys.argv[2:]
TMP = os.path.join(HERE, "prises")
os.makedirs(TMP, exist_ok=True)
os.makedirs(OUT, exist_ok=True)
FF = os.environ.get("FFMPEG", "ffmpeg")
ROUNDS = int(os.environ.get("PRISES", "4"))
BATCH = int(os.environ.get("LOT", "8"))
MODELES = os.environ.get("VOIX_MODELES", os.path.join(HERE, "modeles"))
CASTING = os.environ.get("VOIX_CASTING", os.path.join(HERE, "casting"))

# Le vérificateur tourne dans l'environnement de la reconnaissance vocale
ver = subprocess.Popen(
    [os.environ.get("VOIX_VERIF_PY", "python"), os.path.join(HERE, "verifier.py")],
    stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, encoding="utf-8", env={**os.environ, "PYTHONIOENCODING": "utf-8"},
)


def verify(path, text):
    ver.stdin.write(json.dumps({"path": path, "text": text}, ensure_ascii=False) + "\n")
    ver.stdin.flush()
    return json.loads(ver.stdout.readline())


model = Qwen3TTSModel.from_pretrained(os.path.join(MODELES, "qwen-base"), device_map="cuda:0", dtype=torch.bfloat16,
                                      attn_implementation="sdpa")
PROMPTS = {k: model.create_voice_clone_prompt(ref_audio=os.path.join(CASTING, f), ref_text=t, x_vector_only_mode=False)
           for k, (f, t) in REFS.items()}


def ref_for(who, level):
    return "k0" if who == "k" else ("c3" if level >= 2 else "c0")


# La hauteur habituelle de chaque voix posée (mesurée sur les références), et la montée attendue selon l'intensité
BASE_F0 = {"c": 105.0, "k": 81.0}
WANT = {0: 1.0, 1: 1.08, 2: 1.7, 3: 2.2}


def chain(level):
    # Comme à la retransmission : un peu de présence, une compression qui tient les cris, un niveau régulier
    loud = {0: -17, 1: -16, 2: -15, 3: -14}[level]
    return (
        "silenceremove=start_periods=1:start_threshold=-46dB,areverse,silenceremove=start_periods=1:start_threshold=-46dB,areverse,"
        "highpass=f=80,equalizer=f=3000:t=o:w=1.2:g=2,acompressor=threshold=0.12:ratio=3:attack=5:release=90:makeup=1.4,"
        f"loudnorm=I={loud}:TP=-1.5:LRA=8,aresample=44100,afade=t=in:d=0.01,areverse,afade=t=in:d=0.05,areverse"
    )


def grade(text, who, level, m):
    """Le mérite d'une prise : d'abord être comprise, puis avoir l'intensité voulue, sans trou ni longueur anormale"""
    s = m.get("score", 0)
    words = max(1, len(text.split()))
    if m.get("gap", 0) > 0.6 or m.get("dur", 0) > 1.0 + words * 0.6:
        s -= 0.5
    if m.get("f0"):
        lift = m["f0"] / BASE_F0[who]
        s += 0.25 * min(lift / WANT[level], 1.0) - (0.15 if level <= 1 and lift > 1.45 else 0)
    return s


def good(m, g):
    """Une prise bien comprise et dans le ton : inutile d'en faire d'autres"""
    return m.get("score", 0) >= 0.93 and g >= m.get("score", 0) + 0.2


def wanted(k):
    return not ONLY or any(k == p or (p.endswith("*") and k.startswith(p[:-1])) for p in ONLY)


keys = [k for k in LINES if wanted(k)]
best = {}
todo = list(keys)
t0 = time.time()
for rnd in range(ROUNDS):
    if not todo:
        break
    # Par voix de référence, par lots de textes de longueur voisine (le lot avance au pas du plus long)
    groups = {}
    for k in todo:
        text, who, level = LINES[k]
        groups.setdefault(ref_for(who, level), []).append(k)
    done = 0
    for ref, ks in groups.items():
        ks.sort(key=lambda k: len(LINES[k][0]))
        for i in range(0, len(ks), BATCH):
            lot = ks[i:i + BATCH]
            torch.manual_seed(1000 + rnd * 17 + i)
            wavs, sr = model.generate_voice_clone(text=[say(LINES[k][0]) for k in lot], language=["French"] * len(lot),
                                                  voice_clone_prompt=PROMPTS[ref])
            for k, w in zip(lot, wavs):
                text, who, level = LINES[k]
                path = os.path.join(TMP, f"{k}-{rnd}.wav")
                sf.write(path, w, sr)
                m = verify(path, text)
                g = grade(text, who, level, m)
                if k not in best or g > best[k][0]:
                    best[k] = (g, path, m)
            done += len(lot)
            el = time.time() - t0
            print(f"tour {rnd + 1} : {done}/{len(todo)} ({el / 60:.1f} min)", flush=True)
    todo = [k for k in todo if not good(best[k][2], best[k][0])]
    print(f"après le tour {rnd + 1} : {len(todo)} à refaire", flush=True)

report = []
for k in keys:
    g, path, m = best[k]
    text, who, level = LINES[k]
    subprocess.run([FF, "-hide_banner", "-loglevel", "error", "-y", "-i", path, "-af", chain(level), "-ac", "1", "-c:a", "libmp3lame",
                    "-b:a", "56k", os.path.join(OUT, f"{k}.mp3")], check=True)
    report.append({"key": k, "text": text, "who": who, "level": level, "grade": round(g, 3), "take": path, **m})
report.sort(key=lambda r: r["grade"])
name = os.environ.get("RAPPORT", "rapport.json")
json.dump(report, open(os.path.join(HERE, name), "w", encoding="utf-8"), ensure_ascii=False, indent=0)
low = [r for r in report if r["score"] < 0.8]
print(f"{len(report)} répliques en {(time.time() - t0) / 60:.0f} min ; {len(low)} mal comprises")
for r in report[:30]:
    print(f"{r['grade']:.2f} {r['score']:.2f} f0 {r.get('f0', 0):.0f} {r['key']:30} « {r['text']} » | entendu « {r['heard']} »")
ver.stdin.close()
