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
    x = N.phrase(rng, N.MARIMBA, ["E6", "G6", "C7"], [0.035, 0.035], [0.55, 0.6, 0.7], 0.45, hardness=6000, jitter=0.004, damp=0.4)
    x = place(rng, [(x, 0), (swish(rng, 0.22, (800, 2500), (2500, 8000)) * 0.18, 0.02)], 0.45)
    return room(rng, x, rt60=0.4, wet=0.16, size=0.9)


def bricks_quad(rng):
    # Quatre lignes d'un coup : un accord de vibraphone joué en arpège, et des tintements
    x = N.phrase(rng, N.VIBES, ["C5", "E5", "G5", "C6", "E6"], [0.03, 0.03, 0.03, 0.03], [0.6, 0.65, 0.7, 0.8, 0.9], 0.7, hardness=5500, jitter=0.005, damp=0.3)
    s = N.phrase(rng, N.GLOCK, ["C7", "G7"], [0.06], [0.25, 0.3], 0.5, hardness=9000, damp=0.4)
    return room(rng, place(rng, [(x, 0), (s, 0.16), (swish(rng, 0.3, (600, 2000), (2000, 7000)) * 0.15, 0)], 0.75), rt60=0.4, wet=0.18, size=1.0)


def bricks_combo(rng):
    return room(rng, N.phrase(rng, N.GLOCK, ["A6"], [], [0.6], 0.25, hardness=8000, damp=0.3), rt60=0.2, wet=0.12, size=0.6)


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
    x = place(rng, [(struck(rng, HANDBELL, N.note_hz("C6"), 1.0, 1.1, 7000, damp=0.45), 0), (tap(rng, CLAVES, 2000, 0.2, 8000, 0.6, 0.4), 0)], 1.1)
    return room(rng, x, rt60=0.45, wet=0.16, size=1.0)


# ---------------------------------------------------------------------------------------------------------------------
# Uno


def uno_uno(rng):
    # « UNO ! » : deux coups de cloche à main, vifs, et un tambourin
    b1 = struck(rng, HANDBELL, N.note_hz("E6"), 0.9, 1.0, 7000, damp=0.35)
    b2 = struck(rng, HANDBELL, N.note_hz("A6"), 1.0, 1.0, 7000, damp=0.4)
    jingle = sum(place(rng, [(struck(rng, dict(ratios=[1, 1.5, 2.3], decays=[0.12, 0.08, 0.05], amps=[1, 0.6, 0.3]), rng.uniform(5000, 8000), 0.2, 0.25, 9000), 0)], 0.25) for _ in range(5))
    x = place(rng, [(b1, 0), (b2, 0.09), (jingle * 0.6, 0.09)], 1.1)
    return room(rng, x, rt60=0.6, wet=0.2, size=1.1)


def uno_reverse(rng):
    # Sens inverse : une carte qui part d'un côté, puis revient de l'autre, et claque sur la pile
    x = place(rng, [(swish(rng, 0.12, (700, 2500), (2500, 7000), 1) * 0.8, 0), (swish(rng, 0.12, (700, 2500), (2500, 7000), -1) * 0.8, 0.1), (paper(rng, 0.05, (1200, 6000)), 0.21)], 0.3)
    return room(rng, x, rt60=0.2, wet=0.1, size=0.6)


def uno_caught(rng):
    # Pris sans avoir dit UNO (vexant, pas grave) : deux coups de tom qui descendent, « bonk-bonk »
    def hit(f, v):
        tom = modal(rng, f, MEMBRANE["ratios"], MEMBRANE["decays"], MEMBRANE["amps"], 0.35, detune=0.01)
        return place(rng, [(tom * v, 0), (mallet(rng, 0.004, 2200, 0.35 * v), 0)], 0.35)

    x = place(rng, [(hit(rng.uniform(150, 160), 0.85), 0), (hit(rng.uniform(108, 116), 1.0), rng.uniform(0.11, 0.13))], 0.5)
    return room(rng, x, rt60=0.35, wet=0.14, size=0.9)


def uno_eliminated(rng):
    # Éliminé : trois notes de marimba qui descendent, lentes, et un coup sourd
    x = N.phrase(rng, N.MARIMBA, ["C5", "A4", "E4"], [0.22, 0.26], [0.7, 0.65, 0.7], 1.6, hardness=2000, jitter=0.012)
    x = place(rng, [(x, 0), (thud(rng, 70, 0.5, 0.5, 1200) * 0.6, 0.5)], 1.7)
    return room(rng, x, rt60=0.55, wet=0.2, size=1.1)


def uno_your_turn(rng):
    # À toi : deux lames de vibraphone, douces (ding-dong)
    x = N.phrase(rng, N.VIBES, ["E6", "C6"], [0.16], [0.55, 0.6], 1.4, hardness=4000, jitter=0.006, damp=0.6)
    return room(rng, x, rt60=0.55, wet=0.2, size=1.0)


# ---------------------------------------------------------------------------------------------------------------------
# Naval


