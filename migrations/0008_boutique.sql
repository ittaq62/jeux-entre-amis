-- La boutique : ce que chaque joueur possède parmi les thèmes, pions, véhicules et skins.
-- Ses points à dépenser se calculent (le total gagné dans les jeux moins le prix de ses achats) : acheter n'enlève rien au classement.
CREATE TABLE user_items (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item TEXT NOT NULL,
  price INTEGER NOT NULL DEFAULT 0,
  bought_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, item)
);

-- Ce que l'ancien système, à la victoire, avait déjà débloqué reste acquis et ne coûte rien.
-- Les seuils sont ceux de l'ancien système : ils ne servent plus qu'ici.
INSERT OR IGNORE INTO user_items (user_id, item, price, bought_at) SELECT user_id, 'naval:jouet', 0, CAST(strftime('%s', 'now') AS INTEGER) * 1000 FROM user_stats WHERE game = 'naval' AND won >= 1;
INSERT OR IGNORE INTO user_items (user_id, item, price, bought_at) SELECT user_id, 'naval:pirate', 0, CAST(strftime('%s', 'now') AS INTEGER) * 1000 FROM user_stats WHERE game = 'naval' AND won >= 3;
INSERT OR IGNORE INTO user_items (user_id, item, price, bought_at) SELECT user_id, 'naval:camo', 0, CAST(strftime('%s', 'now') AS INTEGER) * 1000 FROM user_stats WHERE game = 'naval' AND won >= 5;
INSERT OR IGNORE INTO user_items (user_id, item, price, bought_at) SELECT user_id, 'naval:glace', 0, CAST(strftime('%s', 'now') AS INTEGER) * 1000 FROM user_stats WHERE game = 'naval' AND won >= 10;
INSERT OR IGNORE INTO user_items (user_id, item, price, bought_at) SELECT user_id, 'naval:royal', 0, CAST(strftime('%s', 'now') AS INTEGER) * 1000 FROM user_stats WHERE game = 'naval' AND won >= 15;
INSERT OR IGNORE INTO user_items (user_id, item, price, bought_at) SELECT user_id, 'naval:neon', 0, CAST(strftime('%s', 'now') AS INTEGER) * 1000 FROM user_stats WHERE game = 'naval' AND won >= 20;
INSERT OR IGNORE INTO user_items (user_id, item, price, bought_at) SELECT user_id, 'naval:lave', 0, CAST(strftime('%s', 'now') AS INTEGER) * 1000 FROM user_stats WHERE game = 'naval' AND won >= 30;

INSERT OR IGNORE INTO user_items (user_id, item, price, bought_at) SELECT user_id, 'token:croissant', 0, CAST(strftime('%s', 'now') AS INTEGER) * 1000 FROM user_stats WHERE game = 'capitale' AND won >= 1;
INSERT OR IGNORE INTO user_items (user_id, item, price, bought_at) SELECT user_id, 'token:fusee', 0, CAST(strftime('%s', 'now') AS INTEGER) * 1000 FROM user_stats WHERE game = 'capitale' AND won >= 3;
INSERT OR IGNORE INTO user_items (user_id, item, price, bought_at) SELECT user_id, 'token:montgolfiere', 0, CAST(strftime('%s', 'now') AS INTEGER) * 1000 FROM user_stats WHERE game = 'capitale' AND won >= 5;
INSERT OR IGNORE INTO user_items (user_id, item, price, bought_at) SELECT user_id, 'token:tour', 0, CAST(strftime('%s', 'now') AS INTEGER) * 1000 FROM user_stats WHERE game = 'capitale' AND won >= 10;
INSERT OR IGNORE INTO user_items (user_id, item, price, bought_at) SELECT user_id, 'token:diamant', 0, CAST(strftime('%s', 'now') AS INTEGER) * 1000 FROM user_stats WHERE game = 'capitale' AND won >= 15;
INSERT OR IGNORE INTO user_items (user_id, item, price, bought_at) SELECT user_id, 'token:couronne', 0, CAST(strftime('%s', 'now') AS INTEGER) * 1000 FROM user_stats WHERE game = 'capitale' AND won >= 25;

