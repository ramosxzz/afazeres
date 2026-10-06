// Automação: o GitHub alimenta o afazeres sozinho.
//  - commits viram atividade (mapa de calor, sequência de dias e XP)
//  - issues viram tarefas; issue fechada conclui a tarefa
//  - status do projeto acompanha os pushes
//  - repositórios novos viram projetos
//  - todo fim de dia sai um resumo automático no diário
// Roda pelo Cron Trigger (a cada 30 min) e pelo botão "Sincronizar agora".

import type { AutomationStatus, GithubRepo, SyncResult } from "../shared/types";
import { AUTO_COLORS, issueKind, issuePriority, normUrl, parseGithubUrl, repoToProject } from "../shared/githubMap";
import { now, uid } from "./db";
import type { Env } from "./env";
import { gh, toRepo, type RawRepo } from "./github";

const DAY = 86400_000;
const JOURNAL_MARKER = "<!-- afazeres:auto -->";

const STATUS_LABEL: Record<string, string> = {
  idea: "Ideias",
  active: "Em andamento",
  paused: "Pausado",
  support: "Suporte",
  done: "Finalizado",
  archived: "Arquivado",
};

// ───────────── estado e configurações ─────────────

async function getState(db: D1Database, key: string) {
  const r = await db.prepare("SELECT value FROM sync_state WHERE key = ?").bind(key).first<{ value: string }>();
  return r?.value ?? null;
}

function setStateStmt(db: D1Database, key: string, value: string) {
  return db
    .prepare("INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(key, value);
}

async function getSettings(db: D1Database) {
  const { results } = await db.prepare("SELECT key, value FROM settings").all<{ key: string; value: string }>();
  const s = Object.fromEntries(results.map((r) => [r.key, r.value]));
  const flag = (k: string) => s[k] !== "false"; // tudo ligado por padrão
  return {
    sync: flag("auto_sync"),
    commits: flag("auto_commits"),
    issues: flag("auto_issues"),
    status: flag("auto_status"),
    import: flag("auto_import"),
    journal: flag("auto_journal"),
    tz: Number(s.tz_offset ?? 180) || 0, // Date.getTimezoneOffset() do navegador
  };
}

export async function automationStatus(env: Env): Promise<AutomationStatus> {
  const [last, journal, journalAuto] = await Promise.all([
    getState(env.DB, "last_sync_result"),
    getState(env.DB, "last_journal"),
    getState(env.DB, "last_journal_auto"),
  ]);
  return {
    has_token: Boolean(env.GITHUB_TOKEN?.trim()),
    last_sync: last ? (JSON.parse(last) as SyncResult) : null,
    last_journal: [journal, journalAuto].filter(Boolean).sort().pop() ?? null,
  };
}

// ───────────── sincronização com o GitHub ─────────────

interface ProjectRow {
  id: string;
  name: string;
  status: string;
  repo_url: string;
  updated_at: string;
}

interface RawCommit {
  sha: string;
  html_url: string;
  parents?: unknown[];
  commit: { message: string; author: { date: string } | null; committer: { date: string } | null };
}

interface RawIssue {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  html_url: string;
  closed_at: string | null;
  labels: (string | { name?: string })[];
  milestone: { due_on: string | null } | null;
  pull_request?: unknown;
}

async function pages<T>(env: Env, path: (page: number) => string, max = 3): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= max; page++) {
    const batch = await gh<T[]>(env, path(page), 60, { fresh: true });
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}

