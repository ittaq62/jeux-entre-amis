# Les sons communs du site, refaits pour sonner vrai : des corps qui vibrent (bois, métal, peau), frappés par un maillet
# ou un choc dont on entend le bruit, dans une petite pièce, jamais deux fois tout à fait pareils.
#
#   python scripts/sons/naturels.py [nom...]      (tous si aucun nom ; écrit dans public/sounds)
#
# Ce qui faisait « son d'ordinateur » dans les anciens : des sinus ou des ondes carrées nus (une seule fréquence, sans
# bruit), des enveloppes parfaitement régulières, un silence numérique absolu autour, et le même fichier à chaque fois.
# Ici :
# - synthèse modale : un objet frappé sonne sur plusieurs fréquences inharmoniques (une lame de marimba : 1 ; 3,9 ;
#   9,2…), chacune s'éteint à son rythme (les aiguës d'abord), légèrement désaccordées et en phases au hasard ;
# - l'attaque : le bruit du choc lui-même (un maillet, un doigt, du bois), filtré selon sa dureté ;
# - une petite pièce : premières réflexions et queue de réverbération courte, un fond de bruit très bas ;
# - plusieurs variantes par son (hauteur, timbre, rythme), que le jeu tire au hasard ;
# - le volume de l'ancien son est repris (mêmes réglages de volume dans le jeu).
#
# Dépendances : numpy, scipy, ffmpeg (encodage mp3).
import os
import subprocess
import sys

import numpy as np
from scipy import signal

SR = 44100
OUT = os.environ.get("OUT_DIR", os.path.join(os.path.dirname(__file__), "..", "..", "public", "sounds"))


# ---------------------------------------------------------------------------------------------------------------------
# Briques de base


def t_axis(dur):
    return np.arange(int(dur * SR)) / SR


def butter(x, kind, f, order=2):
    if kind == "band":
        sos = signal.butter(order, [f[0] / (SR / 2), f[1] / (SR / 2)], btype="band", output="sos")
    else:
        sos = signal.butter(order, f / (SR / 2), btype=kind, output="sos")
    return signal.sosfilt(sos, x)


def noise(rng, n):
    return rng.standard_normal(n)


def pink(rng, n):
    # Bruit rose (−3 dB par octave), comme le fond d'une pièce
    w = rng.standard_normal(n)
    b = [0.049922035, -0.095993537, 0.050612699, -0.004408786]
    a = [1, -2.494956002, 2.017265875, -0.522189400]
    return signal.lfilter(b, a, w)


def mallet(rng, dur=0.006, hardness=3000.0, amp=1.0):
    """Le bruit du choc : une rafale très brève, plus aiguë si le maillet est dur"""
    n = int(dur * SR)
    e = np.exp(-np.arange(n) / (n / 4))
    return butter(noise(rng, n) * e, "low", hardness) * amp


def modal(rng, f0, ratios, decays, amps, dur, detune=0.004, excite=None):
    """Un corps qui vibre : chaque mode sa fréquence (inharmonique), son extinction, son niveau ; phases au hasard"""
    t = t_axis(dur)
    y = np.zeros_like(t)
    for r, d, a in zip(ratios, decays, amps):
        f = f0 * r * (1 + rng.uniform(-detune, detune))
        if f > SR / 2 - 500:
            continue
        ph = rng.uniform(0, 2 * np.pi)
        # Une légère dérive de hauteur au début (le corps « se pose »), comme un vrai choc
        bend = 1 + 0.004 * np.exp(-t / 0.02)
        y += a * np.exp(-t / d) * np.sin(2 * np.pi * f * np.cumsum(bend) / SR + ph)
    # Une attaque qui n'est pas instantanée (quelques dixièmes de milliseconde)
    att = int(SR * rng.uniform(0.0004, 0.0012))
    y[:att] *= np.linspace(0, 1, att)
    # Jamais coupé net en fin de tampon : la main qui amortit la lame sur le dernier quart (au moins 20 ms)
    return fade_out(y, max(20, len(y) / SR * 1000 * 0.25))


