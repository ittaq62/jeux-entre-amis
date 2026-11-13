# Le catalogue du commentaire de Crampons, à deux voix : le commentateur (c), qui raconte l'action, et le consultant
# (k), ancien joueur, qui l'analyse. Chaque réplique a une intensité : 0 posé, 1 vif, 2 enthousiaste, 3 explosion.
# Les répliques sont des morceaux que le jeu assemble : « La frappe de... » + « Vasseur ! », « Et c'est le but ! » +
# « Vasseur ! » + « Le score est ouvert ! ». Chaque situation a beaucoup de variantes, pour ne pas se répéter.
# On écrit comme on parle à l'antenne : des phrases courtes, celles qu'on entend vraiment pendant un match, jamais une
# tournure écrite ; un mot seul (« Faute. », « Hors-jeu. ») se dit mal, on lui donne toujours un peu de contexte.
import re, unicodedata


def slug(s):
    s = unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


LINES = {}


def add(key, text, who="c", level=1):
    assert key not in LINES, key
    LINES[key] = (text, who, level)


def group(cat, who, level, texts):
    for i, t in enumerate(texts, 1):
        add(f"{cat}-{i}", t, who, level)


# ---------------------------------------------------------------------------------------------------------------------
# Avant le match : l'accueil selon l'heure du match, le temps qu'il fait, l'avis du consultant
# ---------------------------------------------------------------------------------------------------------------------
group("accueil-soir", "c", 0, [
    "Bonsoir à tous, et bienvenue pour ce match.",
    "Bonsoir et bienvenue ! Belle affiche ce soir.",
    "Bonsoir à toutes et à tous, on va passer une belle soirée de football.",
    "Bonsoir ! Le stade est plein, ça promet.",
    "Bonsoir à tous, merci de nous rejoindre pour cette rencontre.",
    "Bonsoir ! L'ambiance est déjà magnifique.",
])
group("accueil-jour", "c", 0, [
    "Bonjour à tous, et bienvenue pour ce match.",
    "Bonjour et bienvenue ! Belle affiche cet après-midi.",
    "Bonjour à toutes et à tous, on va passer un bel après-midi de football.",
    "Bonjour ! Le stade est plein, ça promet.",
    "Bonjour à tous, merci de nous rejoindre pour cette rencontre.",
    "Bonjour ! L'ambiance est déjà magnifique.",
])
# Le temps qu'il fait (le jeu choisit selon le match)
group("meteo-pluie", "c", 0, [
    "Il pleut sur le stade, le ballon va fuser sur cette pelouse mouillée.",
    "La pluie tombe, attention aux glissades.",
])
group("meteo-neige", "c", 0, [
    "Il neige ! Un décor de carte postale pour ce match.",
    "Quelques flocons sur la pelouse, il va falloir s'adapter.",
])
group("meteo-jour", "c", 0, [
    "Un beau soleil sur le stade, des conditions idéales.",
    "Il fait beau, la pelouse est parfaite.",
])
group("meteo-nuit", "c", 0, [
    "Sous les projecteurs, le décor est magnifique.",
    "Une belle soirée sous les projecteurs.",
])
group("avant", "k", 0, [
    "Deux équipes qui aiment avoir le ballon, ça devrait être ouvert.",
    "Il faudra être concentré d'entrée, le premier but va compter.",
    "Tout va se jouer au milieu de terrain, j'en suis sûr.",
    "Attention aux contres, les deux équipes vont vite vers l'avant.",
    "On va voir qui prend le jeu à son compte.",
    "Il faudra de la patience, et du réalisme devant le but.",
    "Je m'attends à un vrai combat, avec beaucoup d'engagement.",
    "L'important, c'est de bien démarrer et de ne pas encaisser.",
])

