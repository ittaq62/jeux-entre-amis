-- L'album : les cartes de chaque joueur, et le mouvement de ses points hors de la boutique (paquets, doubles revendus, familles complétées).
CREATE TABLE user_cards (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  -- Ce que rapporte un double de cette carte
  sell INTEGER NOT NULL DEFAULT 0,
  first_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, card)
);

CREATE TABLE card_progress (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  packs INTEGER NOT NULL DEFAULT 0,
  since_epic INTEGER NOT NULL DEFAULT 0,
  since_legend INTEGER NOT NULL DEFAULT 0
);

-- `reason` est unique pour chaque joueur : une famille complétée ne rapporte qu'une fois
CREATE TABLE point_ledger (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  delta INTEGER NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (user_id, reason)
);
