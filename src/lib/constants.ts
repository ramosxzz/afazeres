import type { Mood, Priority, ProjectStatus, ProjectType, TaskKind } from "@shared/types";

export interface Meta {
  label: string;
  kanji: string;
  romaji?: string;
  color: string;
  hint?: string;
}

export const STATUS_META: Record<ProjectStatus, Meta> = {
  idea: { label: "Ideias", kanji: "構想", romaji: "kōsō", color: "#8b95a5", hint: "Ainda no papel" },
  active: { label: "Em andamento", kanji: "進行中", romaji: "shinkōchū", color: "#4f8cd6", hint: "Mão na massa" },
  paused: { label: "Pausado", kanji: "休止", romaji: "kyūshi", color: "#c9a13b", hint: "Na geladeira" },
  support: { label: "Suporte", kanji: "保守", romaji: "hoshu", color: "#d97a3a", hint: "Em produção, mantendo" },
  done: { label: "Finalizado", kanji: "完了", romaji: "kanryō", color: "#46a758", hint: "Entregue!" },
  archived: { label: "Arquivado", kanji: "封印", romaji: "fūin", color: "#5f5f5f", hint: "Selado" },
};

export const BOARD_STATUSES: ProjectStatus[] = ["idea", "active", "paused", "support", "done"];

export const TYPE_META: Record<ProjectType, Meta> = {
  frontend: { label: "Front-end", kanji: "表", color: "#8b95a5" },
  backend: { label: "Back-end", kanji: "裏", color: "#8b95a5" },
  fullstack: { label: "Fullstack", kanji: "全", color: "#8b95a5" },
  mobile: { label: "Mobile", kanji: "携", color: "#8b95a5" },
  infra: { label: "Infra / DevOps", kanji: "基", color: "#8b95a5" },
  design: { label: "Design", kanji: "絵", color: "#8b95a5" },
  other: { label: "Outro", kanji: "他", color: "#8b95a5" },
};

export const PRIORITY_META: Record<Priority, Meta & { weight: number }> = {
  low: { label: "Baixa", kanji: "低", color: "#7a7a7a", weight: 5 },
  medium: { label: "Média", kanji: "中", color: "#9a9a9a", weight: 10 },
  high: { label: "Alta", kanji: "高", color: "#d97a3a", weight: 20 },
  critical: { label: "Crítica", kanji: "急", color: "#e5484d", weight: 35 },
};

export const KIND_META: Record<TaskKind, Meta> = {
  feature: { label: "Feature", kanji: "機能", color: "#9a9a9a" },
  bug: { label: "Bug", kanji: "虫", color: "#e5484d" },
  support: { label: "Suporte", kanji: "支援", color: "#d97a3a" },
  chore: { label: "Manutenção", kanji: "雑務", color: "#9a9a9a" },
  study: { label: "Estudo", kanji: "学習", color: "#46a758" },
};

export const MOOD_META: Record<Mood, { emoji: string; label: string; kanji: string }> = {
  fire: { emoji: "🔥", label: "Pegando fogo", kanji: "炎" },
  happy: { emoji: "😄", label: "Feliz", kanji: "喜" },
  calm: { emoji: "🍵", label: "Tranquilo", kanji: "静" },
  tired: { emoji: "😪", label: "Cansado", kanji: "疲" },
  stressed: { emoji: "😵‍💫", label: "Estressado", kanji: "嵐" },
};

export const PROJECT_COLORS = [
  "#e5484d", "#d97a3a", "#c9a13b", "#46a758", "#3e9e8f", "#4f8cd6",
  "#8b95a5", "#a0785a", "#b5b5b5", "#6f6f6f",
];

export const PROJECT_ICONS = [
  "桜", "龍", "狐", "猫", "鬼", "侍", "忍", "刀", "雷", "炎", "水", "風",
  "山", "月", "星", "花", "竹", "鶴", "虎", "魂", "夢", "光", "影", "⛩️",
  "🍣", "🍜", "🎴", "🏯", "🗻", "🌸", "🐉", "🦊", "👺", "🍙", "🎐", "🍡",
];

export const STACK_SUGGESTIONS = [
  "React", "Next.js", "Vue", "Nuxt", "Svelte", "Angular", "Astro", "TypeScript", "JavaScript", "Tailwind",
  "Node.js", "Bun", "Deno", "Hono", "Express", "NestJS", "Python", "Django", "FastAPI", "Go", "Rust", "Java",
  "Spring", "PHP", "Laravel", "C#", ".NET", "PostgreSQL", "MySQL", "SQLite", "MongoDB", "Redis", "Prisma",
  "Drizzle", "Supabase", "Firebase", "Cloudflare", "D1", "Docker", "Kubernetes", "AWS", "Vercel", "GraphQL",
  "React Native", "Flutter", "Expo", "Figma",
];