def naval_sonar(rng):
    # Le sonar : un « ping » qui se perd dans l'eau (une longue réverbération sombre) et son écho qui revient
    dur = 1.4
    t = t_axis(dur)
    f = 1180 * (1 + 0.003 * np.sin(2 * np.pi * 5 * t))
    ping = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.3)
    ping[: int(0.004 * SR)] *= np.linspace(0, 1, int(0.004 * SR))
    ping += 0.25 * np.sin(2 * np.pi * np.cumsum(f * 2.01) / SR) * np.exp(-t / 0.08) * np.minimum(1, t / 0.004)
    d = int(0.5 * SR)
    echo = np.zeros_like(ping)
    echo[d:] = ping[: len(ping) - d] * 0.18
    water = butter(N.pink(rng, len(t)), "low", 900) * 0.02
    x = N.fade_out(ping + echo + water, 300)
    return room(rng, x, rt60=0.9, wet=0.3, size=2.0, damp=1600)


def naval_bubbles(rng):
    # Des bulles qui remontent : chacune sa taille (sa note), à leur rythme, sur le bruit de l'eau
    dur = 2.9
    layers = []
    for _ in range(rng.integers(45, 60)):
        # De grosses bulles surtout (des « bloups » graves, comme l'ancien son), quelques petites plus aiguës
        f0 = rng.uniform(150, 700) if rng.random() < 0.75 else rng.uniform(700, 1300)
        layers.append((bubble(rng, f0, rng.uniform(0.012, 0.03)) * rng.uniform(0.5, 0.9), rng.uniform(0, dur - 0.2) ** 1.1))
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
    # Un pion qui retombe d'un grand saut (le son part à l'atterrissage) : un seul choc, plus appuyé qu'un pas
    x = place(rng, [(tap(rng, PIECE, rng.uniform(850, 1100), 0.14, 6000, 1.0), 0), (thud(rng, rng.uniform(150, 190), 0.25, 0.45, 1800) * 0.7, 0)], 0.3)
    return room(rng, x, rt60=0.22, wet=0.12, size=0.6)


def cap_build(rng):
    # Un bâtiment qui sort de terre (0,55 s) : de petits blocs de bois qui s'empilent, de plus en plus haut, et se calent
    layers = []
    at = 0.0
    f = rng.uniform(520, 600)
    for k in range(3):
        layers.append((tap(rng, N.WOODBLOCK, f * (1 + 0.12 * k), 0.12, 5000, rng.uniform(0.55, 0.75)), at))
        at += rng.uniform(0.11, 0.15)
    layers.append((place(rng, [(tap(rng, N.WOODBLOCK, f * 1.3, 0.15, 5000, 0.9), 0), (thud(rng, 200, 0.2, 0.3, 1800) * 0.4, 0)], 0.2), at))
    return room(rng, place(rng, layers, at + 0.22), rt60=0.22, wet=0.12, size=0.6)


def cap_build_big(rng):
    # Un grand bâtiment : plusieurs blocs qu'on empile, le dernier plus lourd
    layers = []
    at = 0.0
    # Assez de blocs pour un monument qui monte en 1,1 s (et, ralenti, des étages qui tombent)
    for k in range(6):
        layers.append((tap(rng, N.WOODBLOCK, rng.uniform(450, 780), 0.15, 5000, rng.uniform(0.6, 0.9)), at))
        at += rng.uniform(0.11, 0.16)
    layers.append((thud(rng, 120, 0.4, 0.7, 2500), at))
    return room(rng, place(rng, layers, at + 0.45), rt60=0.3, wet=0.14, size=0.8)


def cap_auction(rng):
    # L'enchère s'ouvre : une cloche de comptoir
    x = place(rng, [(struck(rng, HANDBELL, N.note_hz("A5"), 0.9, 1.4, 8000, damp=0.6), 0)], 1.4)
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


def cap_gavel(rng):
    # Adjugé : le maillet de bois dur frappe deux fois son socle, un léger puis un franc (toc-toc)
    def knock(v):
        return place(rng, [(tap(rng, N.KNOCK, rng.uniform(260, 300), 0.25, 6000, v, 0.9), 0), (thud(rng, rng.uniform(140, 170), 0.25, 0.6, 3000) * 0.6 * v, 0)], 0.25)

    x = place(rng, [(knock(0.6), 0), (knock(1.0), rng.uniform(0.085, 0.1))], 0.36)
    return room(rng, x, rt60=0.35, wet=0.16, size=1.0)


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
    return room(rng, whistle(rng, rng.uniform(0.33, 0.38)), rt60=0.6, wet=0.14, size=2.0, damp=4000)


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
# Bolides (des karts, en dessin animé : des bruitages appuyés, mais faits de vrais objets)

COIN = dict(ratios=[1, 1.43, 2.2, 2.9], decays=[0.18, 0.12, 0.07, 0.04], amps=[1, 0.6, 0.35, 0.2])
SPRING = dict(ratios=[1, 2.1, 3.3], decays=[0.35, 0.18, 0.08], amps=[1, 0.4, 0.15])


