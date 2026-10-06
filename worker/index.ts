import { Hono } from "hono";
import type { Context } from "hono";
import {
  MOODS,
  PRIORITIES,
  PROJECT_STATUSES,
  PROJECT_TYPES,
  TASK_KINDS,
  TASK_STATUSES,
  type BackupFile,
  type GithubRepo,
  type GithubRepoDetail,
  type GithubRepoList,
  type FocusSession,
  type JournalEntry,
  type Project,
  type Stats,
  type Task,
} from "../shared/types";
import { clearSessionCookie, createSessionCookie, hexEquals, isAuthenticated, passwordMatches, sha256Hex } from "./auth";
import { ensureSchema, logActivity, now, uid } from "./db";
import type { Env } from "./env";
import { gh, GithubError, toRepo, type RawRepo } from "./github";
import { automationStatus, runJournal, runScheduled, runSync } from "./automation";


type AppCtx = Context<{ Bindings: Env }>;

const app = new Hono<{ Bindings: Env }>().basePath("/api");

const STATUS_LABEL: Record<string, string> = {
  idea: "Ideias",
  active: "Em andamento",
  paused: "Pausado",
  support: "Suporte",
  done: "Finalizado",
  archived: "Arquivado",
};

// ───────────────────────── helpers ─────────────────────────

class BadRequest extends Error {}

const isSecure = (c: AppCtx) => new URL(c.req.url).protocol === "https:";

function oneOf<T extends readonly string[]>(list: T, v: unknown, field: string): T[number] {
  if (typeof v === "string" && (list as readonly string[]).includes(v)) return v as T[number];
  throw new BadRequest(`Campo "${field}" inválido`);
}

function str(v: unknown, field: string, max = 20000): string {
  if (v === null || v === undefined) return "";
  if (typeof v !== "string") throw new BadRequest(`Campo "${field}" deve ser texto`);
  return v.slice(0, max);
}

function dateOrNull(v: unknown, field: string): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 32);
  throw new BadRequest(`Campo "${field}" deve ser uma data`);
}

function num(v: unknown, field: string, min = -Infinity, max = Infinity): number {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new BadRequest(`Campo "${field}" deve ser número`);
  return Math.min(max, Math.max(min, n));
}

function url(v: unknown, field: string): string {
  const s = str(v, field, 2000).trim();
  if (s && !/^https?:\/\//i.test(s)) return `https://${s}`;
  return s;
}

async function body(c: AppCtx): Promise<Record<string, unknown>> {
  try {
    const b = await c.req.json();
    if (b && typeof b === "object" && !Array.isArray(b)) return b as Record<string, unknown>;
  } catch {
    /* noop */
  }
  throw new BadRequest("JSON inválido");
}

type Row = Record<string, unknown>;

const toProject = (r: Row): Project => ({
  ...(r as unknown as Project),
  stack: safeJson(r.stack as string, []),
  pinned: Boolean(r.pinned),
});

function safeJson<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

// Campos editáveis → normalizador. Usado tanto no create quanto no patch.
const projectFields: Record<string, (v: unknown) => unknown> = {
  name: (v) => {
    const s = str(v, "name", 200).trim();
    if (!s) throw new BadRequest("O projeto precisa de um nome");
    return s;
  },
  description: (v) => str(v, "description", 2000),
  status: (v) => oneOf(PROJECT_STATUSES, v, "status"),
  type: (v) => oneOf(PROJECT_TYPES, v, "type"),
  priority: (v) => oneOf(PRIORITIES, v, "priority"),
  client: (v) => str(v, "client", 200),
  color: (v) => {
    const s = str(v, "color", 20);
    if (!/^#[0-9a-f]{6}$/i.test(s)) throw new BadRequest("Cor inválida");
    return s;
  },
  icon: (v) => str(v, "icon", 8) || "桜",
  stack: (v) => {
    if (!Array.isArray(v)) throw new BadRequest("stack deve ser lista");
    return JSON.stringify(
      [...new Set(v.map((x) => String(x).trim().slice(0, 40)).filter(Boolean))].slice(0, 30),
    );
  },
  repo_url: (v) => url(v, "repo_url"),
  live_url: (v) => url(v, "live_url"),
  docs_url: (v) => url(v, "docs_url"),
  progress: (v) => Math.round(num(v, "progress", 0, 100)),
  start_date: (v) => dateOrNull(v, "start_date"),
  due_date: (v) => dateOrNull(v, "due_date"),
  notes: (v) => str(v, "notes", 100000),
  pinned: (v) => (v ? 1 : 0),
  position: (v) => num(v, "position"),
};

const taskFields: Record<string, (v: unknown) => unknown> = {
  project_id: (v) => (v ? str(v, "project_id", 64) : null),
  title: (v) => {
    const s = str(v, "title", 500).trim();
    if (!s) throw new BadRequest("A tarefa precisa de um título");
    return s;
  },
  notes: (v) => str(v, "notes", 20000),
  status: (v) => oneOf(TASK_STATUSES, v, "status"),
  kind: (v) => oneOf(TASK_KINDS, v, "kind"),
  priority: (v) => oneOf(PRIORITIES, v, "priority"),
  due_date: (v) => dateOrNull(v, "due_date"),
  position: (v) => num(v, "position"),
  needs_review: (v) => (v ? 1 : 0),
};

// Só na criação (ex.: "desfazer" ao apagar uma tarefa importada mantém a origem).
const taskCreateOnlyFields: Record<string, (v: unknown) => unknown> = {
  source: (v) => (v ? sourceName(v) : null),
  external_id: (v) => (v ? externalId(v) : null),
  external_url: (v) => (v ? url(v, "external_url") || null : null),
};

/** settings que nunca saem do servidor nem podem ser trocadas pelo app */
const isPrivateSetting = (k: string) => k.startsWith("ingest_");

function sourceName(v: unknown): string {
  if (typeof v === "string" && /^[a-z0-9_-]{1,32}$/.test(v)) return v;
  throw new BadRequest('Campo "source" inválido (use a-z, 0-9, _ ou -)');
}

function externalId(v: unknown): string {
  const s = typeof v === "number" ? String(v) : str(v, "external_id", 300).trim();
  if (!s || s.length > 200) throw new BadRequest('Campo "external_id" obrigatório (até 200 caracteres)');
  return s;
}

const journalFields: Record<string, (v: unknown) => unknown> = {
  date: (v) => {
    const d = dateOrNull(v, "date");
    if (!d) throw new BadRequest("Data obrigatória");
    return d.slice(0, 10);
  },
  mood: (v) => oneOf(MOODS, v, "mood"),
  content: (v) => str(v, "content", 100000),
};

function pick(input: Record<string, unknown>, fields: Record<string, (v: unknown) => unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, fn] of Object.entries(fields)) if (k in input) out[k] = fn(input[k]);
  return out;
}

