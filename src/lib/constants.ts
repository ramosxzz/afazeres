import type { Mood, Priority, ProjectStatus, ProjectType, TaskKind } from "@shared/types";

export interface Meta {
  label: string;
  kanji: string;
  romaji?: string;
  color: string;
  hint?: string;
}

export const STATUS_META: Record<ProjectStatus, Meta> = {
  idea: { label: "Ideias", kanji: "構想", romaji: "kōsō", color: "#a78bfa", hint: "Ainda no papel" },
  active: { label: "Em andamento", kanji: "進行中", romaji: "shinkōchū", color: "#38bdf8", hint: "Mão na massa" },
  paused: { label: "Pausado", kanji: "休止", romaji: "kyūshi", color: "#fbbf24", hint: "Na geladeira" },
  support: { label: "Suporte", kanji: "保守", romaji: "hoshu", color: "#fb923c", hint: "Em produção, mantendo" },
  done: { label: "Finalizado", kanji: "完了", romaji: "kanryō", color: "#4ade80", hint: "Entregue!" },
  archived: { label: "Arquivado", kanji: "封印", romaji: "fūin", color: "#94a3b8", hint: "Selado" },
};

export const BOARD_STATUSES: ProjectStatus[] = ["idea", "active", "paused", "support", "done"];

export const TYPE_META: Record<ProjectType, Meta> = {
  frontend: { label: "Front-end", kanji: "表", color: "#f472b6" },
  backend: { label: "Back-end", kanji: "裏", color: "#60a5fa" },
  fullstack: { label: "Fullstack", kanji: "全", color: "#c084fc" },
  mobile: { label: "Mobile", kanji: "携", color: "#34d399" },
  infra: { label: "Infra / DevOps", kanji: "基", color: "#fbbf24" },
  design: { label: "Design", kanji: "絵", color: "#fb7185" },
  other: { label: "Outro", kanji: "他", color: "#94a3b8" },
};

export const PRIORITY_META: Record<Priority, Meta & { weight: number }> = {
  low: { label: "Baixa", kanji: "低", color: "#94a3b8", weight: 5 },
  medium: { label: "Média", kanji: "中", color: "#38bdf8", weight: 10 },
  high: { label: "Alta", kanji: "高", color: "#fb923c", weight: 20 },
  critical: { label: "Crítica", kanji: "急", color: "#f43f5e", weight: 35 },
};

export const KIND_META: Record<TaskKind, Meta> = {
  feature: { label: "Feature", kanji: "機能", color: "#a78bfa" },
  bug: { label: "Bug", kanji: "虫", color: "#f43f5e" },
  support: { label: "Suporte", kanji: "支援", color: "#fb923c" },
  chore: { label: "Manutenção", kanji: "雑務", color: "#94a3b8" },
  study: { label: "Estudo", kanji: "学習", color: "#34d399" },
};

export const MOOD_META: Record<Mood, { emoji: string; label: string; kanji: string }> = {
  fire: { emoji: "🔥", label: "Pegando fogo", kanji: "炎" },
  happy: { emoji: "😄", label: "Feliz", kanji: "喜" },
  calm: { emoji: "🍵", label: "Tranquilo", kanji: "静" },
  tired: { emoji: "😪", label: "Cansado", kanji: "疲" },
  stressed: { emoji: "😵‍💫", label: "Estressado", kanji: "嵐" },
};

export const PROJECT_COLORS = [
  "#ff7eb6", "#f43f5e", "#fb923c", "#fbbf24", "#a3e635", "#4ade80",
  "#2dd4bf", "#38bdf8", "#818cf8", "#a78bfa", "#e879f9", "#94a3b8",
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