# ---------------------------------------------------------------------------------------------------------------------
# Les coups d'envoi, les périodes
# ---------------------------------------------------------------------------------------------------------------------
group("envoi", "c", 1, [
    "C'est parti !",
    "Coup d'envoi !",
    "Et c'est parti pour ce match !",
    "L'arbitre siffle, c'est parti !",
    "Le ballon roule, c'est parti !",
    "Et voilà, la rencontre est lancée !",
])
group("reprise", "c", 1, [
    "C'est reparti pour la seconde période !",
    "La deuxième mi-temps est lancée !",
    "Et c'est reparti !",
    "Les joueurs sont de retour, c'est reparti !",
])
group("mitemps", "c", 0, [
    "C'est la mi-temps.",
    "L'arbitre siffle la pause.",
    "Fin de la première période.",
    "Et c'est la pause.",
])
group("mitemps-nul0", "k", 0, [
    "Une première période fermée, il va falloir se libérer après la pause.",
    "Pas de but, mais beaucoup d'intensité. Tout reste à faire.",
])
group("mitemps-nul", "k", 0, [
    "Tout reste à faire, c'est un match très équilibré.",
    "Personne n'a vraiment pris le dessus, la deuxième période va être passionnante.",
])
group("mitemps-court", "k", 0, [
    "Un petit avantage à la pause, mais rien n'est fait.",
    "Ils mènent, mais il reste toute une mi-temps à tenir.",
])
group("mitemps-large", "k", 0, [
    "C'est déjà presque plié à la pause.",
    "Quelle première période ! Ils ont fait le plus dur.",
])
group("mitemps-fou", "k", 1, [
    "Quelle première mi-temps, que d'émotions !",
    "Un match fou, on ne s'ennuie pas une seconde !",
])
group("dix-minutes", "c", 1, [
    "Plus que dix minutes à jouer.",
    "On entre dans les dix dernières minutes.",
    "Il reste dix minutes, tout est encore possible.",
])
group("derniere-minute", "c", 2, [
    "On joue la dernière minute !",
    "Les dernières secondes de ce match !",
    "On est dans le temps additionnel !",
])
group("prolongations", "c", 1, [
    "Fin du temps réglementaire, place aux prolongations !",
    "On n'a pas pu se départager, il y aura des prolongations !",
])
group("tab", "c", 1, [
    "Place à la séance de tirs au but !",
    "Tout va se jouer aux tirs au but !",
])
group("fin", "c", 3, [
    "C'est terminé !",
    "Coup de sifflet final !",
    "L'arbitre siffle la fin du match !",
    "C'est fini !",
])
group("fin-nul", "c", 2, [
    "C'est terminé, match nul !",
    "Coup de sifflet final, les deux équipes se quittent dos à dos !",
    "C'est fini, et personne ne l'emporte !",
])
# Le mot du consultant à la fin, selon le match
group("bilan-large", "k", 1, ["Une victoire nette, rien à redire.", "Ils ont été au-dessus du début à la fin.", "Une démonstration, tout simplement."])
group("bilan-court", "k", 1, ["Ils ont souffert, mais ils l'ont fait.", "Une victoire arrachée, qui vaut cher.", "Ça s'est joué à rien, mais ils l'ont fait."])
group("bilan-remontada", "k", 2, ["Quelle remontée, c'est magnifique !", "Ils étaient menés, et ils renversent tout. Chapeau !"])
group("bilan-tard", "k", 2, ["Arraché au bout du suspense !", "Ils y ont cru jusqu'au bout, et ils ont eu raison !"])
group("bilan-nul0", "k", 0, ["Pas de but, mais un vrai combat.", "Les défenses ont pris le dessus aujourd'hui."])
group("bilan-nul", "k", 0, ["Un nul qui ne satisfait personne.", "Un match nul plutôt logique.", "Chacun repart avec un point."])
group("bilan-fou", "k", 1, ["Un match fou, bravo aux deux équipes pour le spectacle !", "Quel spectacle ! On en redemande."])

# ---------------------------------------------------------------------------------------------------------------------
# Le jeu : la construction, les temps calmes
# ---------------------------------------------------------------------------------------------------------------------
group("construction", "c", 0, [
    "Ils font tourner.",
    "On fait circuler le ballon.",
    "Patience dans la construction.",
    "On cherche l'ouverture.",
    "Le jeu se pose un peu.",
    "Ils prennent leur temps.",
    "Le ballon change de côté.",
    "Bonne conservation du ballon.",
    "Ils cherchent la faille.",
    "Ils construisent patiemment.",
])
# Le consultant, quand rien ne se passe
group("analyse", "k", 0, [
    "Il faut plus de mouvement devant, c'est trop statique.",
    "Il faut écarter le jeu, l'axe est bouché.",
    "Le bloc défensif est bien en place.",
    "Ça manque un peu de vitesse dans les transmissions.",
    "Personne ne veut prendre de risque pour l'instant.",
    "Attention à la perte de balle au milieu, ça peut coûter cher.",
    "Le pressing est bien coordonné.",
    "C'est un match très tactique.",
    "Il faut tenter quelque chose. Une frappe de loin, pourquoi pas.",
    "Les latéraux montent beaucoup, il y a de l'espace dans leur dos.",
    "Il faut être plus juste dans la dernière passe.",
    "C'est intense, ça court beaucoup.",
    "Les deux équipes se neutralisent.",
    "Il manque un peu de folie devant.",
])
group("analyse-mene", "k", 0, [
    "Ils gèrent bien leur avantage.",
    "Ils n'ont pas besoin de se précipiter.",
    "Ils font tourner, et le temps passe.",
])
group("analyse-court", "k", 0, [
    "Attention, un but d'écart, ce n'est jamais suffisant.",
    "Le match n'est pas plié, loin de là.",
])
group("analyse-presse", "k", 1, [
    "Il faut prendre plus de risques maintenant.",
    "Il faut accélérer, le temps passe.",
    "Ils doivent pousser, il reste peu de temps.",
])
group("analyse-nul-tard", "k", 0, [
    "Personne ne veut perdre ce match.",
    "Le prochain but sera sans doute décisif.",
])