export async function runSync(env: Env, manual: boolean): Promise<SyncResult> {
  const db = env.DB;
  const started = now();
  const result: SyncResult = {
    ok: true,
    at: started,
    message: "",
    repos: 0,
    commits: 0,
    issues_created: 0,
    issues_closed: 0,
    projects_created: 0,
    status_changed: 0,
    errors: [],
  };
  const finish = async (message: string, ok = true) => {
    result.ok = ok;
    result.message = message;
    await setStateStmt(db, "last_sync_result", JSON.stringify(result)).run();
    return result;
  };

  const cfg = await getSettings(db);
  if (!manual && !cfg.sync) return { ...result, message: "Automação desligada" };
  if (!env.GITHUB_TOKEN?.trim()) {
    return finish("Configure o segredo GITHUB_TOKEN no Cloudflare para a automação funcionar.", false);
  }

  const me = await gh<{ login: string }>(env, "/user", 3600);
  const login = me.login;
  const repos = (
    await pages<RawRepo>(
      env,
      (p) => `/user/repos?per_page=100&page=${p}&sort=pushed&affiliation=owner,collaborator,organization_member`,
    )
  ).map(toRepo);
  const byUrl = new Map(repos.map((r) => [normUrl(r.html_url), r]));

  const lastSync = await getState(db, "last_sync_at");
  // janela com 1h de folga para não perder nada entre execuções
  const since = new Date(lastSync ? Date.parse(lastSync) - 3600_000 : Date.now() - 90 * DAY).toISOString();

  let projects = (
    await db.prepare("SELECT id, name, status, repo_url, updated_at FROM projects").all<ProjectRow>()
  ).results;
  const linked = new Set(projects.map((p) => normUrl(p.repo_url)).filter(Boolean));

  // 1) repositórios novos viram projetos
  if (cfg.import) {
    const importSince = lastSync ? Date.parse(lastSync) - 3600_000 : Date.now() - 30 * DAY;
    const fresh = repos.filter(
      (r) => !r.fork && !r.archived && !linked.has(normUrl(r.html_url)) && Date.parse(r.pushed_at) >= importSince,
    );
    const min = await db.prepare("SELECT MIN(position) AS p FROM projects WHERE status = 'active'").first<{ p: number | null }>();
    let pos = (min?.p ?? 1000) - 1;
    const stmts: D1PreparedStatement[] = [];
    for (const [i, repo] of fresh.entries()) {
      const input = repoToProject(repo, "active", AUTO_COLORS[(projects.length + i) % AUTO_COLORS.length], login);
      const id = uid();
      const t = now();
      stmts.push(
        db
          .prepare(
            `INSERT INTO projects (id, name, description, status, type, priority, client, color, icon, stack, repo_url,
              live_url, docs_url, progress, start_date, notes, pinned, position, created_at, updated_at)
             VALUES (?, ?, ?, 'active', ?, 'medium', ?, ?, ?, ?, ?, ?, '', 0, ?, '', 0, ?, ?, ?)`,
          )
          .bind(
            id, input.name, input.description ?? "", input.type, input.client ?? "", input.color, input.icon,
            JSON.stringify(input.stack ?? []), input.repo_url, input.live_url ?? "", input.start_date ?? null, pos--, t, t,
          ),
        activityStmt(db, "project_created", `Novo projeto (GitHub): ${input.name}`, id, id, t),
      );
      projects.push({ id, name: input.name!, status: "active", repo_url: repo.html_url, updated_at: t });
      result.projects_created++;
    }
    if (stmts.length) await db.batch(stmts);
  }

  // 2) para cada projeto ligado a um repositório
  const maxPos = await db.prepare("SELECT MAX(position) AS p FROM tasks").first<{ p: number | null }>();
  let taskPos = (maxPos?.p ?? 0) + 1;

  for (const project of projects) {
    const full = parseGithubUrl(project.repo_url);
    if (!full) continue;
    const repo: GithubRepo | undefined = byUrl.get(normUrl(project.repo_url));
    if (!repo) continue; // repositório sem acesso pelo token
    result.repos++;
    const stmts: D1PreparedStatement[] = [];
    const commitIdx: number[] = [];

    try {
      // 2a) status acompanha a atividade no GitHub
      const prevPush = await getState(db, `pushed:${full}`);
      if (cfg.status) {
        let next: string | null = null;
        let why = "";
        if (repo.archived && !["archived", "done"].includes(project.status)) {
          next = "archived";
          why = "repositório arquivado no GitHub";
        } else if (prevPush && repo.pushed_at > prevPush && ["idea", "paused"].includes(project.status)) {
          next = "active";
          why = "push no GitHub";
        } else if (
          project.status === "active" &&
          Date.now() - Date.parse(repo.pushed_at) > 30 * DAY &&
          Date.now() - Date.parse(project.updated_at) > 30 * DAY
        ) {
          next = "paused";
          why = "30 dias sem push";
        }
        if (next) {
          const t = now();
          stmts.push(
            db.prepare("UPDATE projects SET status = ?, updated_at = ? WHERE id = ?").bind(next, t, project.id),
            activityStmt(db, "project_status", `${project.name} → ${STATUS_LABEL[next]} (${why})`, project.id, project.id, t),
          );
          result.status_changed++;
        }
      }
      stmts.push(setStateStmt(db, `pushed:${full}`, repo.pushed_at));

      // 2b) commits viram atividade
      if (cfg.commits && repo.pushed_at >= since) {
        try {
          const commits = await pages<RawCommit>(
            env,
            (p) => `/repos/${full}/commits?author=${encodeURIComponent(login)}&since=${since}&per_page=100&page=${p}`,
          );
          for (const c of commits) {
            if ((c.parents?.length ?? 1) > 1) continue; // ignora merges
            const msg = c.commit.message.split("\n")[0].slice(0, 160);
            const when = c.commit.author?.date ?? c.commit.committer?.date ?? now();
            commitIdx.push(stmts.length);
            stmts.push(
              db
                .prepare(
                  `INSERT OR IGNORE INTO activity (id, type, project_id, entity_id, message, created_at, external_id)
                   VALUES (?, 'commit', ?, ?, ?, ?, ?)`,
                )
                .bind(uid(), project.id, c.sha.slice(0, 7), `${project.name}: ${msg}`, when, `gh:${full}@${c.sha}`),
            );
          }
        } catch (e) {
          // repositório vazio responde 409; não é erro de verdade
          if (!String(e).includes("409")) result.errors.push(`${full}: commits (${(e as Error).message})`);
        }
      }

      // 2c) issues viram tarefas
      if (cfg.issues) {
        const issues = await pages<RawIssue>(
          env,
          (p) =>
            lastSync
              ? `/repos/${full}/issues?state=all&since=${since}&per_page=100&page=${p}`
              : `/repos/${full}/issues?state=open&per_page=100&page=${p}`,
        );
        for (const issue of issues) {
          if (issue.pull_request) continue;
          // mesmo formato da API de ingest: source "github" + "dono/repo#12"
          const ext = `${full}#${issue.number}`;
          const task = await db
            .prepare("SELECT id, status, title FROM tasks WHERE source = 'github' AND external_id = ?")
            .bind(ext)
            .first<{ id: string; status: string; title: string }>();
          const t = now();
          if (!task) {
            if (issue.state !== "open") continue; // não importa issue antiga já fechada
            const ignored = await db
              .prepare("SELECT 1 AS x FROM ingest_ignored WHERE source = 'github' AND external_id = ?")
              .bind(ext)
              .first();
            if (ignored) continue; // você apagou essa tarefa: não recria
            stmts.push(
              db
                .prepare(
                  `INSERT INTO tasks (id, project_id, title, notes, status, kind, priority, due_date, position,
                    completed_at, created_at, updated_at, source, external_id, external_url, needs_review)
                   VALUES (?, ?, ?, ?, 'todo', ?, ?, ?, ?, NULL, ?, ?, 'github', ?, ?, 0)`,
                )
                .bind(
                  uid(), project.id, issue.title.slice(0, 500),
                  `${(issue.body ?? "").slice(0, 4000)}\n\n[Issue #${issue.number} no GitHub](${issue.html_url})`.trim(),
                  issueKind(issue), issuePriority(issue), issue.milestone?.due_on?.slice(0, 10) ?? null, taskPos++,
                  t, t, ext, issue.html_url,
                ),
            );
            result.issues_created++;
          } else if (issue.state === "closed" && task.status !== "done") {
            const when = issue.closed_at ?? t;
            stmts.push(
              db.prepare("UPDATE tasks SET status = 'done', completed_at = ?, updated_at = ? WHERE id = ?").bind(when, t, task.id),
              activityStmt(db, "task_done", `Concluiu (GitHub): ${task.title}`, project.id, task.id, when),
            );
            result.issues_closed++;
          } else if (issue.state === "open" && task.title !== issue.title.slice(0, 500)) {
            stmts.push(db.prepare("UPDATE tasks SET title = ?, updated_at = ? WHERE id = ?").bind(issue.title.slice(0, 500), t, task.id));
          }
        }
      }
    } catch (e) {
      result.errors.push(`${full}: ${(e as Error).message}`);
    }

    if (stmts.length) {
      const res = await db.batch(stmts);
      // conta só os commits realmente novos (INSERT OR IGNORE)
      for (const i of commitIdx) result.commits += res[i].meta.changes ?? 0;
    }
  }

  await setStateStmt(db, "last_sync_at", started).run();
  const parts = [
    result.commits && `${result.commits} commit${result.commits > 1 ? "s" : ""}`,
    result.issues_created && `${result.issues_created} tarefa${result.issues_created > 1 ? "s" : ""} nova${result.issues_created > 1 ? "s" : ""}`,
    result.issues_closed && `${result.issues_closed} concluída${result.issues_closed > 1 ? "s" : ""}`,
    result.projects_created && `${result.projects_created} projeto${result.projects_created > 1 ? "s" : ""} novo${result.projects_created > 1 ? "s" : ""}`,
    result.status_changed && `${result.status_changed} status atualizado${result.status_changed > 1 ? "s" : ""}`,
  ].filter(Boolean);
  const summary = parts.length ? parts.join(" · ") : `Tudo em dia (${result.repos} repositório${result.repos === 1 ? "" : "s"})`;
  const warn = result.errors.length ? ` · ${result.errors.length} aviso${result.errors.length > 1 ? "s" : ""}` : "";
  return finish(summary + warn);
}