INSERT OR IGNORE INTO user_items (user_id, item, price, bought_at) SELECT user_id, 'vehicle:buggy', 0, CAST(strftime('%s', 'now') AS INTEGER) * 1000 FROM user_stats WHERE game = 'bolides' AND won >= 2;
INSERT OR IGNORE INTO user_items (user_id, item, price, bought_at) SELECT user_id, 'vehicle:bolide', 0, CAST(strftime('%s', 'now') AS INTEGER) * 1000 FROM user_stats WHERE game = 'bolides' AND won >= 5;
INSERT OR IGNORE INTO user_items (user_id, item, price, bought_at) SELECT user_id, 'vehicle:monstre', 0, CAST(strftime('%s', 'now') AS INTEGER) * 1000 FROM user_stats WHERE game = 'bolides' AND won >= 10;
INSERT OR IGNORE INTO user_items (user_id, item, price, bought_at) SELECT user_id, 'vehicle:tondeuse', 0, CAST(strftime('%s', 'now') AS INTEGER) * 1000 FROM user_stats WHERE game = 'bolides' AND won >= 18;
INSERT OR IGNORE INTO user_items (user_id, item, price, bought_at) SELECT user_id, 'vehicle:soucoupe', 0, CAST(strftime('%s', 'now') AS INTEGER) * 1000 FROM user_stats WHERE game = 'bolides' AND won >= 30;

INSERT OR IGNORE INTO user_items (user_id, item, price, bought_at) SELECT user_id, 'kart:damier', 0, CAST(strftime('%s', 'now') AS INTEGER) * 1000 FROM user_stats WHERE game = 'bolides' AND won >= 1;
INSERT OR IGNORE INTO user_items (user_id, item, price, bought_at) SELECT user_id, 'kart:carbone', 0, CAST(strftime('%s', 'now') AS INTEGER) * 1000 FROM user_stats WHERE game = 'bolides' AND won >= 5;
INSERT OR IGNORE INTO user_items (user_id, item, price, bought_at) SELECT user_id, 'kart:chrome', 0, CAST(strftime('%s', 'now') AS INTEGER) * 1000 FROM user_stats WHERE game = 'bolides' AND won >= 12;
INSERT OR IGNORE INTO user_items (user_id, item, price, bought_at) SELECT user_id, 'kart:or', 0, CAST(strftime('%s', 'now') AS INTEGER) * 1000 FROM user_stats WHERE game = 'bolides' AND won >= 25;
INSERT OR IGNORE INTO user_items (user_id, item, price, bought_at) SELECT user_id, 'kart:arcenciel', 0, CAST(strftime('%s', 'now') AS INTEGER) * 1000 FROM user_stats WHERE game = 'bolides' AND won >= 40;
INSERT OR IGNORE INTO user_items (user_id, item, price, bought_at) SELECT user_id, 'kart:bandes', 0, CAST(strftime('%s', 'now') AS INTEGER) * 1000 FROM user_stats WHERE game = 'bolides' AND played >= 2;
INSERT OR IGNORE INTO user_items (user_id, item, price, bought_at) SELECT user_id, 'kart:camo', 0, CAST(strftime('%s', 'now') AS INTEGER) * 1000 FROM user_stats WHERE game = 'bolides' AND played >= 10;
INSERT OR IGNORE INTO user_items (user_id, item, price, bought_at) SELECT user_id, 'kart:galaxie', 0, CAST(strftime('%s', 'now') AS INTEGER) * 1000 FROM user_stats WHERE game = 'bolides' AND played >= 100;
INSERT OR IGNORE INTO user_items (user_id, item, price, bought_at) SELECT user_id, 'kart:flammes', 0, CAST(strftime('%s', 'now') AS INTEGER) * 1000 FROM user_stats WHERE game = 'bolides' AND COALESCE(json_extract(totals, '$.turbos'), 0) >= 50;
INSERT OR IGNORE INTO user_items (user_id, item, price, bought_at) SELECT user_id, 'kart:neon', 0, CAST(strftime('%s', 'now') AS INTEGER) * 1000 FROM user_stats WHERE game = 'bolides' AND COALESCE(json_extract(totals, '$.hitsGiven'), 0) >= 25;
