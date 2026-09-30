import type { Priority, Project, TaskKind } from "@shared/types";
import { addDays, toKey, todayKey } from "./dates";

// Parser de adição rápida:
//   "Corrigir login #loja !alta @amanha bug"
//   #projeto  → vincula a um projeto (busca por prefixo/trecho do nome)
//   !1..!4 ou !baixa !media !alta !urgente → prioridade
//   @hoje @amanha @seg..@dom @+3 @2026-10-05 @05/10 → prazo
//   palavras-chave "bug" "suporte" "estudo" "chore" no início ou com ~ (ex.: ~bug) → tipo

export interface ParsedTask {
  title: string;
  project?: Project;
  projectQuery?: string;
  priority?: Priority;
  due_date?: string;
  kind?: TaskKind;
}

const PRIORITY_WORDS: Record<string, Priority> = {
  "1": "low", baixa: "low", low: "low",
  "2": "medium", media: "medium", média: "medium", medium: "medium",
  "3": "high", alta: "high", high: "high",
  "4": "critical", urgente: "critical", critica: "critical", crítica: "critical", critical: "critical",
};

const KIND_WORDS: Record<string, TaskKind> = {
  bug: "bug", fix: "bug", suporte: "support", support: "support", estudo: "study", study: "study",
  chore: "chore", manutencao: "chore", manutenção: "chore", feature: "feature", feat: "feature",
};

const WEEKDAYS: Record<string, number> = { dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6, sáb: 6 };

const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function parseDue(token: string): string | undefined {
  const t = norm(token);
  const today = todayKey();
  if (t === "hoje" || t === "today") return today;
  if (t === "amanha" || t === "tomorrow") return addDays(today, 1);
  if (/^\+\d{1,3}$/.test(t)) return addDays(today, Number(t.slice(1)));
  if (t in WEEKDAYS) {
    const now = new Date();
    let diff = (WEEKDAYS[t] - now.getDay() + 7) % 7;
    if (diff === 0) diff = 7;
    return addDays(today, diff);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (m) {
    const now = new Date();
    let year = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : now.getFullYear();
    const d = new Date(year, Number(m[2]) - 1, Number(m[1]));
    if (!m[3] && toKey(d) < todayKey()) d.setFullYear(++year);
    return toKey(d);
  }
  return undefined;
}

export function findProject(projects: Project[], query: string): Project | undefined {
  const q = norm(query).replace(/[-_]/g, " ");
  if (!q) return undefined;
  const candidates = projects.filter((p) => p.status !== "archived");
  return (
    candidates.find((p) => norm(p.name) === q) ??
    candidates.find((p) => norm(p.name).startsWith(q)) ??
    candidates.find((p) => norm(p.name).replace(/\s+/g, "").includes(q.replace(/\s+/g, "")))
  );
}

export function parseQuickAdd(input: string, projects: Project[]): ParsedTask {
  const out: ParsedTask = { title: "" };
  const words: string[] = [];
  const tokens = input.trim().split(/\s+/);
  tokens.forEach((tok, i) => {
    if (tok.length > 1 && tok.startsWith("#")) {
      out.projectQuery = tok.slice(1);
      out.project = findProject(projects, tok.slice(1));
      return;
    }
    if (tok.length > 1 && tok.startsWith("!") && PRIORITY_WORDS[norm(tok.slice(1))]) {
      out.priority = PRIORITY_WORDS[norm(tok.slice(1))];
      return;
    }
    if (tok.length > 1 && tok.startsWith("@")) {
      const due = parseDue(tok.slice(1));
      if (due) {
        out.due_date = due;
        return;
      }
    }
    if (tok.length > 1 && tok.startsWith("~") && KIND_WORDS[norm(tok.slice(1))]) {
      out.kind = KIND_WORDS[norm(tok.slice(1))];
      return;
    }
    // "bug: botão quebrado" / "suporte cliente X" no começo
    const bare = norm(tok.replace(/:$/, ""));
    if (i === 0 && KIND_WORDS[bare] && tokens.length > 1) {
      out.kind = KIND_WORDS[bare];
      return;
    }
    words.push(tok);
  });
  out.title = words.join(" ");
  return out;
}
