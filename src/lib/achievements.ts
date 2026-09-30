import type { Project, Stats, Task } from "@shared/types";
import { todayKey } from "./dates";

export interface Achievement {
  id: string;
  kanji: string;
  title: string;
  desc: string;
  /** progresso atual e meta — para a barrinha */
  progress: (ctx: AchievementCtx) => [number, number];
}

export interface AchievementCtx {
  stats: Stats;
  projects: Project[];
  tasks: Task[];
}

const count = (n: number, goal: number): [number, number] => [Math.min(n, goal), goal];

export const ACHIEVEMENTS: Achievement[] = [
  { id: "first-step", kanji: "一歩", title: "Primeiro passo", desc: "Conclua sua primeira tarefa", progress: ({ stats }) => count(stats.totals.tasks_done, 1) },
  { id: "hundred", kanji: "百", title: "Cem cortes", desc: "Conclua 100 tarefas", progress: ({ stats }) => count(stats.totals.tasks_done, 100) },
  { id: "thousand", kanji: "千", title: "Mil lâminas", desc: "Conclua 1000 tarefas", progress: ({ stats }) => count(stats.totals.tasks_done, 1000) },
  { id: "ship-it", kanji: "完", title: "Ship it!", desc: "Finalize um projeto", progress: ({ stats }) => count(stats.totals.projects_done, 1) },
  { id: "five-ships", kanji: "五輪", title: "Cinco anéis", desc: "Finalize 5 projetos", progress: ({ stats }) => count(stats.totals.projects_done, 5) },
  { id: "bug-hunter", kanji: "虫狩", title: "Caçador de bugs", desc: "Corrija 25 bugs", progress: ({ stats }) => count(stats.totals.bugs_fixed, 25) },
  { id: "guardian", kanji: "守護", title: "Guardião", desc: "Resolva 20 chamados de suporte", progress: ({ stats }) => count(stats.totals.support_done, 20) },
  { id: "streak-7", kanji: "七日", title: "Sete dias", desc: "Mantenha 7 dias seguidos de atividade", progress: ({ stats }) => count(stats.best_streak, 7) },
  { id: "streak-30", kanji: "月", title: "Lua cheia", desc: "Mantenha 30 dias seguidos de atividade", progress: ({ stats }) => count(stats.best_streak, 30) },
  { id: "focus-10h", kanji: "禅", title: "Zen", desc: "Acumule 10 horas de foco", progress: ({ stats }) => count(Math.floor(stats.totals.focus_minutes / 60), 10) },
  { id: "focus-100h", kanji: "悟", title: "Satori", desc: "Acumule 100 horas de foco", progress: ({ stats }) => count(Math.floor(stats.totals.focus_minutes / 60), 100) },
  { id: "pomodoro-50", kanji: "🍅", title: "Horta de tomates", desc: "Complete 50 sessões de foco", progress: ({ stats }) => count(stats.totals.focus_sessions, 50) },
  { id: "diary-10", kanji: "日記", title: "Cronista", desc: "Escreva 10 entradas no diário", progress: ({ stats }) => count(stats.totals.journal_entries, 10) },
  { id: "early-bird", kanji: "朝", title: "Asa-gata", desc: "Conclua 10 tarefas entre 4h e 7h", progress: ({ stats }) => count(stats.totals.early_tasks, 10) },
  { id: "night-owl", kanji: "夜", title: "Coruja da madrugada", desc: "Conclua 10 tarefas entre 0h e 4h", progress: ({ stats }) => count(stats.totals.night_tasks, 10) },
  {
    id: "polyglot",
    kanji: "多才",
    title: "Polímata",
    desc: "Tenha projetos de 5 tipos diferentes",
    progress: ({ projects }) => count(new Set(projects.map((p) => p.type)).size, 5),
  },
  {
    id: "stack-master",
    kanji: "技",
    title: "Arsenal",
    desc: "Use 15 tecnologias diferentes nos projetos",
    progress: ({ projects }) => count(new Set(projects.flatMap((p) => p.stack.map((s) => s.toLowerCase()))).size, 15),
  },
  {
    id: "juggler",
    kanji: "曲芸",
    title: "Malabarista",
    desc: "Tenha 5 projetos em andamento ao mesmo tempo",
    progress: ({ projects }) => count(projects.filter((p) => p.status === "active").length, 5),
  },
  {
    id: "zero-inbox",
    kanji: "空",
    title: "Mente vazia",
    desc: "Zere as tarefas atrasadas (com ao menos 20 tarefas feitas)",
    progress: ({ tasks, stats }) => {
      const today = todayKey();
      const late = tasks.some((t) => t.status !== "done" && t.due_date && t.due_date < today);
      return late ? [0, 1] : count(stats.totals.tasks_done >= 20 ? 1 : 0, 1);
    },
  },
];
