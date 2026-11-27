"""Les musiques de Toque !, composées pour le jeu et jouées note à note par des instruments « physiques » : accordéon
(deux anches qui battent, le soufflet), guitare et mandoline (cordes pincées, la pompe, le trémolo), contrebasse,
lames frappées (xylophone, glockenspiel, vibraphone), cuivres doux, flûte, cordes tenues, batterie aux balais,
tambourin, mains, timbales. Jeu humain (petits décalages, nuances, swing), une salle, puis la boucle sans couture :
le fichier fait une seconde de la fin, la boucle entière, une seconde du début (loopStart = 1 s, loopEnd = 1 s + boucle).

    python scripts/toque-musique.py [morceau...]      (sans argument : tous ; écrit public/sounds/toque-<morceau>.mp3)

Les morceaux (une famille de cuisines chacun) :
  musette   la valse musette du bistrot et de la guinguette (accordéon, guitare à la pompe, contrebasse)
  port      la gigue du port, pour la crêperie sur le bateau (flûte, accordéon, bouzouki, tambour sur cadre)
  marche    la marche bondissante de la cantine et du marché (xylophone, clarinette, tuba, caisse claire)
  toits     la tarentelle des toits de la pizzeria (mandoline en trémolo, accordéon, tambourin)
  chalet    le ländler du chalet (glockenspiel, guitare en arpèges, cordes tenues, grelots)
  train     le swing du train de nuit (vibraphone, bugle en sourdine, contrebasse qui marche, balais)
  banquet   la polka du banquet de la fête (cuivres, accordéon en tierces, mains, timbales)
"""

import math
import os
import subprocess
import sys

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, fftconvolve, lfilter, sosfilt

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "sounds")
rng = np.random.default_rng(2611)

NOTE = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def pitch(name):
    """« F#5 », « Bb4 » → numéro MIDI"""
    n = NOTE[name[0]]
    i = 1
    while i < len(name) and name[i] in "#b":
        n += 1 if name[i] == "#" else -1
        i += 1
    return n + 12 * (int(name[i:]) + 1)


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def tune(text):
    """« E5:1.5 D5:.5 r:1 » → [(midi ou None, durée en temps)]"""
    out = []
    for tok in text.split():
        p, d = tok.split(":")
        out.append((None if p == "r" else pitch(p), float(d)))
    return out


# ---------------------------------------------------------------------------------------------------------------------
# Les instruments


def env_adsr(n, a, d, s, r, hold):
    e = np.zeros(n)
    pts = [(0, 0), (a, 1), (a + d, s), (a + d + max(0, hold), s), (a + d + max(0, hold) + r, 0)]
    t = np.arange(n) / SR
    return np.interp(t, [p[0] for p in pts], [p[1] for p in pts], right=0)


