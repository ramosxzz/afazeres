import { useState, type ReactNode } from "react";
import { X } from "lucide-react";
import type { Priority, ProjectStatus, TaskKind } from "@shared/types";
import { KIND_META, PRIORITY_META, STATUS_META } from "../lib/constants";
import { relativeDue } from "../lib/dates";
import { renderMarkdown } from "../lib/markdown";

export function PageHeader({
  kanji,
  romaji,
  title,
  subtitle,
  actions,
}: {
  kanji: string;
  romaji?: string;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="page-kanji" aria-hidden="true">
        {kanji}
      </div>
      <div className="page-titles">
        {romaji && <span className="page-romaji">{romaji}</span>}
        <h1>{title}</h1>
        {subtitle && <p className="page-sub">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function StatusBadge({ status }: { status: ProjectStatus }) {
  const m = STATUS_META[status];
  return (
    <span className="badge" style={{ "--c": m.color } as React.CSSProperties}>
      <i className="dot" />
      {m.label}
    </span>
  );
}

export function PriorityBadge({ priority, compact }: { priority: Priority; compact?: boolean }) {
  const m = PRIORITY_META[priority];
  return (
    <span className="badge badge-outline" style={{ "--c": m.color } as React.CSSProperties} title={`Prioridade ${m.label}`}>
      <b className="badge-kanji">{m.kanji}</b>
      {!compact && m.label}
    </span>
  );
}

export function KindBadge({ kind }: { kind: TaskKind }) {
  const m = KIND_META[kind];
  return (
    <span className="badge badge-ghost" style={{ "--c": m.color } as React.CSSProperties}>
      {m.label}
    </span>
  );
}

export function DueBadge({ date, done }: { date: string; done?: boolean }) {
  const r = relativeDue(date);
  return <span className={`due due-${done ? "done" : r.tone}`}>{r.text}</span>;
}

export function ProgressRing({ value, size = 44, stroke = 4, color }: { value: number; size?: number; stroke?: number; color?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg className="ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${value}%`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color ?? "var(--accent)"}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - value / 100)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset .6s var(--ease)" }}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="ring-text">
        {value}
      </text>
    </svg>
  );
}

export function Empty({ kanji, title, children }: { kanji: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-kanji">{kanji}</div>
      <h3>{title}</h3>
      {children && <div className="empty-body">{children}</div>}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size,
}: {
  value: T;
  options: { value: T; label: ReactNode; color?: string; title?: string }[];
  onChange: (v: T) => void;
  size?: "sm";
}) {
  return (
    <div className={`segmented ${size === "sm" ? "segmented-sm" : ""}`} role="radiogroup">
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? "active" : ""}
          style={o.color ? ({ "--c": o.color } as React.CSSProperties) : undefined}
          title={o.title}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function TagInput({
  value,
  onChange,
  suggestions = [],
  placeholder,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  const add = (t: string) => {
    const tag = t.trim();
    if (tag && !value.some((v) => v.toLowerCase() === tag.toLowerCase())) onChange([...value, tag]);
    setDraft("");
  };
  const matches = draft
    ? suggestions.filter((s) => s.toLowerCase().includes(draft.toLowerCase()) && !value.includes(s)).slice(0, 6)
    : [];
  return (
    <div className="tag-input">
      <div className="tag-list">
        {value.map((t) => (
          <span key={t} className="chip">
            {t}
            <button type="button" aria-label={`Remover ${t}`} onClick={() => onChange(value.filter((v) => v !== t))}>
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          value={draft}
          placeholder={value.length ? "" : placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === ",") && draft.trim()) {
              e.preventDefault();
              add(matches[0] && e.key === "Enter" && matches[0].toLowerCase().startsWith(draft.toLowerCase()) ? matches[0] : draft);
            } else if (e.key === "Backspace" && !draft && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => draft.trim() && add(draft)}
        />
      </div>
      {matches.length > 0 && (
        <div className="tag-suggest">
          {matches.map((m) => (
            <button type="button" key={m} onMouseDown={(e) => e.preventDefault()} onClick={() => add(m)}>
              {m}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Markdown({ source, className }: { source: string; className?: string }) {
  return <div className={`markdown ${className ?? ""}`} dangerouslySetInnerHTML={{ __html: renderMarkdown(source) }} />;
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  rows = 10,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  const [preview, setPreview] = useState(false);
  return (
    <div className="md-editor">
      <div className="md-tabs">
        <button type="button" className={!preview ? "active" : ""} onClick={() => setPreview(false)}>
          Escrever
        </button>
        <button type="button" className={preview ? "active" : ""} onClick={() => setPreview(true)}>
          Visualizar
        </button>
        <span className="md-hint">Markdown ✓</span>
      </div>
      {preview ? (
        <div className="md-preview">{value.trim() ? <Markdown source={value} /> : <p className="muted">Nada por aqui ainda.</p>}</div>
      ) : (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows} />
      )}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}
