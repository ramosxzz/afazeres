// Tipos compartilhados entre o front-end e o Worker.

export const PROJECT_STATUSES = ["idea", "active", "paused", "support", "done", "archived"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_TYPES = ["frontend", "backend", "fullstack", "mobile", "infra", "design", "other"] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export const PRIORITIES = ["low", "medium", "high", "critical"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const TASK_STATUSES = ["todo", "doing", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_KINDS = ["feature", "bug", "support", "chore", "study"] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

export const MOODS = ["fire", "happy", "calm", "tired", "stressed"] as const;
export type Mood = (typeof MOODS)[number];

export interface Project {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  type: ProjectType;
  priority: Priority;
  client: string;
  color: string;
  icon: string;
  stack: string[];
  repo_url: string;
  live_url: string;
  docs_url: string;
  progress: number;
  start_date: string | null;
  due_date: string | null;
  finished_at: string | null;
  notes: string;
  pinned: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  project_id: string | null;
  title: string;
  notes: string;
  status: TaskStatus;
  kind: TaskKind;
  priority: Priority;
  due_date: string | null;
  position: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  /** origem quando veio de fora (ex.: "github", "whatsapp"); null = criada no app */
  source?: string | null;
  /** id na origem (ex.: "ramosxzz/repo#12" ou id da mensagem) */
  external_id?: string | null;
  external_url?: string | null;
  /** 1 = criada automaticamente e ainda não revisada */
  needs_review?: number;
}

export interface JournalEntry {
  id: string;
  date: string;
  mood: Mood;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface FocusSession {
  id: string;
  project_id: string | null;
  task_id: string | null;
  minutes: number;
  label: string;
  started_at: string;
  ended_at: string;
}

export interface Activity {
  id: string;
  type: string;
  project_id: string | null;
  entity_id: string | null;
  message: string;
  created_at: string;
}

export interface Stats {
  xp: number;
  streak: number;
  best_streak: number;
  heatmap: { day: string; count: number }[];
  focus_by_day: { day: string; minutes: number }[];
  focus_by_project: { project_id: string | null; minutes: number }[];
  totals: {
    tasks_done: number;
    tasks_open: number;
    projects_done: number;
    focus_minutes: number;
    focus_sessions: number;
    journal_entries: number;
    bugs_fixed: number;
    support_done: number;
    early_tasks: number;
    night_tasks: number;
    commits: number;
  };
}

export type ProjectInput = Partial<Omit<Project, "id" | "created_at" | "updated_at">>;
export type TaskInput = Partial<Omit<Task, "id" | "created_at" | "updated_at">>;
export type JournalInput = Partial<Omit<JournalEntry, "id" | "created_at" | "updated_at">>;

export interface BackupFile {
  app: "afazeres";
  version: 1;
  exported_at: string;
  projects: Project[];
  tasks: Task[];
  journal: JournalEntry[];
  focus: FocusSession[];
  settings: Record<string, string>;
}

// ───────────── GitHub ─────────────

export interface GithubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string;
  html_url: string;
  homepage: string;
  language: string | null;
  topics: string[];
  private: boolean;
  archived: boolean;
  fork: boolean;
  stars: number;
  created_at: string;
  pushed_at: string;
}

export interface GithubRepoList {
  authenticated: boolean;
  login: string;
  repos: GithubRepo[];
  token_kind: "fine-grained" | "classic" | "other" | null;
  /** escopos do token clássico (ex.: "repo, read:org") */
  scopes: string | null;
  /** true quando a lista veio de /user/repos (com privados), false quando de /users/{nome}/repos */
  listed_as_user: boolean;
  /** dono do token (quando há token) */
  token_login: string | null;
}

export interface GithubRepoDetail {
  full_name: string;
  html_url: string;
  description: string;
  language: string | null;
  default_branch: string;
  stars: number;
  open_issues: number;
  private: boolean;
  archived: boolean;
  pushed_at: string;
  last_commit: { sha: string; message: string; date: string; url: string; author: string } | null;
}

// ───────────── Automação ─────────────

export interface SyncResult {
  ok: boolean;
  at: string;
  message: string;
  repos: number;
  commits: number;
  issues_created: number;
  issues_closed: number;
  projects_created: number;
  status_changed: number;
  errors: string[];
}

export interface AutomationStatus {
  has_token: boolean;
  last_sync: SyncResult | null;
  last_journal: string | null;
}