def string(freq, dur, vel=0.8, bright=0.5, sustain=1.2, pick=0.18, damp=None):
    """Une corde pincée : ses harmoniques un peu raides (inharmonicité), chacune amortie à son rythme, le bruit du doigt.
    `damp` : la main qui étouffe la corde au bout de tant de secondes."""
    n = int((dur + 0.6) * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for h in range(1, 20):
        f = freq * h * math.sqrt(1 + 0.00012 * h * h)
        if f > SR / 2 - 600:
            break
        amp = abs(math.sin(math.pi * h * pick)) / h * (bright ** (h * 0.16))
        tau = sustain / (1 + 0.32 * h * (1.3 - bright))
        out += amp * np.exp(-t / tau) * np.sin(2 * math.pi * f * t + rng.uniform(0, 6.28))
    m = int(0.006 * SR)
    out[:m] += rng.normal(0, 1, m) * np.linspace(1, 0, m) * 0.2 * bright
    out *= np.minimum(1, t / 0.002)
    if damp is not None:
        out *= np.clip(1 - (t - damp) / 0.06, 0, 1)
    return out * vel * 0.45


def reed(freq, dur, vel=0.7, bright=0.6, musette=True):
    """L'accordéon : deux (ou trois) anches presque à l'unisson qui battent, le souffle, le soufflet qui pousse"""
    n = int((dur + 0.2) * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    dets = (-0.0042, 0.0, 0.0046) if musette else (0.0, 0.0021)
    for det in dets:
        f = freq * (1 + det)
        ph = rng.uniform(0, 6.28)
        for h in range(1, 14):
            if f * h > SR / 2 - 600:
                break
            amp = (1 / h) * (bright ** (h * 0.28)) * (1.0 if h % 2 else 0.7)
            out += amp * np.sin(2 * math.pi * f * h * t + ph * h)
    e = env_adsr(n, 0.03, 0.07, 0.82, 0.09, dur - 0.1)
    swell = 1 + 0.05 * np.sin(2 * math.pi * 0.7 * t + rng.uniform(0, 6))
    breath = rng.normal(0, 0.01, n)
    b, a = butter(2, 3800 / (SR / 2), "low")
    return lfilter(b, a, (out * 0.16 + breath) * e * swell) * vel


def clarinet(freq, dur, vel=0.6):
    """Une clarinette : surtout des harmoniques impaires, un souffle, un vibrato discret qui vient tard"""
    n = int((dur + 0.15) * SR)
    t = np.arange(n) / SR
    vib = 1 + 0.003 * np.sin(2 * math.pi * 5 * t) * np.clip((t - 0.25) / 0.3, 0, 1)
    ph = 2 * math.pi * freq * np.cumsum(vib) / SR
    out = np.zeros(n)
    for h in range(1, 12):
        if freq * h > SR / 2 - 600:
            break
        out += np.sin(h * ph) * ((1 / h) if h % 2 else (0.12 / h))
    e = env_adsr(n, 0.04, 0.08, 0.8, 0.08, dur - 0.1)
    return (out * 0.35 + rng.normal(0, 0.008, n)) * e * vel


def flute(freq, dur, vel=0.6):
    """Une flûte en bois : presque une sinusoïde, l'octave et la quinte en dessous du souffle, le vibrato"""
    n = int((dur + 0.12) * SR)
    t = np.arange(n) / SR
    vib = 1 + 0.004 * np.sin(2 * math.pi * 5.4 * t) * np.clip((t - 0.15) / 0.25, 0, 1)
    ph = 2 * math.pi * freq * np.cumsum(vib) / SR
    out = np.sin(ph) + 0.22 * np.sin(2 * ph) + 0.06 * np.sin(3 * ph)
    sos = butter(2, [freq * 0.8 / (SR / 2), min(0.95, freq * 4 / (SR / 2))], "band", output="sos")
    breath = sosfilt(sos, rng.normal(0, 1, n)) * 0.08
    # le coup de langue
    e = env_adsr(n, 0.025, 0.05, 0.85, 0.06, dur - 0.08)
    chiff = np.exp(-t / 0.02) * 0.4
    return (out * 0.4 + breath * (1 + chiff * 4)) * e * vel


def horn(freq, dur, vel=0.7, mute=False):
    """Un cuivre doux (bugle, trompette en sourdine) : les harmoniques s'ouvrent avec la force"""
    n = int((dur + 0.2) * SR)
    t = np.arange(n) / SR
    vib = 1 + 0.0035 * np.sin(2 * math.pi * 5.2 * t) * np.clip((t - 0.3) / 0.3, 0, 1)
    ph = 2 * math.pi * freq * np.cumsum(vib) / SR
    out = np.zeros(n)
    bright = 0.35 + vel * 0.4
    # l'attaque s'ouvre : les harmoniques hautes arrivent un peu après la fondamentale
    opening = np.clip(t / 0.05, 0, 1)
    for h in range(1, 16):
        if freq * h > SR / 2 - 600:
            break
        out += (bright ** h) * np.sin(h * ph) / (0.6 + h * 0.4) * (opening if h > 2 else 1)
    e = env_adsr(n, 0.04, 0.1, 0.78, 0.12, dur - 0.12)
    out = out * e * 0.32 + rng.normal(0, 0.006, n) * e
    if mute:
        sos = butter(2, [700 / (SR / 2), 2600 / (SR / 2)], "band", output="sos")
        out = sosfilt(sos, out) * 2.2
    return out * vel


def tuba(freq, dur, vel=0.8):
    """Le tuba de l'oumpapa : rond, court, un peu de bourdonnement de lèvres"""
    n = int((dur + 0.15) * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for h in range(1, 9):
        out += (0.55**h) * np.sin(2 * math.pi * freq * h * t) / (0.5 + h * 0.5)
    e = env_adsr(n, 0.03, 0.12, 0.6, 0.1, dur - 0.15)
    b, a = butter(2, 1200 / (SR / 2), "low")
    return lfilter(b, a, out * e) * vel * 0.9


def bar(freq, dur, vel=0.8, kind="xylo"):
    """Une lame frappée : xylophone, glockenspiel, vibraphone (avec son trémolo)"""
    n = int((dur + 1.2) * SR)
    t = np.arange(n) / SR
    modes = {
        "xylo": [(1, 1.0, 0.32), (3.0, 0.42, 0.1), (6.1, 0.14, 0.04)],
        "glock": [(1, 1.0, 1.5), (2.76, 0.38, 0.55), (5.4, 0.22, 0.22), (8.93, 0.08, 0.08)],
        "vibes": [(1, 1.0, 2.2), (4.0, 0.28, 0.5), (10.0, 0.05, 0.1)],
    }[kind]
    out = np.zeros(n)
    for ratio, amp, tau in modes:
        f = freq * ratio
        if f > SR / 2 - 300:
            continue
        out += amp * vel ** (1 + 0.6 * (ratio > 1.5)) * np.exp(-t / (tau * (0.8 + 0.4 * vel))) * np.sin(2 * math.pi * f * t)
    if kind == "vibes":
        out *= 1 + 0.22 * np.sin(2 * math.pi * 5.2 * t)
        # la pédale relevée : la lame s'étouffe à la fin de la note
        out *= np.clip(1 - (t - dur - 0.05) / 0.25, 0, 1)
    m = int(0.004 * SR)
    out[:m] += rng.normal(0, 0.3 * vel, m) * np.linspace(1, 0, m)
    return out * vel * 0.6


def strings(freq, dur, vel=0.5):
    """Un pupitre de cordes tenues : plusieurs archets un peu désaccordés, vibrato, attaque lente"""
    n = int((dur + 0.5) * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for v in range(4):
        det = rng.uniform(-0.005, 0.005)
        vib = 1 + 0.004 * np.sin(2 * math.pi * rng.uniform(4.8, 6) * t + rng.uniform(0, 6))
        ph = 2 * math.pi * freq * (1 + det) * np.cumsum(vib) / SR
        for h in range(1, 10):
            if freq * h > SR / 2 - 900:
                break
            out += np.sin(h * ph + v) / h * (0.78**h)
    e = env_adsr(n, 0.25, 0.2, 0.85, 0.4, dur - 0.25)
    b, a = butter(2, 3800 / (SR / 2), "low")
    return lfilter(b, a, out * e) * vel * 0.07


def bass(freq, dur, vel=0.8):
    """La contrebasse pincée : le bois qui résonne, étouffée à la fin de la note"""
    return string(freq, dur, vel, bright=0.28, sustain=0.9, pick=0.24, damp=dur + 0.04) * 1.7


def kick(vel=0.8, low=50):
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    f = low + 70 * np.exp(-t / 0.03)
    out = np.sin(2 * math.pi * np.cumsum(f) / SR) * np.exp(-t / 0.13)
    out[: int(0.003 * SR)] += rng.normal(0, 0.3, int(0.003 * SR))
    return out * vel


def frame_drum(vel=0.7, open_=True):
    """Un tambour sur cadre : la peau grave, la main qui l'étouffe ou la laisse sonner"""
    n = int(0.5 * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for ratio, amp, tau in ((1, 1, 0.22 if open_ else 0.07), (1.59, 0.5, 0.12), (2.14, 0.3, 0.08)):
        out += amp * np.sin(2 * math.pi * 92 * ratio * t) * np.exp(-t / tau)
    sos = butter(2, [300 / (SR / 2), 2500 / (SR / 2)], "band", output="sos")
    out += sosfilt(sos, rng.normal(0, 1, n)) * np.exp(-t / 0.015) * 0.4
    return out * vel * 0.7


def brush(vel=0.6, swish=False):
    """La caisse claire aux balais : un frottement, ou une frappe courte"""
    n = int((0.35 if swish else 0.16) * SR)
    t = np.arange(n) / SR
    sos = butter(2, [1800 / (SR / 2), 9000 / (SR / 2)], "band", output="sos")
    noise = sosfilt(sos, rng.normal(0, 1, n))
    e = (np.minimum(1, t / 0.07) * np.exp(-t / 0.12)) if swish else np.exp(-t / 0.05)
    body = np.sin(2 * math.pi * 190 * t) * np.exp(-t / 0.04) * (0 if swish else 0.35)
    return (noise * e * 0.45 + body) * vel


def snare(vel=0.6):
    """La caisse claire de fanfare : la peau et le timbre"""
    n = int(0.22 * SR)
    t = np.arange(n) / SR
    sos = butter(2, [2000 / (SR / 2), 9000 / (SR / 2)], "band", output="sos")
    noise = sosfilt(sos, rng.normal(0, 1, n)) * np.exp(-t / 0.07)
    body = np.sin(2 * math.pi * 210 * t) * np.exp(-t / 0.03)
    return (noise * 0.6 + body * 0.5) * vel


def hat(vel=0.4, open_=False):
    n = int((0.25 if open_ else 0.06) * SR)
    t = np.arange(n) / SR
    sos = butter(2, 7000 / (SR / 2), "high", output="sos")
    return sosfilt(sos, rng.normal(0, 1, n)) * np.exp(-t / (0.08 if open_ else 0.018)) * vel * 0.5


def clap(vel=0.6):
    n = int(0.2 * SR)
    out = np.zeros(n)
    sos = butter(2, [900 / (SR / 2), 3500 / (SR / 2)], "band", output="sos")
    for k, d in enumerate((0, 0.008, 0.017, 0.027)):
        i = int((d + rng.uniform(0, 0.003)) * SR)
        m = n - i
        t = np.arange(m) / SR
        out[i:] += sosfilt(sos, rng.normal(0, 1, m)) * np.exp(-t / (0.012 if k < 3 else 0.06))
    return out * vel * 0.45


def tamb(vel=0.4):
    """Le tambourin : ses cymbalettes"""
    n = int(0.2 * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for f in (5200, 6900, 8300, 9700):
        out += np.sin(2 * math.pi * f * rng.uniform(0.98, 1.02) * t + rng.uniform(0, 6)) * np.exp(-t / 0.05)
    sos = butter(2, 6000 / (SR / 2), "high", output="sos")
    out += sosfilt(sos, rng.normal(0, 1, n)) * np.exp(-t / 0.03)
    return out * vel * 0.18


def bells(vel=0.4):
    """Des grelots de traîneau, secoués"""
    n = int(0.3 * SR)
    out = np.zeros(n)
    for _ in range(5):
        i = int(rng.uniform(0, 0.03) * SR)
        t = np.arange(n - i) / SR
        f = rng.uniform(4200, 6400)
        out[i:] += np.sin(2 * math.pi * f * t) * np.exp(-t / 0.09) * rng.uniform(0.5, 1)
    return out * vel * 0.12


def wood(vel=0.5, freq=820):
    """Un temple-block"""
    n = int(0.15 * SR)
    t = np.arange(n) / SR
    return (np.sin(2 * math.pi * freq * t) + 0.4 * np.sin(2 * math.pi * freq * 2.7 * t)) * np.exp(-t / 0.03) * vel * 0.5


def timpani(freq, vel=0.8):
    n = int(1.6 * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for ratio, amp, tau in ((1, 1, 0.9), (1.5, 0.5, 0.6), (1.98, 0.3, 0.4), (2.44, 0.2, 0.3)):
        out += amp * np.sin(2 * math.pi * freq * ratio * t) * np.exp(-t / tau)
    out[: int(0.01 * SR)] += rng.normal(0, 0.4, int(0.01 * SR))
    return out * vel * 0.6


# ---------------------------------------------------------------------------------------------------------------------
# Les accords, la table de mixage, la salle


CHORD = {
    "": [0, 4, 7],
    "m": [0, 3, 7],
    "7": [0, 4, 7, 10],
    "m7": [0, 3, 7, 10],
    "6": [0, 4, 7, 9],
    "maj7": [0, 4, 7, 11],
    "dim": [0, 3, 6, 9],
}


def chord(name):
    """« F#m », « G7 », « Bb6 » → (racine midi à l'octave 3, intervalles)"""
    root = name[0]
    i = 1
    if i < len(name) and name[i] in "#b":
        i += 1
    m = pitch(name[:i] + "3")
    return m, CHORD[name[i:]]


def voicing(name, low=55, size=3):
    """Les notes d'un accord, serrées au-dessus de `low` (pour la guitare, l'accordéon)"""
    root, iv = chord(name)
    notes = []
    for k in iv:
        n = root + k
        while n < low:
            n += 12
        notes.append(n)
    return sorted(notes)[: max(size, len(notes))]


class Mix:
    def __init__(self, seconds):
        self.L = np.zeros(int(seconds * SR) + SR * 6)
        self.R = np.zeros_like(self.L)

    def add(self, sig, at, pan=0.0, gain=1.0, human=0.006):
        at = at + rng.uniform(-human, human)
        i = int(at * SR)
        if i < 0:
            sig = sig[-i:]
            i = 0
        n = min(len(sig), len(self.L) - i)
        if n <= 0:
            return
        lg = math.cos((pan + 1) * math.pi / 4) * gain
        rg = math.sin((pan + 1) * math.pi / 4) * gain
        self.L[i : i + n] += sig[:n] * lg
        self.R[i : i + n] += sig[:n] * rg


def room(L, R, rt60=1.4, wet=0.2, tone=5000):
    """Une salle : une réponse faite de bruit qui s'éteint, quelques premières réflexions"""
    n = int(SR * rt60 * 1.1)
    t = np.arange(n) / SR
    irs = []
    for _ in range(2):
        sos = butter(1, tone / (SR / 2), "low", output="sos")
        ir = sosfilt(sos, rng.normal(0, 1, n)) * np.exp(-6.9 * t / rt60)
        for _ in range(9):
            j = int(rng.uniform(0.005, 0.045) * SR)
            ir[j] += rng.uniform(0.3, 0.7) * rng.choice([-1, 1])
        ir[: int(0.01 * SR)] *= 0.2
        irs.append(ir / np.sqrt(np.sum(ir**2)))
    wl = fftconvolve(L, irs[0])[: len(L)]
    wr = fftconvolve(R, irs[1])[: len(R)]
    return L * (1 - wet * 0.5) + wl * wet, R * (1 - wet * 0.5) + wr * wet


def master(L, R):
    """Un peu de chaleur (une saturation douce), puis à -1 dB"""
    x = np.stack([L, R])
    x = x / (np.max(np.abs(x)) or 1) * 1.3
    x = np.tanh(x) / np.tanh(1.3)
    return x * 10 ** (-1 / 20) / (np.max(np.abs(x)) or 1)


def render(name, bpm, bars, per_bar, write, rt60=1.3, wet=0.2):
    beat = 60 / bpm
    length = bars * per_bar * beat
    n = int(round(length * SR))
    mix = Mix(length + 6)
    write(mix, beat)

    # La boucle repliée sur elle-même : ce qui dépasse la fin (les notes qui tiennent, les échos) revient au début
    def fold(ch):
        body = ch[:n].copy()
        rest = ch[n:]
        for k in range(0, len(rest), n):
            m = min(n, len(rest) - k)
            body[:m] += rest[k : k + m]
        return body

    bl, br = fold(mix.L), fold(mix.R)
    # La salle aussi en boucle : sur deux tours, on garde le second
    wl, wr = room(np.concatenate([bl, bl]), np.concatenate([br, br]), rt60, wet)
    x = master(wl[n:], wr[n:])
    full = np.concatenate([x[:, -SR:], x, x[:, :SR]], axis=1)
    os.makedirs(OUT, exist_ok=True)
    wav = os.path.join(OUT, f"toque-{name}.wav")
    wavfile.write(wav, SR, (full.T * 32767).astype(np.int16))
    mp3 = os.path.join(OUT, f"toque-{name}.mp3")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-codec:a", "libmp3lame", "-b:a", "112k", mp3], check=True)
    os.remove(wav)
    print(f"{name}: boucle {length:.4f} s, {os.path.getsize(mp3) // 1024} Ko")
    return length


def play(mix, beat, line, inst, at=0.0, pan=0.0, gain=1.0, swing=0.0, vel=0.75, accent=None, human=0.006):
    """Joue une mélodie : chaque note avec sa nuance (le premier temps un peu plus fort), le swing des croches"""
    t = 0.0
    for m, d in line:
        if m is not None:
            on = t
            if swing and abs((t % 1) - 0.5) < 1e-6:
                on += swing
            v = vel * (1.08 if accent and abs(t % accent) < 1e-6 else 1) * rng.uniform(0.92, 1.05)
            mix.add(inst(hz(m), d * beat * 0.95, v), at + on * beat, pan, gain, human)
        t += d
    return t


def bars_of(chords, per_bar):
    return [(c, i * per_bar) for i, c in enumerate(chords)]


# ---------------------------------------------------------------------------------------------------------------------
# Les morceaux


def musette(mix, beat):
    """Valse musette en la mineur, puis do majeur : l'accordéon chante, la guitare fait la pompe, la contrebasse marque le un"""
    chords = "Am Am E7 E7 E7 E7 Am Am Dm Dm Am Am B7 B7 E7 E7 C C G7 G7 G7 G7 C C F F C A7 Dm E7 Am Am".split()
    melody = tune(
        "E5:1.5 D5:.5 C5:1 B4:.5 C5:.5 E5:1 A5:1 G#5:1.5 F5:.5 E5:1 D5:.5 E5:.5 D5:.5 B4:.5 G#4:1 "
        "B4:1 D5:1 F5:1 E5:.5 F5:.5 E5:.5 D5:.5 B4:1 C5:1.5 B4:.5 A4:1 A4:2 r:1 "
        "D5:1.5 E5:.5 F5:1 A5:1 F5:.5 E5:.5 D5:1 C5:1.5 D5:.5 E5:1 A5:2 E5:1 "
        "D#5:1.5 E5:.5 F#5:1 A5:1 F#5:1 D#5:1 E5:1 G#5:1 B5:1 B5:.5 A5:.5 G#5:.5 F5:.5 E5:.5 D5:.5 "
        "C5:1.5 E5:.5 G5:1 C6:2 B5:.5 A5:.5 G5:1.5 F5:.5 D5:1 B4:1 D5:1 F5:1 "
        "F5:.5 G5:.5 F5:.5 E5:.5 D5:1 B4:1.5 C5:.5 D5:1 E5:1.5 D5:.5 C5:1 G4:1 C5:1 E5:1 "
        "F5:1.5 A5:.5 C6:1 A5:1 F5:1 C5:1 G5:1.5 F5:.5 E5:1 C#5:1 E5:1 G5:1 "
        "F5:1.5 E5:.5 D5:1 B4:1 D5:1 G#5:1 A5:1.5 E5:.5 C5:1 A4:1.5 r:.5 B4:.5 D5:.5"
    )
    play(mix, beat, melody, lambda f, d, v: reed(f, d, v, 0.62), pan=-0.15, gain=1.0, accent=3)
    # La contrebasse sur le un (la quinte une mesure sur deux), la guitare à la pompe sur le deux et le trois
    for c, at in bars_of(chords, 3):
        root, iv = chord(c)
        low = root - 12 + (7 if (at // 3) % 2 else 0)
        mix.add(bass(hz(low), beat * 0.9, 0.85), at * beat, 0.05, 1.0)
        for k in (1, 2):
            v = voicing(c, 57)
            for j, m in enumerate(v):
                mix.add(string(hz(m), beat * 0.4, 0.42, bright=0.55, sustain=0.6, damp=beat * 0.45), (at + k) * beat + j * 0.006, 0.3, 0.8)
            mix.add(brush(0.18 if k == 1 else 0.14), (at + k) * beat, 0.25, 0.6)
        mix.add(brush(0.25, swish=True), at * beat, -0.25, 0.5)


def port(mix, beat):
    """Gigue en ré majeur pour la crêperie du port : la flûte, l'accordéon qui pousse sur le un et le quatre, le bouzouki"""
    chords = "D D G A D Bm Em A D D G A D Bm A D Bm Bm G A Bm Bm G A".split()
    melody = tune(
        "A4:1 D5:1 F#5:1 A5:2 F#5:1 G5:1 F#5:1 E5:1 D5:2 A4:1 B4:1 D5:1 G5:1 B5:2 G5:1 A5:1 G5:1 F#5:1 E5:2 C#5:1 "
        "D5:1 F#5:1 A5:1 D6:2 A5:1 B5:1 A5:1 F#5:1 D5:2 F#5:1 G5:1 F#5:1 E5:1 B4:1 E5:1 G5:1 F#5:1 E5:1 D5:1 C#5:1 B4:1 A4:1 "
        "A4:1 D5:1 F#5:1 A5:2 F#5:1 G5:1 F#5:1 E5:1 D5:2 A4:1 B4:1 D5:1 G5:1 B5:1 A5:1 G5:1 A5:1 B5:1 C#6:1 A5:2 E5:1 "
        "F#5:1 A5:1 F#5:1 D5:1 F#5:1 A5:1 B5:2 F#5:1 D5:2 B4:1 C#5:1 E5:1 A5:1 G5:1 F#5:1 E5:1 D5:2 F#5:1 D5:2 r:1 "
        "F#5:1 B5:1 F#5:1 D5:1 F#5:1 B5:1 C#6:1 B5:1 A5:1 F#5:2 D5:1 G5:1 B5:1 D6:1 B5:2 G5:1 A5:1 C#6:1 E6:1 C#6:2 A5:1 "
        "B5:2 A5:1 F#5:2 E5:1 D5:1 E5:1 F#5:1 B4:2 D5:1 E5:1 F#5:1 G5:1 B5:1 A5:1 G5:1 F#5:1 E5:1 C#5:1 A4:1 B4:1 C#5:1"
    )
    play(mix, beat, melody, flute, pan=0.12, gain=1.05, accent=3)
    for c, at in bars_of(chords, 6):
        root, _ = chord(c)
        for k, (beat_at, open_) in enumerate(((0, True), (2, False), (3, True), (5, False))):
            mix.add(frame_drum(0.6 if k % 2 == 0 else 0.3, open_), (at + beat_at) * beat, -0.1, 0.8)
        mix.add(bass(hz(root - 12), beat * 2.6, 0.8), at * beat, 0.0, 0.9)
        mix.add(bass(hz(root - 12 + 7), beat * 2.6, 0.7), (at + 3) * beat, 0.0, 0.9)
        v = voicing(c, 62)
        for k in (0, 3):
            for m in v:
                mix.add(reed(hz(m), beat * 1.6, 0.35, 0.5, musette=False), (at + k) * beat, -0.35, 0.55)
        # le bouzouki égrène l'accord
        arp = [v[0], v[1], v[2], v[1] + 12 if v[1] + 12 < 84 else v[1], v[2], v[1]]
        for k, m in enumerate(arp):
            mix.add(string(hz(m), beat * 0.9, 0.35, bright=0.75, sustain=0.5, pick=0.12), (at + k) * beat, 0.45, 0.55)


def marche(mix, beat):
    """Marche bondissante en fa : le xylophone et la clarinette ensemble, le tuba, la caisse claire et le temple-block"""
    chords = "F F C7 C7 C7 C7 F F Bb Bb F D7 Gm C7 F F".split()
    melody = tune(
        "C5:.5 F5:.5 A5:.5 F5:.5 C5:1 A4:1 Bb4:.5 A4:.5 G4:.5 A4:.5 F4:2 G4:.5 C5:.5 E5:.5 G5:.5 Bb5:1 G5:1 "
        "A5:.5 G5:.5 F5:.5 E5:.5 D5:1 C5:1 E5:1 G5:1 C6:1.5 Bb5:.5 A5:.5 G5:.5 F5:.5 G5:.5 E5:2 "
        "F5:.5 E5:.5 F5:.5 G5:.5 A5:1 C6:1 A5:.5 F5:.5 C5:1 F5:1 r:1 D5:.5 F5:.5 Bb5:1 Bb5:.5 A5:.5 G5:1 "
        "F5:.5 G5:.5 F5:.5 D5:.5 Bb4:2 A4:.5 C5:.5 F5:1 A5:1.5 G5:.5 F#5:1 A5:1 D6:1 C6:1 "
        "Bb5:.5 A5:.5 G5:.5 F5:.5 D5:1 G5:1 E5:.5 F5:.5 G5:.5 A5:.5 Bb5:1 E5:1 F5:1.5 C5:.5 A4:1 C5:1 "
        "F5:1 r:1 C5:.5 D5:.5 E5:.5 C5:.5"
    )
    play(mix, beat, melody, lambda f, d, v: bar(f, d, v, "xylo"), pan=0.3, gain=1.0, accent=2)
    play(mix, beat, [(m - 12 if m else m, d) for m, d in melody], clarinet, pan=-0.3, gain=0.55, accent=2)
    for c, at in bars_of(chords, 4):
        root, iv = chord(c)
        mix.add(tuba(hz(root - 12), beat * 0.8, 0.85), at * beat, 0.0, 1.0)
        mix.add(tuba(hz(root - 12 + 7), beat * 0.8, 0.75), (at + 2) * beat, 0.0, 1.0)
        for k in (1, 3):
            for m in voicing(c, 60):
                mix.add(reed(hz(m), beat * 0.35, 0.3, 0.55, musette=False), (at + k) * beat, -0.1, 0.6)
        for k in range(8):
            v = 0.42 if k % 4 == 2 else 0.2 if k % 2 else 0.28
            mix.add(snare(v), (at + k * 0.5) * beat, 0.2, 0.55)
        mix.add(wood(0.4, 880), (at + 3.5) * beat, 0.5, 0.6)


def toits(mix, beat):
    """Tarentelle en la mineur sur les toits : la mandoline en trémolo, l'accordéon, le tambourin qui ne s'arrête jamais"""
    chords = "Am Am E7 E7 E7 E7 Am Am Am Am Dm Dm E7 E7 Am Am C C G7 G7 G7 G7 C C F F E7 E7 Am E7 Am E7".split()
    melody = tune(
        "E5:1 A5:1 B5:1 C6:2 B5:1 A5:1 B5:1 A5:1 E5:3 G#5:1 B5:1 D6:1 B5:2 G#5:1 E5:1 F5:1 G#5:1 B5:3 "
        "D6:1 C6:1 B5:1 G#5:2 E5:1 F5:1 E5:1 D5:1 B4:3 C5:1 E5:1 A5:1 C6:2 A5:1 A5:3 A4:3 "
        "E5:1 A5:1 B5:1 C6:2 D6:1 E6:2 D6:1 C6:2 B5:1 A5:1 F5:1 D5:1 F5:2 A5:1 D6:2 C6:1 A5:2 F5:1 "
        "E5:1 G#5:1 B5:1 E6:2 D6:1 C6:1 B5:1 A5:1 G#5:2 B5:1 A5:1 E5:1 C5:1 A4:2 C5:1 A4:3 r:3 "
        "E5:1 G5:1 C6:1 E6:2 C6:1 D6:1 C6:1 B5:1 C6:3 D5:1 G5:1 B5:1 D6:2 B5:1 C6:1 B5:1 A5:1 G5:3 "
        "F5:1 G5:1 A5:1 B5:2 D6:1 C6:1 B5:1 G5:1 F5:2 D5:1 E5:1 G5:1 C6:1 G5:2 E5:1 C5:3 E5:1 F5:1 G5:1 "
        "A5:2 G5:1 F5:2 A5:1 C6:2 A5:1 F5:3 G#5:2 A5:1 B5:2 D6:1 C6:1 B5:1 A5:1 G#5:3 "
        "A5:1 C6:1 E6:1 C6:2 A5:1 B5:1 G#5:1 E5:1 D5:2 B4:1 C5:1 E5:1 A5:1 E5:2 C5:1 B4:3 E5:1 r:2"
    )

    def mandolin(f, d, v):
        # le trémolo : la corde (doublée) attaquée en aller-retour, de plus en plus doucement pour les notes longues
        n = int((d + 0.4) * SR)
        out = np.zeros(n)
        step = 0.052
        k = 0
        while k * step < d * 0.98:
            s = string(f * (1 + 0.0015 * (k % 2)), step * 1.6, v * (1 - 0.15 * (k % 2)), bright=0.85, sustain=0.35, pick=0.1)
            i = int(k * step * SR)
            m = min(len(s), n - i)
            out[i : i + m] += s[:m]
            k += 1
        if k == 0:
            out[: n] += string(f, d, v, bright=0.85, sustain=0.35, pick=0.1)[:n]
        return out

    play(mix, beat, melody, mandolin, pan=0.25, gain=0.85, accent=3)
    for c, at in bars_of(chords, 6):
        root, _ = chord(c)
        mix.add(bass(hz(root - 12), beat * 1.8, 0.85), at * beat, 0.0, 0.9)
        mix.add(bass(hz(root - 12 + 7), beat * 1.8, 0.7), (at + 3) * beat, 0.0, 0.9)
        v = voicing(c, 60)
        for k in (1, 2, 4, 5):
            for m in v:
                mix.add(reed(hz(m), beat * 0.6, 0.26, 0.55), (at + k) * beat, -0.35, 0.6)
        for k in range(6):
            mix.add(tamb(0.75 if k in (0, 3) else 0.4), (at + k) * beat, 0.4, 0.8)
        mix.add(frame_drum(0.5), at * beat, -0.1, 0.6)


def chalet(mix, beat):
    """Ländler en sol au coin du feu : le glockenspiel, la guitare en arpèges, les cordes tenues, les grelots"""
    chords = "G G C G D7 D7 G G Em Em C C D D7 G G C C G Em Am D7 G G".split()
    melody = tune(
        "D5:1 G5:1 B5:1 A5:.5 G5:.5 F#5:1 G5:1 E5:1 G5:1 C6:1 B5:2 G5:1 A5:1 F#5:1 D5:1 C6:1.5 B5:.5 A5:1 "
        "B5:1 G5:1 D5:1 G5:2 r:1 B5:1 E5:1 G5:1 F#5:.5 G5:.5 B5:2 C6:1 B5:1 A5:1 G5:1 E5:2 "
        "F#5:1 A5:1 D6:1 C6:1 A5:1 F#5:1 G5:1.5 A5:.5 B5:1 G5:2 D5:1 E5:1 G5:1 C6:1 E6:2 D6:1 "
        "D6:1 B5:1 G5:1 E5:1 G5:1 B5:1 C6:1 A5:1 E5:1 D5:1 F#5:1 A5:1 G5:1 B5:1 D6:1 G5:2 r:1"
    )
    play(mix, beat, melody, lambda f, d, v: bar(f, d, v * 0.9, "glock"), pan=0.2, gain=0.8, accent=3)
    play(mix, beat, [(m - 12 if m else m, d) for m, d in melody], flute, pan=-0.25, gain=0.32, accent=3)
    for c, at in bars_of(chords, 3):
        root, _ = chord(c)
        mix.add(bass(hz(root - 12), beat * 1.6, 0.75), at * beat, 0.0, 0.85)
        v = voicing(c, 55)
        arp = [root, v[0], v[1], v[2], v[1], v[0]]
        for k, m in enumerate(arp):
            mix.add(string(hz(m), beat * 0.9, 0.32 if k else 0.4, bright=0.45, sustain=1.0, pick=0.2), (at + k * 0.5) * beat, -0.3, 0.7)
        for m in voicing(c, 60):
            mix.add(strings(hz(m), beat * 2.9, 0.5), at * beat, 0.35, 0.55)
        mix.add(bells(0.5), (at + 1) * beat, 0.5, 0.7)
        mix.add(bells(0.4), (at + 2) * beat, 0.5, 0.6)


def train(mix, beat):
    """Swing en si bémol, la nuit dans le wagon : le bugle en sourdine, le vibraphone, la contrebasse qui marche, les balais"""
    chords = "Bb6 G7 Cm7 F7 Bb6 G7 Cm7 F7 Eb6 Edim Bb6 G7 Cm7 F7 Bb6 F7".split()
    melody = tune(
        "D5:1.5 F5:.5 G5:1 F5:1 B4:1 D5:.5 F5:1.5 r:1 Eb5:.5 D5:.5 C5:.5 Bb4:.5 G4:2 A4:1 C5:1 Eb5:1 r:1 "
        "D5:1.5 F5:.5 Bb5:1 A5:.5 G5:.5 F5:1 D5:1 B4:2 C5:.5 Eb5:.5 G5:.5 Bb5:.5 A5:1 G5:1 F5:2 r:2 "
        "G5:1 Bb5:1 G5:.5 F5:.5 Eb5:1 E5:1 G5:1 Bb5:1 Db6:1 D6:1.5 C6:.5 Bb5:1 F5:1 G5:.5 A5:.5 B5:.5 D6:.5 D6:1 B5:1 "
        "C6:1 G5:1 Eb5:1 C5:1 D5:.5 Eb5:.5 F5:.5 A5:.5 C6:1 A5:1 Bb5:2 F5:1 D5:1 Bb4:1 r:1 C5:.5 D5:.5 r:1"
    )
    play(mix, beat, melody, lambda f, d, v: horn(f, d, v * 0.9, mute=True), pan=-0.2, gain=1.0, swing=0.16, accent=4)
    walks = {
        "Bb6": "Bb2 D3 F3 A2",
        "G7": "G2 B2 D3 F#2",
        "Cm7": "C3 Eb3 G3 E3",
        "F7": "F2 A2 C3 B2",
        "Eb6": "Eb3 G3 Bb3 F3",
        "Edim": "E3 G3 Bb3 F3",
    }
    for i, (c, at) in enumerate(bars_of(chords, 4)):
        line = walks[c].split()
        if i == len(chords) - 1:
            line = "F2 A2 C3 A2".split()
        for k, n in enumerate(line):
            mix.add(bass(hz(pitch(n)), beat * 0.85, 0.85 if k % 2 == 0 else 0.75), (at + k) * beat, 0.05, 1.0, human=0.004)
        root, iv = chord(c)
        v = voicing(c, 58, 4)
        for hit in (1.66, 3.0) if i % 2 else (0.0, 2.66):
            for m in v:
                mix.add(bar(hz(m), beat * 0.9, 0.38, "vibes"), (at + hit) * beat, 0.35, 0.7)
        for k in range(4):
            mix.add(brush(0.32, swish=True), (at + k) * beat, -0.3, 0.6)
            if k % 2:
                mix.add(brush(0.3), (at + k) * beat, 0.2, 0.55)
                mix.add(hat(0.3), (at + k) * beat, 0.4, 0.5)
            mix.add(hat(0.18), (at + k + 0.5 + 0.16) * beat, 0.4, 0.4)


def banquet(mix, beat):
    """Polka en do pour le banquet de la fête : les cuivres, l'accordéon en tierces, les mains, les timbales"""
    chords = "C C G7 G7 G7 G7 C C F F C C D7 G7 C C".split()
    melody = tune(
        "G4:.5 C5:.5 E5:.5 G5:.5 C6:1 G5:1 E5:.5 F5:.5 G5:.5 E5:.5 C5:2 B4:.5 D5:.5 G5:.5 B5:.5 D6:1 B5:1 "
        "A5:.5 G5:.5 F5:.5 E5:.5 D5:2 F5:1 A5:1 D6:1 B5:1 G5:.5 A5:.5 G5:.5 F5:.5 D5:1 B4:1 "
        "C5:.5 E5:.5 G5:.5 C6:.5 E6:1 C6:1 G5:1 E5:1 C5:1 r:1 A5:.5 G5:.5 F5:.5 A5:.5 C6:1 A5:1 "
        "F5:.5 G5:.5 A5:.5 Bb5:.5 C6:2 G5:.5 F5:.5 E5:.5 G5:.5 C6:1 G5:1 E5:1 G5:1 C6:1.5 B5:.5 "
        "A5:.5 F#5:.5 D5:.5 F#5:.5 A5:1 C6:1 B5:.5 A5:.5 G5:.5 F5:.5 D5:1 B4:1 C5:1 E5:1 G5:1 C6:1 "
        "C6:1 G4:.5 G4:.5 G4:1 r:1"
    )
    play(mix, beat, melody, lambda f, d, v: horn(f, d, v), pan=-0.15, gain=0.95, accent=2)
    # L'accordéon, une tierce en dessous (dans la gamme de do)
    scale = [0, 2, 4, 5, 7, 9, 11]

    def third_below(m):
        if m is None:
            return None
        pc = m % 12
        if pc not in scale:
            return m - 4
        i = scale.index(pc)
        j = (i - 2) % 7
        down = (pc - scale[j]) % 12
        return m - down

    play(mix, beat, [(third_below(m), d) for m, d in melody], lambda f, d, v: reed(f, d, v * 0.8, 0.6), pan=0.3, gain=0.6, accent=2)
    for i, (c, at) in enumerate(bars_of(chords, 4)):
        root, _ = chord(c)
        mix.add(tuba(hz(root - 12), beat * 0.7, 0.9), at * beat, 0.0, 1.0)
        mix.add(tuba(hz(root - 12 + 7), beat * 0.7, 0.8), (at + 2) * beat, 0.0, 1.0)
        for k in (1, 3):
            for m in voicing(c, 60):
                mix.add(horn(hz(m), beat * 0.3, 0.4), (at + k) * beat, 0.15, 0.35)
            mix.add(clap(0.55), (at + k) * beat, 0.35, 0.7)
            mix.add(snare(0.3), (at + k) * beat, -0.2, 0.5)
        for k in range(8):
            mix.add(tamb(0.5 if k % 2 == 0 else 0.3), (at + k * 0.5) * beat, 0.45, 0.6)
        if i % 4 == 3:
            mix.add(timpani(hz(root - 12 if root - 12 > 40 else root), 0.8), (at + 3) * beat, -0.1, 0.8)
        mix.add(kick(0.5, 60), at * beat, 0.0, 0.6)


PIECES = {
    # nom : (fonction, battements par minute, mesures, temps par mesure, salle, part de la salle)
    "musette": (musette, 176, 32, 3, 1.3, 0.2),
    "port": (port, 300, 24, 6, 1.1, 0.18),
    "marche": (marche, 116, 16, 4, 1.2, 0.18),
    "toits": (toits, 380, 32, 6, 1.0, 0.16),
    "chalet": (chalet, 132, 24, 3, 1.8, 0.26),
    "train": (train, 138, 16, 4, 1.4, 0.2),
    "banquet": (banquet, 132, 16, 4, 1.6, 0.22),
}

if __name__ == "__main__":
    names = sys.argv[1:] or list(PIECES)
    for name in names:
        fn, bpm, bars, per_bar, rt, wet = PIECES[name]
        render(name, bpm, bars, per_bar, fn, rt, wet)
