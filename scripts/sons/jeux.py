# Les sons des jeux, refaits pour sonner vrai (voir naturels.py pour la méthode et les briques de base).
#
#   python scripts/sons/jeux.py <jeu ou nom...>     jeux : briques, uno, naval, capitale, crampons
#
# Chaque son garde son nom de fichier et le volume de l'ancien (REF_DIR : où lire les anciens ; OUT_DIR : où écrire).
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import naturels as N  # noqa: E402
from naturels import SR, butter, mallet, modal, noise, phrase, place, room, struck, t_axis  # noqa: E402

# ---------------------------------------------------------------------------------------------------------------------
# Quelques corps de plus

# Une cloche à main : des partiels inharmoniques qui sonnent longtemps (le « bourdon » sous la note, la tierce mineure…)
HANDBELL = dict(ratios=[1, 2.0, 2.41, 3.01, 4.17, 5.43], decays=[1.6, 1.1, 0.7, 0.5, 0.3, 0.18], amps=[1, 0.45, 0.35, 0.25, 0.15, 0.08])
# Une peau tendue (un tom) : les modes d'une membrane circulaire
MEMBRANE = dict(ratios=[1, 1.59, 2.14, 2.3, 2.65, 2.92], decays=[0.22, 0.12, 0.08, 0.07, 0.05, 0.04], amps=[1, 0.6, 0.4, 0.35, 0.25, 0.2])
# Un tube de métal libre (un poteau de but, une barre) : les modes d'une poutre, longs
TUBE = dict(ratios=[1, 2.756, 5.404, 8.933], decays=[1.2, 0.7, 0.35, 0.18], amps=[1, 0.55, 0.3, 0.15])
# Une petite pièce de plastique ou de bois clair (une brique de jeu, un pion) : aigu, très amorti
PIECE = dict(ratios=[1, 1.47, 2.09, 2.83, 3.7], decays=[0.03, 0.02, 0.014, 0.01, 0.007], amps=[1, 0.7, 0.5, 0.3, 0.2])
CLAVES = dict(ratios=[1, 2.68, 4.8], decays=[0.12, 0.04, 0.015], amps=[1, 0.25, 0.08])


def tap(rng, body, f0, dur=0.25, hard=6000.0, vel=1.0, click=0.5):
    """Un petit objet posé ou tapé : son corps, et le bruit du contact"""
    b = modal(rng, f0, body["ratios"], body["decays"], body["amps"], dur, detune=0.015)
    return place(rng, [(b * vel, 0), (mallet(rng, 0.0025, hard, click * vel), 0)], dur)


def thud(rng, f0=90.0, dur=0.5, crunch=1.0, lp=2500.0):
    """Un coup sourd (voir naturels.make_hit)"""
    body = modal(rng, f0, [1, 1.9, 2.8, 4.1, 5.3], [0.09, 0.05, 0.03, 0.018, 0.012], [1, 0.55, 0.35, 0.2, 0.12], dur, detune=0.02)
    n = int(0.09 * SR)
    c = butter(noise(rng, n) * np.exp(-np.arange(n) / (0.014 * SR)), "low", lp)
    return place(rng, [(body, 0), (c * crunch, 0)], dur)


def swish(rng, dur=0.35, lo=(400, 1500), hi=(1500, 5000), direction=1.0):
    """De l'air (une carte qui fend l'air, un objet lancé) : du bruit qui gonfle et dont la couleur bouge"""
    n = int(dur * SR)
    t = np.arange(n) / SR
    pos = t / dur if direction > 0 else 1 - t / dur
    shape = np.sin(np.pi * t / dur) ** 2
    src = noise(rng, n)
    a = butter(src, "band", lo) * (1 - pos)
    b = butter(src, "band", hi) * pos
    return (a + b) * shape


