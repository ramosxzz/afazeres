export interface Env {
  DB: D1Database;
  APP_PASSWORD?: string;
  /** opcional: token do GitHub (read-only) para ver repos privados e ter limite maior */
  GITHUB_TOKEN?: string;
  /** opcional: outra URL da API (GitHub Enterprise ou testes locais) */
  GITHUB_API_URL?: string;
  /** opcional: token para /api/ingest (além do hash salvo em settings.ingest_token_sha256) */
  INGEST_TOKEN?: string;
}
