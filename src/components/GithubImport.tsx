import { useEffect, useMemo, useState } from "react";
import { Loader2, Lock, RefreshCw, Search, Star } from "lucide-react";
import { PROJECT_STATUSES, type GithubRepoList, type ProjectStatus } from "@shared/types";
import { api, ApiError } from "../api";
import { useStore } from "../store";
import { STATUS_META } from "../lib/constants";
import { timeAgo } from "../lib/dates";
import { guessStatus, normUrl, repoToProject } from "../lib/github";
import { Modal } from "./Modal";

/** Lista os repositórios do GitHub e cria projetos a partir dos selecionados. */
export function GithubImportModal() {
  const open = useStore((s) => s.githubOpen);
  const set = useStore((s) => s.set);
  const projects = useStore((s) => s.projects);
  const prefs = useStore((s) => s.prefs);
  const setPrefs = useStore((s) => s.setPrefs);
  const createProject = useStore((s) => s.createProject);
  const toast = useStore((s) => s.toast);

  const [user, setUser] = useState(prefs.github_user);
  const [data, setData] = useState<GithubRepoList | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [showForks, setShowForks] = useState(false);
  const [picked, setPicked] = useState<Record<string, ProjectStatus>>({});
  const [importing, setImporting] = useState(false);

  const imported = useMemo(() => new Set(projects.map((p) => normUrl(p.repo_url)).filter(Boolean)), [projects]);

  const load = async (fresh = false, login = user) => {
    setLoading(true);
    setError("");
    try {
      const res = await api<GithubRepoList>(
        `/github/repos?user=${encodeURIComponent(login.trim())}${fresh ? "&fresh=1" : ""}`,
      );
      setData(res);
      if (res.login && res.login !== prefs.github_user) setPrefs({ github_user: res.login });
      if (res.login) setUser(res.login);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Não consegui falar com o GitHub");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setPicked({});
    setQ("");
    if (!data && user.trim()) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const repos = useMemo(() => {
    const nq = q.trim().toLowerCase();
    return (data?.repos ?? []).filter(
      (r) =>
        (showForks || !r.fork) &&
        (!nq || `${r.name} ${r.description} ${r.language ?? ""} ${r.topics.join(" ")}`.toLowerCase().includes(nq)),
    );
  }, [data, q, showForks]);

  const close = () => set({ githubOpen: false });
  const count = Object.keys(picked).length;

  const toggle = (fullName: string, status: ProjectStatus) =>
    setPicked((p) => {
      const next = { ...p };
      if (next[fullName]) delete next[fullName];
      else next[fullName] = status;
      return next;
    });

  const doImport = async () => {
    if (!data || !count) return;
    setImporting(true);
    let ok = 0;
    const chosen = data.repos.filter((r) => picked[r.full_name]);
    for (const [i, repo] of chosen.entries()) {
      const p = await createProject(repoToProject(repo, picked[repo.full_name], projects.length + i, data.login), { silent: true });
      if (p) ok++;
    }
    setImporting(false);
    setPicked({});
    toast(`${ok} projeto${ok === 1 ? "" : "s"} importado${ok === 1 ? "" : "s"} do GitHub`, "success", { kanji: "入" });
    if (ok === chosen.length) close();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      wide
      title="Importar do GitHub"
      footer={
        <>
          <span className="muted small">
            {data
              ? data.authenticated
                ? `Token de ${data.token_login} · ${data.repos.filter((r) => r.private).length} privado(s)`
                : "Sem token: só repositórios públicos"
              : ""}
          </span>
          <span className="spacer" />
          <button type="button" className="btn btn-ghost" onClick={close}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" disabled={!count || importing} onClick={() => void doImport()}>
            {importing ? <Loader2 size={15} className="spin" /> : null}
            Importar {count || ""} projeto{count === 1 ? "" : "s"}
          </button>
        </>
      }
    >
      <form
        className="gh-toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          void load(true);
        }}
      >
        <label className="gh-user">
          <span className="muted">github.com/</span>
          <input value={user} onChange={(e) => setUser(e.target.value)} placeholder="seu-usuario" aria-label="Usuário do GitHub" />
        </label>
        <button type="submit" className="btn btn-ghost" disabled={loading}>
          {loading ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />} Buscar
        </button>
        {data && (
          <div className="search-box gh-search">
            <Search size={15} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrar repositórios…" />
          </div>
        )}
      </form>

      {error && <p className="gh-error">{error}</p>}
      {data && <TokenHint data={data} />}

      {data && (
        <>
          <div className="gh-meta">
            <span className="muted small">
              {repos.length} repositório{repos.length === 1 ? "" : "s"}
            </span>
            <label className="toggle">
              <input type="checkbox" checked={showForks} onChange={(e) => setShowForks(e.target.checked)} />
              <span>Mostrar forks</span>
            </label>
          </div>
          <ul className="gh-list">
            {repos.map((r) => {
              const already = imported.has(normUrl(r.html_url));
              const status = picked[r.full_name];
              return (
                <li key={r.id} className={`gh-repo ${status ? "picked" : ""} ${already ? "done" : ""}`}>
                  <label className="gh-check">
                    <input
                      type="checkbox"
                      disabled={already}
                      checked={Boolean(status) || already}
                      onChange={() => toggle(r.full_name, guessStatus(r))}
                    />
                  </label>
                  <div className="gh-info" onClick={() => !already && toggle(r.full_name, guessStatus(r))}>
                    <div className="gh-name">
                      {r.name}
                      {r.private && <Lock size={12} />}
                      {r.fork && <span className="gh-tag">fork</span>}
                      {r.archived && <span className="gh-tag">arquivado</span>}
                      {already && <span className="gh-tag">já importado</span>}
                    </div>
                    {r.description && <div className="gh-desc">{r.description}</div>}
                    <div className="gh-sub">
                      {r.language && <span>{r.language}</span>}
                      {r.stars > 0 && (
                        <span>
                          <Star size={11} /> {r.stars}
                        </span>
                      )}
                      <span>push {timeAgo(r.pushed_at)} atrás</span>
                    </div>
                  </div>
                  {status && (
                    <select
                      value={status}
                      onChange={(e) => setPicked((p) => ({ ...p, [r.full_name]: e.target.value as ProjectStatus }))}
                      aria-label="Status do projeto"
                    >
                      {PROJECT_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_META[s].label}
                        </option>
                      ))}
                    </select>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {!data && !loading && !error && <p className="muted small">Digite seu usuário e clique em Buscar.</p>}
    </Modal>
  );
}

/** Explica por que os repositórios privados não aparecem (quando for o caso). */
function TokenHint({ data }: { data: GithubRepoList }) {
  const privates = data.repos.filter((r) => r.private).length;
  if (data.authenticated && data.listed_as_user && privates > 0) return null;

  let title: string;
  let steps: React.ReactNode;
  if (!data.authenticated) {
    title = "O app não está recebendo o token do GitHub.";
    steps = (
      <ol>
        <li>
          No Cloudflare: Workers &amp; Pages → afazeres → Settings → Variables and Secrets.
        </li>
        <li>
          Confira se existe um <b>Secret</b> com o nome exatamente <code>GITHUB_TOKEN</code> (maiúsculas, sem espaço) e se você
          clicou em <b>Deploy</b> depois de salvar.
        </li>
        <li>Espere alguns segundos, recarregue a página e clique em Buscar.</li>
      </ol>
    );
  } else if (!data.listed_as_user) {
    title = `O token é da conta "${data.token_login}", mas você buscou "${data.login}". Para outra conta só aparecem os públicos.`;
    steps = <p>Busque por {data.token_login} ou gere o token logado na conta {data.login}.</p>;
  } else if (data.token_kind === "classic") {
    title = "Seu token clássico não tem permissão para repositórios privados.";
    steps = (
      <p>
        Escopos atuais: <code>{data.scopes || "nenhum"}</code>. Gere um novo token clássico marcando o escopo <code>repo</code>{" "}
        e troque o valor do <code>GITHUB_TOKEN</code> no Cloudflare.
      </p>
    );
  } else {
    title = "O token funciona, mas só enxerga repositórios públicos.";
    steps = (
      <ol>
        <li>
          No GitHub: Settings → Developer settings → Personal access tokens → <b>Fine-grained tokens</b> → abra o seu token.
        </li>
        <li>
          Em <b>Repository access</b>, troque &quot;Public repositories&quot; por <b>All repositories</b> (ou selecione os repos).
        </li>
        <li>
          Em <b>Permissions → Repositories</b>, adicione <b>Contents: Read-only</b> e salve. Não precisa trocar o token no
          Cloudflare.
        </li>
        <li>Volte aqui e clique em Buscar.</li>
      </ol>
    );
  }
  if (data.authenticated && data.listed_as_user && privates === 0) {
    steps = (
      <>
        {steps}
        <p className="muted">
          Se os privados forem de uma <b>organização</b>, crie o token com a organização como &quot;Resource owner&quot; (ela
          precisa permitir tokens fine-grained). Se você realmente não tem repositórios privados, pode ignorar este aviso.
        </p>
      </>
    );
  }
  return (
    <div className="gh-hint">
      <strong>{title}</strong>
      {steps}
    </div>
  );
}
