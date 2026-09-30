import { useEffect, useMemo, useState } from "react";
import { Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import type { FocusSession } from "@shared/types";
import { api } from "../api";
import { useStore, type PomodoroMode } from "../store";
import { formatMinutes, timeAgo, todayKey, addDays, toKey } from "../lib/dates";
import { useTick } from "../lib/hooks";
import { formatClock } from "../components/Layout";
import { FocusColumns, HBars } from "../components/charts";
import { PageHeader } from "../components/ui";

const MODES: Record<PomodoroMode, { kanji: string; label: string }> = {
  focus: { kanji: "集中", label: "Foco" },
  short: { kanji: "小休", label: "Pausa curta" },
  long: { kanji: "長休", label: "Pausa longa" },
};

export function Focus() {
  const p = useStore((s) => s.pomodoro);
  const prefs = useStore((s) => s.prefs);
  const setPrefs = useStore((s) => s.setPrefs);
  const projects = useStore((s) => s.projects);
  const tasks = useStore((s) => s.tasks);
  const stats = useStore((s) => s.stats);
  const { pomoStart, pomoPause, pomoReset, pomoSet } = useStore.getState();
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  useTick(p.running, 250);

  useEffect(() => {
    api<FocusSession[]>("/focus?days=30").then(setSessions).catch(() => {});
  }, [stats]);

  const remaining = p.running && p.endsAt ? Math.max(0, p.endsAt - Date.now()) : p.remaining;
  const pct = 1 - remaining / p.duration;
  const size = 320;
  const r = 140;
  const c = 2 * Math.PI * r;

  const start = () => {
    if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission();
    pomoStart();
  };

  const today = todayKey();
  const weekStart = addDays(today, -6);
  const todayMin = stats?.focus_by_day.find((d) => d.day === today)?.minutes ?? 0;
  const weekMin = (stats?.focus_by_day ?? []).filter((d) => d.day >= weekStart).reduce((a, d) => a + d.minutes, 0);

  const projectTasks = tasks.filter((t) => t.status !== "done" && (!p.projectId || t.project_id === p.projectId));
  const perProject = useMemo(
    () =>
      (stats?.focus_by_project ?? []).slice(0, 6).map((f) => {
        const pr = projects.find((x) => x.id === f.project_id);
        return {
          key: f.project_id ?? "none",
          label: pr ? `${pr.icon} ${pr.name}` : "Livre",
          value: f.minutes,
          color: pr?.color ?? "var(--muted)",
        };
      }),
    [stats, projects],
  );

  return (
    <div className="page focus-page">
      <PageHeader kanji="集中" romaji="shūchū" title="Foco" subtitle="Pomodoro com sino de vento. Cada minuto focado vale 1 XP." />

      <div className="focus-layout">
        <section className={`card focus-timer mode-${p.mode} ${p.running ? "running" : ""}`}>
          <div className="mode-tabs">
            {(Object.keys(MODES) as PomodoroMode[]).map((m) => (
              <button key={m} className={p.mode === m ? "active" : ""} disabled={p.running} onClick={() => pomoReset(m)}>
                <span>{MODES[m].kanji}</span> {MODES[m].label}
              </button>
            ))}
          </div>

          <div className="timer-wrap">
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="timer-svg" aria-hidden="true">
              <defs>
                <linearGradient id="timer-grad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" />
                  <stop offset="100%" stopColor="var(--accent-2)" />
                </linearGradient>
                <filter id="brush">
                  <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" />
                  <feDisplacementMap in="SourceGraphic" scale="6" />
                </filter>
              </defs>
              <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={14} />
              <circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke="url(#timer-grad)"
                strokeWidth={16}
                strokeLinecap="round"
                strokeDasharray={c}
                strokeDashoffset={c * (1 - pct)}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                filter="url(#brush)"
                className="timer-progress"
              />
            </svg>
            <div className="timer-center">
              <span className="timer-kanji">{p.mode === "focus" ? "集" : "休"}</span>
              <span className="timer-clock">{formatClock(remaining)}</span>
              <span className="timer-label">{p.label || MODES[p.mode].label}</span>
            </div>
          </div>

          <div className="cycles" title="Ciclos de foco (a cada 4, pausa longa)">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={i < p.cycles % 4 || (p.cycles > 0 && p.cycles % 4 === 0 && p.mode === "long") ? "on" : ""}>
                🌸
              </span>
            ))}
          </div>

          <div className="timer-controls">
            <button className="icon-btn lg" onClick={() => pomoReset()} title="Reiniciar">
              <RotateCcw size={20} />
            </button>
            <button className="play-btn" onClick={p.running ? pomoPause : start} aria-label={p.running ? "Pausar" : "Iniciar"}>
              {p.running ? <Pause size={30} /> : <Play size={30} />}
            </button>
            <button
              className="icon-btn lg"
              title="Pular"
              onClick={() => {
                const next = p.mode === "focus" ? "short" : "focus";
                pomoReset(next);
              }}
            >
              <SkipForward size={20} />
            </button>
          </div>

          <div className="focus-target">
            <select
              value={p.projectId ?? ""}
              disabled={p.running}
              onChange={(e) => {
                const pr = projects.find((x) => x.id === e.target.value);
                pomoSet({ projectId: pr?.id ?? null, taskId: null, label: pr?.name ?? "" });
              }}
            >
              <option value="">Sem projeto</option>
              {projects
                .filter((x) => x.status === "active" || x.status === "support" || x.id === p.projectId)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.icon} {x.name}
                  </option>
                ))}
            </select>
            <select
              value={p.taskId ?? ""}
              disabled={p.running}
              onChange={(e) => {
                const t = tasks.find((x) => x.id === e.target.value);
                pomoSet({ taskId: t?.id ?? null, label: t?.title ?? projects.find((x) => x.id === p.projectId)?.name ?? "", projectId: t?.project_id ?? p.projectId });
              }}
            >
              <option value="">Qualquer tarefa</option>
              {projectTasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </div>
        </section>

        <div className="focus-side">
          <div className="stat-grid compact">
            <div className="stat-tile" style={{ "--c": "var(--accent)" } as React.CSSProperties}>
              <span className="stat-kanji">今日</span>
              <span className="stat-value">{formatMinutes(todayMin)}</span>
              <span className="stat-label">hoje</span>
            </div>
            <div className="stat-tile" style={{ "--c": "var(--accent-2)" } as React.CSSProperties}>
              <span className="stat-kanji">週</span>
              <span className="stat-value">{formatMinutes(weekMin)}</span>
              <span className="stat-label">últimos 7 dias</span>
            </div>
            <div className="stat-tile" style={{ "--c": "var(--accent-3)" } as React.CSSProperties}>
              <span className="stat-kanji">累計</span>
              <span className="stat-value">{Math.round((stats?.totals.focus_minutes ?? 0) / 60)}h</span>
              <span className="stat-label">{stats?.totals.focus_sessions ?? 0} sessões</span>
            </div>
          </div>

          <section className="card">
            <header className="card-head">
              <h2>
                <span className="card-kanji">二週</span> Minutos de foco · 14 dias
              </h2>
            </header>
            <FocusColumns data={stats?.focus_by_day ?? []} />
          </section>

          {perProject.length > 0 && (
            <section className="card">
              <header className="card-head">
                <h2>
                  <span className="card-kanji">配分</span> Onde foi o tempo
                </h2>
              </header>
              <HBars rows={perProject} format={formatMinutes} />
            </section>
          )}

          <section className="card">
            <header className="card-head">
              <h2>
                <span className="card-kanji">設定</span> Durações
              </h2>
            </header>
            <div className="durations">
              {(
                [
                  ["focus_minutes", "Foco", 5, 90],
                  ["short_break", "Pausa curta", 1, 30],
                  ["long_break", "Pausa longa", 5, 60],
                ] as const
              ).map(([key, label, min, max]) => (
                <label key={key}>
                  <span>{label}</span>
                  <input
                    type="number"
                    min={min}
                    max={max}
                    value={prefs[key]}
                    onChange={(e) => {
                      const v = Math.min(max, Math.max(min, Number(e.target.value) || min));
                      setPrefs({ [key]: v });
                    }}
                  />
                  <small>min</small>
                </label>
              ))}
            </div>
          </section>

          {sessions.length > 0 && (
            <section className="card">
              <header className="card-head">
                <h2>
                  <span className="card-kanji">履歴</span> Sessões recentes
                </h2>
              </header>
              <ol className="timeline">
                {sessions.slice(0, 8).map((s) => {
                  const pr = projects.find((x) => x.id === s.project_id);
                  return (
                    <li key={s.id}>
                      <span className="timeline-kanji">{pr?.icon ?? "禅"}</span>
                      <span className="timeline-text">
                        {s.minutes} min{s.label ? ` · ${s.label}` : ""}
                      </span>
                      <time className="timeline-time" title={toKey(new Date(s.ended_at))}>
                        {timeAgo(s.ended_at)}
                      </time>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