def room(rng, x, rt60=0.35, wet=0.14, size=1.0, damp=5000.0):
    """Une petite pièce : six premières réflexions, puis une queue de bruit qui s'éteint et s'assourdit"""
    n = int(SR * (rt60 * 1.3 + 0.05))
    ir = np.zeros(n)
    ir[0] = 1.0
    for _ in range(6):
        d = int(SR * rng.uniform(0.004, 0.028) * size)
        ir[d] += rng.uniform(0.15, 0.45) * rng.choice([-1, 1])
    tail_start = int(SR * 0.012 * size)
    tt = np.arange(n - tail_start) / SR
    tail = noise(rng, n - tail_start) * np.exp(-6.9 * tt / rt60) * 0.35
    tail = butter(tail, "low", damp)
    ir[tail_start:] += tail
    dry = np.concatenate([x, np.zeros(n)])
    wet_sig = np.zeros(len(dry))
    conv = signal.fftconvolve(x, ir)[: len(dry)]
    wet_sig[: len(conv)] = conv
    wet_sig = wet_sig / (np.max(np.abs(wet_sig)) + 1e-9) * np.max(np.abs(x))
    return dry * (1 - wet) + wet_sig * wet


def place(rng, layers, dur):
    """Pose des couches (signal, instant) dans un tampon de `dur` secondes"""
    out = np.zeros(int(dur * SR))
    for sig, at in layers:
        i = int(at * SR)
        j = min(len(out), i + len(sig))
        if j > i:
            part = sig[: j - i]
            if j - i < len(sig):
                part = fade_out(part, 15)
            out[i:j] += part
    return out


def floor_noise(rng, x, level_db=-72.0):
    """Le fond très bas d'une vraie prise de son (plus de silence numérique absolu)"""
    p = pink(rng, len(x))
    p = p / (np.std(p) + 1e-9) * 10 ** (level_db / 20)
    return x + p


def limit(x, ceiling=0.89, max_drive=2.0):
    """Des crêtes au-dessus du plafond : un peu de saturation douce au plus (elle arrondit les chocs, mais déformerait
    une note tenue), et pour le reste on baisse le tout"""
    peak = np.max(np.abs(x))
    if peak <= ceiling:
        return x
    # Une note (un spectre de quelques raies, pas un bruit de choc) ne se sature pas du tout : on la baisse
    i = int(np.argmax(np.abs(x)))
    seg = x[max(0, i - 2048): i + 2048]
    spec = np.abs(np.fft.rfft(seg * np.hanning(len(seg)))) ** 2 + 1e-12
    band = spec[8 : len(spec) // 2]
    if np.exp(np.mean(np.log(band))) / np.mean(band) < 0.05:
        return x * (ceiling / peak)
    if peak > ceiling * max_drive:
        x = x * (ceiling * max_drive / peak)
    return ceiling * np.tanh(x / ceiling)


def fade_out(x, ms=30):
    n = min(len(x), int(SR * ms / 1000))
    x = x.copy()
    x[-n:] *= np.linspace(1, 0, n)
    return x


def trim(x, thresh_db=-60.0, max_dur=None):
    """Coupe le silence du début (le son part à l'instant de l'événement) et la fin quand tout est retombé sous le seuil
    (relatif à la crête) ; au plus `max_dur` secondes, avec un fondu"""
    env = np.abs(x)
    peak = env.max() + 1e-12
    above = np.where(env > peak * 10 ** (thresh_db / 20))[0]
    start = max(0, (above[0] if len(above) else 0) - int(0.0005 * SR))
    end = min(len(x), (above[-1] if len(above) else len(x)) + int(0.03 * SR))
    if max_dur:
        end = min(end, start + int(max_dur * SR))
    return fade_out(x[start:end], min(25, max(4, (end - start) / SR * 1000 * 0.3)))


# ---------------------------------------------------------------------------------------------------------------------
# Les instruments


MARIMBA = dict(ratios=[1, 3.93, 9.2, 15.5], decays=[0.45, 0.09, 0.03, 0.015], amps=[1, 0.32, 0.12, 0.04])
VIBES = dict(ratios=[1, 2.0, 3.99, 6.8, 9.4], decays=[1.1, 0.5, 0.25, 0.08, 0.04], amps=[1, 0.07, 0.25, 0.05, 0.03])
GLOCK = dict(ratios=[1, 2.71, 5.15, 8.4], decays=[0.9, 0.35, 0.12, 0.05], amps=[1, 0.25, 0.1, 0.04])
WOODBLOCK = dict(ratios=[1, 1.58, 2.71, 3.96], decays=[0.035, 0.022, 0.012, 0.008], amps=[1, 0.6, 0.3, 0.15])
KNOCK = dict(ratios=[1, 1.72, 2.63, 3.4, 4.9], decays=[0.05, 0.03, 0.02, 0.015, 0.01], amps=[1, 0.7, 0.45, 0.3, 0.2])


def note_hz(name):
    names = {"C": -9, "D": -7, "E": -5, "F": -4, "G": -2, "A": 0, "B": 2}
    n = names[name[0]]
    i = 1
    if name[i] in "#b":
        n += 1 if name[i] == "#" else -1
        i += 1
    octave = int(name[i:])
    return 440.0 * 2 ** ((n + (octave - 4) * 12) / 12)


def struck(rng, inst, f0, vel=1.0, dur=1.5, hardness=4000.0, damp=1.0):
    """Une lame frappée : le bruit du maillet, puis les modes ; plus fort = plus brillant. `damp` < 1 : une lame plus
    amortie (elle sonne moins longtemps)"""
    decays = [d * damp for d in inst["decays"]]
    body = modal(rng, f0, inst["ratios"], decays, [a * (vel ** (1 + i * 0.6)) for i, a in enumerate(inst["amps"])], dur)
    hit = mallet(rng, 0.004, hardness * (0.6 + 0.6 * vel), 0.25 * vel)
    return place(rng, [(body * vel, 0.0), (hit, 0.0)], dur)


def phrase(rng, inst, notes, gaps, vels, dur, hardness=4000.0, jitter=0.008, damp=1.0):
    """Quelques notes jouées à la main : un peu en avance ou en retard, jamais deux fois la même force"""
    layers = []
    at = 0.0
    for k, (n, v) in enumerate(zip(notes, vels)):
        v = v * rng.uniform(0.88, 1.08)
        layers.append((struck(rng, inst, note_hz(n), v, min(2.5, dur - at), hardness, damp), at + rng.uniform(-jitter, jitter) * (k > 0)))
        if k < len(gaps):
            at += gaps[k]
    return place(rng, layers, dur)


# ---------------------------------------------------------------------------------------------------------------------
# Les sons


def make_pop(rng):
    # Une bulle qui éclate / un bouchon : une résonance qui monte très vite, et le petit claquement de l'ouverture
    dur = 0.16
    t = t_axis(dur)
    f_start, f_end = rng.uniform(330, 420), rng.uniform(820, 1050)
    f = f_end + (f_start - f_end) * np.exp(-t / 0.012)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / rng.uniform(0.018, 0.026))
    body[: int(0.0015 * SR)] *= np.linspace(0, 1, int(0.0015 * SR))
    click = butter(mallet(rng, 0.003, 7000, 0.35), "high", 1500)
    x = place(rng, [(body, 0.0), (click, 0.0)], dur)
    return room(rng, x, rt60=0.22, wet=0.1, size=0.6)