# ---------------------------------------------------------------------------------------------------------------------
# Les passes et les gestes
# ---------------------------------------------------------------------------------------------------------------------
group("profondeur", "c", 1, [
    "Ballon en profondeur !",
    "Il lance dans la course !",
    "Attention, dans la profondeur !",
    "Il trouve l'appel !",
    "Ouverture dans le dos de la défense !",
    "Bien vu, en profondeur !",
])
group("centre", "c", 1, [
    "Le centre !",
    "Il centre !",
    "Ballon dans la surface !",
    "Centre au deuxième poteau !",
    "Attention, le centre !",
    "Le centre est envoyé !",
])
group("long", "c", 1, [
    "Long ballon !",
    "Il renverse le jeu !",
    "Grand ballon vers l'avant !",
    "Changement d'aile !",
])
group("dribble", "c", 2, [
    "Joli crochet !",
    "Il l'élimine !",
    "Quel geste !",
    "Il passe en force !",
    "Il le laisse sur place !",
    "Superbe dribble !",
])
group("tacle", "c", 1, [
    "Bien taclé !",
    "Ballon récupéré !",
    "Tacle propre !",
    "Il récupère le ballon !",
    "Belle interception !",
    "Bien vu en défense !",
])

# ---------------------------------------------------------------------------------------------------------------------
# Les frappes et ce qui s'ensuit
# ---------------------------------------------------------------------------------------------------------------------
group("frappe", "c", 2, [
    "La frappe !",
    "Il tente sa chance !",
    "Il déclenche !",
    "Il arme !",
    "Oh, la frappe !",
    "Il frappe !",
    "Il tire !",
    "Attention, la frappe !",
])
# Suivies du nom du tireur
group("frappe-de", "c", 2, [
    "La frappe de...",
    "Et la frappe de...",
    "Oh, la frappe de...",
])
group("frappe-loin", "c", 2, [
    "De loin !",
    "Il tente de loin !",
    "Une frappe lointaine !",
    "Il essaie de très loin !",
])
group("frappe-forte", "c", 2, [
    "Quelle frappe !",
    "Une frappe énorme !",
    "Une frappe terrible !",
    "Il frappe fort !",
])
group("cote", "c", 1, [
    "C'est à côté !",
    "Ça passe à côté !",
    "Pas cadré !",
    "Juste à côté du poteau !",
    "Ça file à côté !",
    "Trop croisé !",
    "Ça passe au-dessus !",
    "Bien au-dessus !",
])
group("cote-avis", "k", 0, [
    "Il pouvait mieux faire, il était bien placé.",
    "Il fallait cadrer, c'était l'occasion.",
    "Trop de précipitation sur ce coup.",
    "Il se dépêche trop, il avait le temps.",
    "C'est dommage, l'action était bien construite.",
    "Il a voulu mettre trop de force, c'est dommage !",
    "Il faut cadrer ces frappes-là.",
    "Il y avait mieux à faire, un partenaire était démarqué.",
])
group("capte", "c", 0, [
    "Bien capté par le gardien.",
    "Le gardien s'en saisit.",
    "Pas de problème pour le gardien.",
    "Dans les gants du gardien.",
    "Le gardien est bien placé.",
    "Un arrêt facile pour le gardien.",
])
group("parade", "c", 3, [
    "Quel arrêt !",
    "Superbe parade !",
    "Le gardien sort le grand jeu !",
    "Il la sort !",
    "Quelle détente !",
    "Le gardien s'interpose !",
    "Exceptionnel, le gardien !",
    "Il détourne !",
])
group("parade-avis", "k", 1, [
    "Énorme réflexe du gardien.",
    "Ah, le gardien sauve son équipe !",
    "Ça, c'est un arrêt décisif.",
    "Il a été très vif sur sa ligne.",
    "Il a bien fermé l'angle.",
    "Superbe détente, rien à dire.",
])
group("gardien-feu", "k", 2, [
    "Le gardien est impérial aujourd'hui !",
    "Il est infranchissable aujourd'hui.",
    "Quel match du gardien, il écœure les attaquants !",
])
group("poteau", "c", 3, [
    "Sur le poteau !",
    "Le poteau ! C'était tout près !",
    "Il trouve le poteau !",
    "Le montant ! Pas de chance !",
    "Oh, le poteau !",
])
group("barre", "c", 3, [
    "Sur la barre !",
    "La transversale ! Quelle occasion !",
    "La barre ! Le gardien était battu !",
    "Il trouve la barre !",
    "Oh, la transversale !",
])
group("montant-avis", "k", 1, [
    "C'était à quelques centimètres.",
    "Il n'a vraiment pas de chance.",
    "Le gardien était battu, quelle frayeur !",
    "Ça s'est joué à rien.",
])

