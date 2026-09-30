import type { Stats, Task } from "@shared/types";
import { todayKey } from "./dates";
import { RANKS } from "./xp";

// Kitsune (狐): ganha uma cauda por patente. Na lenda, a raposa mais sábia
// e poderosa é a kyūbi (九尾) — de nove caudas. Aqui, a 9ª cauda chega junto
// com a patente 伝説 Lenda.

export type MascotMood = "idle" | "happy" | "sleepy" | "focus" | "worried";

export interface MascotStage {
  tails: number;
  kanji: string;
  title: string;
  /** marca vermelha na testa */
  mark: boolean;
  /** fogo-fátuo (kitsunebi) flutuando ao lado */
  orbs: number;
}

const TAIL_KANJI = ["一尾", "二尾", "三尾", "四尾", "五尾", "六尾", "七尾", "八尾", "九尾"];
const STAGE_TITLES = [
  "Filhote",
  "Raposa do bosque",
  "Raposa andarilha",
  "Mensageira de Inari",
  "Raposa sombria",
  "Guardiã do santuário",
  "Raposa celeste",
  "Raposa ancestral",
  "Kyūbi, a de nove caudas",
];

export function stageForLevel(level: number): MascotStage {
  const idx = Math.max(0, RANKS.filter((r) => level >= r.level).length - 1);
  return {
    tails: idx + 1,
    kanji: TAIL_KANJI[idx],
    title: STAGE_TITLES[idx],
    mark: idx >= 3,
    orbs: idx >= 8 ? 2 : idx >= 5 ? 1 : 0,
  };
}

export const ALL_STAGES = RANKS.map((r) => ({ ...stageForLevel(r.level), level: r.level, rank: r }));

interface MoodCtx {
  stats: Stats | null;
  tasks: Task[];
  focusing: boolean;
  name: string;
}

/** Humor + fala da kitsune, a partir do seu dia. */
export function mascotMood({ stats, tasks, focusing, name }: MoodCtx): { mood: MascotMood; line: string } {
  const today = todayKey();
  const hour = new Date().getHours();
  const doneToday = tasks.filter(
    (t) => t.status === "done" && t.completed_at && new Date(t.completed_at).toDateString() === new Date().toDateString(),
  ).length;
  const late = tasks.filter((t) => t.status !== "done" && t.due_date && t.due_date < today).length;
  const activeToday = (stats?.heatmap.find((h) => h.day === today)?.count ?? 0) > 0;

  if (focusing) return { mood: "focus", line: "集中… shh, estamos focados." };
  if (doneToday >= 5) return { mood: "happy", line: `すごい! ${doneToday} tarefas hoje. ${name} está orgulhosa.` };
  if (hour >= 23 || hour < 5) return { mood: "sleepy", line: "Zzz… já é tarde. O código ainda vai estar aqui amanhã." };
  if (late > 0) return { mood: "worried", line: `Tem ${late} tarefa${late > 1 ? "s" : ""} atrasada${late > 1 ? "s" : ""}. Vamos resolver uma?` };
  if ((stats?.streak ?? 0) >= 3) return { mood: "happy", line: `${stats!.streak} dias seguidos. Continua assim.` };
  if (doneToday > 0) return { mood: "happy", line: `${doneToday} feita${doneToday > 1 ? "s" : ""} hoje. Bom ritmo.` };
  if (!activeToday && hour < 12) return { mood: "idle", line: "おはよう. Qual é a primeira tarefa de hoje?" };
  if (!activeToday) return { mood: "idle", line: "Ainda não fizemos nada hoje. Uma tarefa pequena já conta." };
  return { mood: "idle", line: "Tô por aqui." };
}
