import { useEffect, useMemo, useRef, useState } from "react";
import { HelpCircle, Search } from "lucide-react";
import { PRIORITIES, TASK_KINDS, type Task } from "@shared/types";
import { useStore } from "../store";
import { KIND_META, PRIORITY_META } from "../lib/constants";
import { addDays, todayKey } from "../lib/dates";
import { QuickAdd } from "../components/QuickAdd";
import { TaskRow } from "../components/TaskRow";
import { Empty, PageHeader, Segmented } from "../components/ui";

type Group = "agenda" | "project";

const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

const byPriority = (a: Task, b: Task) =>
  PRIORITY_META[b.priority].weight - PRIORITY_META[a.priority].weight || a.position - b.position;

export function Tasks() {
  const tasks = useStore((s) => s.tasks);
  const projects = useStore((s) => s.projects);
  const [group, setGroup] = useState<Group>("agenda");
  const [q, setQ] = useState("");
  const [project, setProject] = useState("");
  const [kind, setKind] = useState("");
  const [priority, setPriority] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [help, setHelp] = useState(false);
  const quick = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const focus = () => quick.current?.focus();
    window.addEventListener("afz:quickadd", focus);
    return () => window.removeEventListener("afz:quickadd", focus);
  }, []);

  const today = todayKey();

  const filtered = useMemo(() => {
    const nq = norm(q);
    return tasks.filter(
      (t) =>
        (!nq || norm(`${t.title} ${t.notes}`).includes(nq)) &&
        (!project || (project === "none" ? !t.project_id : t.project_id === project)) &&
        (!kind || t.kind === kind) &&
        (!priority || t.priority === priority),
    );
  }, [tasks, q, project, kind, priority]);

  const open = filtered.filter((t) => t.status !== "done");
  const done = filtered
    .filter((t) => t.status === "done")
    .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""))
    .slice(0, 50);

  const sections = useMemo(() => {
    if (group === "agenda") {
      const weekEnd = addDays(today, 7);
      const buckets: { key: string; kanji: string; title: string; tone?: string; items: Task[] }[] = [
        { key: "late", kanji: "遅延", title: "Atrasadas", tone: "danger", items: [] },
        { key: "today", kanji: "今日", title: "Hoje", tone: "accent", items: [] },
        { key: "tomorrow", kanji: "明日", title: "Amanhã", items: [] },
        { key: "week", kanji: "今週", title: "Próximos 7 dias", items: [] },
        { key: "later", kanji: "後で", title: "Mais pra frente", items: [] },
        { key: "none", kanji: "未定", title: "Sem prazo", items: [] },
      ];
      for (const t of open) {
        const d = t.due_date;
        const b = !d ? 5 : d < today ? 0 : d === today ? 1 : d === addDays(today, 1) ? 2 : d <= weekEnd ? 3 : 4;
        buckets[b].items.push(t);
      }
      buckets.forEach((b) =>
        b.items.sort((x, y) => (x.status === "doing" ? -1 : 0) - (y.status === "doing" ? -1 : 0) || (x.due_date ?? "").localeCompare(y.due_date ?? "") || byPriority(x, y)),
      );
      return buckets.filter((b) => b.items.length);
    }
    const m = new Map<string, Task[]>();
    for (const t of open) m.set(t.project_id ?? "none", [...(m.get(t.project_id ?? "none") ?? []), t]);
    return [...m.entries()]
      .map(([pid, items]) => {
        const p = projects.find((x) => x.id === pid);
        return {
          key: pid,
          kanji: p?.icon ?? "他",
          title: p?.name ?? "Sem projeto",
          tone: undefined,
          color: p?.color,
          items: items.sort(byPriority),
        };
      })
      .sort((a, b) => b.items.length - a.items.length);
  }, [group, open, projects, today]);

  return (
    <div className="page">
      <PageHeader
        kanji="任務"
        romaji="ninmu"
        title="Tarefas"
        subtitle={`${open.length} aberta${open.length === 1 ? "" : "s"} · ${tasks.filter((t) => t.status === "done").length} concluída${tasks.filter((t) => t.status === "done").length === 1 ? "" : "s"} no total`}
      />

      <div className="card quick-card">
        <QuickAdd ref={quick} />
        <button className="link-more" onClick={() => setHelp(!help)}>
          <HelpCircle size={14} /> sintaxe
        </button>
        {help && (
          <div className="syntax-help">
            <div><code>#nome</code> vincula ao projeto (basta o começo do nome)</div>
            <div><code>!alta</code> <code>!urgente</code> <code>!baixa</code> ou <code>!1</code>…<code>!4</code> prioridade</div>
            <div><code>@hoje</code> <code>@amanha</code> <code>@sex</code> <code>@+3</code> <code>@15/10</code> prazo</div>
            <div><code>~bug</code> <code>~suporte</code> <code>~estudo</code> <code>~chore</code> tipo (ou comece com "bug:")</div>
          </div>
        )}
      </div>

      <div className="toolbar">
        <div className="search-box">
          <Search size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar tarefas…" />
        </div>
        <select value={project} onChange={(e) => setProject(e.target.value)} aria-label="Projeto">
          <option value="">Todos os projetos</option>
          <option value="none">— Sem projeto —</option>
          {projects
            .filter((p) => p.status !== "archived")
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.icon} {p.name}
              </option>
            ))}
        </select>
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Tipo">
          <option value="">Todos os tipos</option>
          {TASK_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_META[k].label}
            </option>
          ))}
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Prioridade">
          <option value="">Qualquer prioridade</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_META[p].kanji} {PRIORITY_META[p].label}
            </option>
          ))}
        </select>
        <span className="spacer" />
        <Segmented
          size="sm"
          value={group}
          onChange={setGroup}
          options={[
            { value: "agenda", label: "Agenda" },
            { value: "project", label: "Por projeto" },
          ]}
        />
      </div>

      {open.length === 0 && !showDone ? (
        <Empty kanji="無心" title="Mushin — mente vazia">
          Nenhuma tarefa aberta{q || project || kind || priority ? " com esses filtros" : ""}. Use o campo acima ou aperte <kbd>N</kbd>.
        </Empty>
      ) : (
        <div className="task-sections">
          {sections.map((s) => (
            <section key={s.key} className={`card task-section ${s.tone ? `tone-${s.tone}` : ""}`} style={"color" in s && s.color ? ({ "--c": s.color } as React.CSSProperties) : undefined}>
              <h3 className="section-title">
                <span className="section-kanji">{s.kanji}</span>
                {s.title}
                <span className="section-count">{s.items.length}</span>
              </h3>
              <div className="task-list">
                {s.items.map((t) => (
                  <TaskRow key={t.id} task={t} showProject={group === "agenda"} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <div className="done-toggle">
        <button className="btn btn-ghost" onClick={() => setShowDone(!showDone)}>
          {showDone ? "Esconder" : "Mostrar"} concluídas recentes ({done.length})
        </button>
      </div>
      {showDone && (
        <section className="card task-section">
          <h3 className="section-title">
            <span className="section-kanji">完了</span> Concluídas
          </h3>
          <div className="task-list">
            {done.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