async function insertRow(db: D1Database, table: string, row: Record<string, unknown>) {
  const keys = Object.keys(row);
  await db
    .prepare(`INSERT INTO ${table} (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`)
    .bind(...keys.map((k) => row[k] ?? null))
    .run();
}

async function updateRow(db: D1Database, table: string, id: string, row: Record<string, unknown>) {
  const keys = Object.keys(row);
  if (!keys.length) return;
  await db
    .prepare(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`)
    .bind(...keys.map((k) => row[k] ?? null), id)
    .run();
}

// ───────────────────────── middleware ─────────────────────────

app.onError((err, c) => {
  if (err instanceof BadRequest) return c.json({ error: err.message }, 400);
  if (err instanceof GithubError) return c.json({ error: err.message, code: "github" }, err.status);
  console.error(err);
  return c.json({ error: "Erro interno no servidor" }, 500);
});

app.use("*", async (c, next) => {
  if (!c.env.APP_PASSWORD) {
    return c.json(
      { error: "Defina o segredo APP_PASSWORD no Worker (wrangler secret put APP_PASSWORD).", code: "no_password" },
      500,
    );
  }
  await ensureSchema(c.env.DB);
  const path = new URL(c.req.url).pathname;
  if (path === "/api/auth/login" || path === "/api/health") return next();
  if (path.startsWith("/api/ingest/")) {
    if (!(await ingestAuthorized(c))) {
      await new Promise((r) => setTimeout(r, 300));
      return c.json({ error: "Token de ingest ausente ou inválido", code: "ingest_unauthorized" }, 401);
    }
    return next();
  }
  if (!(await isAuthenticated(c.req.header("cookie") ?? null, c.env.APP_PASSWORD))) {
    return c.json({ error: "Não autenticado" }, 401);
  }
  return next();
});

// ───────────────────────── auth ─────────────────────────

app.get("/health", (c) => c.json({ ok: true }));

app.post("/auth/login", async (c) => {
  const { password } = await body(c);
  if (typeof password !== "string" || !(await passwordMatches(password, c.env.APP_PASSWORD!))) {
    await new Promise((r) => setTimeout(r, 700)); // desacelera força bruta
    return c.json({ error: "Senha incorreta" }, 401);
  }
  c.header("Set-Cookie", await createSessionCookie(c.env.APP_PASSWORD!, isSecure(c)));
  return c.json({ ok: true });
});

app.post("/auth/logout", (c) => {
  c.header("Set-Cookie", clearSessionCookie(isSecure(c)));
  return c.json({ ok: true });
});

app.get("/auth/me", (c) => c.json({ ok: true }));

// ───────────────────────── bootstrap ─────────────────────────

const publicSettings = (rows: { key: string; value: string }[]) =>
  Object.fromEntries(rows.filter((s) => !isPrivateSetting(s.key)).map((s) => [s.key, s.value]));

app.get("/bootstrap", async (c) => {
  const db = c.env.DB;
  const [projects, tasks, settings] = await db.batch([
    db.prepare("SELECT * FROM projects ORDER BY position, created_at"),
    db.prepare("SELECT * FROM tasks ORDER BY position, created_at"),
    db.prepare("SELECT key, value FROM settings"),
  ]);
  return c.json({
    projects: (projects.results as Row[]).map(toProject),
    tasks: tasks.results as unknown as Task[],
    settings: publicSettings(settings.results as { key: string; value: string }[]),
  });
});

// ───────────────────────── projects ─────────────────────────

app.post("/projects", async (c) => {
  const db = c.env.DB;
  const input = pick(await body(c), projectFields);
  if (!input.name) throw new BadRequest("O projeto precisa de um nome");
  const t = now();
  const status = (input.status as string) ?? "idea";
  const min = await db
    .prepare("SELECT MIN(position) AS p FROM projects WHERE status = ?")
    .bind(status)
    .first<{ p: number | null }>();
  const row = {
    id: uid(),
    status,
    position: (min?.p ?? 1000) - 1,
    ...input,
    finished_at: status === "done" ? t : null,
    created_at: t,
    updated_at: t,
  };
  await insertRow(db, "projects", row);
  await logActivity(db, "project_created", `Novo projeto: ${input.name as string}`, row.id, row.id);
  const saved = await db.prepare("SELECT * FROM projects WHERE id = ?").bind(row.id).first<Row>();
  return c.json(toProject(saved!), 201);
});

app.patch("/projects/:id", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  const current = await db.prepare("SELECT * FROM projects WHERE id = ?").bind(id).first<Row>();
  if (!current) return c.json({ error: "Projeto não encontrado" }, 404);
  const input = pick(await body(c), projectFields);
  const t = now();
  if (input.status && input.status !== current.status) {
    if (input.status === "done") {
      input.finished_at = t;
      input.progress = 100;
    } else if (current.status === "done") {
      input.finished_at = null;
    }
    const type = input.status === "done" ? "project_done" : "project_status";
    await logActivity(
      db,
      type,
      input.status === "done"
        ? `Projeto finalizado: ${current.name} 🎉`
        : `${current.name} → ${STATUS_LABEL[input.status as string]}`,
      id,
      id,
    );
  }
  await updateRow(db, "projects", id, { ...input, updated_at: t });
  const saved = await db.prepare("SELECT * FROM projects WHERE id = ?").bind(id).first<Row>();
  return c.json(toProject(saved!));
});

app.delete("/projects/:id", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  const p = await db.prepare("SELECT name FROM projects WHERE id = ?").bind(id).first<{ name: string }>();
  if (!p) return c.json({ error: "Projeto não encontrado" }, 404);
  await db.batch([
    db.prepare("DELETE FROM tasks WHERE project_id = ?").bind(id),
    db.prepare("UPDATE focus_sessions SET project_id = NULL WHERE project_id = ?").bind(id),
    db.prepare("DELETE FROM projects WHERE id = ?").bind(id),
  ]);
  await logActivity(db, "project_deleted", `Projeto removido: ${p.name}`);
  return c.json({ ok: true });
});

// ───────────────────────── tasks ─────────────────────────

app.post("/tasks", async (c) => {
  const db = c.env.DB;
  const b = await body(c);
  const input = { ...pick(b, taskFields), ...pick(b, taskCreateOnlyFields) };
  if (!input.title) throw new BadRequest("A tarefa precisa de um título");
  if (!input.source || !input.external_id) input.external_id = null;
  const t = now();
  const max = await db.prepare("SELECT MAX(position) AS p FROM tasks").first<{ p: number | null }>();
  const row = {
    id: uid(),
    position: (max?.p ?? 0) + 1,
    ...input,
    completed_at: input.status === "done" ? t : null,
    created_at: t,
    updated_at: t,
  };
  await insertRow(db, "tasks", row);
  if (input.external_id) {
    await db
      .prepare("DELETE FROM ingest_ignored WHERE source = ? AND external_id = ?")
      .bind(input.source, input.external_id)
      .run();
  }
  const saved = await db.prepare("SELECT * FROM tasks WHERE id = ?").bind(row.id).first<Task>();
  return c.json(saved, 201);
});

app.patch("/tasks/:id", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  const current = await db.prepare("SELECT * FROM tasks WHERE id = ?").bind(id).first<Task>();
  if (!current) return c.json({ error: "Tarefa não encontrada" }, 404);
  const input = pick(await body(c), taskFields);
  const t = now();
  if (input.status && input.status !== current.status) {
    if (input.status === "done") {
      input.completed_at = t;
      await logActivity(db, "task_done", `Concluiu: ${current.title}`, current.project_id, id);
    } else if (current.status === "done") {
      input.completed_at = null;
    }
  }
  await updateRow(db, "tasks", id, { ...input, updated_at: t });
  return c.json(await db.prepare("SELECT * FROM tasks WHERE id = ?").bind(id).first<Task>());
});

app.delete("/tasks/:id", async (c) => {
  const db = c.env.DB;
  const ext = await db
    .prepare("SELECT source, external_id FROM tasks WHERE id = ?")
    .bind(c.req.param("id"))
    .first<{ source: string | null; external_id: string | null }>();
  if (ext?.source && ext.external_id) {
    // apagou uma tarefa importada: o próximo ingest não deve recriá-la
    await db
      .prepare("INSERT OR IGNORE INTO ingest_ignored (source, external_id, created_at) VALUES (?, ?, ?)")
      .bind(ext.source, ext.external_id, now())
      .run();
  }
  await db.batch([
    db.prepare("UPDATE focus_sessions SET task_id = NULL WHERE task_id = ?").bind(c.req.param("id")),
    db.prepare("DELETE FROM tasks WHERE id = ?").bind(c.req.param("id")),
  ]);
  return c.json({ ok: true });
});

// ───────────────────────── journal ─────────────────────────

app.get("/journal", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM journal ORDER BY date DESC, created_at DESC LIMIT 500").all<JournalEntry>();
  return c.json(results);
});

app.post("/journal", async (c) => {
  const db = c.env.DB;
  const input = pick(await body(c), journalFields);
  if (!input.date) throw new BadRequest("Data obrigatória");
  const t = now();
  const row = { id: uid(), mood: "calm", content: "", ...input, created_at: t, updated_at: t };
  await insertRow(db, "journal", row);
  await logActivity(db, "journal", `Escreveu no diário (${input.date as string})`, null, row.id);
  return c.json(await db.prepare("SELECT * FROM journal WHERE id = ?").bind(row.id).first<JournalEntry>(), 201);
});

app.patch("/journal/:id", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  const input = pick(await body(c), journalFields);
  await updateRow(db, "journal", id, { ...input, updated_at: now() });
  const saved = await db.prepare("SELECT * FROM journal WHERE id = ?").bind(id).first<JournalEntry>();
  if (!saved) return c.json({ error: "Entrada não encontrada" }, 404);
  return c.json(saved);
});

app.delete("/journal/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM journal WHERE id = ?").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});

// ───────────────────────── focus (pomodoro) ─────────────────────────

app.get("/focus", async (c) => {
  const days = Math.round(num(c.req.query("days") ?? 30, "days", 1, 400));
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const { results } = await c.env.DB.prepare("SELECT * FROM focus_sessions WHERE ended_at >= ? ORDER BY ended_at DESC")
    .bind(since)
    .all<FocusSession>();
  return c.json(results);
});

app.post("/focus", async (c) => {
  const db = c.env.DB;
  const b = await body(c);
  const t = now();
  const row = {
    id: uid(),
    project_id: b.project_id ? str(b.project_id, "project_id", 64) : null,
    task_id: b.task_id ? str(b.task_id, "task_id", 64) : null,
    minutes: Math.round(num(b.minutes, "minutes", 1, 600)),
    label: str(b.label, "label", 200),
    started_at: dateOrNull(b.started_at, "started_at") ?? t,
    ended_at: t,
  };
  await insertRow(db, "focus_sessions", row);
  await logActivity(db, "focus", `Sessão de foco: ${row.minutes} min${row.label ? ` · ${row.label}` : ""}`, row.project_id, row.id);
  return c.json(row, 201);
});

// ───────────────────────── activity & stats ─────────────────────────

app.get("/activity", async (c) => {
  const limit = Math.round(num(c.req.query("limit") ?? 30, "limit", 1, 200));
  const project = c.req.query("project_id");
  const stmt = project
    ? c.env.DB.prepare("SELECT * FROM activity WHERE project_id = ? ORDER BY created_at DESC LIMIT ?").bind(project, limit)
    : c.env.DB.prepare("SELECT * FROM activity ORDER BY created_at DESC LIMIT ?").bind(limit);
  return c.json((await stmt.all()).results);
});

app.get("/stats", async (c) => {
  const db = c.env.DB;
  // tz = Date.getTimezoneOffset() do navegador (ex.: 180 para UTC-3).
  const tz = Math.round(num(c.req.query("tz") ?? 0, "tz", -840, 840));
  const mod = `${-tz} minutes`;
  const since = new Date(Date.now() - 372 * 86400_000).toISOString();

  const [heat, focusDay, focusProject, taskXp, totals, focusTotals, journalCount, projectsDone, commitCount] = await db.batch([
    db
      .prepare("SELECT date(created_at, ?) AS day, COUNT(*) AS count FROM activity WHERE created_at >= ? GROUP BY day ORDER BY day")
      .bind(mod, since),
    db
      .prepare("SELECT date(ended_at, ?) AS day, SUM(minutes) AS minutes FROM focus_sessions WHERE ended_at >= ? GROUP BY day ORDER BY day")
      .bind(mod, since),
    db.prepare("SELECT project_id, SUM(minutes) AS minutes FROM focus_sessions GROUP BY project_id ORDER BY minutes DESC"),
    db.prepare(
      `SELECT COALESCE(SUM(CASE priority WHEN 'low' THEN 5 WHEN 'medium' THEN 10 WHEN 'high' THEN 20 ELSE 35 END), 0) AS xp
       FROM tasks WHERE status = 'done'`,
    ),
    db
      .prepare(
        `SELECT
          SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS tasks_done,
          SUM(CASE WHEN status != 'done' THEN 1 ELSE 0 END) AS tasks_open,
          SUM(CASE WHEN status = 'done' AND kind = 'bug' THEN 1 ELSE 0 END) AS bugs_fixed,
          SUM(CASE WHEN status = 'done' AND kind = 'support' THEN 1 ELSE 0 END) AS support_done,
          SUM(CASE WHEN status = 'done' AND CAST(strftime('%H', completed_at, ?) AS INTEGER) < 7
                   AND CAST(strftime('%H', completed_at, ?) AS INTEGER) >= 4 THEN 1 ELSE 0 END) AS early_tasks,
          SUM(CASE WHEN status = 'done' AND CAST(strftime('%H', completed_at, ?) AS INTEGER) < 4 THEN 1 ELSE 0 END) AS night_tasks
        FROM tasks`,
      )
      .bind(mod, mod, mod),
    db.prepare("SELECT COALESCE(SUM(minutes), 0) AS minutes, COUNT(*) AS sessions FROM focus_sessions"),
    db.prepare("SELECT COUNT(*) AS n FROM journal"),
    db.prepare("SELECT COUNT(*) AS n FROM projects WHERE status = 'done'"),
    db.prepare("SELECT COUNT(*) AS n FROM activity WHERE type = 'commit'"),
  ]);

  const heatmap = heat.results as { day: string; count: number }[];
  const t = (totals.results[0] ?? {}) as Record<string, number | null>;
  const f = focusTotals.results[0] as { minutes: number; sessions: number };
  const journal = (journalCount.results[0] as { n: number }).n;
  const pDone = (projectsDone.results[0] as { n: number }).n;
  const commits = (commitCount.results[0] as { n: number }).n;
  const xp = (taskXp.results[0] as { xp: number }).xp + pDone * 150 + f.minutes + journal * 15 + commits * 2;

  // Sequência de dias com atividade (hoje ou ontem contam como "ainda vivo").
  const days = new Set(heatmap.filter((h) => h.count > 0).map((h) => h.day));
  const localToday = new Date(Date.now() - tz * 60_000);
  const key = (offset: number) => new Date(localToday.getTime() - offset * 86400_000).toISOString().slice(0, 10);
  let streak = 0;
  const start = days.has(key(0)) ? 0 : 1;
  while (days.has(key(start + streak))) streak++;
  let best = 0;
  let run = 0;
  let prev: number | null = null;
  for (const d of [...days].sort()) {
    const ms = Date.parse(d);
    run = prev !== null && ms - prev === 86400_000 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = ms;
  }

  const stats: Stats = {
    xp,
    streak,
    best_streak: best,
    heatmap,
    focus_by_day: focusDay.results as { day: string; minutes: number }[],
    focus_by_project: focusProject.results as { project_id: string | null; minutes: number }[],
    totals: {
      tasks_done: t.tasks_done ?? 0,
      tasks_open: t.tasks_open ?? 0,
      projects_done: pDone,
      focus_minutes: f.minutes,
      focus_sessions: f.sessions,
      journal_entries: journal,
      bugs_fixed: t.bugs_fixed ?? 0,
      support_done: t.support_done ?? 0,
      early_tasks: t.early_tasks ?? 0,
      night_tasks: t.night_tasks ?? 0,
      commits,
    },
  };
  return c.json(stats);
});

// ───────────────────────── settings ─────────────────────────

app.put("/settings", async (c) => {
  const db = c.env.DB;
  const b = await body(c);
  const entries = Object.entries(b)
    .filter(([k]) => /^[a-z_]{1,40}$/.test(k) && !isPrivateSetting(k))
    .slice(0, 50);
  if (entries.length) {
    await db.batch(
      entries.map(([k, v]) =>
        db
          .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
          .bind(k, String(v).slice(0, 5000)),
      ),
    );
  }
  return c.json({ ok: true });
});

// ───────────────────────── backup ─────────────────────────

app.get("/export", async (c) => {
  const db = c.env.DB;
  const [projects, tasks, journal, focus, settings] = await db.batch([
    db.prepare("SELECT * FROM projects"),
    db.prepare("SELECT * FROM tasks"),
    db.prepare("SELECT * FROM journal"),
    db.prepare("SELECT * FROM focus_sessions"),
    db.prepare("SELECT key, value FROM settings"),
  ]);
  const file: BackupFile = {
    app: "afazeres",
    version: 1,
    exported_at: now(),
    projects: (projects.results as Row[]).map(toProject),
    tasks: tasks.results as unknown as Task[],
    journal: journal.results as unknown as JournalEntry[],
    focus: focus.results as unknown as FocusSession[],
    settings: publicSettings(settings.results as { key: string; value: string }[]),
  };
  return c.json(file);
});

const COLUMNS = {
  projects: [
    "id", "name", "description", "status", "type", "priority", "client", "color", "icon", "stack", "repo_url",
    "live_url", "docs_url", "progress", "start_date", "due_date", "finished_at", "notes", "pinned", "position",
    "created_at", "updated_at",
  ],
  tasks: [
    "id", "project_id", "title", "notes", "status", "kind", "priority", "due_date", "position", "completed_at",
    "created_at", "updated_at", "source", "external_id", "external_url", "needs_review",
  ],
  journal: ["id", "date", "mood", "content", "created_at", "updated_at"],
  focus_sessions: ["id", "project_id", "task_id", "minutes", "label", "started_at", "ended_at"],
} as const;

app.post("/import", async (c) => {
  const db = c.env.DB;
  const file = (await body(c)) as unknown as BackupFile;
  if (file.app !== "afazeres" || !Array.isArray(file.projects) || !Array.isArray(file.tasks)) {
    throw new BadRequest("Arquivo de backup inválido");
  }
  const stmts: D1PreparedStatement[] = [
    db.prepare("DELETE FROM focus_sessions"),
    db.prepare("DELETE FROM tasks"),
    db.prepare("DELETE FROM journal"),
    db.prepare("DELETE FROM projects"),
  ];
  const push = (table: keyof typeof COLUMNS, rows: Row[] | undefined) => {
    for (const r of rows ?? []) {
      const cols = COLUMNS[table];
      const values = cols.map((k) => {
        const v = r[k];
        if (k === "stack") return JSON.stringify(Array.isArray(v) ? v : safeJson(String(v ?? "[]"), []));
        if (k === "pinned" || k === "needs_review") return v ? 1 : 0;
        return v ?? null;
      });
      stmts.push(
        db.prepare(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`).bind(...values),
      );
    }
  };
  push("projects", file.projects as unknown as Row[]);
  push("tasks", file.tasks as unknown as Row[]);
  push("journal", file.journal as unknown as Row[]);
  push("focus_sessions", file.focus as unknown as Row[]);
  for (const [k, v] of Object.entries(file.settings ?? {})) {
    if (isPrivateSetting(k)) continue;
    stmts.push(
      db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(k, String(v)),
    );
  }
  await db.batch(stmts); // batch = transação: ou importa tudo, ou nada.
  await logActivity(db, "import", `Backup importado (${file.projects.length} projetos, ${file.tasks.length} tarefas)`);
  return c.json({ ok: true });
});