def make_tick(rng):
    # Le tic d'une pendule / d'un chrono : un petit bloc de bois sec
    f0 = rng.uniform(1700, 2100)
    body = modal(rng, f0, WOODBLOCK["ratios"], WOODBLOCK["decays"], WOODBLOCK["amps"], 0.25, detune=0.01)
    hit = mallet(rng, 0.002, 9000, 0.5)
    x = place(rng, [(body, 0), (hit, 0)], 0.25)
    return room(rng, x, rt60=0.18, wet=0.12, size=0.5)


def make_hit(rng):
    # Un coup sourd : le corps grave qui résonne, et le bruit du choc par-dessus
    f0 = rng.uniform(95, 135)
    body = modal(rng, f0, [1, 1.9, 2.8, 4.1, 5.3], [0.09, 0.05, 0.03, 0.018, 0.012], [1, 0.55, 0.35, 0.2, 0.12], 0.6, detune=0.02)
    n = int(0.09 * SR)
    crunch = butter(noise(rng, n) * np.exp(-np.arange(n) / (0.014 * SR)), "low", rng.uniform(2200, 3200))
    x = place(rng, [(body, 0), (crunch * 1.1, 0)], 0.6)
    return room(rng, x, rt60=0.3, wet=0.14, size=0.9)


def make_big_hit(rng):
    # Un gros choc : une masse qui tombe (grave qui descend), des débris, une grande pièce
    dur = 1.6
    t = t_axis(dur)
    f = 48 + 70 * np.exp(-t / 0.08)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.35)
    boom[: int(0.003 * SR)] *= np.linspace(0, 1, int(0.003 * SR))
    crack = butter(noise(rng, int(0.12 * SR)) * np.exp(-np.arange(int(0.12 * SR)) / (0.02 * SR)), "low", 3500) * 0.8
    debris = []
    for k in range(rng.integers(5, 9)):
        n = int(0.03 * SR)
        g = butter(noise(rng, n) * np.exp(-np.arange(n) / (0.006 * SR)), "band", (rng.uniform(600, 1200), rng.uniform(2500, 5000)))
        debris.append((g * rng.uniform(0.08, 0.25), rng.uniform(0.04, 0.45)))
    x = place(rng, [(boom, 0), (crack, 0)] + debris, dur)
    return room(rng, x, rt60=0.9, wet=0.22, size=1.6, damp=3500)


