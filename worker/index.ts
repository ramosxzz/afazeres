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
import { clearSessionCookie, createSessionCookie, isAuthenticated, passwordMatches } from "./auth";
import { ensureSchema, logActivity, now, uid } from "./db";

interface Env {
  DB: D1Database;
  APP_PASSWORD?: string;
  /** opcional: token do GitHub (read-only) para ver repos privados e ter limite maior */
  GITHUB_TOKEN?: string;
  /** opcional: outra URL da API (GitHub Enterprise ou testes locais) */
  GITHUB_API_URL?: string;
}

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
};

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
    settings: Object.fromEntries((settings.results as { key: string; value: string }[]).map((s) => [s.key, s.value])),
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
  const input = pick(await body(c), taskFields);
  if (!input.title) throw new BadRequest("A tarefa precisa de um título");
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

  const [heat, focusDay, focusProject, taskXp, totals, focusTotals, journalCount, projectsDone] = await db.batch([
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
  ]);

  const heatmap = heat.results as { day: string; count: number }[];
  const t = (totals.results[0] ?? {}) as Record<string, number | null>;
  const f = focusTotals.results[0] as { minutes: number; sessions: number };
  const journal = (journalCount.results[0] as { n: number }).n;
  const pDone = (projectsDone.results[0] as { n: number }).n;
  const xp = (taskXp.results[0] as { xp: number }).xp + pDone * 150 + f.minutes + journal * 15;

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
    },
  };
  return c.json(stats);
});

// ───────────────────────── settings ─────────────────────────

app.put("/settings", async (c) => {
  const db = c.env.DB;
  const b = await body(c);
  const entries = Object.entries(b)
    .filter(([k]) => /^[a-z_]{1,40}$/.test(k))
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
    settings: Object.fromEntries((settings.results as { key: string; value: string }[]).map((s) => [s.key, s.value])),
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
    "created_at", "updated_at",
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
        if (k === "pinned") return v ? 1 : 0;
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
    stmts.push(
      db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(k, String(v)),
    );
  }
  await db.batch(stmts); // batch = transação: ou importa tudo, ou nada.
  await logActivity(db, "import", `Backup importado (${file.projects.length} projetos, ${file.tasks.length} tarefas)`);
  return c.json({ ok: true });
});

// ───────────────────────── GitHub ─────────────────────────

class GithubError extends Error {
  constructor(
    message: string,
    public status: 400 | 401 | 404 | 429 | 502,
  ) {
    super(message);
  }
}

interface GhOpts {
  /** ignora o cache (botão "Buscar") */
  fresh?: boolean;
  /** recebe os escopos do token clássico (header x-oauth-scopes) */
  meta?: { scopes: string | null };
}

/** GET na API do GitHub com cache de alguns minutos (Cache API do Workers). */
async function gh<T>(env: Env, path: string, ttl = 300, opts: GhOpts = {}): Promise<T> {
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

interface RawRepo {
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

const toRepo = (r: RawRepo): GithubRepo => ({
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

app.all("*", (c) => c.json({ error: "Rota não encontrada" }, 404));

export default app;
