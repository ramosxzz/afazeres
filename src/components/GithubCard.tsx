import { useEffect, useState } from "react";
import { ExternalLink, GitCommitHorizontal, Lock, Star } from "lucide-react";
import type { GithubRepoDetail } from "@shared/types";
import { api, ApiError } from "../api";
import { timeAgo } from "../lib/dates";
import { parseGithubUrl } from "../lib/github";

/** Resumo ao vivo do repositório (último push, último commit, issues, estrelas). */
export function GithubCard({ repoUrl }: { repoUrl: string }) {
  const full = parseGithubUrl(repoUrl);
  const [data, setData] = useState<GithubRepoDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!full) return;
    let alive = true;
    setData(null);
    setError("");
    api<GithubRepoDetail>(`/github/repo?repo=${encodeURIComponent(full)}`)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e instanceof ApiError ? e.message : "Erro ao consultar o GitHub"));
    return () => {
      alive = false;
    };
  }, [full]);

  if (!full) return null;

  return (
    <div className="card gh-card">
      <h4 className="side-title gh-card-title">
        GitHub
        <a href={`https://github.com/${full}`} target="_blank" rel="noopener noreferrer" className="link-more">
          {full} <ExternalLink size={12} />
        </a>
      </h4>
      {error ? (
        <p className="muted small">{error}</p>
      ) : !data ? (
        <p className="muted small">carregando…</p>
      ) : (
        <>
          {data.last_commit && (
            <a href={data.last_commit.url} target="_blank" rel="noopener noreferrer" className="gh-commit">
              <GitCommitHorizontal size={14} />
              <span className="gh-commit-msg">{data.last_commit.message}</span>
              <span className="gh-commit-meta">
                <code>{data.last_commit.sha}</code> · {timeAgo(data.last_commit.date)} atrás
              </span>
            </a>
          )}
          <dl className="gh-stats">
            <div>
              <dt>Último push</dt>
              <dd>{timeAgo(data.pushed_at)} atrás</dd>
            </div>
            <div>
              <dt>Issues abertas</dt>
              <dd>{data.open_issues}</dd>
            </div>
            <div>
              <dt>Estrelas</dt>
              <dd>
                <Star size={12} /> {data.stars}
              </dd>
            </div>
            <div>
              <dt>Branch</dt>
              <dd>
                {data.default_branch} {data.private && <Lock size={11} />}
              </dd>
            </div>
          </dl>
        </>
      )}
    </div>
  );
}
