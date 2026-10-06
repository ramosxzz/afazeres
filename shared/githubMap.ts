// Regras de conversão GitHub → afazeres, usadas pelo front (importação manual)
// e pelo Worker (sincronização automática).
import type { GithubRepo, Priority, ProjectInput, ProjectStatus, ProjectType, TaskKind } from "./types";

export const AUTO_COLORS = ["#e5484d", "#d97a3a", "#c9a13b", "#46a758", "#3e9e8f", "#4f8cd6", "#8b95a5", "#a0785a"];

const dayKey = (iso: string) => iso.slice(0, 10);

const TYPE_BY_LANGUAGE: Record<string, ProjectType> = {
  HTML: "frontend", CSS: "frontend", SCSS: "frontend", Vue: "frontend", Svelte: "frontend", Astro: "frontend", Elm: "frontend",
  Go: "backend", Rust: "backend", Java: "backend", Python: "backend", PHP: "backend", "C#": "backend", Ruby: "backend",
  Elixir: "backend", Scala: "backend", C: "backend", "C++": "backend",
  Kotlin: "mobile", Swift: "mobile", Dart: "mobile", "Objective-C": "mobile",
  HCL: "infra", Shell: "infra", Dockerfile: "infra", Nix: "infra", PowerShell: "infra",
  TypeScript: "fullstack", JavaScript: "fullstack",
};

// Tópicos do GitHub vêm em minúsculas; alguns ficam mais bonitos com o nome oficial.
const TOPIC_NAMES: Record<string, string> = {
  react: "React", nextjs: "Next.js", "next-js": "Next.js", vue: "Vue", vuejs: "Vue", nuxt: "Nuxt", svelte: "Svelte",
  sveltekit: "SvelteKit", angular: "Angular", astro: "Astro", tailwindcss: "Tailwind", tailwind: "Tailwind",
  nodejs: "Node.js", node: "Node.js", bun: "Bun", deno: "Deno", hono: "Hono", express: "Express", nestjs: "NestJS",
  django: "Django", fastapi: "FastAPI", flask: "Flask", laravel: "Laravel", spring: "Spring", "spring-boot": "Spring Boot",
  postgresql: "PostgreSQL", postgres: "PostgreSQL", mysql: "MySQL", sqlite: "SQLite", mongodb: "MongoDB", redis: "Redis",
  prisma: "Prisma", drizzle: "Drizzle", supabase: "Supabase", firebase: "Firebase", cloudflare: "Cloudflare",
  "cloudflare-workers": "Cloudflare Workers", docker: "Docker", kubernetes: "Kubernetes", aws: "AWS", vercel: "Vercel",
  graphql: "GraphQL", "react-native": "React Native", flutter: "Flutter", expo: "Expo", typescript: "TypeScript",
  javascript: "JavaScript", python: "Python", golang: "Go", go: "Go", rust: "Rust",
};

export function guessType(repo: GithubRepo): ProjectType {
  const topics = repo.topics.join(" ");
  if (/react-native|flutter|expo|android|ios/.test(topics)) return "mobile";
  return (repo.language && TYPE_BY_LANGUAGE[repo.language]) || "other";
}

/** Arquivado → arquivado; mexido nos últimos 45 dias → em andamento; senão → finalizado. */
export function guessStatus(repo: GithubRepo): ProjectStatus {
  if (repo.archived) return "archived";
  const days = (Date.now() - Date.parse(repo.pushed_at)) / 86400_000;
  return days <= 45 ? "active" : "done";
}

export function prettyName(name: string) {
  // "meu-app_front" → "Meu app front" (só se parecer um slug)
  if (!/[-_]/.test(name) || /\s/.test(name)) return name;
  const words = name.split(/[-_]+/).filter(Boolean);
  return words.map((w, i) => (i === 0 ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
}

export function repoToProject(repo: GithubRepo, status: ProjectStatus, color: string, login = ""): ProjectInput {
  const stack = [
    ...(repo.language ? [repo.language] : []),
    ...repo.topics.map((t) => TOPIC_NAMES[t] ?? t),
  ];
  const owner = repo.full_name.split("/")[0];
  return {
    name: prettyName(repo.name),
    description: repo.description,
    status,
    type: guessType(repo),
    priority: "medium",
    // repo seu → "Pessoal"; repo de organização → nome da organização
    client: owner.toLowerCase() === login.toLowerCase() ? "Pessoal" : owner,
    color,
    icon: "狐",
    stack: [...new Set(stack)].slice(0, 10),
    repo_url: repo.html_url,
    live_url: repo.homepage,
    start_date: dayKey(repo.created_at),
    progress: status === "done" ? 100 : 0,
  };
}

/** "https://github.com/dono/repo(.git)" → "dono/repo" */
export function parseGithubUrl(url: string): string | null {
  const m = url.trim().match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?(?:[#?].*)?$/i);
  return m ? `${m[1]}/${m[2]}` : null;
}

export const normUrl = (u: string) => u.trim().toLowerCase().replace(/\.git$/, "").replace(/\/+$/, "");

// ───────────── issues → tarefas ─────────────

export interface IssueLike {
  labels: (string | { name?: string })[];
}

const labelNames = (i: IssueLike) =>
  i.labels.map((l) => (typeof l === "string" ? l : l.name ?? "").toLowerCase());

export function issueKind(i: IssueLike): TaskKind {
  const l = labelNames(i).join(" ");
  if (/bug|fix|defeito|erro/.test(l)) return "bug";
  if (/suporte|support|cliente|customer/.test(l)) return "support";
  if (/docs|chore|refactor|manuten|infra|ci/.test(l)) return "chore";
  if (/estudo|study|research|pesquisa|spike/.test(l)) return "study";
  return "feature";
}

export function issuePriority(i: IssueLike): Priority {
  const l = labelNames(i).join(" ");
  if (/critical|crític|critic|urgent|blocker|p0/.test(l)) return "critical";
  if (/high|alta|important|p1/.test(l)) return "high";
  if (/low|baixa|minor|p3|nice/.test(l)) return "low";
  return "medium";
}
