// Acesso à API do GitHub (com cache) — usado pelas rotas e pela sincronização automática.
import type { GithubRepo } from "../shared/types";
import type { Env } from "./env";

export class GithubError extends Error {
  constructor(
    message: string,
    public status: 400 | 401 | 403 | 404 | 429 | 502,
  ) {
    super(message);
  }
}

export interface GhOpts {
  /** ignora o cache (botão "Buscar") */
  fresh?: boolean;
  /** recebe os escopos do token clássico (header x-oauth-scopes) */
  meta?: { scopes: string | null };
}

/** GET na API do GitHub com cache de alguns minutos (Cache API do Workers). */
export async function gh<T>(env: Env, path: string, ttl = 300, opts: GhOpts = {}): Promise<T> {
  const token = env.GITHUB_TOKEN?.trim();
  const cacheKey = new Request(`https://github-cache.afazeres.internal/${token ? "a" : "p"}${path}`);
  const cache = caches.default;
  if (!opts.fresh) {
    const hit = await cache.match(cacheKey);
    if (hit) {
      if (opts.meta) opts.meta.scopes = hit.headers.get("x-oauth-scopes");
      return hit.json<T>();
    }
  }

  const base = (env.GITHUB_API_URL || "https://api.github.com").replace(/\/+$/, "");
  const res = await fetch(`${base}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "afazeres-worker",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    if (res.status === 401) throw new GithubError("Token do GitHub inválido ou expirado (GITHUB_TOKEN).", 401);
    if ((res.status === 403 || res.status === 429) && res.headers.get("x-ratelimit-remaining") === "0") {
      throw new GithubError(
        token
          ? "Limite da API do GitHub atingido. Tente de novo em alguns minutos."
          : "Limite da API do GitHub atingido (sem token o limite é bem baixo). Configure o segredo GITHUB_TOKEN.",
        429,
      );
    }
    if (res.status === 403) {
      throw new GithubError(
        "Sem permissão no GitHub — o token precisa de Contents e Issues como Read-only.",
        403,
      );
    }
    if (res.status === 404) throw new GithubError("Não encontrado no GitHub (ou é privado e falta o GITHUB_TOKEN).", 404);
    throw new GithubError(`GitHub respondeu ${res.status}`, 502);
  }
  const body = await res.text();
  const scopes = res.headers.get("x-oauth-scopes");
  if (opts.meta) opts.meta.scopes = scopes;
  const headers: Record<string, string> = { "Content-Type": "application/json", "Cache-Control": `max-age=${ttl}` };
  if (scopes !== null) headers["x-oauth-scopes"] = scopes;
  await cache.put(cacheKey, new Response(body, { headers }));
  return JSON.parse(body) as T;
}

export interface RawRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  homepage: string | null;
  language: string | null;
  topics?: string[];
  private: boolean;
  archived: boolean;
  fork: boolean;
  stargazers_count: number;
  open_issues_count: number;
  default_branch: string;
  created_at: string;
  pushed_at: string;
}

export const toRepo = (r: RawRepo): GithubRepo => ({
  id: r.id,
  name: r.name,
  full_name: r.full_name,
  description: r.description ?? "",
  html_url: r.html_url,
  homepage: r.homepage ?? "",
  language: r.language,
  topics: r.topics ?? [],
  private: r.private,
  archived: r.archived,
  fork: r.fork,
  stars: r.stargazers_count,
  created_at: r.created_at,
  pushed_at: r.pushed_at,
});