function activityStmt(db: D1Database, type: string, message: string, projectId: string | null, entityId: string | null, at: string) {
  return db
    .prepare("INSERT INTO activity (id, type, project_id, entity_id, message, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(uid(), type, projectId, entityId, message, at);
}

// ───────────── diário automático ─────────────

function fmtMin(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}min` : `${h}h`;
}

/** Dia local (YYYY-MM-DD) no fuso do usuário. */
export function localDay(tz: number, at = Date.now()) {
  return new Date(at - tz * 60_000).toISOString().slice(0, 10);
}

/**
 * Escreve (ou atualiza) o resumo automático do dia no diário.
 * Se a página do dia já existe, o resumo entra no fim dela sem apagar o que você escreveu.
 */
export async function runJournal(env: Env, date: string | null, manual: boolean) {
  const db = env.DB;
  const cfg = await getSettings(db);
  if (!manual && !cfg.journal) return null;
  const day = date ?? localDay(cfg.tz);
  const start = new Date(Date.parse(`${day}T00:00:00Z`) + cfg.tz * 60_000).toISOString();
  const end = new Date(Date.parse(start) + DAY).toISOString();
  const tomorrow = new Date(Date.parse(`${day}T00:00:00Z`) + DAY).toISOString().slice(0, 10);

  const [commits, done, focus, moves, dueTomorrow] = await db.batch([
    db
      .prepare(
        `SELECT p.name AS project, a.message FROM activity a LEFT JOIN projects p ON p.id = a.project_id
         WHERE a.type = 'commit' AND a.created_at >= ? AND a.created_at < ? ORDER BY a.created_at`,
      )
      .bind(start, end),
    db
      .prepare(
        `SELECT t.title, p.name AS project FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
         WHERE t.status = 'done' AND t.completed_at >= ? AND t.completed_at < ? ORDER BY t.completed_at`,
      )
      .bind(start, end),
    db
      .prepare(
        `SELECT COALESCE(p.name, 'Livre') AS project, SUM(f.minutes) AS minutes FROM focus_sessions f
         LEFT JOIN projects p ON p.id = f.project_id WHERE f.ended_at >= ? AND f.ended_at < ?
         GROUP BY f.project_id ORDER BY minutes DESC`,
      )
      .bind(start, end),
    db
      .prepare(
        `SELECT message FROM activity WHERE type IN ('project_status', 'project_done', 'project_created')
         AND created_at >= ? AND created_at < ? ORDER BY created_at`,
      )
      .bind(start, end),
    db
      .prepare(
        `SELECT t.title, p.name AS project FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
         WHERE t.status != 'done' AND t.due_date = ? ORDER BY t.priority`,
      )
      .bind(tomorrow),
  ]);

  const c = commits.results as { project: string | null; message: string }[];
  const d = done.results as { title: string; project: string | null }[];
  const f = focus.results as { project: string; minutes: number }[];
  const m = moves.results as { message: string }[];
  const n = dueTomorrow.results as { title: string; project: string | null }[];
  const focusTotal = f.reduce((a, x) => a + x.minutes, 0);

  if (!manual && !c.length && !d.length && !f.length && !m.length) return null; // dia sem nada: não cria página

  const lines: string[] = [JOURNAL_MARKER, "### 🦊 Resumo automático do dia"];
  if (c.length) {
    lines.push("", `**Commits (${c.length})**`);
    const byProject = new Map<string, string[]>();
    for (const x of c) {
      const name = x.project ?? "Outros";
      const msg = x.message.replace(new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}: `), "");
      byProject.set(name, [...(byProject.get(name) ?? []), msg]);
    }
    for (const [name, msgs] of byProject) {
      const shown = msgs.slice(0, 6).join(" · ");
      lines.push(`- **${name}** — ${shown}${msgs.length > 6 ? ` · (+${msgs.length - 6})` : ""}`);
    }
  }
  if (d.length) {
    lines.push("", `**Tarefas concluídas (${d.length})**`);
    for (const x of d.slice(0, 20)) lines.push(`- ${x.title}${x.project ? ` _(${x.project})_` : ""}`);
  }
  if (f.length) {
    lines.push("", `**Foco: ${fmtMin(focusTotal)}** — ${f.map((x) => `${x.project} ${fmtMin(x.minutes)}`).join(" · ")}`);
  }
  if (m.length) {
    lines.push("", "**Projetos**");
    for (const x of m) lines.push(`- ${x.message}`);
  }
  if (n.length) {
    lines.push("", "**Vence amanhã**");
    for (const x of n) lines.push(`- ${x.title}${x.project ? ` _(${x.project})_` : ""}`);
  }
  if (!c.length && !d.length && !f.length && !m.length) lines.push("", "_Nenhuma atividade registrada hoje._");
  const section = lines.join("\n");

  const volume = c.length + d.length * 2;
  const mood = volume >= 12 ? "fire" : volume >= 3 ? "happy" : "calm";
  const t = now();
  const existing = await db.prepare("SELECT id, content FROM journal WHERE date = ? ORDER BY created_at LIMIT 1").bind(day).first<{
    id: string;
    content: string;
  }>();

  let id: string;
  if (existing) {
    id = existing.id;
    const before = existing.content.split(JOURNAL_MARKER)[0].trimEnd();
    const content = before ? `${before}\n\n${section}` : section;
    await db.prepare("UPDATE journal SET content = ?, updated_at = ? WHERE id = ?").bind(content, t, id).run();
  } else {
    id = uid();
    const content = `${section}\n\n### 学んだこと · O que aprendi\n- \n\n### 困ったこと · O que travou\n- `;
    await db.batch([
      db
        .prepare("INSERT INTO journal (id, date, mood, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(id, day, mood, content, t, t),
      activityStmt(db, "journal", `Diário gerado automaticamente (${day})`, null, id, t),
    ]);
  }
  await setStateStmt(db, manual ? "last_journal" : "last_journal_auto", day).run();
  return { id, date: day };
}

/** Chamado pelo Cron Trigger. */
export async function runScheduled(env: Env) {
  await runSync(env, false).catch((e) => console.error("sync", e));
  // diário: a partir das 23h (horário do usuário), uma vez por dia
  const cfg = await getSettings(env.DB);
  const localHour = new Date(Date.now() - cfg.tz * 60_000).getUTCHours();
  const today = localDay(cfg.tz);
  if (cfg.journal && localHour >= 23 && (await getState(env.DB, "last_journal_auto")) !== today) {
    await runJournal(env, today, false).catch((e) => console.error("journal", e));
  }
}