def slide_whistle(rng, dur, f_from, f_to):
    """Un sifflet à coulisse : une note qui glisse, son vibrato et le souffle"""
    t = t_axis(dur)
    pos = t / dur
    f = f_from * (f_to / f_from) ** pos * (1 + 0.012 * np.sin(2 * np.pi * rng.uniform(5, 6.5) * t))
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.12 * np.sin(2 * np.pi * np.cumsum(2 * f) / SR)
    breath = butter(noise(rng, len(t)), "band", (1200, 6000)) * 0.015
    env = np.minimum(1, t / 0.03) * np.minimum(1, (dur - t) / 0.08)
    return (tone + breath) * env


def boing(rng, f0, dur):
    """Un ressort de butée qu'on pince : une note qui ondule fort puis se calme"""
    t = t_axis(dur)
    wob = 1 + 0.18 * np.exp(-t / 0.12) * np.sin(2 * np.pi * rng.uniform(11, 14) * t)
    f = f0 * wob
    y = np.zeros_like(t)
    for r, d, a in zip(SPRING["ratios"], SPRING["decays"], SPRING["amps"]):
        y += a * np.exp(-t / d) * np.sin(2 * np.pi * np.cumsum(f * r) / SR)
    return place(rng, [(y, 0), (mallet(rng, 0.004, 4000, 0.3), 0)], dur)


def bolides_box(rng):
    # Une boîte à objets attrapée : un carton qui claque et un tintement de verre (attaque nette, brève)
    x = place(rng, [(tap(rng, PIECE, rng.uniform(500, 650), 0.12, 7000, 0.8, 0.8), 0), (struck(rng, N.GLOCK, rng.uniform(1900, 2100), 0.6, 0.35, 9000, damp=0.35), 0.005)], 0.4)
    return room(rng, x, rt60=0.25, wet=0.1, size=0.7)


def bolides_coin(rng):
    # Une pièce ramassée : deux pièces qui tintent l'une après l'autre (attaque nette, brève)
    c1 = modal(rng, rng.uniform(2300, 2500), COIN["ratios"], COIN["decays"], COIN["amps"], 0.35, detune=0.006)
    c2 = modal(rng, rng.uniform(3300, 3600), COIN["ratios"], COIN["decays"], COIN["amps"], 0.35, detune=0.006)
    x = place(rng, [(c1 * 0.8, 0), (mallet(rng, 0.002, 9000, 0.3), 0), (c2, 0.06), (mallet(rng, 0.002, 9000, 0.3), 0.06)], 0.45)
    return room(rng, x, rt60=0.25, wet=0.1, size=0.6)


def bolides_bump(rng):
    # Deux karts qui se cognent : les pneus qui rebondissent, la coque en plastique
    x = place(rng, [(thud(rng, rng.uniform(95, 120), 0.25, 0.7, 2200), 0), (tap(rng, PIECE, rng.uniform(380, 460), 0.1, 5000, 0.7), 0)], 0.25)
    return room(rng, x, rt60=0.2, wet=0.1, size=0.7)


def bolides_charge(rng):
    # La charge du dérapage : un souffle qui monte, et des étincelles qui crépitent
    layers = [(swish(rng, 0.2, (600, 2000), (2000, 7000)) * 0.8, 0)]
    for _ in range(6):
        layers.append((butter(mallet(rng, 0.0015, 12000, 0.5), "high", 4000), rng.uniform(0.02, 0.18)))
    return room(rng, place(rng, layers, 0.24), rt60=0.2, wet=0.08, size=0.6)


def bolides_clang(rng):
    # Un choc contre du métal : une tôle, un poteau, qui sonne longtemps
    x = place(rng, [(thud(rng, 120, 0.3, 0.8, 3000), 0), (modal(rng, rng.uniform(160, 190), TUBE["ratios"], TUBE["decays"], TUBE["amps"], 1.0, detune=0.01) * 0.8, 0)], 1.0)
    return room(rng, x, rt60=0.6, wet=0.14, size=1.2)


def bolides_dive(rng):
    # Le kart qui plonge : il fend l'air en descendant, puis l'eau
    n = int(0.25 * SR)
    splash = butter(noise(rng, n) * np.exp(-np.arange(n) / (0.07 * SR)), "band", (500, 5000))
    x = place(rng, [(swish(rng, 0.3, (1500, 5000), (400, 1500)) * 0.6, 0), (splash, 0.28), (bubble(rng, 300, 0.03) * 0.4, 0.3)], 0.6)
    return room(rng, x, rt60=0.4, wet=0.14, size=1.0)


def bolides_fall(rng):
    # Une chute dans le vide (dessin animé) : le sifflet à coulisse qui descend, puis l'écrasement à l'arrivée
    crash = [(thud(rng, 70, 0.5, 1.2, 3500), 0.85)]
    for _ in range(6):
        crash.append((tap(rng, PIECE, rng.uniform(400, 900), 0.12, 6000, rng.uniform(0.3, 0.6)), 0.86 + rng.uniform(0, 0.25)))
    x = place(rng, [(slide_whistle(rng, 0.85, rng.uniform(1500, 1700), rng.uniform(380, 450)), 0)] + crash, 1.5)
    return room(rng, x, rt60=0.5, wet=0.15, size=1.2)