// ───────────────────────── GitHub ─────────────────────────

app.get("/github/repos", async (c) => {
  const token = c.env.GITHUB_TOKEN?.trim() ?? "";
  const hasToken = Boolean(token);
  const fresh = c.req.query("fresh") === "1";
  const user = (c.req.query("user") ?? "").trim();
  if (user && !/^[A-Za-z0-9-]{1,39}$/.test(user)) throw new BadRequest("Usuário do GitHub inválido");

  let login = user;
  let tokenLogin = "";
  let path: (page: number) => string;
  const meta = { scopes: null as string | null };
  if (hasToken) {
    const me = await gh<{ login: string }>(c.env, "/user", 3600, { fresh, meta });
    login = me.login;
  }
  if (hasToken && (!user || user.toLowerCase() === login.toLowerCase())) {
    // com token: inclui privados e repos de organizações
    path = (page) => `/user/repos?per_page=100&page=${page}&sort=pushed&affiliation=owner,collaborator,organization_member`;
  } else {
    if (!user) throw new BadRequest("Informe o usuário do GitHub");
    tokenLogin = login;
    login = user;
    path = (page) => `/users/${user}/repos?per_page=100&page=${page}&sort=pushed&type=owner`;
  }

  const repos: GithubRepo[] = [];
  for (let page = 1; page <= 3; page++) {
    const batch = await gh<RawRepo[]>(c.env, path(page), 300, { fresh });
    repos.push(...batch.map(toRepo));
    if (batch.length < 100) break;
  }
  const result: GithubRepoList = {
    authenticated: hasToken,
    login,
    repos,
    // ajuda a diagnosticar por que os privados não aparecem
    token_kind: !hasToken ? null : token.startsWith("github_pat_") ? "fine-grained" : token.startsWith("ghp_") ? "classic" : "other",
    scopes: meta.scopes,
    listed_as_user: hasToken && !path(1).startsWith("/users/"),
    token_login: tokenLogin || (hasToken ? login : null),
  };
  return c.json(result);
});

