import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "wouter";
import { ArrowLeft, BookText, ExternalLink, GitBranch, Globe, Pencil, Pin, PinOff, Timer } from "lucide-react";
import { PROJECT_STATUSES, TASK_KINDS, type Activity, type ProjectStatus, type TaskKind } from "@shared/types";
import { api } from "../api";
import { useStore } from "../store";
import { KIND_META, PRIORITY_META, STATUS_META, TYPE_META } from "../lib/constants";
import { formatLong, formatMinutes, timeAgo } from "../lib/dates";
import { QuickAdd } from "../components/QuickAdd";
import { TaskRow } from "../components/TaskRow";
import { DueBadge, Empty, MarkdownEditor, ProgressRing } from "../components/ui";

type Tab = "tasks" | "notes" | "activity";

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const project = useStore((s) => s.projects.find((p) => p.id === id));
  const allTasks = useStore((s) => s.tasks);
  const stats = useStore((s) => s.stats);
  const set = useStore((s) => s.set);
  const updateProject = useStore((s) => s.updateProject);
  const pomoSet = useStore((s) => s.pomoSet);
  const [tab, setTab] = useState<Tab>("tasks");
  const [kind, setKind] = useState<TaskKind | "">("");
  const [showDone, setShowDone] = useState(false);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [notes, setNotes] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");

  useEffect(() => {
    setNotes(project?.notes ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (tab === "activity" && id) api<Activity[]>(`/activity?limit=60&project_id=${id}`).then(setActivity).catch(() => {});
  }, [tab, id, stats]);

  // salva ao sair da página se houver edição pendente
  const pending = useRef<{ id: string; notes: string } | null>(null);
  useEffect(
    () => () => {
      clearTimeout(saveTimer.current);
      if (pending.current) void useStore.getState().updateProject(pending.current.id, { notes: pending.current.notes });
    },
    [id],
  );

  const tasks = useMemo(() => allTasks.filter((t) => t.project_id === id), [allTasks, id]);
  const visible = tasks.filter((t) => !kind || t.kind === kind);
  const doing = visible.filter((t) => t.status === "doing");
  const todo = visible
    .filter((t) => t.status === "todo")
    .sort(
      (a, b) =>
        PRIORITY_META[b.priority].weight - PRIORITY_META[a.priority].weight || (a.due_date ?? "9").localeCompare(b.due_date ?? "9"),
    );
  const done = visible.filter((t) => t.status === "done").sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));

  if (!project) {
    return (
      <div className="page">
        <Empty kanji="迷" title="Projeto não encontrado">
          <Link href="/projetos" className="btn btn-ghost">
            <ArrowLeft size={16} /> Voltar aos projetos
          </Link>
        </Empty>
      </div>
    );
  }

  const p = project;
  const openCount = tasks.filter((t) => t.status !== "done").length;
  const pct = tasks.length ? Math.round(((tasks.length - openCount) / tasks.length) * 100) : p.progress;
  const focusMin = stats?.focus_by_project.find((f) => f.project_id === p.id)?.minutes ?? 0;
  const bugs = tasks.filter((t) => t.kind === "bug" && t.status !== "done").length;

  const onNotes = (v: string) => {
    setNotes(v);
    setSaved("saving");
    pending.current = { id: p.id, notes: v };
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      pending.current = null;
      await updateProject(p.id, { notes: v });
      setSaved("saved");
    }, 800);
  };

  const links = [
    { url: p.repo_url, label: "Repositório", icon: GitBranch },
    { url: p.live_url, label: "Produção", icon: Globe },
    { url: p.docs_url, label: "Docs", icon: BookText },
  ].filter((l) => l.url);

  return (
    <div className="page project-detail" style={{ "--c": p.color } as React.CSSProperties}>
      <Link href="/projetos" className="back-link">
        <ArrowLeft size={16} /> Projetos
      </Link>

      <section className="pd-banner">
        <div className="pd-banner-kanji" aria-hidden="true">
          {STATUS_META[p.status].kanji}
        </div>
        <span className="pd-icon">{p.icon}</span>
        <div className="pd-head">
          <div className="pd-kicker">
            {TYPE_META[p.type].kanji} {TYPE_META[p.type].label}
            {p.client && <> · {p.client}</>}
          </div>
          <h1>{p.name}</h1>
          {p.description && <p className="pd-desc">{p.description}</p>}
          <div className="pd-links">
            {links.map((l) => (
              <a key={l.label} href={l.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost sm">
                <l.icon size={14} /> {l.label} <ExternalLink size={12} />
              </a>
            ))}
          </div>
        </div>
        <div className="pd-actions">
          <button className="icon-btn" title={p.pinned ? "Desafixar" : "Fixar no início"} onClick={() => void updateProject(p.id, { pinned: !p.pinned })}>
            {p.pinned ? <PinOff size={18} /> : <Pin size={18} />}
          </button>
          <Link
            href="/foco"
            className="icon-btn"
            title="Sessão de foco neste projeto"
            onClick={() => pomoSet({ projectId: p.id, taskId: null, label: p.name })}
          >
            <Timer size={18} />
          </Link>
          <button className="btn btn-ghost" onClick={() => set({ projectForm: { open: true, project: p } })}>
            <Pencil size={16} /> Editar
          </button>
        </div>
      </section>

      <div className="status-stepper" role="radiogroup" aria-label="Status do projeto">
        {PROJECT_STATUSES.map((s: ProjectStatus) => (
          <button
            key={s}
            role="radio"
            aria-checked={p.status === s}
            className={p.status === s ? "active" : ""}
            style={{ "--c": STATUS_META[s].color } as React.CSSProperties}
            onClick={() => p.status !== s && void updateProject(p.id, { status: s })}
          >
            <span className="step-kanji">{STATUS_META[s].kanji}</span>
            <span>{STATUS_META[s].label}</span>
          </button>
        ))}
      </div>

      <div className="pd-layout">
        <div className="pd-main">
          <div className="tabs">
            <button className={tab === "tasks" ? "active" : ""} onClick={() => setTab("tasks")}>
              任務 Tarefas <span className="tab-count">{openCount}</span>
            </button>
            <button className={tab === "notes" ? "active" : ""} onClick={() => setTab("notes")}>
              帳面 Notas
            </button>
            <button className={tab === "activity" ? "active" : ""} onClick={() => setTab("activity")}>
              記録 Histórico
            </button>
          </div>

          {tab === "tasks" && (
            <div className="card">
              <QuickAdd projectId={p.id} placeholder={`Nova tarefa em ${p.name}…  !alta  @sex  ~bug`} />
              <div className="kind-filter">
                <button className={!kind ? "active" : ""} onClick={() => setKind("")}>
                  Todas
                </button>
                {TASK_KINDS.map((k) => {
                  const n = tasks.filter((t) => t.kind === k && t.status !== "done").length;
                  return (
                    <button
                      key={k}
                      className={kind === k ? "active" : ""}
                      style={{ "--c": KIND_META[k].color } as React.CSSProperties}
                      onClick={() => setKind(kind === k ? "" : k)}
                    >
                      {KIND_META[k].label} {n > 0 && <b>{n}</b>}
                    </button>
                  );
                })}
              </div>

              {doing.length > 0 && (
                <div className="task-group">
                  <h4 className="group-title">
                    <span>進行中</span> Fazendo agora
                  </h4>
                  {doing.map((t) => (
                    <TaskRow key={t.id} task={t} showProject={false} />
                  ))}
                </div>
              )}
              <div className="task-group">
                <h4 className="group-title">
                  <span>未完</span> A fazer · {todo.length}
                </h4>
                {todo.length === 0 ? (
                  <p className="muted small pad">Nada pendente {kind ? "desse tipo" : ""}. 🍵</p>
                ) : (
                  todo.map((t) => <TaskRow key={t.id} task={t} showProject={false} />)
                )}
              </div>
              {done.length > 0 && (
                <div className="task-group">
                  <button className="group-title as-button" onClick={() => setShowDone(!showDone)}>
                    <span>完了</span> Concluídas · {done.length} {showDone ? "▾" : "▸"}
                  </button>
                  {showDone && done.map((t) => <TaskRow key={t.id} task={t} showProject={false} />)}
                </div>
              )}
            </div>
          )}

          {tab === "notes" && (
            <div className="card">
              <div className="notes-head">
                <span className="muted small">Anotações, decisões técnicas, credenciais de teste (sem senhas reais 😉), links…</span>
                <span className={`save-state ${saved}`}>{saved === "saving" ? "salvando…" : saved === "saved" ? "salvo ✓" : ""}</span>
              </div>
              <MarkdownEditor value={notes} onChange={onNotes} rows={18} placeholder={"## Arquitetura\n- Front: …\n- API: …\n\n## Deploy\n…"} />
            </div>
          )}

          {tab === "activity" && (
            <div className="card">
              {activity.length === 0 ? (
                <Empty kanji="無" title="Sem histórico ainda" />
              ) : (
                <ol className="timeline">
                  {activity.map((a) => (
                    <li key={a.id}>
                      <span className="timeline-kanji">・</span>
                      <span className="timeline-text">{a.message}</span>
                      <time className="timeline-time">{timeAgo(a.created_at)}</time>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>

        <aside className="pd-side">
          <div className="card pd-progress">
            <ProgressRing value={pct} size={120} stroke={9} color={p.color} />
            <div className="pd-progress-text">
              <strong>{pct}%</strong>
              <span>{tasks.length ? `${tasks.length - openCount} de ${tasks.length} tarefas` : "progresso manual"}</span>
            </div>
          </div>
          <div className="card pd-facts">
            <dl>
              <div>
                <dt>Abertas</dt>
                <dd>{openCount}</dd>
              </div>
              <div>
                <dt>Bugs</dt>
                <dd className={bugs ? "text-danger" : ""}>{bugs}</dd>
              </div>
              <div>
                <dt>Foco</dt>
                <dd>{formatMinutes(focusMin)}</dd>
              </div>
              <div>
                <dt>Prioridade</dt>
                <dd style={{ color: PRIORITY_META[p.priority].color }}>
                  {PRIORITY_META[p.priority].kanji} {PRIORITY_META[p.priority].label}
                </dd>
              </div>
            </dl>
            <ul className="pd-dates">
              {p.start_date && (
                <li>
                  <span>Início</span> {formatLong(p.start_date)}
                </li>
              )}
              {p.due_date && (
                <li>
                  <span>Prazo</span> {formatLong(p.due_date)} {p.status !== "done" && <DueBadge date={p.due_date} />}
                </li>
              )}
              {p.finished_at && (
                <li>
                  <span>Entregue</span> {new Date(p.finished_at).toLocaleDateString("pt-BR")}
                </li>
              )}
              <li>
                <span>Criado</span> {new Date(p.created_at).toLocaleDateString("pt-BR")}
              </li>
            </ul>
          </div>
          {p.stack.length > 0 && (
            <div className="card">
              <h4 className="side-title">技術 Stack</h4>
              <div className="pc-stack">
                {p.stack.map((s) => (
                  <span key={s} className="chip">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
