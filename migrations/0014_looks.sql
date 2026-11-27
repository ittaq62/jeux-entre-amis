-- Les apparences choisies (dos de cartes, kart, pion, ballon…), gardées sur le compte pour les retrouver sur chaque
-- appareil. Un petit objet JSON aux clés connues (src/shared/savedLooks.ts), 4 Ko au plus.
-- (0013 est réservé au journal des erreurs.)
CREATE TABLE user_looks (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  looks TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL
);
