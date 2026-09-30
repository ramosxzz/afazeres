// Migrações do D1 aplicadas automaticamente pelo próprio Worker.
// Para evoluir o schema, adicione um novo item no fim da lista (nunca edite um já publicado).

const MIGRATIONS: { id: number; name: string; statements: string[] }[] = [
  {
    id: 1,
    name: "initial",
    statements: [
      `CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'idea',
        type TEXT NOT NULL DEFAULT 'fullstack',
        priority TEXT NOT NULL DEFAULT 'medium',
        client TEXT NOT NULL DEFAULT '',
        color TEXT NOT NULL DEFAULT '#8b95a5',
        icon TEXT NOT NULL DEFAULT '桜',
        stack TEXT NOT NULL DEFAULT '[]',
        repo_url TEXT NOT NULL DEFAULT '',
        live_url TEXT NOT NULL DEFAULT '',
        docs_url TEXT NOT NULL DEFAULT '',
        progress INTEGER NOT NULL DEFAULT 0,
        start_date TEXT,
        due_date TEXT,
        finished_at TEXT,
        notes TEXT NOT NULL DEFAULT '',
        pinned INTEGER NOT NULL DEFAULT 0,
        position REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'todo',
        kind TEXT NOT NULL DEFAULT 'feature',
        priority TEXT NOT NULL DEFAULT 'medium',
        due_date TEXT,
        position REAL NOT NULL DEFAULT 0,
        completed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id)`,
      `CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`,
      `CREATE TABLE IF NOT EXISTS journal (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        mood TEXT NOT NULL DEFAULT 'calm',
        content TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_journal_date ON journal(date)`,
      `CREATE TABLE IF NOT EXISTS focus_sessions (
        id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
        task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
        minutes INTEGER NOT NULL,
        label TEXT NOT NULL DEFAULT '',
        started_at TEXT NOT NULL,
        ended_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS activity (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        project_id TEXT,
        entity_id TEXT,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_activity_created ON activity(created_at)`,
      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )`,
    ],
  },
];

let migrated = false;

export async function ensureSchema(db: D1Database): Promise<void> {
  if (migrated) return;
  await db.prepare(
    "CREATE TABLE IF NOT EXISTS _migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)",
  ).run();
  const { results } = await db.prepare("SELECT id FROM _migrations").all<{ id: number }>();
  const applied = new Set(results.map((r) => r.id));
  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue;
    try {
      await db.batch([
        ...m.statements.map((s) => db.prepare(s)),
        db
          .prepare("INSERT OR IGNORE INTO _migrations (id, name, applied_at) VALUES (?, ?, ?)")
          .bind(m.id, m.name, new Date().toISOString()),
      ]);
    } catch (err) {
      // Outra instância pode ter aplicado a mesma migração ao mesmo tempo.
      const again = await db.prepare("SELECT id FROM _migrations WHERE id = ?").bind(m.id).first();
      if (!again) throw err;
    }
  }
  migrated = true;
}

export const now = () => new Date().toISOString();
export const uid = () => crypto.randomUUID();

export async function logActivity(
  db: D1Database,
  type: string,
  message: string,
  projectId: string | null = null,
  entityId: string | null = null,
) {
  await db
    .prepare("INSERT INTO activity (id, type, project_id, entity_id, message, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(uid(), type, projectId, entityId, message, now())
    .run();
}
