import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import {
  closestCorners, DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Bug, Columns3, FolderGit2, LayoutGrid, List, Pin, Plus, Search } from "lucide-react";
import { PRIORITIES, PROJECT_TYPES, type Project, type ProjectStatus } from "@shared/types";
import { useStore } from "../store";
import { BOARD_STATUSES, PRIORITY_META, STATUS_META, TYPE_META } from "../lib/constants";
import { DueBadge, Empty, PageHeader, ProgressRing, StatusBadge } from "../components/ui";

type View = "board" | "grid" | "list";

const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

function useProjectStats() {
  const tasks = useStore((s) => s.tasks);
  return useMemo(() => {
    const m = new Map<string, { total: number; open: number; bugs: number; support: number }>();
    for (const t of tasks) {
      if (!t.project_id) continue;
      const s = m.get(t.project_id) ?? { total: 0, open: 0, bugs: 0, support: 0 };
      s.total++;
      if (t.status !== "done") {
        s.open++;
        if (t.kind === "bug") s.bugs++;
        if (t.kind === "support") s.support++;
      }
      m.set(t.project_id, s);
    }
    return m;
  }, [tasks]);
}

export function Projects() {
  const projects = useStore((s) => s.projects);
  const set = useStore((s) => s.set);
  const search = useSearch();
  const params = new URLSearchParams(search);
  const [view, setView] = useState<View>(() => (localStorage.getItem("afz_view") as View) || "board");
  const [q, setQ] = useState("");
  const [type, setType] = useState<string>("");
  const [priority, setPriority] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>(params.get("status") ?? "");
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem("afz_view", view);
    } catch {
      /* noop */
    }
  }, [view]);

  useEffect(() => {
    const s = new URLSearchParams(search).get("status");
    if (s) {
      setStatusFilter(s);
      if (view === "board") setView("grid");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const filtered = useMemo(() => {
    const nq = norm(q);
    return projects.filter(
      (p) =>
        (!nq || norm(`${p.name} ${p.client} ${p.description} ${p.stack.join(" ")}`).includes(nq)) &&
        (!type || p.type === type) &&
        (!priority || p.priority === priority) &&
        (view === "board" || !statusFilter || p.status === statusFilter) &&
        (showArchived || statusFilter === "archived" || p.status !== "archived"),
    );
  }, [projects, q, type, priority, statusFilter, showArchived, view]);

  const boardMode = view === "board" && projects.length > 0;

  return (
    <div className={`page ${boardMode ? "page-board" : ""}`}>
      <PageHeader
        kanji="巻物"
        romaji="makimono"
        title="Projetos"
        subtitle={`${projects.filter((p) => p.status === "active").length} em andamento · ${projects.filter((p) => p.status === "support").length} em suporte · ${projects.filter((p) => p.status === "done").length} finalizados`}
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => set({ githubOpen: true })}>
              <FolderGit2 size={16} /> <span className="hide-sm">Importar do GitHub</span>
            </button>
            <button className="btn btn-primary" onClick={() => set({ projectForm: { open: true } })}>
              <Plus size={16} /> Novo projeto
            </button>
          </>
        }
      />

      <div className="toolbar">
        <div className="search-box">
          <Search size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrar projetos…" />
        </div>
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Tipo">
          <option value="">Todos os tipos</option>
          {PROJECT_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_META[t].kanji} {TYPE_META[t].label}
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
        {view !== "board" && (
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status">
            <option value="">Todos os status</option>
            {(Object.keys(STATUS_META) as ProjectStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].kanji} {STATUS_META[s].label}
              </option>
            ))}
          </select>
        )}
        <label className="toggle">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          <span>Arquivados</span>
        </label>
        <span className="spacer" />
        <div className="view-switch" role="tablist">
          <button className={view === "board" ? "active" : ""} onClick={() => setView("board")} title="Kanban">
            <Columns3 size={16} />
          </button>
          <button className={view === "grid" ? "active" : ""} onClick={() => setView("grid")} title="Cards">
            <LayoutGrid size={16} />
          </button>
          <button className={view === "list" ? "active" : ""} onClick={() => setView("list")} title="Lista">
            <List size={16} />
          </button>
        </div>
      </div>

      {projects.length === 0 ? (
        <Empty kanji="始" title="Todo grande projeto começa com um passo">
          <p>Cadastre seus projetos — em andamento, finalizados, em suporte — e acompanhe tudo num lugar só.</p>
          <div className="empty-actions">
            <button className="btn btn-primary" onClick={() => set({ projectForm: { open: true } })}>
              <Plus size={16} /> Criar projeto
            </button>
            <button className="btn btn-ghost" onClick={() => set({ githubOpen: true })}>
              <FolderGit2 size={16} /> Importar do GitHub
            </button>
          </div>
        </Empty>
      ) : view === "board" ? (
        <Board projects={filtered} showArchived={showArchived} />
      ) : view === "grid" ? (
        <div className="project-grid">
          {filtered.map((p) => (
            <ProjectCard key={p.id} project={p} showStatus />
          ))}
        </div>
      ) : (
        <ProjectTable projects={filtered} />
      )}
    </div>
  );
}