def make_whoosh(rng):
    # De l'air déplacé : un bruit dont la couleur suit le mouvement (monte puis redescend), et le volume avec
    dur = rng.uniform(0.55, 0.7)
    n = int(dur * SR)
    t = np.arange(n) / SR
    shape = np.sin(np.pi * (t / dur) ** rng.uniform(0.75, 1.0)) ** 2
    src = noise(rng, n)
    # Un filtre qui glisse : on mêle trois bandes selon l'instant (approximation d'un filtre variable)
    lo = butter(src, "band", (250, 900))
    mid = butter(src, "band", (700, 2200))
    hi = butter(src, "band", (1800, 5500))
    pos = t / dur
    w_mid = np.sin(np.pi * pos) ** 2
    w_hi = np.clip(1 - np.abs(pos - 0.5) * 3, 0, 1) ** 2
    w_lo = 1 - w_mid * 0.6
    x = (lo * w_lo * 0.8 + mid * w_mid + hi * w_hi * 0.6) * shape
    return room(rng, x, rt60=0.25, wet=0.08, size=0.8)


def make_buzzer(rng):
    # Un vrai buzzer électrique : une lame qui vibre sur le secteur (grave riche), son grésillement, sa caisse
    dur = 0.45
    t = t_axis(dur)
    f = rng.uniform(118, 126) * (1 + 0.002 * np.sin(2 * np.pi * 7 * t))
    saw = signal.sawtooth(2 * np.pi * np.cumsum(f) / SR)
    rattle = noise(rng, len(t)) * (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 2 * f * t)))
    body = butter(saw, "band", (180, 2400)) + butter(rattle, "band", (1500, 5000)) * 0.05
    env = np.minimum(1, t / 0.006) * np.minimum(1, (dur - t) / 0.05)
    x = body * env
    return room(rng, x, rt60=0.25, wet=0.12, size=0.7)


def make_achievement(rng):
    # Un succès : quatre lames de vibraphone qui montent, jouées à la main, et un tintement de glockenspiel
    notes = ["C5", "E5", "G5", "C6"]
    x = phrase(rng, VIBES, notes, [0.085, 0.085, 0.09], [0.7, 0.75, 0.8, 0.95], 1.6, hardness=5000)
    sparkle = phrase(rng, GLOCK, ["G6", "C7"], [0.07], [0.25, 0.3], 1.2, hardness=8000)
    x = place(rng, [(x, 0), (sparkle, 0.27)], 1.8)
    return room(rng, x, rt60=0.6, wet=0.2, size=1.2)


def make_join(rng):
    # Quelqu'un arrive : deux petits coups frappés sur du bois (une porte, la table)
    f0 = rng.uniform(170, 230)
    k1 = place(rng, [(modal(rng, f0, KNOCK["ratios"], KNOCK["decays"], KNOCK["amps"], 0.3, detune=0.02), 0), (mallet(rng, 0.003, 2500, 0.6), 0)], 0.3)
    k2 = place(rng, [(modal(rng, f0 * rng.uniform(0.97, 1.03), KNOCK["ratios"], KNOCK["decays"], KNOCK["amps"], 0.3, detune=0.02), 0), (mallet(rng, 0.003, 2500, 0.6), 0)], 0.3)
    x = place(rng, [(k1 * rng.uniform(0.8, 0.95), 0), (k2, rng.uniform(0.11, 0.15))], 0.45)
    return room(rng, x, rt60=0.35, wet=0.16, size=1.0)


def make_win(rng):
    # Une victoire : un arpège de marimba qui monte, la dernière note doublée à l'octave
    x = phrase(rng, MARIMBA, ["G4", "C5", "E5", "G5", "C6"], [0.09, 0.09, 0.09, 0.11], [0.6, 0.65, 0.7, 0.8, 1.0], 1.5, hardness=3500)
    top = phrase(rng, MARIMBA, ["C5"], [], [0.5], 1.2, hardness=3500)
    x = place(rng, [(x, 0), (top, 0.38)], 1.6)
    return room(rng, x, rt60=0.55, wet=0.18, size=1.1)