def bolides_grow(rng):
    # La potion géante : le sifflet à coulisse qui monte, et un tintement à la fin
    x = place(rng, [(slide_whistle(rng, 0.9, 300, 1100), 0), (struck(rng, N.GLOCK, 2200, 0.4, 0.4, 8000, damp=0.4), 0.85)], 1.1)
    return room(rng, x, rt60=0.5, wet=0.15, size=1.1)


def bolides_hoop(rng):
    # Un anneau traversé en deltaplane : deux notes de glockenspiel, vives
    return room(rng, N.phrase(rng, N.GLOCK, ["E6", "B6"], [0.06], [0.6, 0.7], 0.45, hardness=8000, damp=0.4), rt60=0.35, wet=0.14, size=0.9)


def bolides_jump(rng):
    # Le saut : un ressort de butée pincé (boing)
    return room(rng, boing(rng, rng.uniform(310, 360), 0.42), rt60=0.25, wet=0.1, size=0.8)


def bolides_spring(rng):
    # Le ressort (l'objet) : un plus grand boing, plus long
    return room(rng, boing(rng, rng.uniform(230, 260), 0.55), rt60=0.25, wet=0.1, size=0.8)


def bolides_land(rng):
    # La réception : les pneus qui touchent le sol, la suspension qui encaisse
    x = place(rng, [(thud(rng, rng.uniform(80, 100), 0.3, 0.9, 1800), 0), (tap(rng, PIECE, 300, 0.08, 3000, 0.4), 0.01)], 0.32)
    return room(rng, x, rt60=0.2, wet=0.1, size=0.8)


def bolides_magnet(rng):
    # L'aimant : un bourdonnement électrique qui enfle, et le clic du métal attiré
    t = t_axis(0.65)
    hum = butter(np.sign(np.sin(2 * np.pi * 120 * t)) * 0.5 + 0.5 * np.sin(2 * np.pi * 240 * t), "band", (150, 2000))
    hum *= np.sin(np.pi * t / 0.65) ** 0.7
    x = place(rng, [(hum * 0.5, 0), (modal(rng, 2600, COIN["ratios"], COIN["decays"], COIN["amps"], 0.2) * 0.4, 0.55)], 0.75)
    return room(rng, x, rt60=0.3, wet=0.12, size=0.8)


def bolides_rescue(rng):
    # Le drone qui vient reposer le kart : ses hélices qui ronronnent en approchant, puis s'éloignent
    t = t_axis(1.5)
    blades = butter(noise(rng, len(t)), "band", (300, 2500)) * (0.6 + 0.4 * np.sin(2 * np.pi * 95 * t))
    whine = np.sin(2 * np.pi * np.cumsum(560 + 40 * np.sin(2 * np.pi * 0.7 * t)) / SR) * 0.15
    x = (blades + whine) * np.sin(np.pi * t / 1.5) ** 1.5
    return room(rng, x, rt60=0.4, wet=0.14, size=1.2)


def bolides_splat(rng):
    # La tarte à la crème : un paquet mou et mouillé qui s'écrase
    n = int(0.3 * SR)
    wet = butter(noise(rng, n) * np.exp(-np.arange(n) / (0.05 * SR)), "low", 2500)
    layers = [(wet, 0), (thud(rng, 140, 0.2, 0.3, 900) * 0.6, 0)]
    for _ in range(4):
        layers.append((bubble(rng, rng.uniform(200, 500), 0.01) * 0.3, rng.uniform(0.03, 0.2)))
    return room(rng, place(rng, layers, 0.4), rt60=0.2, wet=0.08, size=0.6)


def bolides_strike(rng):
    # La boule de bowling : elle fauche des quilles de bois
    layers = [(thud(rng, 120, 0.4, 1.0, 3000), 0)]
    for _ in range(rng.integers(7, 11)):
        layers.append((tap(rng, N.WOODBLOCK, rng.uniform(500, 900), 0.15, 6000, rng.uniform(0.4, 0.9)), rng.uniform(0.0, 0.35)))
    return room(rng, place(rng, layers, 0.8), rt60=0.4, wet=0.14, size=1.0)


def bolides_thunder(rng):
    # L'orage : le claquement de la foudre, puis le grondement qui roule
    dur = 1.6
    n = int(dur * SR)
    t = np.arange(n) / SR
    crack = butter(noise(rng, int(0.08 * SR)) * np.exp(-np.arange(int(0.08 * SR)) / (0.015 * SR)), "high", 1500)
    rumble = butter(noise(rng, n), "low", 160) * (np.exp(-t / 0.6) * (1 + 0.5 * np.sin(2 * np.pi * 1.7 * t + 1)))
    x = place(rng, [(crack * 0.7, 0), (rumble * 3.0, 0.02)], dur)
    return room(rng, x, rt60=1.2, wet=0.25, size=2.0, damp=2500)