app.get("/github/repo", async (c) => {
  const full = c.req.query("repo") ?? "";
  if (!/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/.test(full)) throw new BadRequest("Repositório inválido");
  const r = await gh<RawRepo>(c.env, `/repos/${full}`);
  let last_commit: GithubRepoDetail["last_commit"] = null;
  try {
    const commits = await gh<
      { sha: string; html_url: string; commit: { message: string; author: { name: string; date: string } | null } }[]
    >(c.env, `/repos/${full}/commits?per_page=1`);
    const k = commits[0];
    if (k) {
      last_commit = {
        sha: k.sha.slice(0, 7),
        message: k.commit.message.split("\n")[0].slice(0, 200),
        date: k.commit.author?.date ?? r.pushed_at,
        url: k.html_url,
        author: k.commit.author?.name ?? "",
      };
    }
  } catch {
    /* repo vazio ou sem acesso a commits */
  }
  const detail: GithubRepoDetail = {
    full_name: r.full_name,
    html_url: r.html_url,
    description: r.description ?? "",
    language: r.language,
    default_branch: r.default_branch,
    stars: r.stargazers_count,
    open_issues: r.open_issues_count,
    private: r.private,
    archived: r.archived,
    pushed_at: r.pushed_at,
    last_commit,
  };
  return c.json(detail);
});

