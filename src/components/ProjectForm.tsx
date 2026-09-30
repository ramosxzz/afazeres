import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Trash2 } from "lucide-react";
import { PRIORITIES, PROJECT_STATUSES, PROJECT_TYPES, type ProjectInput } from "@shared/types";
import { useStore } from "../store";
import { PRIORITY_META, PROJECT_COLORS, PROJECT_ICONS, STACK_SUGGESTIONS, STATUS_META, TYPE_META } from "../lib/constants";
import { Modal } from "./Modal";
import { Field, Segmented, TagInput } from "./ui";

const EMPTY: ProjectInput = {
  name: "",
  description: "",
  status: "active",
  type: "fullstack",
  priority: "medium",
  client: "",
  color: "#8b95a5",
  icon: "桜",
  stack: [],
  repo_url: "",
  live_url: "",
  docs_url: "",
  progress: 0,
  start_date: null,
  due_date: null,
};

export function ProjectFormModal() {
  const { open, project, status } = useStore((s) => s.projectForm);
  const set = useStore((s) => s.set);
  const createProject = useStore((s) => s.createProject);
  const updateProject = useStore((s) => s.updateProject);
  const deleteProject = useStore((s) => s.deleteProject);
  const allProjects = useStore((s) => s.projects);
  const [, navigate] = useLocation();
  const [form, setForm] = useState<ProjectInput>(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (project) {
      const { id: _i, created_at: _c, updated_at: _u, ...rest } = project;
      setForm(rest);
    } else {
      setForm({
        ...EMPTY,
        status: status ?? "active",
        color: PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)],
        icon: PROJECT_ICONS[Math.floor(Math.random() * 24)],
      });
    }
  }, [open, project, status]);

  const close = () => set({ projectForm: { open: false } });
  const up = (patch: ProjectInput) => setForm((f) => ({ ...f, ...patch }));

  const usedStacks = [...new Set(allProjects.flatMap((p) => p.stack))];
  const suggestions = [...new Set([...usedStacks, ...STACK_SUGGESTIONS])];

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!form.name?.trim() || saving) return;
    setSaving(true);
    try {
      if (project) {
        await updateProject(project.id, form);
        close();
      } else {
        const p = await createProject(form);
        if (p) {
          close();
          navigate(`/projetos/${p.id}`);
        }
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      wide
      kanji={form.icon}
      title={project ? "Editar projeto" : "Novo projeto"}
      footer={
        <>
          {project && (
            <button
              type="button"
              className="btn btn-danger-ghost"
              onClick={async () => {
                if (!window.confirm(`Excluir "${project.name}" e todas as tarefas dele?`)) return;
                close();
                navigate("/projetos");
                await deleteProject(project.id);
              }}
            >
              <Trash2 size={16} /> Excluir
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn btn-ghost" onClick={close}>
            Cancelar
          </button>
          <button type="submit" form="project-form" className="btn btn-primary" disabled={!form.name?.trim() || saving}>
            {project ? "Salvar" : "Criar projeto"} <kbd>⌘↵</kbd>
          </button>
        </>
      }
    >
      <form
        id="project-form"
        className="form-grid"
        onSubmit={submit}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
        }}
      >
        <div className="form-hero" style={{ "--c": form.color } as React.CSSProperties}>
          <div className="icon-preview">{form.icon}</div>
          <input
            className="input-hero"
            autoFocus
            placeholder="Nome do projeto"
            value={form.name}
            onChange={(e) => up({ name: e.target.value })}
          />
        </div>

        <Field label="Ícone">
          <div className="icon-grid">
            {PROJECT_ICONS.map((i) => (
              <button type="button" key={i} className={form.icon === i ? "active" : ""} onClick={() => up({ icon: i })}>
                {i}
              </button>
            ))}
            <input
              className="icon-custom"
              maxLength={4}
              placeholder="字"
              title="Digite um kanji ou emoji próprio"
              value={PROJECT_ICONS.includes(form.icon ?? "") ? "" : form.icon}
              onChange={(e) => e.target.value && up({ icon: e.target.value })}
            />
          </div>
        </Field>

        <Field label="Cor">
          <div className="color-row">
            {PROJECT_COLORS.map((c) => (
              <button
                type="button"
                key={c}
                className={`swatch ${form.color === c ? "active" : ""}`}
                style={{ background: c }}
                aria-label={c}
                onClick={() => up({ color: c })}
              />
            ))}
            <input type="color" value={form.color} onChange={(e) => up({ color: e.target.value })} title="Cor personalizada" />
          </div>
        </Field>

        <Field label="Status">
          <Segmented
            value={form.status!}
            onChange={(status) => up({ status })}
            options={PROJECT_STATUSES.map((s) => ({
              value: s,
              label: (
                <>
                  <span className="seg-kanji">{STATUS_META[s].kanji}</span>
                  {STATUS_META[s].label}
                </>
              ),
              color: STATUS_META[s].color,
            }))}
          />
        </Field>

        <div className="form-row">
          <Field label="Tipo">
            <select value={form.type} onChange={(e) => up({ type: e.target.value as ProjectInput["type"] })}>
              {PROJECT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_META[t].kanji} · {TYPE_META[t].label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Prioridade">
            <select value={form.priority} onChange={(e) => up({ priority: e.target.value as ProjectInput["priority"] })}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_META[p].kanji} · {PRIORITY_META[p].label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Cliente / empresa">
            <input value={form.client} onChange={(e) => up({ client: e.target.value })} placeholder="Pessoal, freela, empresa…" />
          </Field>
        </div>

        <Field label="Descrição">
          <textarea
            rows={2}
            value={form.description}
            onChange={(e) => up({ description: e.target.value })}
            placeholder="Do que se trata, em uma ou duas linhas"
          />
        </Field>

        <Field label="Stack" hint="Enter ou vírgula para adicionar">
          <TagInput value={form.stack ?? []} onChange={(stack) => up({ stack })} suggestions={suggestions} placeholder="React, Hono, D1…" />
        </Field>

        <div className="form-row">
          <Field label="Repositório">
            <input value={form.repo_url} onChange={(e) => up({ repo_url: e.target.value })} placeholder="github.com/…" />
          </Field>
          <Field label="Produção / demo">
            <input value={form.live_url} onChange={(e) => up({ live_url: e.target.value })} placeholder="meuapp.com" />
          </Field>
          <Field label="Docs / Figma">
            <input value={form.docs_url} onChange={(e) => up({ docs_url: e.target.value })} placeholder="figma.com/…" />
          </Field>
        </div>

        <div className="form-row">
          <Field label="Início">
            <input type="date" value={form.start_date ?? ""} onChange={(e) => up({ start_date: e.target.value || null })} />
          </Field>
          <Field label="Prazo">
            <input type="date" value={form.due_date ?? ""} onChange={(e) => up({ due_date: e.target.value || null })} />
          </Field>
          <Field label={`Progresso · ${form.progress ?? 0}%`}>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={form.progress ?? 0}
              onChange={(e) => up({ progress: Number(e.target.value) })}
              style={{ "--val": `${form.progress ?? 0}%` } as React.CSSProperties}
            />
          </Field>
        </div>
      </form>
    </Modal>
  );
}