# ---------------------------------------------------------------------------------------------------------------------
# Le but : un cri, le nom du buteur, puis ce que ce but change
# ---------------------------------------------------------------------------------------------------------------------
group("but", "c", 3, [
    "But ! Il y a but !",
    "Et c'est le but !",
    "Il l'a fait !",
    "C'est au fond !",
    "Le ballon est au fond des filets !",
    "Et ça rentre !",
    "Et le but !",
    "Et c'est dedans !",
    "Il marque !",
    "Mais quel but !",
    "Oh le but !",
    "Il trompe le gardien !",
])
group("but-ouverture", "c", 3, [
    "Et c'est l'ouverture du score !",
    "Le premier but du match !",
    "Le score est ouvert !",
    "Ça y est, le verrou a sauté !",
])
group("but-egalisation", "c", 3, [
    "Égalisation !",
    "Ils reviennent au score !",
    "Tout est à refaire !",
    "Le match est relancé !",
    "On repart de zéro !",
])
group("but-devant", "c", 3, [
    "Ils passent devant !",
    "Ils prennent l'avantage !",
    "Le match a basculé !",
    "Et ils mènent !",
])
group("but-ecart", "c", 3, [
    "Ils creusent l'écart !",
    "C'est le break !",
    "Ça commence à faire beaucoup !",
    "Ils font le trou !",
])
group("but-reduit", "c", 3, [
    "Ils réduisent l'écart !",
    "Ils reviennent à un but !",
    "Il y a encore de l'espoir !",
    "Le match n'est pas fini !",
])
group("but-tard", "c", 3, [
    "À la dernière minute !",
    "Dans les ultimes instants !",
    "Au bout du suspense !",
    "Dans le temps additionnel !",
])
group("but-double", "c", 3, ["Il s'offre un doublé !", "Et de deux pour lui !", "Deuxième but pour lui !"])
group("but-triple", "c", 3, ["Le triplé !", "Un triplé, le coup du chapeau !", "Et de trois pour lui !"])
group("but-festival", "c", 3, ["C'est un festival !", "Une démonstration !"])
group("but-penalty", "c", 3, ["Le penalty est transformé !", "Il ne tremble pas, transformé !", "Pas d'erreur, il transforme !"])
group("csc", "c", 3, [
    "Contre son camp !",
    "Oh non, il trompe son propre gardien !",
    "Le malheureux, contre son camp !",
    "Quelle malchance, but contre son camp !",
])
# La passe décisive : suivie du nom du passeur
group("passeur", "c", 2, ["Sur une passe de...", "Bien servi par...", "Et quelle passe de..."])
group("but-avis", "k", 2, [
    "Quelle finition, rien à dire.",
    "Le gardien ne pouvait rien.",
    "Superbe mouvement collectif.",
    "Il a été clinique devant le but.",
    "Il l'a placée parfaitement.",
    "Il a pris sa chance... et il a eu raison !",
    "La défense a été trop passive sur ce coup.",
    "C'est le fruit d'une belle pression.",
    "Il a gardé son sang-froid, chapeau.",
    "Magnifique ! Ça, c'est du grand art.",
    "Ils l'ont bien mérité, ce but.",
    "On l'attendait, ce but.",
])
group("csc-avis", "k", 0, [
    "Il voulait bien faire, mais il trompe son gardien.",
    "C'est cruel pour lui.",
    "Le ballon lui a échappé, ce sont des choses qui arrivent.",
])

