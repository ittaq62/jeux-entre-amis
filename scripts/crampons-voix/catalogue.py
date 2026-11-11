# Le catalogue du commentateur : chaque réplique, son texte et son ton.
# Ton : "calme" (posé), "vif" (dans l'action), "fort" (but, penalty, carton rouge : plus haut, plus vite, plus fort).
import re, unicodedata

def slug(s):
    s = unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")

LINES = {}
def add(key, text, tone="vif"):
    assert key not in LINES, key
    LINES[key] = (text, tone)

# L'accueil et le coup d'envoi
add("accueil-1", "Bonsoir à tous, et bienvenue au stade pour ce grand match !", "calme")
add("accueil-2", "Bienvenue ! L'ambiance est électrique, le coup d'envoi approche.", "calme")
add("accueil-3", "Bonsoir ! Les deux équipes sont prêtes, ça promet un beau match.", "calme")
add("envoi-1", "C'est parti !")
add("envoi-2", "Coup d'envoi !")
add("envoi-3", "Et le match commence !")

# Le but : un cri, puis le nom du buteur
add("but-1", "Le ballon est au fond des filets !", "fort")
add("but-2", "Et c'est le but !", "fort")
add("but-3", "Il l'a fait !", "fort")
add("but-4", "Quelle réalisation !", "fort")
add("but-5", "Ça fait trembler les filets !", "fort")
add("csc-1", "Oh non ! Contre son camp !", "fort")
add("csc-2", "Il trompe son propre gardien !", "fort")

# Les frappes, les arrêts, les montants
add("frappe-1", "La frappe !")
add("frappe-2", "Il tente sa chance !")
add("frappe-3", "Il déclenche !")
add("frappe-forte-1", "Quelle frappe !", "fort")
add("frappe-forte-2", "Une frappe terrible !", "fort")
add("capte-1", "Bien capté par le gardien.", "calme")
add("capte-2", "Le gardien s'en saisit.", "calme")
add("capte-3", "Sans difficulté pour le gardien.", "calme")
add("parade-1", "Quel arrêt du gardien !", "fort")
add("parade-2", "Superbe parade du gardien !", "fort")
add("parade-3", "Le gardien sort le grand jeu !", "fort")
add("poteau-1", "Sur le poteau !", "fort")
add("poteau-2", "Le poteau ! C'était tout près !", "fort")
add("barre-1", "Sur la barre !", "fort")
add("barre-2", "La transversale ! Quelle occasion !", "fort")

# L'arbitre
add("faute-1", "Coup de sifflet, il y a faute.", "calme")
add("faute-2", "L'arbitre siffle une faute.", "calme")
add("faute-3", "Faute !")
add("penalty-1", "Penalty ! L'arbitre désigne le point de penalty !", "fort")
add("penalty-2", "Penalty ! Il y a faute dans la surface !", "fort")
add("jaune-1", "Carton jaune.", "calme")
add("jaune-2", "L'arbitre sort le carton jaune.", "calme")
add("rouge-1", "Carton rouge ! Il est expulsé !", "fort")
add("rouge-2", "Rouge ! Il doit quitter le terrain !", "fort")
add("horsjeu-1", "Hors-jeu.", "calme")
add("horsjeu-2", "Le drapeau se lève : hors-jeu.", "calme")
add("corner-1", "Cornère à jouer.", "calme")
add("corner-2", "Ce sera un cornère.", "calme")

# Le jeu
add("tacle-1", "Beau tacle !")
add("tacle-2", "Ballon récupéré !")
add("centre-1", "Le centre...")
add("centre-2", "Il centre...")
add("profondeur-1", "Ballon en profondeur...")
add("profondeur-2", "Il lance en profondeur...")
add("crochet-1", "Joli crochet !")
add("crochet-2", "Il élimine son adversaire !")
add("passe-1", "Ça fait tourner.", "calme")
add("passe-2", "Belle circulation du ballon.", "calme")

# Les périodes, la fin, les tirs au but
add("mitemps", "C'est la mi-temps !", "calme")
add("prolongations", "Fin du temps réglementaire ! Place aux prolongations !", "vif")
add("tab", "Place à la séance de tirs au but !", "vif")
add("fin", "C'est terminé !", "fort")
add("fin-nul", "C'est terminé ! Match nul !", "vif")
add("tab-marque-1", "Marqué !", "fort")
add("tab-marque-2", "Dans le but !", "fort")
add("tab-marque-3", "Il ne tremble pas !", "fort")
add("tab-rate-1", "C'est manqué !", "fort")
add("tab-rate-2", "Arrêté !", "fort")
add("tab-rate-3", "Il a raté !", "fort")