// ───────────────────────── ingest (assistente / automações) ─────────────────────────
// Autenticação: Authorization: Bearer <token>. Vale o token cujo SHA-256 está em
// settings.ingest_token_sha256 (gerado fora do app) ou o segredo INGEST_TOKEN do Worker.

const INGEST_HASH_KEY = "ingest_token_sha256";
const INGEST_MAX_ITEMS = 100;
const INGEST_MAX_BYTES = 512 * 1024;

async function ingestAuthorized(c: AppCtx): Promise<boolean> {
  const m = /^Bearer\s+(\S{16,512})$/i.exec((c.req.header("authorization") ?? "").trim());
  if (!m) return false;
  const token = m[1];
  let ok = false;
  const row = await c.env.DB.prepare("SELECT value FROM settings WHERE key = ?")
    .bind(INGEST_HASH_KEY)
    .first<{ value: string }>();
  const stored = row?.value.trim().toLowerCase() ?? "";
  if (/^[0-9a-f]{64}$/.test(stored)) ok = hexEquals(await sha256Hex(token), stored);
  const envToken = c.env.INGEST_TOKEN?.trim();
  if (envToken && (await passwordMatches(token, envToken))) ok = true;
  return ok;
}

async function ingestItems(c: AppCtx): Promise<Record<string, unknown>[]> {
  const len = Number(c.req.header("content-length") ?? 0);
  if (len > INGEST_MAX_BYTES) throw new BadRequest(`Corpo grande demais (máx. ${INGEST_MAX_BYTES / 1024} KB)`);
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new BadRequest("JSON inválido");
  }
  const list = Array.isArray(raw) ? raw : (raw as { items?: unknown } | null)?.items;
  if (!Array.isArray(list)) throw new BadRequest('Envie uma lista de itens (ou { "items": [...] })');
  if (list.length > INGEST_MAX_ITEMS) throw new BadRequest(`No máximo ${INGEST_MAX_ITEMS} itens por requisição`);
  return list.map((x) => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {}));
}

