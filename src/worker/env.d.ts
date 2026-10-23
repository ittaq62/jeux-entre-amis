// Secrets definis avec `wrangler secret put` (absents des variables publiques)
interface Env {
  SMTP_USER?: string;
  SMTP_PASS?: string;
}
