import { useEffect, useState } from "react";
import { Check, ExternalLink, Trash2 } from "lucide-react";
import { PRIORITIES, TASK_KINDS, TASK_STATUSES, type TaskInput } from "@shared/types";
import { useStore } from "../store";
import { KIND_META, PRIORITY_META } from "../lib/constants";
import { addDays, todayKey } from "../lib/dates";
import { Modal } from "./Modal";
import { Field, MarkdownEditor, Segmented } from "./ui";

const STATUS_LABEL = { todo: "A fazer", doing: "Fazendo", done: "Feito" } as const;

export function TaskFormModal() {
  const { open, task, projectId } = useStore((s) => s.taskForm);
  const projects = useStore((s) => s.projects);
  const set = useStore((s) => s.set);
  const createTask = useStore((s) => s.createTask);
  const updateTask = useStore((s) => s.updateTask);
  const deleteTask = useStore((s) => s.deleteTask);
  const [form, setForm] = useState<TaskInput>({});

  useEffect(() => {
    if (!open) return;
    setForm(
      task
        ? { ...task }
        : { title: "", notes: "", status: "todo", kind: "feature", priority: "medium", due_date: null, project_id: projectId ?? null },
    );
  }, [open, task, projectId]);

  const close = () => set({ taskForm: { open: false } });
  const up = (p: TaskInput) => setForm((f) => ({ ...f, ...p }));

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!form.title?.trim()) return;
    const body: TaskInput = {
      title: form.title,
      notes: form.notes,
      status: form.status,
      kind: form.kind,
      priority: form.priority,
      due_date: form.due_date,
      project_id: form.project_id,
    };
    close();
    if (task) await updateTask(task.id, body);
    else await createTask(body);
  };

  const today = todayKey();

  return (
    <Modal
      open={open}
      onClose={close}
      kanji="任"
      title={task ? "Editar tarefa" : "Nova tarefa"}
      footer={
        <>
          {task && (
            <button
              type="button"
              className="btn btn-danger-ghost"
              onClick={() => {
                close();
                void deleteTask(task.id);
              }}
            >
              <Trash2 size={16} /> Excluir
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn btn-ghost" onClick={close}>
            Cancelar
          </button>
          <button type="submit" form="task-form" className="btn btn-primary" disabled={!form.title?.trim()}>
            Salvar <kbd>⌘↵</kbd>
          </button>
        </>
      }
    >
      <form
        id="task-form"
        className="form-grid"
        onSubmit={submit}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
        }}
      >
        {task && (task.source || task.needs_review) ? (
          <div className="task-origin">
            {task.source && <span>Veio de {task.source}</span>}
            {task.external_url && (
              <a href={task.external_url} target="_blank" rel="noopener noreferrer" className="ext-link">
                <ExternalLink size={12} /> abrir original
              </a>
            )}
            {task.needs_review ? (
              <button
                type="button"
                className="chip-btn"
                onClick={() => {
                  void updateTask(task.id, { needs_review: 0 });
                  set({ taskForm: { open: true, task: { ...task, needs_review: 0 } } });
                }}
              >
                <Check size={12} /> Aprovar
              </button>
            ) : null}
          </div>
        ) : null}

        <input className="input-hero" autoFocus placeholder="O que precisa ser feito?" value={form.title ?? ""} onChange={(e) => up({ title: e.target.value })} />

        <div className="form-row">
          <Field label="Projeto">
            <select value={form.project_id ?? ""} onChange={(e) => up({ project_id: e.target.value || null })}>
              <option value="">— Sem projeto —</option>
              {projects
                .filter((p) => p.status !== "archived" || p.id === form.project_id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.icon} {p.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Status">
            <Segmented
              value={form.status ?? "todo"}
              onChange={(status) => up({ status })}
              options={TASK_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
            />
          </Field>
        </div>

        <Field label="Tipo">
          <Segmented
            value={form.kind ?? "feature"}
            onChange={(kind) => up({ kind })}
            options={TASK_KINDS.map((k) => ({
              value: k,
              label: (
                <>
                  <span className="seg-kanji">{KIND_META[k].kanji}</span>
                  {KIND_META[k].label}
                </>
              ),
              color: KIND_META[k].color,
            }))}
          />
        </Field>

        <div className="form-row">
          <Field label="Prioridade">
            <Segmented
              value={form.priority ?? "medium"}
              onChange={(priority) => up({ priority })}
              options={PRIORITIES.map((p) => ({
                value: p,
                label: (
                  <>
                    <span className="seg-kanji">{PRIORITY_META[p].kanji}</span>
                    {PRIORITY_META[p].label}
                  </>
                ),
                color: PRIORITY_META[p].color,
              }))}
            />
          </Field>
          <Field label="Prazo">
            <div className="date-quick">
              <input type="date" value={form.due_date ?? ""} onChange={(e) => up({ due_date: e.target.value || null })} />
              <button type="button" className="chip-btn" onClick={() => up({ due_date: today })}>
                Hoje
              </button>
              <button type="button" className="chip-btn" onClick={() => up({ due_date: addDays(today, 1) })}>
                Amanhã
              </button>
              <button type="button" className="chip-btn" onClick={() => up({ due_date: addDays(today, 7) })}>
                +7d
              </button>
            </div>
          </Field>
        </div>

        <Field label="Notas">
          <MarkdownEditor value={form.notes ?? ""} onChange={(notes) => up({ notes })} rows={5} placeholder="Detalhes, links, passos pra reproduzir o bug…" />
        </Field>
      </form>
    </Modal>
  );
}
