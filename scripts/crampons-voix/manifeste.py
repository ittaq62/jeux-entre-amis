# Écrit src/client/crampons/voixLignes.ts : le nombre de variantes de chaque réplique du commentaire
import io, json, os, re, sys
from collections import OrderedDict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from repliques import LINES

REPO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
counts = OrderedDict()
for key in LINES:
    if key.startswith(("nom-", "club-", "score-")):
        continue
    m = re.fullmatch(r"(.+)-(\d+)", key)
    assert m, key
    cat, n = m.group(1), int(m.group(2))
    counts[cat] = max(counts.get(cat, 0), n)
    assert n == counts[cat], key
# Comme Prettier les écrit : sans guillemets quand le nom s'en passe
body = "\n".join(f'  {c if re.fullmatch(r"[a-z]+", c) else json.dumps(c)}: {n},' for c, n in counts.items())
out = (
    "// Généré par scripts/crampons-voix (manifeste.py) depuis le catalogue : ne pas modifier à la main.\n"
    "// Le nombre de variantes enregistrées de chaque réplique du commentaire (fichiers public/sounds/commentaire/<réplique>-<n>.mp3).\n"
    "export const VOIX: Record<string, number> = {\n" + body + "\n};\n"
)
io.open(os.path.join(REPO, "src/client/crampons/voixLignes.ts"), "w", encoding="utf-8", newline="\n").write(out)
print(len(counts), "répliques,", sum(counts.values()), "variantes")
