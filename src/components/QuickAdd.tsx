import { forwardRef, useMemo, useState } from "react";
import { CornerDownLeft, Plus } from "lucide-react";
import { useStore } from "../store";
import { parseQuickAdd } from "../lib/quickadd";
import { KIND_META, PRIORITY_META } from "../lib/constants";
import { DueBadge } from "./ui";

interface Props {
  projectId?: string;
  placeholder?: string;
  defaultDue?: string;
}

/** Campo de adição rápida com sintaxe: #projeto !alta @amanha ~bug */
export const QuickAdd = forwardRef<HTMLInputElement, Props>(function QuickAdd({ projectId, placeholder, defaultDue }, ref) {
  const projects = useStore((s) => s.projects);
  const createTask = useStore((s) => s.createTask);
  const toast = useStore((s) => s.toast);
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const parsed = useMemo(() => parseQuickAdd(value, projects), [value, projects]);

  const submit = async () => {
    if (!parsed.title.trim()) return;
    const task = await createTask({
      title: parsed.title,
      project_id: parsed.project?.id ?? projectId ?? null,
      priority: parsed.priority ?? "medium",
      due_date: parsed.due_date ?? defaultDue ?? null,
      kind: parsed.kind ?? "feature",
      status: "todo",
    });
    if (task) {
      setValue("");
      toast("Tarefa adicionada", "success", { kanji: "追" });
    }
  };

  const hasTokens = parsed.project || parsed.projectQuery || parsed.priority || parsed.due_date || parsed.kind;

  return (
    <div className={`quickadd ${focused ? "focused" : ""}`}>
      <Plus size={18} className="quickadd-icon" />
      <input
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
          if (e.key === "Escape") (e.target as HTMLInputElement).blur();
        }}
        placeholder={placeholder ?? "Nova tarefa…  #projeto  !alta  @amanha  ~bug"}
        aria-label="Adicionar tarefa rápida"
      />
      {hasTokens && (
        <div className="quickadd-tokens">
          {parsed.projectQuery &&
            (parsed.project ? (
              <span className="chip" style={{ "--c": parsed.project.color } as React.CSSProperties}>
                {parsed.project.icon} {parsed.project.name}
              </span>
            ) : (
              <span className="chip chip-warn">#{parsed.projectQuery}?</span>
            ))}
          {parsed.priority && <span className="chip">{PRIORITY_META[parsed.priority].kanji} {PRIORITY_META[parsed.priority].label}</span>}
          {parsed.kind && <span className="chip">{KIND_META[parsed.kind].label}</span>}
          {parsed.due_date && <DueBadge date={parsed.due_date} />}
        </div>
      )}
      <button className="quickadd-enter" onClick={() => void submit()} disabled={!parsed.title.trim()} aria-label="Adicionar">
        <CornerDownLeft size={16} />
      </button>
    </div>
  );
});
