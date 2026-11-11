# Les deux voix du commentaire. Elles ont été dessinées par Qwen3-TTS (casting.py : une description en mots, plusieurs
# essais, on garde le meilleur), puis toutes les répliques les clonent : la même personne d'un bout à l'autre du match.
# Le commentateur a deux références, posée et survoltée (pour les buts, les arrêts, les grosses occasions).

VOICE = {
    "c": "A French man in his forties with a deep, warm baritone voice, a professional TV football commentator. Rich, "
         "resonant low voice, crisp diction, native standard French accent from France, no foreign accent.",
    "k": "A French man in his fifties with a low, slightly husky voice, a former professional footballer now a TV pundit. "
         "Relaxed, thoughtful delivery, native standard French accent from France, no foreign accent.",
}

# Les références retenues au casting : le fichier et ce qu'il dit
REFS = {
    "c0": ("c0-4.flac", "Bonsoir à tous. On joue la soixantième minute, le score est toujours de un partout, et ce match reste "
                       "très ouvert. Les deux équipes se cherchent, on attend la petite étincelle."),
    "c3": ("c3-0.flac", "But ! But ! Mais quel but ! Il l'a mise en pleine lucarne, le gardien n'a rien pu faire ! C'est extraordinaire !"),
    "k0": ("k0-3.flac", "Je trouve que les deux équipes se neutralisent. Il manque un peu de mouvement devant, et surtout de la "
                       "vitesse dans les transmissions. Il faudra prendre plus de risques."),
}

# Ce que la voix lirait mal : on l'écrit comme ça se dit
FIX = {
    # Les sigles des clubs, lettre par lettre
    "l'A.S.": "l'a-èsse", "le F.C.": "le èf-cé", "du F.C.": "du èf-cé", "l'U.S.": "l'u-èsse", "la J.S.": "la ji-èsse",
    "l'A.C.": "l'a-cé", "le C.S.": "le cé-èsse", "du C.S.": "du cé-èsse",
    "L'A.S.": "L'a-èsse", "Le F.C.": "Le èf-cé", "L'U.S.": "L'u-èsse", "La J.S.": "La ji-èsse", "L'A.C.": "L'a-cé", "Le C.S.": "Le cé-èsse",
    # « Le Goff » se dit « le gof »
    "Le Goff": "Le Gof",
}


def say(text):
    for a, b in FIX.items():
        text = text.replace(a, b)
    return text