# ---------------------------------------------------------------------------------------------------------------------
# L'arbitre
# ---------------------------------------------------------------------------------------------------------------------
group("faute", "c", 1, [
    "Coup de sifflet, il y a faute.",
    "L'arbitre siffle la faute.",
    "Il y a faute, l'arbitre arrête le jeu.",
    "Il l'a accroché.",
    "Faute, coup franc.",
    "Il est fauché !",
])
group("faute-glisse", "c", 1, [
    "Tacle glissé, mais il n'a pas touché le ballon.",
    "Il arrive en glissade, et c'est faute.",
    "Tacle glissé en retard, l'arbitre siffle.",
    "Il se jette, mais il prend le joueur.",
])
group("faute-derriere", "c", 2, [
    "Tacle par derrière, l'arbitre siffle tout de suite !",
    "Il le fauche par derrière !",
    "Par derrière, c'est dangereux, ça !",
    "Il arrive par derrière, il n'avait aucune chance de jouer le ballon !",
])
group("faute-charge", "c", 1, [
    "Il le pousse dans le dos, faute.",
    "Charge dans le dos, l'arbitre siffle.",
    "Il le bouscule par derrière, coup franc.",
    "Il y va avec l'épaule dans le dos, c'est sifflé.",
])
group("faute-dernier", "c", 2, [
    "Il le fait tomber alors qu'il filait au but !",
    "Le dernier défenseur le stoppe en faute !",
    "Il était seul face au but, et il est fauché !",
])
group("faute-avis", "k", 0, [
    "Il arrive trop tard.",
    "Il pouvait l'éviter, celle-là.",
    "Il casse le rythme, c'est malin.",
    "Faute intelligente, il stoppe l'action.",
    "Il y va un peu fort.",
    "Il n'avait pas vraiment le choix.",
])
group("coup-franc", "c", 2, [
    "Coup franc très bien placé !",
    "Attention, coup franc dangereux !",
    "Belle position pour frapper !",
    "Coup franc à l'entrée de la surface !",
])
group("penalty", "c", 3, [
    "Penalty !",
    "Penalty ! L'arbitre désigne le point !",
    "Il y a penalty !",
    "Faute dans la surface, penalty !",
    "L'arbitre n'hésite pas, penalty !",
])
group("penalty-avis", "k", 1, [
    "On ne peut pas faire ça dans la surface.",
    "C'est logique, il le fauche.",
    "Pas de discussion possible.",
    "Quelle erreur du défenseur !",
])
# Le carton jaune : suivi du nom du joueur
group("jaune", "c", 1, ["Carton jaune pour...", "Avertissement pour...", "L'arbitre sort le jaune pour..."])
group("rouge", "c", 3, [
    "Carton rouge !",
    "Rouge ! Il est expulsé !",
    "Expulsion !",
    "Il doit quitter le terrain !",
])
group("rouge-avis", "k", 1, [
    "Ça va peser lourd dans ce match.",
    "Son équipe va devoir jouer à dix.",
    "Il laisse ses partenaires dans l'embarras.",
])
group("horsjeu", "c", 0, [
    "Il est hors-jeu.",
    "Le drapeau se lève, hors-jeu.",
    "Il est parti trop tôt.",
    "Position de hors-jeu.",
    "Hors-jeu, de peu.",
])
group("corner", "c", 1, [
    "Ce sera un corner.",
    "Corner à jouer.",
    "Il obtient un corner.",
    "Il y a corner.",
])

# ---------------------------------------------------------------------------------------------------------------------
# Les tirs au but
# ---------------------------------------------------------------------------------------------------------------------
group("tab-marque", "c", 2, ["Marqué !", "Dans le but !", "Il ne tremble pas !", "Transformé !", "Plein de sang-froid !", "Le gardien est battu !"])
group("tab-rate", "c", 3, ["C'est manqué !", "Arrêté !", "Il a raté !", "Le gardien l'arrête !", "C'est à côté !", "Quelle tension, il le manque !"])