def bubble(rng, f0, tau):
    """Une bulle (modèle de Minnaert) : une résonance qui monte un peu pendant qu'elle s'éteint"""
    dur = tau * 6
    t = t_axis(dur)
    f = f0 * (1 + 0.6 * t / dur)
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / tau)
    y[: int(0.002 * SR)] *= np.linspace(0, 1, int(0.002 * SR))
    return y


def paper(rng, dur=0.12, color=(1500, 7000)):
    """Le bruit d'une carte ou d'un papier : un froissement bref"""
    n = int(dur * SR)
    e = np.exp(-np.arange(n) / (n / 5)) * (1 + 0.5 * rng.standard_normal(n).cumsum() / np.sqrt(n))
    return butter(noise(rng, n) * np.abs(e), "band", color)


# ---------------------------------------------------------------------------------------------------------------------
# Briques (le jeu de briques qui tombent)


def bricks_move(rng):
    return room(rng, tap(rng, PIECE, rng.uniform(1900, 2300), 0.06, 9000, 0.6, 0.5), rt60=0.15, wet=0.08, size=0.4)


def bricks_rotate(rng):
    # La pièce qui tourne : un petit clic de plastique, avec son léger cliquetis
    a = tap(rng, PIECE, rng.uniform(1500, 1800), 0.08, 9000, 0.7, 0.6)
    b = tap(rng, PIECE, rng.uniform(2200, 2600), 0.06, 9000, 0.35, 0.4)
    return room(rng, place(rng, [(a, 0), (b, rng.uniform(0.012, 0.02))], 0.1), rt60=0.15, wet=0.08, size=0.4)


def bricks_drop(rng):
    # La chute franche : la brique qui tape le fond, et le plateau qui résonne
    x = place(rng, [(thud(rng, rng.uniform(150, 190), 0.4, 0.9, 3500), 0), (tap(rng, PIECE, rng.uniform(700, 900), 0.1, 7000, 0.6), 0)], 0.4)
    return room(rng, x, rt60=0.25, wet=0.12, size=0.7)


def bricks_lock(rng):
    # La brique qui se cale : un clac sec de pièces qui s'emboîtent
    x = place(rng, [(tap(rng, PIECE, rng.uniform(600, 760), 0.12, 7000, 0.9), 0), (tap(rng, PIECE, rng.uniform(1100, 1400), 0.06, 9000, 0.4), rng.uniform(0.006, 0.012))], 0.15)
    return room(rng, x, rt60=0.2, wet=0.1, size=0.5)


def bricks_clear(rng):
    # Une ligne effacée : trois lames qui montent vite, et un souffle qui l'emporte
    x = N.phrase(rng, N.MARIMBA, ["E6", "G6", "C7"], [0.035, 0.035], [0.55, 0.6, 0.7], 0.6, hardness=6000, jitter=0.004)
    x = place(rng, [(x, 0), (swish(rng, 0.3, (800, 2500), (2500, 8000)) * 0.18, 0.02)], 0.65)
    return room(rng, x, rt60=0.4, wet=0.16, size=0.9)


def bricks_quad(rng):
    # Quatre lignes d'un coup : un accord de vibraphone joué en arpège, et des tintements
    x = N.phrase(rng, N.VIBES, ["C5", "E5", "G5", "C6", "E6"], [0.03, 0.03, 0.03, 0.03], [0.6, 0.65, 0.7, 0.8, 0.9], 1.2, hardness=5500, jitter=0.005)
    s = N.phrase(rng, N.GLOCK, ["C7", "G7"], [0.06], [0.25, 0.3], 0.8, hardness=9000)
    return room(rng, place(rng, [(x, 0), (s, 0.16), (swish(rng, 0.4, (600, 2000), (2000, 7000)) * 0.15, 0)], 1.3), rt60=0.6, wet=0.2, size=1.1)


def bricks_combo(rng):
    return room(rng, N.phrase(rng, N.GLOCK, ["A6"], [], [0.6], 0.35, hardness=8000), rt60=0.3, wet=0.14, size=0.7)