/** github.com/Dono/Repo.git/ → github.com/dono/repo */
function normRepo(u: unknown): string {
  return String(u ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "")
    .replace(/\.git$/, "")
    .replace(/\/+$/, "");
}

const normName = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

type ProjectRef = { id: string; name: string; client: string; repo_url: string };

/** Acha o projeto por id → repo_url → nome → cliente. undefined = sem pista; null = pista sem projeto. */
function resolveProject(projects: ProjectRef[], it: Record<string, unknown>): ProjectRef | null | undefined {
  const { project_id, project_repo_url, project_name, client } = it;
  if (!project_id && !project_repo_url && !project_name && !client) return undefined;
  if (project_id) {
    const p = projects.find((x) => x.id === project_id);
    if (p) return p;
  }
  if (project_repo_url) {
    const r = normRepo(project_repo_url);
    const p = r ? projects.find((x) => x.repo_url && normRepo(x.repo_url) === r) : undefined;
    if (p) return p;
  }
  if (project_name) {
    const n = normName(project_name);
    const p = projects.find((x) => normName(x.name) === n);
    if (p) return p;
  }
  if (client) {
    const n = normName(client);
    const hits = projects.filter((x) => normName(x.client) === n);
    if (hits.length === 1) return hits[0];
  }
  return null;
}

/** SELECT ... WHERE col IN (...) em blocos (o D1 aceita até 100 parâmetros). */
async function selectIn<T>(db: D1Database, sql: (marks: string) => string, fixed: unknown[], values: string[]): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < values.length; i += 90) {
    const chunk = values.slice(i, i + 90);
    const { results } = await db
      .prepare(sql(chunk.map(() => "?").join(", ")))
      .bind(...fixed, ...chunk)
      .all<T>();
    out.push(...results);
  }
  return out;
}