# ---------------------------------------------------------------------------------------------------------------------
# Le score : « deux à un » suivi de l'équipe qui mène, « un partout »
# ---------------------------------------------------------------------------------------------------------------------
WORDS = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf"]
for hi in range(10):
    for lo in range(hi + 1):
        if hi == lo:
            add(f"score-{hi}-{lo}", "Zéro à zéro." if hi == 0 else f"{WORDS[hi].capitalize()} partout.", "c", 0)
        else:
            # « Six à un » se dit mal (on n'entend plus le chiffre) : « six buts à un », comme à l'antenne
            add(f"score-{hi}-{lo}", "Six buts à un..." if (hi, lo) == (6, 1) else f"{WORDS[hi].capitalize()} à {WORDS[lo]}...", "c", 0)

# ---------------------------------------------------------------------------------------------------------------------
# Les joueurs : leur nom dit de trois façons (en passant, dans l'action, sur un but)
# ---------------------------------------------------------------------------------------------------------------------
SURNAMES = ['Pichon', 'Vasseur', 'Lemoine', 'Barbier', 'Chauvin', 'Tessier', 'Ragot', 'Poulain', 'Bouvier', 'Gaillard', 'Renaud',
            'Marchand', 'Perrot', 'Maillard', 'Besson', 'Hamon', 'Prévost', 'Collin', 'Jacquet', 'Delorme', 'Charpentier', 'Garnier',
            'Picard', 'Dufour', 'Morvan', 'Tanguy', 'Le Goff', 'Ferrand', 'Dumas', 'Joly', 'Rigaud', 'Sauvage', 'Cordier', 'Blanchet',
            'Thibaud', 'Roussel', 'Lacombe', 'Pasquier', 'Lambert', 'Noiret', 'Grangier', 'Fournel', 'Sénéchal', 'Berthier', 'Courtin',
            'Aubry', 'Mazet', 'Vidal']
for n in SURNAMES:
    s = slug(n)
    add(f"nom-{s}", f"{n}.", "c", 0)
    add(f"nom-{s}-vif", f"{n} !", "c", 2)
    add(f"nom-{s}-but", f"{n} !", "c", 3)

# ---------------------------------------------------------------------------------------------------------------------
# Les clubs : la présentation, le score, la victoire
# ---------------------------------------------------------------------------------------------------------------------
# Le nom tel qu'on le dit avec son article (les sigles écrits comme ils se prononcent)
CLUBS = {
    "AS Saint-Ballon": "l'A.S. Saint-Ballon",
    "Olympique de Haute-Combe": "l'Olympique de Haute-Combe",
    "Les Forges FC": "les Forges",
    "FC Port-Salé": "le F.C. Port-Salé",
    "Racing Mont-Bidule": "le Racing Mont-Bidule",
    "Stade Clairmarais": "le Stade Clairmarais",
    "US Trois-Clochers": "l'U.S. Trois-Clochers",
    "Entente Vieux-Moulin": "l'Entente Vieux-Moulin",
    "JS Belle-Rive": "la J.S. Belle-Rive",
    "Union Grand-Pré": "l'Union Grand-Pré",
    "AC Sainte-Marmite": "l'A.C. Sainte-Marmite",
    "Roche-Noire AC": "Roche-Noire",
    "CS Val-Joli": "le C.S. Val-Joli",
    "FC Moules-Frites": "le F.C. Moules-Frites",
    "Amicale du Comptoir": "l'Amicale du Comptoir",
    "Vétérans du Dimanche": "les Vétérans du Dimanche",
}


def de(art):
    """« de » devant le nom avec son article : du, de la, de l', des"""
    if art.startswith("le "):
        return "du " + art[3:]
    if art.startswith("les "):
        return "des " + art[4:]
    return "de " + art


def cap(s):
    return s[0].upper() + s[1:]


for club, art in CLUBS.items():
    s = slug(club)
    add(f"club-{s}-cote1", f"D'un côté, {art}...", "c", 0)
    add(f"club-{s}-cote2", f"de l'autre, {art} !", "c", 1)
    add(f"club-{s}-pour", f"pour {art}.", "c", 0)
    add(f"club-{s}-victoire", f"Victoire {de(art)} !", "c", 3)
    add(f"club-{s}-devant", f"{cap(art)} passe devant !" if not art.startswith("les ") else f"{cap(art)} passent devant !", "c", 3)

if __name__ == "__main__":
    from collections import Counter
    print(len(LINES), "répliques")
    print(Counter(w for _, w, _ in LINES.values()))
    print(Counter(l for _, _, l in LINES.values()))
