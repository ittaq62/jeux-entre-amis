# Les deux voix du commentaire. Elles ont été dessinées par Qwen3-TTS (casting.py : une description en mots, plusieurs
# essais, on garde le meilleur), puis toutes les répliques les clonent : la même personne d'un bout à l'autre du match.
# Le commentateur a deux références, posée et survoltée (pour les buts, les arrêts, les grosses occasions). La survoltée
# est un clone de la posée à qui l'on fait crier un but : c'est la même voix qui s'emballe (l'ancienne, dessinée à part,
# montait à plus de 300 Hz et ne ressemblait pas plus au commentateur que le consultant : deux personnes dans une phrase).

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
    "c3": ("c3-clone.flac", "Attention, attention ! Il est seul ! Il frappe ! Et c'est au fond ! Quel but !"),
    "k0": ("k0-3.flac", "Je trouve que les deux équipes se neutralisent. Il manque un peu de mouvement devant, et surtout de la "
                       "vitesse dans les transmissions. Il faudra prendre plus de risques."),
    # Le consultant vif (references.py) : clone de la voix posée qui s'enthousiasme. Cloner la posée donnait des avis dits
    # presque sur une seule note ; celle-ci, même voix et même hauteur, vit davantage
    "k1": ("k1-vive.flac", "Ah, ça, c'est très bien joué ! Il prend l'espace, il lève la tête, et il trouve le bon partenaire. "
                          "Magnifique !"),
}

# Ce que la voix lirait mal : on l'écrit comme ça se dit
FIX = {
    # Les sigles des clubs, lettre par lettre
    "l'A.S.": "l'a-èsse", "le F.C.": "le èf-cé", "du F.C.": "du èf-cé", "l'U.S.": "l'u-èsse", "la J.S.": "la ji-èsse",
    "l'A.C.": "l'a-cé", "le C.S.": "le cé-èsse", "du C.S.": "du cé-èsse",
    "L'A.S.": "L'a-èsse", "Le F.C.": "Le èf-cé", "L'U.S.": "L'u-èsse", "La J.S.": "La ji-èsse", "L'A.C.": "L'a-cé", "Le C.S.": "Le cé-èsse",
    # « Le Goff » se dit « le gof »
    "Le Goff": "Le Gof",
    # Les noms que la voix écorchait (vérifié à la reconnaissance vocale, plusieurs graphies essayées)
    "Tessier": "Tessié", "Tanguy": "Tan-gui", "Pasquier": "Paskié", "Courtin": "Kour-tain",
    "Jacquet": "Jaké", "Mazet": "Mazé", "Perrot": "Pérot", "Delorme": "De-lorme",
}


def say(text):
    for a, b in FIX.items():
        text = text.replace(a, b)
    return text