def make_lose(rng):
    # Une défaite : trois notes de marimba qui descendent, douces, la dernière qui traîne
    x = phrase(rng, MARIMBA, ["E5", "C5", "A4"], [0.16, 0.2], [0.7, 0.6, 0.55], 1.3, hardness=2200, jitter=0.012)
    return room(rng, x, rt60=0.5, wet=0.18, size=1.1)


SOUNDS = {
    # nom: (fabrique, fichiers produits, fichier dont on reprend le volume)
    "pop": (make_pop, ["pop.mp3", "pop-2.mp3", "pop-3.mp3"], "pop.mp3"),
    "tick": (make_tick, ["tick.mp3", "tick-2.mp3", "tick-3.mp3"], "tick.mp3"),
    "hit": (make_hit, ["hit.mp3", "hit-2.mp3", "hit-3.mp3"], "hit.mp3"),
    "big-hit": (make_big_hit, ["big-hit.mp3", "big-hit-2.mp3"], "big-hit.mp3"),
    "whoosh": (make_whoosh, ["whoosh.mp3", "whoosh-2.mp3", "whoosh-3.mp3"], "whoosh.mp3"),
    "buzzer": (make_buzzer, ["buzzer.mp3"], "buzzer.mp3"),
    "achievement": (make_achievement, ["achievement.mp3"], "achievement.mp3"),
    "join": (make_join, ["join.mp3", "join-2.mp3"], "join.mp3"),
    "win": (make_win, ["win.mp3"], "win.mp3"),
    "lose": (make_lose, ["lose.mp3"], "lose.mp3"),
}


# ---------------------------------------------------------------------------------------------------------------------
# Sortie


def decode(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"], capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).astype(np.float64)


def active_rms(x):
    """Le niveau du son quand il sonne (les passages au-dessus de −30 dB sous la crête)"""
    frames = np.lib.stride_tricks.sliding_window_view(np.pad(x, (0, 2048)), 1024)[::256]
    r = np.sqrt(np.mean(frames ** 2, axis=1))
    keep = r > r.max() * 10 ** (-30 / 20)
    return float(np.sqrt(np.mean(r[keep] ** 2))) if keep.any() else float(r.max())


def short_loud(x, ms=50):
    """La force perçue d'un son bref : le niveau des `ms` millisecondes les plus fortes"""
    w = int(SR * ms / 1000)
    frames = np.lib.stride_tricks.sliding_window_view(np.pad(x, (0, w)), w)[::441]
    return float(np.sqrt((frames**2).mean(axis=1)).max())


def write_wav(x, path):
    """Une boucle : en WAV (le mp3 ajoute un blanc au début, qui s'entendrait à chaque tour)"""
    raw = x.astype(np.float32).tobytes()
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-", "-c:a", "pcm_s16le", path],
        input=raw,
        check=True,
    )


def write_mp3(x, path):
    raw = x.astype(np.float32).tobytes()
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-", "-c:a", "libmp3lame", "-b:a", "96k", path],
        input=raw,
        check=True,
    )


def build(name, reference_dir):
    make, files, ref = SOUNDS[name]
    ref_path = os.path.join(reference_dir, ref)
    # Le volume de l'ancien son, tel qu'on l'entend (ses 50 ms les plus fortes)
    target = short_loud(decode(ref_path)) if os.path.exists(ref_path) else 0.12
    for k, f in enumerate(files):
        rng = np.random.default_rng(sum(map(ord, name)) * 1000 + k)
        x = make(rng)
        x = trim(x)
        x = x * (target / (short_loud(x) + 1e-12))
        # Des crêtes trop hautes : on les arrondit (saturation douce, comme une prise de son compressée) au lieu de baisser
        # tout le son, qui paraîtrait plus faible que l'ancien
        x = limit(x)
        # Le fond de la pièce, au même niveau pour tous (après la mise au volume, qui le remonterait sinon)
        x = floor_noise(rng, x)
        write_mp3(x, os.path.join(OUT, f))
        print(f"{f:<22} {len(x) / SR:5.2f} s")


if __name__ == "__main__":
    names = sys.argv[1:] or list(SOUNDS)
    # Le volume de référence vient des anciens sons (git), pas des nouveaux déjà écrits
    ref_dir = os.environ.get("REF_DIR", OUT)
    for n in names:
        build(n, ref_dir)
