import { create } from "zustand";
import type { Project, ProjectInput, Stats, Task, TaskInput } from "@shared/types";
import { api } from "./api";
import { levelInfo } from "./lib/xp";
import { playFurin, playPop, playTaiko } from "./lib/sound";

export type ThemeId = "yozakura" | "neotokyo" | "washi" | "matcha";

export interface Prefs {
  theme: ThemeId;
  petals: boolean;
  sound: boolean;
  focus_minutes: number;
  short_break: number;
  long_break: number;
  display_name: string;
}

const DEFAULT_PREFS: Prefs = {
  theme: "yozakura",
  petals: true,
  sound: true,
  focus_minutes: 25,
  short_break: 5,
  long_break: 15,
  display_name: "ramosxzz",
};

export interface Toast {
  id: number;
  text: string;
  tone: "info" | "success" | "error";
  kanji?: string;
  action?: { label: string; run: () => void };
}

export type Celebration =
  | { kind: "project"; title: string; color: string }
  | { kind: "level"; level: number; rank: string; rankKanji: string };

export type PomodoroMode = "focus" | "short" | "long";

export interface Pomodoro {
  mode: PomodoroMode;
  running: boolean;
  endsAt: number | null;
  remaining: number; // ms quando pausado
  duration: number; // ms
  startedAt: string | null;
  projectId: string | null;
  taskId: string | null;
  label: string;
  cycles: number; // focos completos nesta rodada
}

interface State {
  auth: "unknown" | "in" | "out";
  loaded: boolean;
  projects: Project[];
  tasks: Task[];
  prefs: Prefs;
  stats: Stats | null;
  toasts: Toast[];
  celebrations: Celebration[];
  paletteOpen: boolean;
  helpOpen: boolean;
  projectForm: { open: boolean; project?: Project; status?: Project["status"] };
  taskForm: { open: boolean; task?: Task; projectId?: string | null };
  pomodoro: Pomodoro;

  setAuth: (a: State["auth"]) => void;
  load: () => Promise<void>;
  refreshStats: () => Promise<void>;
  toast: (text: string, tone?: Toast["tone"], extra?: Partial<Toast>) => void;
  dismissToast: (id: number) => void;
  setPrefs: (p: Partial<Prefs>) => void;
  celebrate: (c: Celebration) => void;
  dismissCelebration: () => void;
  set: (partial: Partial<State>) => void;

  createProject: (input: ProjectInput) => Promise<Project | undefined>;
  updateProject: (id: string, patch: ProjectInput) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  createTask: (input: TaskInput) => Promise<Task | undefined>;
  updateTask: (id: string, patch: TaskInput) => Promise<void>;
  toggleTask: (task: Task) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;

  pomoStart: () => void;
  pomoPause: () => void;
  pomoReset: (mode?: PomodoroMode) => void;
  pomoTick: () => void;
  pomoSet: (p: Partial<Pomodoro>) => void;
}

function loadLocalPrefs(): Prefs {
  try {
    const raw = localStorage.getItem("afz_prefs");
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    /* noop */
  }
  return DEFAULT_PREFS;
}

function saveLocalPrefs(p: Prefs) {
  try {
    localStorage.setItem("afz_prefs", JSON.stringify(p));
  } catch {
    /* noop */
  }
}

function prefsFromSettings(settings: Record<string, string>, base: Prefs): Prefs {
  const out = { ...base };
  for (const key of Object.keys(DEFAULT_PREFS) as (keyof Prefs)[]) {
    const raw = settings[key];
    if (raw === undefined) continue;
    const def = DEFAULT_PREFS[key];
    (out as Record<string, unknown>)[key] =
      typeof def === "boolean" ? raw === "true" : typeof def === "number" ? Number(raw) || def : raw;
  }
  return out;
}

function durationFor(mode: PomodoroMode, prefs: Prefs) {
  const min = mode === "focus" ? prefs.focus_minutes : mode === "short" ? prefs.short_break : prefs.long_break;
  return min * 60_000;
}

let toastId = 0;
let statsTimer: ReturnType<typeof setTimeout> | undefined;

const initialPrefs = loadLocalPrefs();