def bricks_spin(rng):
    # Une pièce glissée en tournant : un souffle qui tourne, et le clac à la fin
    x = place(rng, [(swish(rng, 0.3, (500, 1600), (1600, 5000)) * 0.6, 0), (tap(rng, PIECE, 700, 0.12, 7000, 0.9), 0.26)], 0.4)
    return room(rng, x, rt60=0.25, wet=0.12, size=0.6)


def bricks_hold(rng):
    # La pièce mise de côté : elle glisse dans sa réserve
    x = place(rng, [(paper(rng, 0.09, (900, 5000)) * 0.6, 0), (tap(rng, PIECE, 1300, 0.07, 8000, 0.5), 0.07)], 0.15)
    return room(rng, x, rt60=0.15, wet=0.08, size=0.4)


def bricks_attack(rng):
    # Des lignes envoyées chez l'autre : un lancer qui fend l'air
    x = place(rng, [(swish(rng, 0.22, (600, 2000), (2000, 7000)), 0), (tap(rng, PIECE, 900, 0.08, 8000, 0.4), 0.17)], 0.26)
    return room(rng, x, rt60=0.2, wet=0.1, size=0.6)


def bricks_garbage(rng):
    # Des lignes reçues : un poids qui monte d'en bas, sourd
    x = place(rng, [(thud(rng, rng.uniform(70, 85), 0.3, 0.6, 1500), 0), (tap(rng, PIECE, 400, 0.08, 4000, 0.3), 0.01)], 0.3)
    return room(rng, x, rt60=0.25, wet=0.12, size=0.8)


def bricks_warn(rng):
    # Le danger : deux coups graves sur du bois, pressants
    k = lambda: tap(rng, N.KNOCK, rng.uniform(140, 160), 0.15, 2500, 0.9, 0.6)
    return room(rng, place(rng, [(k(), 0), (k(), 0.075)], 0.22), rt60=0.25, wet=0.14, size=0.8)


def bricks_ko(rng):
    # Tout s'écroule : un gros coup et les briques qui retombent
    layers = [(thud(rng, 75, 0.6, 1.2, 3000), 0)]
    for k in range(rng.integers(6, 10)):
        layers.append((tap(rng, PIECE, rng.uniform(500, 1200), 0.1, 7000, rng.uniform(0.3, 0.7)), rng.uniform(0.05, 0.45)))
    return room(rng, place(rng, layers, 0.7), rt60=0.4, wet=0.16, size=1.0)


def bricks_count(rng):
    # Le décompte (Briques, et le départ de Bolides et de Culbute) : un coup de claves bien net
    return room(rng, tap(rng, CLAVES, rng.uniform(1950, 2050), 0.2, 8000, 1.0, 0.5), rt60=0.3, wet=0.14, size=0.8)


def bricks_go(rng):
    # Partez : une cloche claire, qui sonne
    x = place(rng, [(struck(rng, HANDBELL, N.note_hz("C6"), 1.0, 2.2, 7000), 0), (tap(rng, CLAVES, 2000, 0.2, 8000, 0.6, 0.4), 0)], 2.2)
    return room(rng, x, rt60=0.6, wet=0.18, size=1.0)


# ---------------------------------------------------------------------------------------------------------------------
# Uno


def uno_uno(rng):
    # « UNO ! » : deux coups de cloche à main, vifs, et un tambourin
    b1 = struck(rng, HANDBELL, N.note_hz("E6"), 0.9, 2.0, 7000)
    b2 = struck(rng, HANDBELL, N.note_hz("A6"), 1.0, 2.2, 7000)
    jingle = sum(place(rng, [(struck(rng, dict(ratios=[1, 1.5, 2.3], decays=[0.12, 0.08, 0.05], amps=[1, 0.6, 0.3]), rng.uniform(5000, 8000), 0.2, 0.25, 9000), 0)], 0.25) for _ in range(5))
    x = place(rng, [(b1, 0), (b2, 0.13), (jingle * 0.6, 0.13)], 2.4)
    return room(rng, x, rt60=0.6, wet=0.2, size=1.1)