# Le score : « deux à un », « un partout »
WORDS = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf"]
for hi in range(10):
    for lo in range(hi + 1):
        if hi == lo:
            add(f"score-{hi}-{lo}", "Zéro à zéro." if hi == 0 else f"{WORDS[hi].capitalize()} partout.", "calme")
        else:
            add(f"score-{hi}-{lo}", f"{WORDS[hi].capitalize()} à {WORDS[lo]}", "calme")

# Les joueurs : leur nom, lancé avec élan après un cri de but
SURNAMES = ['Pichon', 'Vasseur', 'Lemoine', 'Barbier', 'Chauvin', 'Tessier', 'Ragot', 'Poulain', 'Bouvier', 'Gaillard', 'Renaud',
            'Marchand', 'Perrot', 'Maillard', 'Besson', 'Hamon', 'Prévost', 'Collin', 'Jacquet', 'Delorme', 'Charpentier', 'Guillot',
            'Picard', 'Dufour', 'Morvan', 'Tanguy', 'Le Goff', 'Ferrand', 'Dumas', 'Joly', 'Rigaud', 'Sauvage', 'Cordier', 'Blanchet',
            'Thibaud', 'Roussel', 'Lacombe', 'Pasquier', 'Lambert', 'Noiret', 'Grangier', 'Fournel', 'Sénéchal', 'Berthier', 'Courtin',
            'Aubry', 'Mazet', 'Vidal']
# Comment la voix doit les écrire pour bien les dire (elle lirait « Joly » à l'anglaise)
SAID = {"Joly": "Joli"}
for n in SURNAMES:
    add(f"nom-{slug(n)}", f"{SAID.get(n, n)} !", "fort")

# Les clubs : comment on les dit, avec leur article
CLUBS = {
    # Le nom tel qu'on le dit après « pour » et dans « Victoire de… » ; les sigles écrits comme ils se prononcent
    "AS Saint-Ballon": ("Victoire de l'a-èsse Saint-Ballon !", "pour l'a-èsse Saint-Ballon."),
    "Olympique de Haute-Combe": ("Victoire de l'Olympique de Haute-Combe !", "pour l'Olympique de Haute-Combe."),
    "Les Forges FC": ("Victoire des Forges !", "pour Les Forges."),
    "FC Port-Salé": ("Victoire du èf-cé Port-Salé !", "pour le èf-cé Port-Salé."),
    "Racing Mont-Bidule": ("Victoire du Rassinng Mont-Bidule !", "pour le Rassinng Mont-Bidule."),
    "Stade Clairmarais": ("Victoire du Stade Clairmarais !", "pour le Stade Clairmarais."),
    "US Trois-Clochers": ("Victoire de l'u-èsse Trois-Clochers !", "pour l'u-èsse Trois-Clochers."),
    "Entente Vieux-Moulin": ("Victoire de l'Entente Vieux-Moulin !", "pour l'Entente Vieux-Moulin."),
    "JS Belle-Rive": ("Victoire de la ji èsse Belle-Rive !", "pour la ji èsse Belle-Rive."),
    "Union Grand-Pré": ("Victoire de l'Union Grand-Pré !", "pour l'Union Grand-Pré."),
    "AC Sainte-Marmite": ("Victoire de l'a-cé Sainte-Marmite !", "pour l'a-cé Sainte-Marmite."),
    "Roche-Noire AC": ("Victoire de Roche-Noire !", "pour Roche-Noire."),
    "CS Val-Joli": ("Victoire du cé-èsse Val-Joli !", "pour le cé-èsse Val-Joli."),
    "FC Moules-Frites": ("Victoire du èf-cé Moules-Frites !", "pour le èf-cé Moules-Frites."),
    "Amicale du Comptoir": ("Victoire de l'Amicale du Comptoir !", "pour l'Amicale du Comptoir."),
    "Vétérans du Dimanche": ("Victoire des Vétérans du Dimanche !", "pour les Vétérans du Dimanche."),
}
for club, (victoire, pour) in CLUBS.items():
    s = slug(club)
    add(f"club-{s}-pour", pour, "calme")
    add(f"club-{s}-victoire", victoire, "fort")