def bolides_trick(rng):
    # Une figure en l'air : un tour qui fend l'air, et un tintement de réussite
    x = place(rng, [(swish(rng, 0.35, (500, 1800), (1800, 6000)) * 0.7, 0), (N.phrase(rng, N.GLOCK, ["G6", "D7"], [0.05], [0.4, 0.5], 0.3, hardness=8000, damp=0.4), 0.3)], 0.6)
    return room(rng, x, rt60=0.3, wet=0.12, size=0.8)


def bolides_turbo(rng):
    # Le turbo : le pot qui pétarade, puis le souffle qui pousse
    layers = [(swish(rng, 0.6, (300, 1200), (1200, 4000)) * 0.9, 0.03)]
    for k in range(3):
        layers.append((thud(rng, rng.uniform(70, 90), 0.12, 1.0, 1500) * 0.6, k * rng.uniform(0.03, 0.05)))
    return room(rng, place(rng, layers, 0.7), rt60=0.3, wet=0.1, size=0.9)


# ---------------------------------------------------------------------------------------------------------------------
# Mèche : les bombes (la mèche qui brûle sur la table, en boucle sans couture ; puis la fin chez qui la tient)

LOOP_S = 2.4


def seamless(x, fade=0.25):
    """Une boucle sans couture : la fin (fondue) se pose sur le début, la longueur finale est LOOP_S"""
    n = int(LOOP_S * SR)
    f = int(fade * SR)
    x = np.asarray(x)[: n + f]
    if len(x) < n + f:
        x = np.pad(x, (0, n + f - len(x)))
    out = x[:n].copy()
    w = np.sin(np.linspace(0, np.pi / 2, f)) ** 2
    out[:f] = x[:f] * w + x[n : n + f] * (1 - w)
    return out


def crackle(rng, dur, rate=40, hi=(2500, 9000), amp=0.5):
    """Des crépitements : de minuscules claquements au hasard (une mèche, des étincelles)"""
    layers = []
    for _ in range(int(dur * rate)):
        layers.append((butter(mallet(rng, 0.0012, 12000, rng.uniform(0.2, 1.0) * amp), "band", hi), rng.uniform(0, dur)))
    return place(rng, layers, dur)


def hiss(rng, dur, band=(2000, 8000), wobble=0.25):
    """Un sifflement de mèche ou de gaz, dont la force ondule un peu"""
    t = t_axis(dur)
    return butter(noise(rng, len(t)), "band", band) * (1 + wobble * np.sin(2 * np.pi * rng.uniform(1.5, 3.5) * t + rng.uniform(0, 6)))


def buzz(rng, dur, f0, wander=0.04):
    """Une abeille : un bourdonnement (les ailes, riches en harmoniques), dont la hauteur et la force vagabondent"""
    t = t_axis(dur)
    f = f0 * (1 + wander * np.sin(2 * np.pi * rng.uniform(0.3, 0.9) * t + rng.uniform(0, 6)) + 0.01 * rng.standard_normal(len(t)).cumsum() / np.sqrt(len(t)))
    ph = 2 * np.pi * np.cumsum(f) / SR
    wings = signal_saw(ph)
    # Les ailes : surtout sous 3 kHz (un filtre plus raide que d'habitude, sinon le bourdonnement devient un grésillement)
    wings = butter(butter(wings, "low", 2800, order=4), "high", f0 * 0.8)
    return wings * (0.6 + 0.4 * np.sin(2 * np.pi * rng.uniform(0.5, 1.5) * t + rng.uniform(0, 6)) ** 2)


def signal_saw(ph):
    return 2 * ((ph / (2 * np.pi)) % 1.0) - 1


def meche_ballon_fuse(rng):
    # Le ballon qui gonfle avec la mèche : la mèche qui siffle, et le caoutchouc qui grince de temps en temps
    d = LOOP_S + 0.25
    layers = [(hiss(rng, d, (2500, 8000)) * 0.25, 0), (crackle(rng, d, 25), 0)]
    for k in range(3):
        t0 = rng.uniform(0.1, d - 0.4)
        tt = t_axis(0.25)
        f = rng.uniform(500, 800) * (1 + 0.15 * tt / 0.25)
        sq = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * tt / 0.25) * 0.25
        layers.append((butter(sq + 0.3 * noise(rng, len(tt)) * np.sin(np.pi * tt / 0.25) * 0.1, "band", (400, 3000)), t0))
    return seamless(place(rng, layers, d))


def meche_ballon_boom(rng):
    # Le ballon éclate : un claquement sec très large, et les lambeaux de caoutchouc qui claquent
    n = int(0.03 * SR)
    pop = butter(noise(rng, n) * np.exp(-np.arange(n) / (0.004 * SR)), "high", 400)
    layers = [(pop * 1.5, 0), (thud(rng, 120, 0.15, 0.4, 3000) * 0.4, 0)]
    for _ in range(3):
        layers.append((butter(mallet(rng, 0.003, 6000, 0.4), "band", (800, 5000)), rng.uniform(0.02, 0.12)))
    return room(rng, place(rng, layers, 0.6), rt60=0.6, wet=0.2, size=1.2)