type IngestResult = {
  index: number;
  source?: string;
  external_id?: string;
  action: "created" | "updated" | "unchanged" | "ignored" | "error";
  id?: string;
  error?: string;
  warnings?: string[];
};

app.post("/ingest/tasks", async (c) => {
  const db = c.env.DB;
  const items = await ingestItems(c);
  const t = now();
  const [projectsRes, maxRes] = await db.batch([
    db.prepare("SELECT id, name, client, repo_url FROM projects"),
    db.prepare("SELECT MAX(position) AS p FROM tasks"),
  ]);
  const projects = projectsRes.results as ProjectRef[];
  let position = ((maxRes.results[0] as { p: number | null } | undefined)?.p ?? 0) + 1;

  // 1) valida tudo antes de tocar no banco
  type Parsed = {
    index: number;
    source: string;
    external_id: string;
    fields: Record<string, unknown>;
    project: ProjectRef | null | undefined;
    needsReview: boolean | undefined;
    completedAt: string | null;
    warnings: string[];
  };
  const results: IngestResult[] = [];
  const parsed: Parsed[] = [];
  const seen = new Set<string>();
  items.forEach((it, index) => {
    try {
      const source = sourceName(it.source);
      const external_id = externalId(it.external_id);
      const key = `${source}\u0000${external_id}`;
      if (seen.has(key)) throw new BadRequest("Item repetido na mesma requisição");
      seen.add(key);
      const fields = pick(it, {
        title: taskFields.title,
        notes: taskFields.notes,
        status: taskFields.status,
        kind: taskFields.kind,
        priority: taskFields.priority,
        due_date: taskFields.due_date,
        external_url: taskCreateOnlyFields.external_url,
      });
      const warnings: string[] = [];
      const project = resolveProject(projects, it);
      if (project === null) warnings.push("projeto não encontrado; tarefa fica sem projeto");
      parsed.push({
        index,
        source,
        external_id,
        fields,
        project,
        needsReview: "needs_review" in it ? Boolean(it.needs_review) : undefined,
        completedAt: dateOrNull(it.completed_at, "completed_at"),
        warnings,
      });
    } catch (e) {
      if (!(e instanceof BadRequest)) throw e;
      results.push({ index, action: "error", error: e.message });
    }
  });

  // 2) carrega o que já existe (e o que foi apagado de propósito)
  const bySource = new Map<string, string[]>();
  for (const p of parsed) bySource.set(p.source, [...(bySource.get(p.source) ?? []), p.external_id]);
  const existing = new Map<string, Task>();
  const ignored = new Set<string>();
  for (const [source, ids] of bySource) {
    const rows = await selectIn<Task>(db, (m) => `SELECT * FROM tasks WHERE source = ? AND external_id IN (${m})`, [source], ids);
    for (const r of rows) existing.set(`${source}\u0000${r.external_id}`, r);
    const ign = await selectIn<{ external_id: string }>(
      db,
      (m) => `SELECT external_id FROM ingest_ignored WHERE source = ? AND external_id IN (${m})`,
      [source],
      ids,
    );
    for (const r of ign) ignored.add(`${source}\u0000${r.external_id}`);
  }

  // 3) monta as escritas e roda tudo num batch só
  const stmts: D1PreparedStatement[] = [];
  const activity = (title: string, projectId: string | null, id: string) =>
    db
      .prepare("INSERT INTO activity (id, type, project_id, entity_id, message, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(uid(), "task_done", projectId, id, `Concluiu: ${title}`, t);

  for (const p of parsed) {
    const key = `${p.source}\u0000${p.external_id}`;
    const cur = existing.get(key);
    const base = { index: p.index, source: p.source, external_id: p.external_id, warnings: p.warnings.length ? p.warnings : undefined };
    if (!cur) {
      if (ignored.has(key)) {
        results.push({ ...base, action: "ignored", error: "apagada manualmente antes; não recriada" });
        continue;
      }
      if (!p.fields.title) {
        results.push({ ...base, action: "error", error: "A tarefa precisa de um título" });
        continue;
      }
      const status = (p.fields.status as string) ?? "todo";
      const row: Record<string, unknown> = {
        id: uid(),
        project_id: p.project?.id ?? null,
        notes: "",
        kind: "feature",
        priority: "medium",
        position: position++,
        ...p.fields,
        status,
        source: p.source,
        external_id: p.external_id,
        needs_review: p.needsReview ? 1 : 0,
        completed_at: status === "done" ? (p.completedAt ?? t) : null,
        created_at: t,
        updated_at: t,
      };
      const keys = Object.keys(row);
      stmts.push(
        db
          .prepare(`INSERT INTO tasks (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`)
          .bind(...keys.map((k) => row[k] ?? null)),
      );
      results.push({ ...base, action: "created", id: row.id as string });
      continue;
    }

    // atualização: só o que veio no item e mudou de fato
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(p.fields)) {
      if ((cur as unknown as Row)[k] !== v) patch[k] = v;
    }
    if (p.project && p.project.id !== cur.project_id) patch.project_id = p.project.id;
    // needs_review=true não volta a marcar uma tarefa já aprovada; false limpa
    if (p.needsReview === false && cur.needs_review) patch.needs_review = 0;
    if (patch.status && patch.status !== cur.status) {
      if (patch.status === "done") {
        patch.completed_at = p.completedAt ?? t;
        stmts.push(activity((patch.title as string) ?? cur.title, (patch.project_id as string) ?? cur.project_id, cur.id));
      } else if (cur.status === "done") {
        patch.completed_at = null;
      }
    }
    if (!Object.keys(patch).length) {
      results.push({ ...base, action: "unchanged", id: cur.id });
      continue;
    }
    patch.updated_at = t;
    const keys = Object.keys(patch);
    stmts.push(
      db
        .prepare(`UPDATE tasks SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`)
        .bind(...keys.map((k) => patch[k] ?? null), cur.id),
    );
    results.push({ ...base, action: "updated", id: cur.id });
  }

  if (stmts.length) await db.batch(stmts); // transação: tudo ou nada
  const counts = { created: 0, updated: 0, unchanged: 0, ignored: 0, error: 0 };
  for (const r of results) counts[r.action]++;
  results.sort((a, b) => a.index - b.index);
  return c.json({ ok: counts.error === 0, counts, results });
});

