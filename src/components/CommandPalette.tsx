import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import {
  BookOpen, CheckSquare, FolderGit2, FolderKanban, FolderPlus, Home, ListPlus, Palette, Pause, Play, Settings, Sparkles, Timer, Trophy, Wind,
} from "lucide-react";
import { useStore, type ThemeId } from "../store";
import { STATUS_META } from "../lib/constants";
import { THEMES } from "../lib/themes";

interface Item {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  keywords?: string;
  run: () => void;
}

const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function CommandPalette() {
  const open = useStore((s) => s.paletteOpen);
  const set = useStore((s) => s.set);
  const projects = useStore((s) => s.projects);
  const tasks = useStore((s) => s.tasks);
  const prefs = useStore((s) => s.prefs);
  const setPrefs = useStore((s) => s.setPrefs);
  const pomo = useStore((s) => s.pomodoro);
  const pomoStart = useStore((s) => s.pomoStart);
  const pomoPause = useStore((s) => s.pomoPause);
  const pomoFinish = useStore((s) => s.pomoFinish);
  const focusInProgress = pomo.mode === "focus" && (pomo.running || pomo.remaining < pomo.duration);
  const [, navigate] = useLocation();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  const close = () => set({ paletteOpen: false });

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      requestAnimationFrame(() => input.current?.focus());
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const go = (path: string) => () => navigate(path);
    const base: Item[] = [
      { id: "new-task", group: "Ações", label: "Nova tarefa", hint: "N", icon: <ListPlus size={16} />, run: () => set({ taskForm: { open: true } }) },
      { id: "new-project", group: "Ações", label: "Novo projeto", hint: "P", icon: <FolderPlus size={16} />, run: () => set({ projectForm: { open: true } }) },
      {
        id: "github",
        group: "Ações",
        label: "Importar projetos do GitHub",
        icon: <FolderGit2 size={16} />,
        keywords: "github repositorio repo importar",
        run: () => set({ githubOpen: true }),
      },
      {
        id: "pomo",
        group: "Ações",
        label: pomo.running ? "Pausar foco" : "Iniciar foco (pomodoro)",
        icon: pomo.running ? <Pause size={16} /> : <Play size={16} />,
        keywords: "pomodoro timer foco",
        run: pomo.running ? pomoPause : pomoStart,
      },
      ...(focusInProgress
        ? [
            {
              id: "pomo-finish",
              group: "Ações",
              label: "Finalizar foco e salvar o tempo",
              icon: <Timer size={16} />,
              keywords: "pomodoro parar encerrar terminar",
              run: pomoFinish,
            },
          ]
        : []),
      {
        id: "petals",
        group: "Ações",
        label: prefs.petals ? "Desligar pétalas de sakura" : "Ligar pétalas de sakura",
        icon: <Wind size={16} />,
        run: () => setPrefs({ petals: !prefs.petals }),
      },
      { id: "nav-home", group: "Ir para", label: "Dōjō · Início", hint: "G D", icon: <Home size={16} />, keywords: "dashboard inicio", run: go("/") },
      { id: "nav-projects", group: "Ir para", label: "Projetos", hint: "G P", icon: <FolderKanban size={16} />, keywords: "kanban", run: go("/projetos") },
      { id: "nav-tasks", group: "Ir para", label: "Tarefas", hint: "G T", icon: <CheckSquare size={16} />, run: go("/tarefas") },
      { id: "nav-journal", group: "Ir para", label: "Diário", hint: "G J", icon: <BookOpen size={16} />, keywords: "nikki", run: go("/diario") },
      { id: "nav-focus", group: "Ir para", label: "Foco", hint: "G F", icon: <Timer size={16} />, keywords: "pomodoro", run: go("/foco") },
      { id: "nav-ach", group: "Ir para", label: "Conquistas", hint: "G C", icon: <Trophy size={16} />, keywords: "xp nivel", run: go("/conquistas") },
      { id: "nav-settings", group: "Ir para", label: "Configurações", icon: <Settings size={16} />, keywords: "config backup tema", run: go("/config") },
      ...(Object.keys(THEMES) as ThemeId[]).map((t) => ({
        id: `theme-${t}`,
        group: "Tema",
        label: `Tema: ${THEMES[t].name}`,
        hint: THEMES[t].kanji,
        icon: <Palette size={16} />,
        keywords: "tema theme cor",
        run: () => setPrefs({ theme: t }),
      })),
    ];
    const projectItems: Item[] = projects.map((p) => ({
      id: `p-${p.id}`,
      group: "Projetos",
      label: p.name,
      hint: STATUS_META[p.status].label,
      icon: <span className="palette-emoji">{p.icon}</span>,
      keywords: `${p.client} ${p.stack.join(" ")} ${p.description}`,
      run: go(`/projetos/${p.id}`),
    }));
    const taskItems: Item[] = tasks
      .filter((t) => t.status !== "done")
      .map((t) => ({
        id: `t-${t.id}`,
        group: "Tarefas",
        label: t.title,
        hint: projects.find((p) => p.id === t.project_id)?.name,
        icon: <Sparkles size={16} />,
        run: () => set({ taskForm: { open: true, task: t } }),
      }));
    return [...base, ...projectItems, ...taskItems];
  }, [projects, tasks, prefs.petals, pomo.running, focusInProgress, navigate, set, setPrefs, pomoStart, pomoPause, pomoFinish]);

  const filtered = useMemo(() => {
    const nq = norm(q.trim());
    if (!nq) return items.filter((i) => i.group !== "Tarefas").slice(0, 40);
    const words = nq.split(/\s+/);
    return items
      .map((i) => {
        const hay = norm(`${i.label} ${i.keywords ?? ""} ${i.hint ?? ""}`);
        if (!words.every((w) => hay.includes(w))) return null;
        const score = norm(i.label).startsWith(nq) ? 0 : norm(i.label).includes(nq) ? 1 : 2;
        return { i, score };
      })
      .filter((x): x is { i: Item; score: number } => !!x)
      .sort((a, b) => a.score - b.score)
      .slice(0, 50)
      .map((x) => x.i);
  }, [items, q]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    list.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const runItem = (item?: Item) => {
    if (!item) return;
    close();
    item.run();
  };

  let lastGroup = "";
  return createPortal(
    <div className="palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="palette" role="dialog" aria-label="Paleta de comandos">
        <div className="palette-search">
          <span className="palette-kanji">探</span>
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar projetos, tarefas, ações…"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(filtered.length - 1, a + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                runItem(filtered[active]);
              } else if (e.key === "Escape") {
                close();
              }
            }}
          />
          <kbd>esc</kbd>
        </div>
        <div className="palette-list" ref={list}>
          {filtered.length === 0 && <div className="palette-empty">Nada encontrado · 何もない</div>}
          {filtered.map((item, idx) => {
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <div key={item.id}>
                {header && <div className="palette-group">{header}</div>}
                <button
                  data-idx={idx}
                  className={`palette-item ${idx === active ? "active" : ""}`}
                  onMouseMove={() => setActive(idx)}
                  onClick={() => runItem(item)}
                >
                  <span className="palette-icon">{item.icon}</span>
                  <span className="palette-label">{item.label}</span>
                  {item.hint && <span className="palette-hint">{item.hint}</span>}
                </button>
              </div>
            );
          })}
        </div>
        <div className="palette-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> navegar</span>
          <span><kbd>↵</kbd> abrir</span>
          <span><kbd>?</kbd> atalhos</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