def uno_reverse(rng):
    # Sens inverse : une carte qui part d'un côté, puis revient de l'autre, et claque sur la pile
    x = place(rng, [(swish(rng, 0.14, (700, 2500), (2500, 7000), 1) * 0.8, 0), (swish(rng, 0.14, (700, 2500), (2500, 7000), -1) * 0.8, 0.12), (paper(rng, 0.05, (1200, 6000)), 0.25)], 0.32)
    return room(rng, x, rt60=0.2, wet=0.1, size=0.6)


def uno_caught(rng):
    # Pris sans avoir dit UNO : un « bonk » de tom, qui retombe
    t = t_axis(0.5)
    tom = modal(rng, 110, MEMBRANE["ratios"], MEMBRANE["decays"], MEMBRANE["amps"], 0.5, detune=0.01)
    tom *= 1 + 0.0 * t
    x = place(rng, [(tom, 0), (mallet(rng, 0.004, 2000, 0.4), 0)], 0.5)
    return room(rng, x, rt60=0.35, wet=0.14, size=0.9)


def uno_eliminated(rng):
    # Éliminé : trois notes de marimba qui descendent, lentes, et un coup sourd
    x = N.phrase(rng, N.MARIMBA, ["C5", "A4", "E4"], [0.22, 0.26], [0.7, 0.65, 0.7], 1.6, hardness=2000, jitter=0.012)
    x = place(rng, [(x, 0), (thud(rng, 70, 0.5, 0.5, 1200) * 0.6, 0.5)], 1.7)
    return room(rng, x, rt60=0.55, wet=0.2, size=1.1)


def uno_your_turn(rng):
    # À toi : deux lames de vibraphone, douces (ding-dong)
    x = N.phrase(rng, N.VIBES, ["E6", "C6"], [0.16], [0.55, 0.6], 2.0, hardness=4000, jitter=0.006)
    return room(rng, x, rt60=0.55, wet=0.2, size=1.0)


# ---------------------------------------------------------------------------------------------------------------------
# Naval


def naval_sonar(rng):
    # Le sonar : un « ping » qui se perd dans l'eau (une longue réverbération sombre) et son écho qui revient
    dur = 2.4
    t = t_axis(dur)
    f = 1180 * (1 + 0.003 * np.sin(2 * np.pi * 5 * t))
    ping = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.5)
    ping[: int(0.004 * SR)] *= np.linspace(0, 1, int(0.004 * SR))
    ping += 0.25 * np.sin(2 * np.pi * np.cumsum(f * 2.01) / SR) * np.exp(-t / 0.08) * np.minimum(1, t / 0.004)
    d = int(0.7 * SR)
    echo = np.zeros_like(ping)
    echo[d:] = ping[: len(ping) - d] * 0.18
    water = butter(N.pink(rng, len(t)), "low", 900) * 0.02
    x = N.fade_out(ping + echo + water, 300)
    return room(rng, x, rt60=1.8, wet=0.35, size=2.0, damp=1600)


def naval_bubbles(rng):
    # Des bulles qui remontent : chacune sa taille (sa note), à leur rythme, sur le bruit de l'eau
    dur = 2.9
    layers = []
    for _ in range(rng.integers(26, 36)):
        f0 = rng.uniform(280, 1300)
        layers.append((bubble(rng, f0, rng.uniform(0.006, 0.02)) * rng.uniform(0.2, 0.9), rng.uniform(0, dur - 0.2) ** 1.1))
    water = butter(N.pink(rng, int(dur * SR)), "low", 700) * 0.04
    # Les bulles sous l'eau n'ont pas d'aigus secs
    x = butter(place(rng, layers, dur), "low", 4500) + water * np.linspace(1, 0.3, int(dur * SR))
    x = N.fade_out(x, 200)
    return room(rng, x, rt60=0.8, wet=0.25, size=1.4, damp=2200)