app.post("/ingest/projects", async (c) => {
  const db = c.env.DB;
  const items = await ingestItems(c);
  if (items.length > 50) throw new BadRequest("No máximo 50 projetos por requisição");
  const { results: rows } = await db.prepare("SELECT * FROM projects").all<Row>();
  const out: { index: number; action: "created" | "updated" | "unchanged" | "error"; id?: string; name?: string; error?: string }[] = [];
  for (const [index, it] of items.entries()) {
    try {
      const input = pick(it, projectFields);
      const repo = normRepo(input.repo_url);
      const name = normName(input.name);
      const cur =
        (it.id ? rows.find((r) => r.id === it.id) : undefined) ??
        (repo ? rows.find((r) => r.repo_url && normRepo(r.repo_url) === repo) : undefined) ??
        (name ? rows.find((r) => normName(r.name) === name) : undefined);
      const t = now();
      if (!cur) {
        if (!input.name) throw new BadRequest("O projeto precisa de um nome");
        const status = (input.status as string) ?? "idea";
        const sameStatus = rows.filter((r) => r.status === status).map((r) => Number(r.position) || 0);
        const row: Record<string, unknown> = {
          id: uid(),
          status,
          position: (sameStatus.length ? Math.min(...sameStatus) : 1000) - 1,
          ...input,
          finished_at: status === "done" ? t : null,
          created_at: t,
          updated_at: t,
        };
        await insertRow(db, "projects", row);
        await logActivity(db, "project_created", `Novo projeto: ${input.name as string}`, row.id as string, row.id as string);
        rows.push(row);
        out.push({ index, action: "created", id: row.id as string, name: input.name as string });
        continue;
      }
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(input)) if (cur[k] !== v) patch[k] = v;
      if (patch.name && normName(patch.name) === normName(cur.name)) delete patch.name; // achou pelo nome: não troca a grafia
      if (patch.status) {
        if (patch.status === "done") patch.finished_at = t;
        else if (cur.status === "done") patch.finished_at = null;
        await logActivity(
          db,
          patch.status === "done" ? "project_done" : "project_status",
          patch.status === "done"
            ? `Projeto finalizado: ${cur.name as string} 🎉`
            : `${cur.name as string} → ${STATUS_LABEL[patch.status as string]}`,
          cur.id as string,
          cur.id as string,
        );
      }
      if (!Object.keys(patch).length) {
        out.push({ index, action: "unchanged", id: cur.id as string, name: cur.name as string });
        continue;
      }
      await updateRow(db, "projects", cur.id as string, { ...patch, updated_at: t });
      Object.assign(cur, patch);
      out.push({ index, action: "updated", id: cur.id as string, name: cur.name as string });
    } catch (e) {
      if (!(e instanceof BadRequest)) throw e;
      out.push({ index, action: "error", error: e.message });
    }
  }
  return c.json({ ok: out.every((r) => r.action !== "error"), results: out });
});

/** Visão compacta para o assistente: projetos e tarefas (abertas, ou todas com ?all=1). */
app.get("/ingest/summary", async (c) => {
  const db = c.env.DB;
  const all = c.req.query("all") === "1";
  const source = c.req.query("source");
  const where: string[] = [];
  const params: string[] = [];
  if (!all) where.push("status != 'done'");
  if (source) {
    where.push("source = ?");
    params.push(sourceName(source));
  }
  const [projects, tasks, counts] = await db.batch([
    db.prepare(
      "SELECT id, name, status, type, priority, client, repo_url, live_url, progress, due_date, updated_at FROM projects ORDER BY status, name",
    ),
    db
      .prepare(
        `SELECT id, project_id, title, status, kind, priority, due_date, source, external_id, external_url, needs_review,
                completed_at, created_at, updated_at
         FROM tasks ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC LIMIT 1000`,
      )
      .bind(...params),
    db.prepare(
      `SELECT COALESCE(source, 'manual') AS source, status, COUNT(*) AS n,
              SUM(CASE WHEN needs_review = 1 THEN 1 ELSE 0 END) AS needs_review
       FROM tasks GROUP BY 1, 2 ORDER BY 1, 2`,
    ),
  ]);
  return c.json({
    generated_at: now(),
    projects: projects.results,
    tasks: tasks.results,
    counts: counts.results,
  });
});

// ───────────────────────── automação ─────────────────────────

app.get("/automation/status", async (c) => c.json(await automationStatus(c.env)));

app.post("/automation/sync", async (c) => c.json(await runSync(c.env, true)));

app.post("/automation/journal", async (c) => {
  let date: string | null = null;
  try {
    const b = (await c.req.json()) as { date?: unknown };
    if (typeof b.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.date)) date = b.date;
  } catch {
    /* sem corpo: hoje */
  }
  const entry = await runJournal(c.env, date, true);
  return c.json({ ok: true, entry });
});

app.all("*", (c) => c.json({ error: "Rota não encontrada" }, 404));

export default {
  fetch: app.fetch,
  // Cron Trigger (wrangler.jsonc → triggers.crons): sincroniza o GitHub e escreve o diário
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      (async () => {
        await ensureSchema(env.DB);
        await runScheduled(env);
      })(),
    );
  },
} satisfies ExportedHandler<Env>;