// ───────────────────────── Kanban ─────────────────────────

function Board({ projects, showArchived }: { projects: Project[]; showArchived: boolean }) {
  const updateProject = useStore((s) => s.updateProject);
  const columns = showArchived ? [...BOARD_STATUSES, "archived" as const] : BOARD_STATUSES;
  const byColumn = useMemo(() => {
    const m = Object.fromEntries(columns.map((c) => [c, [] as string[]])) as Record<string, string[]>;
    [...projects]
      .sort((a, b) => a.position - b.position)
      .forEach((p) => m[p.status]?.push(p.id));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, showArchived]);

  const [items, setItems] = useState(byColumn);
  const [activeId, setActiveId] = useState<string | null>(null);
  const dragging = useRef(false);
  useEffect(() => {
    if (!dragging.current) setItems(byColumn);
  }, [byColumn]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const findColumn = (id: string) => (id in items ? id : Object.keys(items).find((c) => items[c].includes(id)));
  const byId = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const onDragStart = (e: DragStartEvent) => {
    dragging.current = true;
    setActiveId(String(e.active.id));
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const from = findColumn(String(active.id));
    const to = findColumn(String(over.id));
    if (!from || !to || from === to) return;
    setItems((prev) => {
      const fromList = prev[from].filter((id) => id !== active.id);
      const toList = [...prev[to]];
      const overIndex = toList.indexOf(String(over.id));
      toList.splice(overIndex >= 0 ? overIndex : toList.length, 0, String(active.id));
      return { ...prev, [from]: fromList, [to]: toList };
    });
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    dragging.current = false;
    setActiveId(null);
    if (!over) return setItems(byColumn);
    const id = String(active.id);
    const col = findColumn(id);
    if (!col) return;
    let list = items[col];
    const oldIndex = list.indexOf(id);
    const overIndex = list.indexOf(String(over.id));
    if (overIndex >= 0 && overIndex !== oldIndex) {
      list = [...list];
      list.splice(oldIndex, 1);
      list.splice(overIndex, 0, id);
      setItems((prev) => ({ ...prev, [col]: list }));
    }
    const idx = list.indexOf(id);
    const prevP = byId.get(list[idx - 1])?.position;
    const nextP = byId.get(list[idx + 1])?.position;
    const position =
      prevP !== undefined && nextP !== undefined ? (prevP + nextP) / 2 : prevP !== undefined ? prevP + 1 : nextP !== undefined ? nextP - 1 : 0;
    const project = byId.get(id)!;
    if (project.status !== col || project.position !== position) {
      void updateProject(id, { status: col as ProjectStatus, position });
    }
  };

  const active = activeId ? byId.get(activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        dragging.current = false;
        setActiveId(null);
        setItems(byColumn);
      }}
    >
      <div className="board">
        {columns.map((status) => (
          <Column key={status} status={status} ids={items[status] ?? []} byId={byId} />
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 220, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }}>
        {active ? <ProjectCard project={active} overlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({ status, ids, byId }: { status: ProjectStatus; ids: string[]; byId: Map<string, Project> }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const set = useStore((s) => s.set);
  const m = STATUS_META[status];
  return (
    <section className={`column-lane ${isOver ? "is-over" : ""}`} style={{ "--c": m.color } as React.CSSProperties}>
      <header className="lane-head">
        <span className="lane-kanji">{m.kanji}</span>
        <div>
          <h3>{m.label}</h3>
          <small>{m.hint}</small>
        </div>
        <span className="lane-count">{ids.length}</span>
      </header>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="lane-body">
          {ids.map((id) => {
            const p = byId.get(id);
            return p ? <SortableCard key={id} project={p} /> : null;
          })}
          {ids.length === 0 && <div className="lane-empty">Arraste projetos pra cá</div>}
          <button className="lane-add" onClick={() => set({ projectForm: { open: true, status } })}>
            <Plus size={14} /> Adicionar
          </button>
        </div>
      </SortableContext>
    </section>
  );
}

function SortableCard({ project }: { project: Project }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: project.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "is-dragging" : ""}
      {...attributes}
      {...listeners}
    >
      <ProjectCard project={project} />
    </div>
  );
}

// ───────────────────────── Cards ─────────────────────────

export function ProjectCard({ project: p, overlay, showStatus }: { project: Project; overlay?: boolean; showStatus?: boolean }) {
  const [, navigate] = useLocation();
  const stats = useProjectStats().get(p.id);
  const pct = stats?.total ? Math.round(((stats.total - stats.open) / stats.total) * 100) : p.progress;
  return (
    <article
      className={`project-card ${overlay ? "overlay" : ""} ${p.status === "done" ? "is-done" : ""}`}
      style={{ "--c": p.color } as React.CSSProperties}
      onClick={() => !overlay && navigate(`/projetos/${p.id}`)}
      onKeyDown={(e) => e.key === "Enter" && navigate(`/projetos/${p.id}`)}
      tabIndex={0}
    >
      {p.status === "done" && <span className="card-hanko">完</span>}
      <header className="pc-head">
        <span className="pc-icon">{p.icon}</span>
        <div className="pc-titles">
          <h4>
            {p.pinned && <Pin size={12} className="pin" />}
            {p.name}
          </h4>
          <span className="pc-sub">
            {TYPE_META[p.type].kanji} {TYPE_META[p.type].label}
            {p.client && ` · ${p.client}`}
          </span>
        </div>
        {p.status !== "done" && (
          <span className="pc-priority" title={`Prioridade ${PRIORITY_META[p.priority].label}`} style={{ color: PRIORITY_META[p.priority].color }}>
            {PRIORITY_META[p.priority].kanji}
          </span>
        )}
      </header>
      {p.description && <p className="pc-desc">{p.description}</p>}
      {p.stack.length > 0 && (
        <div className="pc-stack">
          {p.stack.slice(0, 4).map((s) => (
            <span key={s} className="mini-chip">
              {s}
            </span>
          ))}
          {p.stack.length > 4 && <span className="mini-chip">+{p.stack.length - 4}</span>}
        </div>
      )}
      <div className="pc-progress">
        <div className="bar">
          <i style={{ width: `${pct}%` }} />
        </div>
        <span>{pct}%</span>
      </div>
      <footer className="pc-foot">
        {showStatus && <StatusBadge status={p.status} />}
        {stats && stats.open > 0 && (
          <span className="pc-stat" title="Tarefas abertas">
            ☐ {stats.open}
          </span>
        )}
        {stats && stats.bugs > 0 && (
          <span className="pc-stat pc-bugs" title="Bugs abertos">
            <Bug size={12} /> {stats.bugs}
          </span>
        )}
        {stats && stats.support > 0 && (
          <span className="pc-stat pc-support" title="Chamados de suporte abertos">
            支 {stats.support}
          </span>
        )}
        <span className="spacer" />
        {p.due_date && p.status !== "done" && <DueBadge date={p.due_date} />}
      </footer>
    </article>
  );
}

function ProjectTable({ projects }: { projects: Project[] }) {
  const [, navigate] = useLocation();
  const stats = useProjectStats();
  const [sort, setSort] = useState<{ key: keyof Project; dir: 1 | -1 }>({ key: "updated_at", dir: -1 });
  const rows = [...projects].sort((a, b) => {
    const x = a[sort.key] ?? "";
    const y = b[sort.key] ?? "";
    return (x > y ? 1 : x < y ? -1 : 0) * sort.dir;
  });
  const th = (key: keyof Project, label: string) => (
    <th onClick={() => setSort((s) => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : 1 }))} className={sort.key === key ? "sorted" : ""}>
      {label} {sort.key === key ? (sort.dir === 1 ? "↑" : "↓") : ""}
    </th>
  );
  return (
    <div className="table-wrap card">
      <table className="table">
        <thead>
          <tr>
            {th("name", "Projeto")}
            {th("status", "Status")}
            {th("type", "Tipo")}
            {th("client", "Cliente")}
            <th>Tarefas</th>
            {th("progress", "Progresso")}
            {th("due_date", "Prazo")}
            {th("updated_at", "Atualizado")}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const s = stats.get(p.id);
            const pct = s?.total ? Math.round(((s.total - s.open) / s.total) * 100) : p.progress;
            return (
              <tr key={p.id} onClick={() => navigate(`/projetos/${p.id}`)}>
                <td>
                  <span className="table-project" style={{ "--c": p.color } as React.CSSProperties}>
                    <span className="pc-icon sm">{p.icon}</span> {p.name}
                  </span>
                </td>
                <td>
                  <StatusBadge status={p.status} />
                </td>
                <td>{TYPE_META[p.type].label}</td>
                <td className="muted">{p.client || "—"}</td>
                <td>{s ? `${s.total - s.open}/${s.total}` : "—"}</td>
                <td>
                  <ProgressRing value={pct} size={32} stroke={3} color={p.color} />
                </td>
                <td>{p.due_date ? <DueBadge date={p.due_date} done={p.status === "done"} /> : "—"}</td>
                <td className="muted">{new Date(p.updated_at).toLocaleDateString("pt-BR")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