def naval_torpedo(rng):
    # La torpille : le coup sourd du lancement, l'hélice qui file, et le sillage de bulles
    dur = 1.8
    t = t_axis(dur)
    prop = butter(noise(rng, len(t)), "band", (400, 1100)) * (0.6 + 0.4 * np.sin(2 * np.pi * 38 * t)) * np.exp(-t / 0.9)
    layers = [(thud(rng, 80, 0.4, 0.8, 1800), 0), (prop * 0.5, 0.05)]
    for _ in range(18):
        layers.append((bubble(rng, rng.uniform(400, 1200), rng.uniform(0.005, 0.012)) * rng.uniform(0.15, 0.4), rng.uniform(0.1, 1.4)))
    return room(rng, place(rng, layers, dur), rt60=0.9, wet=0.25, size=1.5, damp=2000)


# ---------------------------------------------------------------------------------------------------------------------
# Capitale


def cap_hop(rng):
    # Un pion de bois qui saute d'une case : le petit choc, et le plateau en carton qui résonne
    x = place(rng, [(tap(rng, PIECE, rng.uniform(900, 1300), 0.12, 6000, 0.8), 0), (thud(rng, rng.uniform(160, 220), 0.2, 0.25, 1500) * 0.5, 0)], 0.2)
    return room(rng, x, rt60=0.22, wet=0.12, size=0.6)


def cap_turn(rng):
    # Le tour passe : un jeton posé sur la table
    x = place(rng, [(tap(rng, PIECE, rng.uniform(1500, 1900), 0.1, 8000, 0.7), 0), (tap(rng, PIECE, rng.uniform(2200, 2700), 0.06, 9000, 0.3), 0.018)], 0.14)
    return room(rng, x, rt60=0.2, wet=0.1, size=0.5)


def cap_jump(rng):
    # Un pion qui fait un grand saut : il fend l'air, puis retombe
    x = place(rng, [(swish(rng, 0.14, (500, 1500), (1500, 4000)) * 0.4, 0), (tap(rng, PIECE, rng.uniform(900, 1200), 0.12, 6000, 0.9), 0.12), (thud(rng, 180, 0.2, 0.3, 1500) * 0.5, 0.12)], 0.3)
    return room(rng, x, rt60=0.22, wet=0.12, size=0.6)


def cap_build(rng):
    # Une maison posée : un petit bloc de bois sur le plateau
    x = place(rng, [(tap(rng, N.WOODBLOCK, rng.uniform(600, 800), 0.15, 5000, 0.9), 0), (thud(rng, 200, 0.2, 0.3, 1800) * 0.4, 0)], 0.2)
    return room(rng, x, rt60=0.22, wet=0.12, size=0.6)


def cap_build_big(rng):
    # Un grand bâtiment : plusieurs blocs qu'on empile, le dernier plus lourd
    layers = []
    at = 0.0
    for k in range(4):
        layers.append((tap(rng, N.WOODBLOCK, rng.uniform(500, 800), 0.15, 5000, rng.uniform(0.6, 0.9)), at))
        at += rng.uniform(0.09, 0.14)
    layers.append((thud(rng, 120, 0.4, 0.7, 2500), at))
    return room(rng, place(rng, layers, at + 0.45), rt60=0.3, wet=0.14, size=0.8)


def cap_auction(rng):
    # L'enchère s'ouvre : une cloche de comptoir
    x = place(rng, [(struck(rng, HANDBELL, N.note_hz("A5"), 0.9, 2.2, 8000), 0)], 2.2)
    return room(rng, x, rt60=0.5, wet=0.18, size=0.9)