def meche_neige_fuse(rng):
    # La boule de neige qui grossit : un givre qui crisse doucement, et un souffle froid
    d = LOOP_S + 0.25
    grains = crackle(rng, d, 60, (3000, 9000), 0.25)
    wind = hiss(rng, d, (300, 1500), 0.4) * 0.15
    return seamless(grains + wind)


def meche_neige_boom(rng):
    # Les paquets de neige : un choc mou et crissant, puis la neige qui retombe
    n = int(0.25 * SR)
    crunch = butter(noise(rng, n) * np.exp(-np.arange(n) / (0.05 * SR)) * (0.5 + 0.5 * (rng.random(n) > 0.6)), "band", (600, 6000))
    layers = [(crunch, 0), (thud(rng, 110, 0.3, 0.5, 1500) * 0.6, 0)]
    for _ in range(4):
        n2 = int(0.12 * SR)
        layers.append((butter(noise(rng, n2) * np.exp(-np.arange(n2) / (0.03 * SR)), "band", (1000, 6000)) * rng.uniform(0.2, 0.4), rng.uniform(0.15, 0.9)))
    return room(rng, place(rng, layers, 1.3), rt60=0.4, wet=0.14, size=1.0)


def meche_gateau_fuse(rng):
    # Les bougies qui fondent : de petites flammes qui soufflent, et la cire qui grésille
    d = LOOP_S + 0.25
    t = t_axis(d)
    flame = butter(noise(rng, len(t)), "low", 500) * (0.6 + 0.4 * np.sin(2 * np.pi * 7 * t + rng.uniform(0, 6)) ** 2) * 0.5
    return seamless(flame + crackle(rng, d, 18, (2000, 7000), 0.4))


def meche_gateau_boom(rng):
    # Le gâteau en pleine figure (SPLATCH) : un paquet de crème qui s'écrase, et l'assiette qui tinte
    n = int(0.35 * SR)
    wet = butter(noise(rng, n) * np.exp(-np.arange(n) / (0.06 * SR)), "low", 2200)
    layers = [(wet, 0), (thud(rng, 130, 0.25, 0.4, 900) * 0.6, 0)]
    for _ in range(5):
        layers.append((bubble(rng, rng.uniform(180, 450), 0.012) * 0.3, rng.uniform(0.03, 0.25)))
    plate = modal(rng, 1900, [1, 2.3, 3.9], [0.3, 0.15, 0.08], [1, 0.4, 0.2], 0.6) * 0.15
    layers.append((plate, 0.05))
    return room(rng, place(rng, layers, 1.1), rt60=0.35, wet=0.12, size=0.9)


def meche_reveil_fuse(rng):
    # L'aiguille du réveil qui tourne : un tic-tac mécanique, régulier (huit par tour de boucle)
    d = LOOP_S + 0.25
    layers = []
    for k in range(9):
        f = 3200 if k % 2 == 0 else 2700
        layers.append((tap(rng, N.WOODBLOCK, f, 0.05, 9000, 0.8, 0.6) * 0.6, k * LOOP_S / 8))
    # Le mécanisme qui tourne doucement entre les tics (plus de silence absolu)
    whir = hiss(rng, d, (400, 3000), 0.1) * 0.012
    return seamless(place(rng, layers, d) + whir, fade=0.02)


def meche_reveil_boom(rng):
    # Le réveil sonne (DRIIING) : le petit marteau qui frappe très vite deux cloches de métal
    dur = 1.7
    layers = []
    rate = 22.0
    for k in range(int(1.4 * rate)):
        bell = HANDBELL if k % 2 == 0 else dict(HANDBELL, ratios=[r * 1.06 for r in HANDBELL["ratios"]])
        layers.append((struck(rng, bell, 2600, rng.uniform(0.5, 0.7), 0.3, 9000, damp=0.12) * 0.5, k / rate))
    return room(rng, place(rng, layers, dur), rt60=0.4, wet=0.14, size=0.9)


def meche_ruche_fuse(rng):
    # Les abeilles qui sortent une à une : quelques bourdonnements qui vagabondent
    d = LOOP_S + 0.25
    x = sum(buzz(rng, d, rng.uniform(190, 260)) * rng.uniform(0.15, 0.3) for _ in range(3))
    return seamless(x)


def meche_ruche_boom(rng):
    # L'essaim autour de lui (BZZZ) : beaucoup d'abeilles, qui enflent puis s'éloignent
    dur = 2.0
    t = t_axis(dur)
    x = sum(buzz(rng, dur, rng.uniform(170, 300), 0.06) * rng.uniform(0.1, 0.25) for _ in range(10))
    return room(rng, x * np.minimum(1, t / 0.4) * np.minimum(1, (dur - t) / 0.6), rt60=0.4, wet=0.15, size=1.0)


