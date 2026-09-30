import { type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  BookOpen, CheckSquare, FolderKanban, Home, Pause, Play, Plus, Search, Settings, Timer, Trophy,
} from "lucide-react";
import { useStore } from "../store";
import { levelInfo } from "../lib/xp";
import { todayKey, weekdayJp } from "../lib/dates";
import { useTick } from "../lib/hooks";
import { Kitsune } from "./Kitsune";

const NAV = [
  { href: "/", label: "Dōjō", sub: "Início", kanji: "道場", icon: Home },
  { href: "/projetos", label: "Projetos", sub: "Kanban", kanji: "巻物", icon: FolderKanban },
  { href: "/tarefas", label: "Tarefas", sub: "To-do", kanji: "任務", icon: CheckSquare },
  { href: "/foco", label: "Foco", sub: "Pomodoro", kanji: "集中", icon: Timer },
  { href: "/diario", label: "Diário", sub: "Nikki", kanji: "日記", icon: BookOpen },
  { href: "/conquistas", label: "Conquistas", sub: "XP", kanji: "実績", icon: Trophy },
];

function isActive(loc: string, href: string) {
  return href === "/" ? loc === "/" : loc.startsWith(href);
}

export function formatClock(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function MiniPomodoro() {
  const p = useStore((s) => s.pomodoro);
  const start = useStore((s) => s.pomoStart);
  const pause = useStore((s) => s.pomoPause);
  useTick(p.running);
  const remaining = p.running && p.endsAt ? p.endsAt - Date.now() : p.remaining;
  const pct = 1 - remaining / p.duration;
  if (!p.running && p.remaining === p.duration) return null;
  return (
    <div className={`mini-pomo mode-${p.mode}`}>
      <Link href="/foco" className="mini-pomo-time">
        <span className="mini-pomo-kanji">{p.mode === "focus" ? "集" : "休"}</span>
        {formatClock(remaining)}
      </Link>
      <button className="icon-btn sm" onClick={p.running ? pause : start} aria-label={p.running ? "Pausar" : "Continuar"}>
        {p.running ? <Pause size={14} /> : <Play size={14} />}
      </button>
      <div className="mini-pomo-bar" style={{ width: `${pct * 100}%` }} />
    </div>
  );
}

function LevelCard() {
  const stats = useStore((s) => s.stats);
  const name = useStore((s) => s.prefs.display_name);
  const info = levelInfo(stats?.xp ?? 0);
  return (
    <Link href="/conquistas" className="level-card">
      <div className="level-avatar">
        <Kitsune level={info.level} size={40} animate={false} />
        <b>{info.level}</b>
      </div>
      <div className="level-info">
        <strong>{name}</strong>
        <span>
          {info.rank.kanji} · {info.rank.title}
        </span>
        <div className="xp-bar" title={`${info.into} / ${info.needed} XP`}>
          <i style={{ width: `${info.pct * 100}%` }} />
        </div>
      </div>
      {stats && stats.streak > 0 && (
        <div className="streak" title={`${stats.streak} dias seguidos`}>
          🔥<b>{stats.streak}</b>
        </div>
      )}
    </Link>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [loc] = useLocation();
  const set = useStore((s) => s.set);
  const openTasks = useStore((s) => {
    const today = todayKey();
    return s.tasks.filter((t) => t.status !== "done" && t.due_date && t.due_date <= today).length;
  });
  const today = todayKey();

  return (
    <div className="app">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-mark">
            <svg viewBox="0 0 40 40" aria-hidden="true">
              <path d="M6 12h28M9 12v22M31 12v22M4 7c8 3 24 3 32 0M12 19h16" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
            </svg>
          </span>
          <span className="brand-text">
            <b>afazeres</b>
            <small>やること · ramosxzz</small>
          </span>
        </Link>

        <LevelCard />

        <nav className="nav">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={`nav-item ${isActive(loc, n.href) ? "active" : ""}`}>
              <n.icon size={18} />
              <span className="nav-label">{n.label}</span>
              {n.href === "/tarefas" && openTasks > 0 && <span className="nav-count">{openTasks}</span>}
              <span className="nav-kanji">{n.kanji}</span>
            </Link>
          ))}
        </nav>

        <MiniPomodoro />

        <div className="sidebar-foot">
          <Link href="/config" className={`nav-item ${loc.startsWith("/config") ? "active" : ""}`}>
            <Settings size={18} />
            <span className="nav-label">Configurações</span>
            <span className="nav-kanji">設定</span>
          </Link>
          <div className="sidebar-date">
            <span className="date-jp">{weekdayJp(today)}曜日</span>
            <span>{today.split("-").reverse().join("/")}</span>
          </div>
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <button className="search-trigger" onClick={() => set({ paletteOpen: true })}>
            <Search size={16} />
            <span>Buscar ou executar comando…</span>
            <kbd>Ctrl K</kbd>
          </button>
          <div className="topbar-actions">
            <Link href="/conquistas" className="icon-btn show-sm" aria-label="Conquistas">
              <Trophy size={18} />
            </Link>
            <Link href="/config" className="icon-btn show-sm" aria-label="Configurações">
              <Settings size={18} />
            </Link>
            <button className="btn btn-ghost" onClick={() => set({ projectForm: { open: true } })}>
              <FolderKanban size={16} /> <span className="hide-sm">Projeto</span>
            </button>
            <button className="btn btn-primary" onClick={() => set({ taskForm: { open: true } })}>
              <Plus size={16} /> <span className="hide-sm">Tarefa</span>
            </button>
          </div>
        </div>
        <main className="content">{children}</main>
      </div>

      <nav className="mobile-nav">
        {NAV.slice(0, 5).map((n) => (
          <Link key={n.href} href={n.href} className={`mobile-nav-item ${isActive(loc, n.href) ? "active" : ""}`}>
            <n.icon size={20} />
            <span>{n.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