def cap_deal(rng):
    # Un marché conclu : une carte posée d'un coup sec, et une petite note claire
    x = place(rng, [(paper(rng, 0.06, (1200, 7000)), 0), (tap(rng, PIECE, 900, 0.08, 6000, 0.4), 0), (struck(rng, N.GLOCK, N.note_hz("E6"), 0.4, 0.6, 7000), 0.04)], 0.7)
    return room(rng, x, rt60=0.35, wet=0.15, size=0.8)


def cap_buy(rng):
    # Un achat : la caisse enregistreuse (sa sonnette) et des pièces qui tombent dans le tiroir
    layers = [(struck(rng, HANDBELL, N.note_hz("C7"), 0.6, 0.8, 9000), 0)]
    for _ in range(rng.integers(5, 8)):
        coin = modal(rng, rng.uniform(3500, 6500), [1, 1.43, 2.2, 2.9], [0.12, 0.08, 0.05, 0.03], [1, 0.6, 0.35, 0.2], 0.2, detune=0.01)
        layers.append((coin * rng.uniform(0.15, 0.35), rng.uniform(0.08, 0.35)))
    return room(rng, place(rng, layers, 0.9), rt60=0.3, wet=0.14, size=0.7)


def cap_bankrupt(rng):
    # La faillite : trois notes de marimba qui descendent, sourdes
    return room(rng, N.phrase(rng, N.MARIMBA, ["D5", "A4", "F4"], [0.12, 0.14], [0.6, 0.55, 0.6], 0.9, hardness=1800, jitter=0.01), rt60=0.4, wet=0.16, size=0.9)


# ---------------------------------------------------------------------------------------------------------------------
# Crampons


def whistle(rng, dur, f0=None):
    """Un sifflet d'arbitre : la note du sifflet, la bille qui roule dedans (un trille rapide), et le souffle"""
    t = t_axis(dur)
    f0 = f0 or rng.uniform(3050, 3250)
    trill = rng.uniform(26, 34)
    f = f0 * (1 + 0.035 * np.sin(2 * np.pi * trill * t + rng.uniform(0, 6.28)))
    am = 0.7 + 0.3 * np.sin(2 * np.pi * trill * t)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.18 * np.sin(2 * np.pi * np.cumsum(2 * f) / SR)
    breath = butter(noise(rng, len(t)), "band", (f0 * 0.85, f0 * 1.2)) * 0.06 + butter(noise(rng, len(t)), "band", (1500, 9000)) * 0.008
    env = np.minimum(1, t / rng.uniform(0.012, 0.025)) * np.minimum(1, (dur - t) / 0.04)
    # Le souffle n'est pas parfaitement constant
    env *= 1 + 0.06 * np.sin(2 * np.pi * rng.uniform(2, 4) * t)
    return (tone * am + breath) * env


def foot_whistle(rng):
    return room(rng, whistle(rng, rng.uniform(0.36, 0.42)), rt60=0.9, wet=0.18, size=2.0, damp=4000)


def foot_whistle_end(rng):
    # Le coup de sifflet final : deux courts, un long
    a = whistle(rng, 0.22)
    b = whistle(rng, 0.22)
    c = whistle(rng, 0.85)
    x = place(rng, [(a, 0), (b, 0.33), (c, 0.68)], 1.65)
    return room(rng, x, rt60=1.0, wet=0.18, size=2.0, damp=4000)


def foot_post(rng):
    # Sur le poteau : le ballon cogne (sourd), et le tube de métal sonne longtemps
    x = place(rng, [(thud(rng, 110, 0.3, 0.8, 2500), 0), (modal(rng, rng.uniform(380, 460), TUBE["ratios"], TUBE["decays"], TUBE["amps"], 1.0, detune=0.008) * 0.8, 0)], 1.0)
    return room(rng, x, rt60=1.0, wet=0.12, size=2.0, damp=5000)


# ---------------------------------------------------------------------------------------------------------------------