def meche_fusee_fuse(rng):
    # Le feu d'artifice qui crache des étincelles : un grésillement vif, plein de crépitements
    d = LOOP_S + 0.25
    return seamless(hiss(rng, d, (3000, 10000), 0.3) * 0.3 + crackle(rng, d, 80, (2500, 10000), 0.6))


def meche_fusee_boom(rng):
    # BADABOUM : la fusée qui monte en sifflant, l'explosion, puis les gerbes qui crépitent
    dur = 2.3
    t = t_axis(0.5)
    whistle_up = np.sin(2 * np.pi * np.cumsum(900 + 1800 * t / 0.5) / SR) * np.sin(np.pi * t / 0.5) * 0.15
    layers = [(swish(rng, 0.5, (800, 3000), (3000, 9000)) * 0.4, 0), (whistle_up, 0)]
    layers.append((N.make_big_hit(rng) * 0.9, 0.5))
    layers.append((crackle(rng, 1.4, 60, (2000, 9000), 0.5), 0.75))
    return room(rng, place(rng, layers, dur), rt60=0.8, wet=0.2, size=1.6)


def meche_gaz_fuse(rng):
    # Le gaz qui monte : une fuite qui siffle, et des bulles dans la nappe
    d = LOOP_S + 0.25
    layers = [(hiss(rng, d, (1500, 6000), 0.15) * 0.4, 0)]
    for _ in range(8):
        layers.append((bubble(rng, rng.uniform(150, 400), 0.02) * 0.2, rng.uniform(0, d - 0.1)))
    return seamless(place(rng, layers, d))


def cough(rng):
    """Une toux : un souffle bref, coloré par la gorge (deux résonances), qui s'éteint"""
    n = int(0.22 * SR)
    t = np.arange(n) / SR
    env = np.minimum(1, t / 0.008) * np.exp(-t / 0.06)
    src = noise(rng, n) * env
    f1, f2 = rng.uniform(500, 650), rng.uniform(1200, 1500)
    return butter(src, "band", (f1 * 0.7, f1 * 1.3)) + butter(src, "band", (f2 * 0.8, f2 * 1.2)) * 0.6 + butter(src, "low", 300) * 0.4


def meche_gaz_boom(rng):
    # Le nuage vert qui l'engloutit : une bouffée de gaz, puis « kof, kof »
    layers = [(hiss(rng, 1.2, (500, 5000), 0.2) * np.sin(np.pi * t_axis(1.2) / 1.2) * 0.5, 0)]
    layers.append((cough(rng) * 0.8, 0.9))
    layers.append((cough(rng), 1.25))
    return room(rng, place(rng, layers, 1.8), rt60=0.35, wet=0.12, size=0.8)


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
        "cap-gavel": (cap_gavel, ["cap-gavel.mp3"]),
    },
    "bolides": {
        "bolides-box": (bolides_box, ["bolides-box.mp3"]),
        "bolides-coin": (bolides_coin, ["bolides-coin.mp3"]),
        "bolides-bump": (bolides_bump, ["bolides-bump.mp3"]),
        "bolides-charge": (bolides_charge, ["bolides-charge.mp3"]),
        "bolides-clang": (bolides_clang, ["bolides-clang.mp3"]),
        "bolides-dive": (bolides_dive, ["bolides-dive.mp3"]),
        "bolides-fall": (bolides_fall, ["bolides-fall.mp3"]),
        "bolides-grow": (bolides_grow, ["bolides-grow.mp3"]),
        "bolides-hoop": (bolides_hoop, ["bolides-hoop.mp3"]),
        "bolides-jump": (bolides_jump, ["bolides-jump.mp3"]),
        "bolides-spring": (bolides_spring, ["bolides-spring.mp3"]),
        "bolides-land": (bolides_land, ["bolides-land.mp3"]),
        "bolides-magnet": (bolides_magnet, ["bolides-magnet.mp3"]),
        "bolides-rescue": (bolides_rescue, ["bolides-rescue.mp3"]),
        "bolides-splat": (bolides_splat, ["bolides-splat.mp3"]),
        "bolides-strike": (bolides_strike, ["bolides-strike.mp3"]),
        "bolides-thunder": (bolides_thunder, ["bolides-thunder.mp3"]),
        "bolides-trick": (bolides_trick, ["bolides-trick.mp3"]),
        "bolides-turbo": (bolides_turbo, ["bolides-turbo.mp3"]),
    },
    "meche": {
        "meche-ballon-fuse": (meche_ballon_fuse, ["meche-ballon-fuse.wav"]),
        "meche-ballon-boom": (meche_ballon_boom, ["meche-ballon-boom.mp3"]),
        "meche-neige-fuse": (meche_neige_fuse, ["meche-neige-fuse.wav"]),
        "meche-neige-boom": (meche_neige_boom, ["meche-neige-boom.mp3"]),
        "meche-gateau-fuse": (meche_gateau_fuse, ["meche-gateau-fuse.wav"]),
        "meche-gateau-boom": (meche_gateau_boom, ["meche-gateau-boom.mp3"]),
        "meche-reveil-fuse": (meche_reveil_fuse, ["meche-reveil-fuse.wav"]),
        "meche-reveil-boom": (meche_reveil_boom, ["meche-reveil-boom.mp3"]),
        "meche-ruche-fuse": (meche_ruche_fuse, ["meche-ruche-fuse.wav"]),
        "meche-ruche-boom": (meche_ruche_boom, ["meche-ruche-boom.mp3"]),
        "meche-fusee-fuse": (meche_fusee_fuse, ["meche-fusee-fuse.wav"]),
        "meche-fusee-boom": (meche_fusee_boom, ["meche-fusee-boom.mp3"]),
        "meche-gaz-fuse": (meche_gaz_fuse, ["meche-gaz-fuse.wav"]),
        "meche-gaz-boom": (meche_gaz_boom, ["meche-gaz-boom.mp3"]),
    },
    "crampons": {
        "foot-whistle": (foot_whistle, ["foot-whistle.mp3", "foot-whistle-2.mp3", "foot-whistle-3.mp3"]),
        "foot-whistle-end": (foot_whistle_end, ["foot-whistle-end.mp3"]),
        "foot-post": (foot_post, ["foot-post.mp3", "foot-post-2.mp3"]),
    },
}