export const useStore = create<State>((set, get) => {
  const fail = (e: unknown) => get().toast(e instanceof Error ? e.message : "Algo deu errado", "error");
  // Recalcula XP/estatísticas pouco depois de uma sequência de mudanças.
  const bumpStats = () => {
    clearTimeout(statsTimer);
    statsTimer = setTimeout(() => void get().refreshStats(), 600);
  };

  return {
    auth: "unknown",
    loaded: false,
    projects: [],
    tasks: [],
    prefs: initialPrefs,
    stats: null,
    toasts: [],
    celebrations: [],
    paletteOpen: false,
    helpOpen: false,
    projectForm: { open: false },
    taskForm: { open: false },
    pomodoro: {
      mode: "focus",
      running: false,
      endsAt: null,
      remaining: durationFor("focus", initialPrefs),
      duration: durationFor("focus", initialPrefs),
      startedAt: null,
      projectId: null,
      taskId: null,
      label: "",
      cycles: 0,
    },

    set: (partial) => set(partial),
    setAuth: (auth) => set({ auth }),

    load: async () => {
      const data = await api<{ projects: Project[]; tasks: Task[]; settings: Record<string, string> }>("/bootstrap");
      const prefs = prefsFromSettings(data.settings, get().prefs);
      saveLocalPrefs(prefs);
      set({ projects: data.projects, tasks: data.tasks, prefs, loaded: true, auth: "in" });
      const p = get().pomodoro;
      if (!p.running && p.remaining === p.duration) get().pomoReset(p.mode);
      await get().refreshStats();
    },

    refreshStats: async () => {
      try {
        const before = get().stats;
        const stats = await api<Stats>(`/stats?tz=${new Date().getTimezoneOffset()}`);
        set({ stats });
        if (before) {
          const a = levelInfo(before.xp);
          const b = levelInfo(stats.xp);
          if (b.level > a.level) {
            get().celebrate({ kind: "level", level: b.level, rank: b.rank.title, rankKanji: b.rank.kanji });
            if (get().prefs.sound) playFurin();
          }
        }
      } catch {
        /* estatística é secundária */
      }
    },

    toast: (text, tone = "info", extra) => {
      const id = ++toastId;
      set({ toasts: [...get().toasts.slice(-3), { id, text, tone, ...extra }] });
      setTimeout(() => get().dismissToast(id), extra?.action ? 6000 : 3500);
    },
    dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

    setPrefs: (p) => {
      const prefs = { ...get().prefs, ...p };
      set({ prefs });
      saveLocalPrefs(prefs);
      const body = Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v)]));
      api("/settings", { method: "PUT", body }).catch(() => {});
      if (("focus_minutes" in p || "short_break" in p || "long_break" in p) && !get().pomodoro.running) {
        get().pomoReset(get().pomodoro.mode);
      }
    },

    celebrate: (c) => set({ celebrations: [...get().celebrations, c] }),
    dismissCelebration: () => set({ celebrations: get().celebrations.slice(1) }),

    // ───── projetos ─────
    createProject: async (input) => {
      try {
        const p = await api<Project>("/projects", { method: "POST", body: input });
        set({ projects: [...get().projects, p] });
        get().toast(`Projeto "${p.name}" criado`, "success", { kanji: p.icon });
        bumpStats();
        return p;
      } catch (e) {
        fail(e);
      }
    },

    updateProject: async (id, patch) => {
      const prev = get().projects;
      const old = prev.find((p) => p.id === id);
      if (!old) return;
      const optimistic = { ...old, ...patch } as Project;
      if (patch.status === "done" && old.status !== "done") optimistic.progress = 100;
      set({ projects: prev.map((p) => (p.id === id ? optimistic : p)) });
      if (patch.status === "done" && old.status !== "done") {
        get().celebrate({ kind: "project", title: old.name, color: old.color });
        if (get().prefs.sound) playTaiko();
      }
      try {
        const saved = await api<Project>(`/projects/${id}`, { method: "PATCH", body: patch });
        set({ projects: get().projects.map((p) => (p.id === id ? saved : p)) });
        if (patch.status) bumpStats();
      } catch (e) {
        set({ projects: prev });
        fail(e);
      }
    },

    deleteProject: async (id) => {
      const prevP = get().projects;
      const prevT = get().tasks;
      set({ projects: prevP.filter((p) => p.id !== id), tasks: prevT.filter((t) => t.project_id !== id) });
      try {
        await api(`/projects/${id}`, { method: "DELETE" });
        get().toast("Projeto removido", "info", { kanji: "消" });
        bumpStats();
      } catch (e) {
        set({ projects: prevP, tasks: prevT });
        fail(e);
      }
    },

    // ───── tarefas ─────
    createTask: async (input) => {
      try {
        const t = await api<Task>("/tasks", { method: "POST", body: input });
        set({ tasks: [...get().tasks, t] });
        return t;
      } catch (e) {
        fail(e);
      }
    },

    updateTask: async (id, patch) => {
      const prev = get().tasks;
      set({ tasks: prev.map((t) => (t.id === id ? ({ ...t, ...patch } as Task) : t)) });
      try {
        const saved = await api<Task>(`/tasks/${id}`, { method: "PATCH", body: patch });
        set({ tasks: get().tasks.map((t) => (t.id === id ? saved : t)) });
        if (patch.status) bumpStats();
      } catch (e) {
        set({ tasks: prev });
        fail(e);
      }
    },

    toggleTask: async (task) => {
      const done = task.status !== "done";
      if (done && get().prefs.sound) playPop();
      await get().updateTask(task.id, { status: done ? "done" : "todo" });
      if (done) {
        get().toast(`「${task.title}」 concluída`, "success", {
          kanji: "済",
          action: { label: "Desfazer", run: () => void get().updateTask(task.id, { status: task.status }) },
        });
      }
    },

    deleteTask: async (id) => {
      const prev = get().tasks;
      const task = prev.find((t) => t.id === id);
      set({ tasks: prev.filter((t) => t.id !== id) });
      try {
        await api(`/tasks/${id}`, { method: "DELETE" });
        if (task) {
          get().toast("Tarefa removida", "info", {
            kanji: "消",
            action: {
              label: "Desfazer",
              run: () => {
                const { id: _id, created_at: _c, updated_at: _u, completed_at: _d, ...rest } = task;
                void get().createTask(rest);
              },
            },
          });
        }
        bumpStats();
      } catch (e) {
        set({ tasks: prev });
        fail(e);
      }
    },

    // ───── pomodoro ─────
    pomoSet: (p) => set({ pomodoro: { ...get().pomodoro, ...p } }),

    pomoStart: () => {
      const p = get().pomodoro;
      if (p.running) return;
      set({
        pomodoro: {
          ...p,
          running: true,
          endsAt: Date.now() + p.remaining,
          startedAt: p.startedAt ?? new Date().toISOString(),
        },
      });
    },

    pomoPause: () => {
      const p = get().pomodoro;
      if (!p.running || !p.endsAt) return;
      set({ pomodoro: { ...p, running: false, endsAt: null, remaining: Math.max(0, p.endsAt - Date.now()) } });
    },

    pomoReset: (mode) => {
      const p = get().pomodoro;
      const m = mode ?? p.mode;
      const duration = durationFor(m, get().prefs);
      set({ pomodoro: { ...p, mode: m, running: false, endsAt: null, remaining: duration, duration, startedAt: null } });
    },

    pomoTick: () => {
      const p = get().pomodoro;
      if (!p.running || !p.endsAt || Date.now() < p.endsAt) return;
      const { prefs } = get();
      if (prefs.sound) playFurin();
      if (p.mode === "focus") {
        const minutes = Math.round(p.duration / 60_000);
        api("/focus", {
          method: "POST",
          body: { minutes, project_id: p.projectId, task_id: p.taskId, label: p.label, started_at: p.startedAt },
        })
          .then(() => bumpStats())
          .catch(fail);
        const cycles = p.cycles + 1;
        const next: PomodoroMode = cycles % 4 === 0 ? "long" : "short";
        get().toast(`Foco concluído! +${minutes} XP · hora do descanso`, "success", { kanji: "禅" });
        set({ pomodoro: { ...p, cycles } });
        get().pomoReset(next);
      } else {
        get().toast("Pausa encerrada — bora voltar!", "info", { kanji: "戻" });
        get().pomoReset("focus");
      }
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification(p.mode === "focus" ? "集中 · Foco concluído" : "休憩 · Pausa encerrada", {
          body: p.mode === "focus" ? "Respira, alonga e toma uma água." : "Hora de voltar pro código.",
        });
      }
    },
  };
});