GAMES = {
    "briques": {
        "bricks-move": (bricks_move, ["bricks-move.mp3"]),
        "bricks-rotate": (bricks_rotate, ["bricks-rotate.mp3"]),
        "bricks-drop": (bricks_drop, ["bricks-drop-1.mp3", "bricks-drop-2.mp3", "bricks-drop-3.mp3"]),
        "bricks-lock": (bricks_lock, ["bricks-lock-1.mp3", "bricks-lock-2.mp3", "bricks-lock-3.mp3"]),
        "bricks-clear": (bricks_clear, ["bricks-clear.mp3"]),
        "bricks-quad": (bricks_quad, ["bricks-quad.mp3"]),
        "bricks-combo": (bricks_combo, ["bricks-combo.mp3"]),
        "bricks-spin": (bricks_spin, ["bricks-spin.mp3"]),
        "bricks-hold": (bricks_hold, ["bricks-hold.mp3"]),
        "bricks-attack": (bricks_attack, ["bricks-attack.mp3"]),
        "bricks-garbage": (bricks_garbage, ["bricks-garbage.mp3"]),
        "bricks-warn": (bricks_warn, ["bricks-warn.mp3"]),
        "bricks-ko": (bricks_ko, ["bricks-ko.mp3"]),
        "bricks-count": (bricks_count, ["bricks-count.mp3"]),
        "bricks-go": (bricks_go, ["bricks-go.mp3"]),
    },
    "uno": {
        "uno": (uno_uno, ["uno.mp3"]),
        "reverse": (uno_reverse, ["reverse.mp3"]),
        "caught": (uno_caught, ["caught.mp3"]),
        "eliminated": (uno_eliminated, ["eliminated.mp3"]),
        "your-turn": (uno_your_turn, ["your-turn.mp3"]),
    },
    "naval": {
        "naval-sonar": (naval_sonar, ["naval-sonar.mp3"]),
        "naval-bubbles": (naval_bubbles, ["naval-bubbles.mp3"]),
        "naval-torpedo": (naval_torpedo, ["naval-torpedo.mp3"]),
    },
    "capitale": {
        "cap-hop": (cap_hop, ["cap-hop-1.mp3", "cap-hop-2.mp3", "cap-hop-3.mp3"]),
        "cap-turn": (cap_turn, ["cap-turn.mp3"]),
        "cap-jump": (cap_jump, ["cap-jump.mp3"]),
        "cap-build": (cap_build, ["cap-build.mp3"]),
        "cap-build-big": (cap_build_big, ["cap-build-big.mp3"]),
        "cap-auction": (cap_auction, ["cap-auction.mp3"]),
        "cap-deal": (cap_deal, ["cap-deal.mp3"]),
        "cap-buy": (cap_buy, ["cap-buy.mp3"]),
        "cap-bankrupt": (cap_bankrupt, ["cap-bankrupt.mp3"]),
    },
    "crampons": {
        "foot-whistle": (foot_whistle, ["foot-whistle.mp3"]),
        "foot-whistle-end": (foot_whistle_end, ["foot-whistle-end.mp3"]),
        "foot-post": (foot_post, ["foot-post.mp3"]),
    },
}


def build(name, make, files, ref_dir):
    first = os.path.join(ref_dir, files[0])
    target = N.active_rms(N.decode(first)) if os.path.exists(first) else 0.1
    for k, f in enumerate(files):
        rng = np.random.default_rng(sum(map(ord, name)) * 1000 + k)
        x = N.trim(make(rng), -50)
        x = x * (target / (N.active_rms(x) + 1e-12))
        x = N.limit(x)
        x = N.floor_noise(rng, x)
        N.write_mp3(x, os.path.join(N.OUT, f))
        print(f"{f:<24} {len(x) / SR:5.2f} s")


if __name__ == "__main__":
    ref_dir = os.environ.get("REF_DIR", N.OUT)
    wanted = sys.argv[1:] or list(GAMES)
    for g, sounds in GAMES.items():
        for name, (make, files) in sounds.items():
            if g in wanted or name in wanted:
                build(name, make, files, ref_dir)