# Les durées maximales (s), pour rester proche des anciennes : les animations sont calées dessus
MAX_DUR = {
    "bricks-move": 0.05,
    "bricks-rotate": 0.06,
    "bricks-drop": 0.35,
    "bricks-lock": 0.16,
    "bricks-clear": 0.4,
    "bricks-quad": 0.6,
    "bricks-combo": 0.22,
    "bricks-spin": 0.4,
    "bricks-hold": 0.16,
    "bricks-attack": 0.26,
    "bricks-garbage": 0.22,
    "bricks-warn": 0.2,
    "bricks-ko": 0.6,
    "bricks-count": 0.25,
    "bricks-go": 0.9,
    "uno": 0.95,
    "reverse": 0.32,
    "caught": 0.5,
    "eliminated": 1.8,
    "your-turn": 1.35,
    "naval-sonar": 1.4,
    "naval-bubbles": 3.0,
    "naval-torpedo": 1.9,
    "cap-hop": 0.12,
    "cap-turn": 0.2,
    "cap-jump": 0.3,
    "cap-build": 0.6,
    "cap-build-big": 1.2,
    "cap-auction": 1.3,
    "cap-deal": 0.65,
    "cap-buy": 0.9,
    "cap-bankrupt": 0.9,
    "cap-gavel": 0.4,
    "foot-whistle": 0.5,
    "bolides-box": 0.4,
    "bolides-coin": 0.45,
    "bolides-bump": 0.25,
    "bolides-charge": 0.24,
    "bolides-clang": 1.1,
    "bolides-dive": 0.6,
    "bolides-fall": 1.5,
    "bolides-grow": 1.05,
    "bolides-hoop": 0.45,
    "bolides-jump": 0.42,
    "bolides-spring": 0.55,
    "bolides-land": 0.32,
    "bolides-magnet": 0.75,
    "bolides-rescue": 1.6,
    "bolides-splat": 0.42,
    "bolides-strike": 0.8,
    "bolides-thunder": 1.6,
    "bolides-trick": 0.6,
    "bolides-turbo": 0.75,
    "foot-whistle-end": 1.8,
    "foot-post": 1.2,
}


def build(name, make, files, ref_dir):
    first = os.path.join(ref_dir, files[0])
    # Le volume de l'ancien son, tel qu'on l'entend (ses 50 ms les plus fortes)
    target = N.short_loud(N.decode(first)) if os.path.exists(first) else 0.1
    for k, f in enumerate(files):
        rng = np.random.default_rng(sum(map(ord, name)) * 1000 + k)
        loop = f.endswith(".wav")
        x = make(rng) if loop else N.trim(make(rng), -50, MAX_DUR.get(name))
        x = x * (target / (N.short_loud(x) + 1e-12))
        x = N.limit(x)
        if not loop:
            x = N.floor_noise(rng, x)
            N.write_mp3(x, os.path.join(N.OUT, f))
        else:
            floor = N.pink(rng, int((LOOP_S + 0.25) * SR))
            floor = seamless(floor / (np.std(floor) + 1e-9) * 10 ** (-72 / 20))
            N.write_wav(x + floor, os.path.join(N.OUT, f))
        print(f"{f:<24} {len(x) / SR:5.2f} s")


if __name__ == "__main__":
    ref_dir = os.environ.get("REF_DIR", N.OUT)
    wanted = sys.argv[1:] or list(GAMES)
    for g, sounds in GAMES.items():
        for name, (make, files) in sounds.items():
            if g in wanted or name in wanted:
                build(name, make, files, ref_dir)
