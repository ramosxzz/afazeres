import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Flame, Pin } from "lucide-react";
import type { Activity, Project } from "@shared/types";
import { api } from "../api";
import { useStore } from "../store";
import { STATUS_META, TYPE_META } from "../lib/constants";
import { formatMinutes, greeting, timeAgo, todayKey } from "../lib/dates";
import { kotowazaOfDay } from "../lib/kotowaza";
import { levelInfo } from "../lib/xp";
import { QuickAdd } from "../components/QuickAdd";
import { TaskRow } from "../components/TaskRow";
import { Heatmap, HBars } from "../components/charts";
import { DueBadge, Empty, ProgressRing } from "../components/ui";

const ACTIVITY_KANJI: Record<string, string> = {
  task_done: "済",
  project_created: "新",
  project_done: "完",
  project_status: "移",
  project_deleted: "消",
  focus: "禅",
  journal: "記",
  import: "入",
};

export function Dashboard() {
  const projects = useStore((s) => s.projects);
  const tasks = useStore((s) => s.tasks);
  const stats = useStore((s) => s.stats);
  const name = useStore((s) => s.prefs.display_name);
  const [activity, setActivity] = useState<Activity[]>([]);
  const g = greeting();
  const k = kotowazaOfDay();
  const today = todayKey();

  useEffect(() => {
    api<Activity[]>("/activity?limit=14").then(setActivity).catch(() => {});
  }, [stats]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of projects) c[p.status] = (c[p.status] ?? 0) + 1;
    return c;
  }, [projects]);

  const todayTasks = useMemo(
    () =>
      tasks
        .filter((t) => t.status !== "done" && ((t.due_date && t.due_date <= today) || t.status === "doing"))
        .sort((a, b) => (a.due_date ?? "9") .localeCompare(b.due_date ?? "9")),
    [tasks, today],
  );
  const doneToday = tasks.filter((t) => t.status === "done" && t.completed_at && new Date(t.completed_at).toDateString() === new Date().toDateString()).length;
  const overdue = todayTasks.filter((t) => t.due_date && t.due_date < today).length;

  const focusProjects = useMemo(
    () =>
      projects
        .filter((p) => p.pinned || p.status === "active")
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || (a.due_date ?? "9").localeCompare(b.due_date ?? "9"))
        .slice(0, 6),
    [projects],
  );

  const info = levelInfo(stats?.xp ?? 0);
  const focusToday = stats?.focus_by_day.find((d) => d.day === today)?.minutes ?? 0;

  return (
    <div className="page dashboard">
      <section className="hero">
        <div className="hero-text">
          <span className="hero-romaji">{g.romaji}</span>
          <h1 className="hero-title">
            <span className="jp">{g.jp}</span>
            <span className="hero-name">{name}</span>
          </h1>
          <p className="hero-sub">
            {g.pt}! {todayTasks.length ? (
              <>
                Você tem <b>{todayTasks.length}</b> {todayTasks.length === 1 ? "tarefa" : "tarefas"} no radar hoje
                {overdue > 0 && (
                  <>
                    {" "}
                    (<span className="text-danger">{overdue} atrasada{overdue > 1 ? "s" : ""}</span>)
                  </>
                )}
                .
              </>
            ) : (
              "Nenhuma pendência pra hoje — mente limpa, código limpo."
            )}
          </p>
          <div className="hero-pills">
            <span className="pill">
              <b>Nv. {info.level}</b> {info.rank.kanji} {info.rank.title}
            </span>
            <span className="pill">
              <Flame size={14} /> {stats?.streak ?? 0} dia{stats?.streak === 1 ? "" : "s"} seguidos
            </span>
            <span className="pill">禅 {formatMinutes(focusToday)} de foco hoje</span>
            <span className="pill">済 {doneToday} feitas hoje</span>
          </div>
        </div>
        <figure className="kotowaza" title={k.romaji}>
          <blockquote className="kotowaza-jp">{k.jp}</blockquote>
          <figcaption>
            <span className="kotowaza-romaji">{k.romaji}</span>
            <span>{k.pt}</span>
          </figcaption>
        </figure>
      </section>

      <section className="stat-grid">
        {(["active", "support", "done", "idea"] as const).map((s) => (
          <Link key={s} href={`/projetos?status=${s}`} className="stat-tile" style={{ "--c": STATUS_META[s].color } as React.CSSProperties}>
            <span className="stat-kanji">{STATUS_META[s].kanji}</span>
            <span className="stat-value">{counts[s] ?? 0}</span>
            <span className="stat-label">{STATUS_META[s].label}</span>
          </Link>
        ))}
      </section>

      <div className="grid-2">
        <section className="card">
          <header className="card-head">
            <h2>
              <span className="card-kanji">今日</span> Hoje
            </h2>
            <Link href="/tarefas" className="link-more">
              todas <ArrowRight size={14} />
            </Link>
          </header>
          <QuickAdd defaultDue={today} placeholder="Algo pra hoje…  #projeto  !alta  ~bug" />
          <div className="task-list">
            {todayTasks.length === 0 ? (
              <Empty kanji="空" title="Nada pendente pra hoje">
                Aproveita pra atacar um projeto parado ou estudar algo novo.
              </Empty>
            ) : (
              todayTasks.slice(0, 10).map((t) => <TaskRow key={t.id} task={t} />)
            )}
          </div>
        </section>

        <section className="card">
          <header className="card-head">
            <h2>
              <span className="card-kanji">焦点</span> Projetos em foco
            </h2>
            <Link href="/projetos" className="link-more">
              kanban <ArrowRight size={14} />
            </Link>
          </header>
          {focusProjects.length === 0 ? (
            <Empty kanji="巻" title="Nenhum projeto em andamento">
              <button className="btn btn-primary" onClick={() => useStore.getState().set({ projectForm: { open: true } })}>
                Criar primeiro projeto
              </button>
            </Empty>
          ) : (
            <div className="focus-projects">
              {focusProjects.map((p) => (
                <FocusProject key={p.id} project={p} />
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="card">
        <header className="card-head">
          <h2>
            <span className="card-kanji">足跡</span> Pegadas do último ano
          </h2>
          {stats && (
            <span className="muted small">
              recorde: {stats.best_streak} dia{stats.best_streak === 1 ? "" : "s"} seguidos
            </span>
          )}
        </header>
        <Heatmap data={stats?.heatmap ?? []} />
      </section>

      <div className="grid-2">
        <section className="card">
          <header className="card-head">
            <h2>
              <span className="card-kanji">分布</span> Projetos por status
            </h2>
          </header>
          <HBars
            rows={(["idea", "active", "paused", "support", "done", "archived"] as const).map((s) => ({
              key: s,
              label: (
                <>
                  <span className="hbar-kanji">{STATUS_META[s].kanji}</span> {STATUS_META[s].label}
                </>
              ),
              value: counts[s] ?? 0,
              color: STATUS_META[s].color,
            }))}
          />
          <div className="type-cloud">
            {Object.entries(
              projects.reduce<Record<string, number>>((acc, p) => ((acc[p.type] = (acc[p.type] ?? 0) + 1), acc), {}),
            ).map(([t, n]) => (
              <span key={t} className="chip" style={{ "--c": TYPE_META[t as Project["type"]].color } as React.CSSProperties}>
                {TYPE_META[t as Project["type"]].kanji} {TYPE_META[t as Project["type"]].label} · {n}
              </span>
            ))}
          </div>
        </section>

        <section className="card">
          <header className="card-head">
            <h2>
              <span className="card-kanji">記録</span> Atividade recente
            </h2>
          </header>
          {activity.length === 0 ? (
            <Empty kanji="無" title="Sem atividade ainda" />
          ) : (
            <ol className="timeline">
              {activity.map((a) => (
                <li key={a.id}>
                  <span className="timeline-kanji">{ACTIVITY_KANJI[a.type] ?? "・"}</span>
                  <span className="timeline-text">{a.message}</span>
                  <time className="timeline-time">{timeAgo(a.created_at)}</time>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

function FocusProject({ project: p }: { project: Project }) {
  const tasks = useStore((s) => s.tasks);
  const mine = tasks.filter((t) => t.project_id === p.id);
  const open = mine.filter((t) => t.status !== "done");
  const next = open.find((t) => t.status === "doing") ?? open[0];
  const pct = mine.length ? Math.round(((mine.length - open.length) / mine.length) * 100) : p.progress;
  return (
    <Link href={`/projetos/${p.id}`} className="focus-project" style={{ "--c": p.color } as React.CSSProperties}>
      <span className="fp-icon">{p.icon}</span>
      <div className="fp-body">
        <strong>
          {p.pinned && <Pin size={12} className="pin" />} {p.name}
        </strong>
        <span className="fp-next">{next ? `→ ${next.title}` : "Sem tarefas abertas"}</span>
        <span className="fp-meta">
          {open.length} aberta{open.length === 1 ? "" : "s"}
          {p.due_date && (
            <>
              {" "}
              · prazo <DueBadge date={p.due_date} />
            </>
          )}
        </span>
      </div>
      <ProgressRing value={pct} color={p.color} />
    </Link>
  );
}
