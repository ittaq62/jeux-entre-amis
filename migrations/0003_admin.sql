-- Administration du site : rôle admin et suspension de compte.
-- Le premier admin se nomme à la main (wrangler d1 execute), jamais dans le dépôt.

ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN banned_at INTEGER;
ALTER TABLE users ADD COLUMN ban_reason TEXT;
