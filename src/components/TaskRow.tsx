import { memo } from "react";
import { Link } from "wouter";
import { Check, ExternalLink, Pencil, Play, Timer } from "lucide-react";
import type { Task } from "@shared/types";
import { useStore } from "../store";
import { DueBadge, KindBadge, PriorityBadge } from "./ui";

interface Props {
  task: Task;
  showProject?: boolean;
}

export const TaskRow = memo(function TaskRow({ task, showProject = true }: Props) {
  const project = useStore((s) => (task.project_id ? s.projects.find((p) => p.id === task.project_id) : undefined));
  const toggleTask = useStore((s) => s.toggleTask);
  const updateTask = useStore((s) => s.updateTask);
  const set = useStore((s) => s.set);
  const pomoSet = useStore((s) => s.pomoSet);
  const pomoRunning = useStore((s) => s.pomodoro.running);
  const done = task.status === "done";

  return (
    <div className={`task-row ${done ? "is-done" : ""} ${task.status === "doing" ? "is-doing" : ""}`} data-priority={task.priority}>
      <button
        className={`check ${done ? "checked" : ""}`}
        onClick={() => void toggleTask(task)}
        aria-label={done ? "Marcar como pendente" : "Concluir tarefa"}
      >
        <Check size={14} strokeWidth={3} />
      </button>
      <div className="task-main" onDoubleClick={() => set({ taskForm: { open: true, task } })}>
        <div className="task-title">{task.title}</div>
        <div className="task-meta">
          {showProject && project && (
            <Link href={`/projetos/${project.id}`} className="task-project" style={{ "--c": project.color } as React.CSSProperties}>
              <span>{project.icon}</span>
              {project.name}
            </Link>
          )}
          {task.kind !== "feature" && <KindBadge kind={task.kind} />}
          {task.priority !== "medium" && <PriorityBadge priority={task.priority} compact />}
          {task.due_date && <DueBadge date={task.due_date} done={done} />}
          {task.status === "doing" && <span className="doing-pill">fazendo</span>}
          {task.notes && <span className="has-notes" title="Tem notas">✎</span>}
          {task.needs_review ? (
            <span className="review-pill" title={`Criada automaticamente${task.source ? ` (${task.source})` : ""}. Confira e aprove.`}>
              a revisar
              <button className="review-ok" title="Aprovar (remove o selo)" onClick={() => void updateTask(task.id, { needs_review: 0 })}>
                <Check size={11} strokeWidth={3} />
              </button>
            </span>
          ) : null}
          {task.external_url && (
            <a
              className="ext-link"
              href={task.external_url}
              target="_blank"
              rel="noopener noreferrer"
              title={`Abrir na origem${task.source ? ` (${task.source})` : ""}`}
            >
              <ExternalLink size={12} />
              {task.source && <span>{task.source}</span>}
            </a>
          )}
        </div>
      </div>
      <div className="task-actions">
        {!done && task.status !== "doing" && (
          <button className="icon-btn sm" title="Marcar como fazendo" onClick={() => void updateTask(task.id, { status: "doing" })}>
            <Play size={14} />
          </button>
        )}
        {!done && !pomoRunning && (
          <Link
            href="/foco"
            className="icon-btn sm"
            title="Focar nesta tarefa (pomodoro)"
            onClick={() => pomoSet({ taskId: task.id, projectId: task.project_id, label: task.title })}
          >
            <Timer size={14} />
          </Link>
        )}
        <button className="icon-btn sm" title="Editar" onClick={() => set({ taskForm: { open: true, task } })}>
          <Pencil size={14} />
        </button>
      </div>
    </div>
  );
});
