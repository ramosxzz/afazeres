import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { MOODS, type JournalEntry, type Mood } from "@shared/types";
import { api } from "../api";
import { useStore } from "../store";
import { MOOD_META } from "../lib/constants";
import { addDays, formatLong, fromKey, monthName, todayKey, weekdayJp } from "../lib/dates";
import { Empty, MarkdownEditor, PageHeader } from "../components/ui";

const TEMPLATE = `### 今日やったこと · O que fiz hoje
-

### 学んだこと · O que aprendi
-

### 困ったこと · O que travou
-

### 明日 · Amanhã
- `;

export function Journal() {
  const toast = useStore((s) => s.toast);
  const refreshStats = useStore((s) => s.refreshStats);
  const [entries, setEntries] = useState<JournalEntry[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pending = useRef<{ id: string; content: string } | null>(null);
  const today = todayKey();
  const [summarizing, setSummarizing] = useState(false);

  /** Pede ao servidor o resumo automático do dia selecionado (ou de hoje) e recarrega. */
  const summarize = async () => {
    const date = entries?.find((e) => e.id === selected)?.date ?? today;
    setSummarizing(true);
    try {
      await flush();
      const res = await api<{ entry: { id: string } | null }>("/automation/journal", { method: "POST", body: { date } });
      const list = await api<JournalEntry[]>("/journal");
      setEntries(list);
      const e = list.find((x) => x.id === res.entry?.id);
      if (e) {
        setSelected(e.id);
        setDraft(e.content);
      }
      toast("Resumo automático atualizado", "success", { kanji: "記" });
      void refreshStats();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSummarizing(false);
    }
  };

  useEffect(() => {
    api<JournalEntry[]>("/journal")
      .then((e) => {
        setEntries(e);
        const t = e.find((x) => x.date === today) ?? e[0];
        if (t) {
          setSelected(t.id);
          setDraft(t.content);
        }
      })
      .catch(() => setEntries([]));
  }, [today]);

  const flush = () => {
    clearTimeout(timer.current);
    const p = pending.current;
    pending.current = null;
    if (p) return api<JournalEntry>(`/journal/${p.id}`, { method: "PATCH", body: { content: p.content } }).catch(() => {});
  };
  useEffect(() => () => void flush(), []);

  const current = entries?.find((e) => e.id === selected) ?? null;

  const select = (e: JournalEntry) => {
    void flush();
    setSelected(e.id);
    setDraft(e.content);
    setSaving("idle");
  };

  const create = async (date: string) => {
    const existing = entries?.find((e) => e.date === date);
    if (existing) return select(existing);
    try {
      const e = await api<JournalEntry>("/journal", { method: "POST", body: { date, mood: "calm", content: TEMPLATE } });
      setEntries((prev) => [e, ...(prev ?? [])].sort((a, b) => b.date.localeCompare(a.date)));
      select(e);
      void refreshStats();
      toast("Nova página no diário · +15 XP", "success", { kanji: "記" });
    } catch (err) {
      toast((err as Error).message, "error");
    }
  };

  const onChange = (v: string) => {
    if (!current) return;
    setDraft(v);
    setSaving("saving");
    pending.current = { id: current.id, content: v };
    setEntries((prev) => prev?.map((e) => (e.id === current.id ? { ...e, content: v } : e)) ?? null);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      await flush();
      setSaving("saved");
    }, 900);
  };

  const setMood = async (mood: Mood) => {
    if (!current) return;
    setEntries((prev) => prev?.map((e) => (e.id === current.id ? { ...e, mood } : e)) ?? null);
    await api(`/journal/${current.id}`, { method: "PATCH", body: { mood } }).catch(() => {});
  };

  const remove = async () => {
    if (!current || !window.confirm("Apagar esta página do diário?")) return;
    pending.current = null;
    await api(`/journal/${current.id}`, { method: "DELETE" });
    const rest = entries!.filter((e) => e.id !== current.id);
    setEntries(rest);
    if (rest[0]) select(rest[0]);
    else setSelected(null);
    void refreshStats();
  };

  // faixa de humor dos últimos 30 dias
  const moodStrip = useMemo(() => {
    const m = new Map((entries ?? []).map((e) => [e.date, e.mood]));
    return Array.from({ length: 30 }, (_, i) => {
      const d = addDays(today, i - 29);
      return { d, mood: m.get(d) };
    });
  }, [entries, today]);

  const grouped = useMemo(() => {
    const g = new Map<string, JournalEntry[]>();
    for (const e of entries ?? []) {
      const d = fromKey(e.date);
      const k = `${monthName(d.getMonth())} ${d.getFullYear()}`;
      g.set(k, [...(g.get(k) ?? []), e]);
    }
    return [...g.entries()];
  }, [entries]);

  return (
    <div className="page journal-page">
      <PageHeader
        kanji="日記"
        romaji="nikki"
        title="Diário de dev"
        subtitle="O que fez, o que aprendeu, o que travou. Seu eu do futuro agradece."
        actions={
          <>
            <button
              className="btn btn-ghost"
              disabled={summarizing}
              onClick={() => void summarize()}
              title="Preenche a página com commits, tarefas concluídas e foco do dia"
            >
              {summarizing ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
              <span className="hide-sm">Resumo automático</span>
            </button>
            <button className="btn btn-primary" onClick={() => void create(today)}>
              <Plus size={16} /> {entries?.some((e) => e.date === today) ? "Abrir hoje" : "Escrever hoje"}
            </button>
          </>
        }
      />

      <div className="card mood-strip-card">
        <div className="mood-strip">
          {moodStrip.map(({ d, mood }) => (
            <button
              key={d}
              className={`mood-cell ${mood ? "has" : ""} ${d === today ? "today" : ""}`}
              title={`${formatLong(d)}${mood ? ` · ${MOOD_META[mood].label}` : ""}`}
              onClick={() => void create(d)}
            >
              {mood ? MOOD_META[mood].emoji : <span>{fromKey(d).getDate()}</span>}
            </button>
          ))}
        </div>
      </div>

      {entries === null ? (
        <div className="loading-block">読み込み中…</div>
      ) : entries.length === 0 ? (
        <Empty kanji="白紙" title="Página em branco">
          <p>Escreva algumas linhas por dia sobre seu trabalho. Vira um ótimo histórico pra daily, retro e currículo.</p>
          <button className="btn btn-primary" onClick={() => void create(today)}>
            <Plus size={16} /> Primeira página
          </button>
        </Empty>
      ) : (
        <div className="journal-layout">
          <aside className="journal-list card">
            {grouped.map(([month, list]) => (
              <div key={month}>
                <h4 className="journal-month">{month}</h4>
                {list.map((e) => (
                  <button key={e.id} className={`journal-item ${e.id === selected ? "active" : ""}`} onClick={() => select(e)}>
                    <span className="ji-day">
                      <b>{fromKey(e.date).getDate()}</b>
                      <small>{weekdayJp(e.date)}</small>
                    </span>
                    <span className="ji-preview">{e.content.replace(/<!--[\s\S]*?-->/g, "").replace(/[#*>`\-_]/g, "").replace(/\s+/g, " ").trim().slice(0, 70) || "…"}</span>
                    <span className="ji-mood">{MOOD_META[e.mood].emoji}</span>
                  </button>
                ))}
              </div>
            ))}
          </aside>

          {current && (
            <section className="card journal-editor">
              <header className="je-head">
                <div>
                  <span className="je-kanji">{weekdayJp(current.date)}</span>
                  <h2>{formatLong(current.date)}</h2>
                </div>
                <div className="mood-picker" role="radiogroup" aria-label="Humor">
                  {MOODS.map((m) => (
                    <button
                      key={m}
                      role="radio"
                      aria-checked={current.mood === m}
                      className={current.mood === m ? "active" : ""}
                      title={MOOD_META[m].label}
                      onClick={() => void setMood(m)}
                    >
                      {MOOD_META[m].emoji}
                    </button>
                  ))}
                </div>
                <span className={`save-state ${saving}`}>{saving === "saving" ? "salvando…" : saving === "saved" ? "salvo ✓" : ""}</span>
                <button className="icon-btn" title="Apagar" onClick={() => void remove()}>
                  <Trash2 size={16} />
                </button>
              </header>
              <MarkdownEditor value={draft} onChange={onChange} rows={20} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}
