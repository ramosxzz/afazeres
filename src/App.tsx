import { useEffect, useRef, useState } from "react";
import { Route, Switch, useLocation } from "wouter";
import { ApiError, setUnauthorizedHandler } from "./api";
import { useStore } from "./store";
import { Layout, formatClock } from "./components/Layout";
import { SakuraPetals } from "./components/SakuraPetals";
import { Toasts } from "./components/Toasts";
import { CommandPalette } from "./components/CommandPalette";
import { ProjectFormModal } from "./components/ProjectForm";
import { TaskFormModal } from "./components/TaskForm";
import { Celebration } from "./components/Celebration";
import { ShortcutsHelp } from "./components/ShortcutsHelp";
import { GithubImportModal } from "./components/GithubImport";
import { Dashboard } from "./pages/Dashboard";
import { Projects } from "./pages/Projects";
import { ProjectDetail } from "./pages/ProjectDetail";
import { Tasks } from "./pages/Tasks";
import { Focus } from "./pages/Focus";
import { Journal } from "./pages/Journal";
import { Achievements } from "./pages/Achievements";
import { Settings } from "./pages/Settings";
import { Login, SetupNeeded } from "./pages/Login";
import { Empty } from "./components/ui";

function useGlobalShortcuts() {
  const [loc, navigate] = useLocation();
  const pendingG = useRef(0);
  const locRef = useRef(loc);
  locRef.current = loc;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        s.set({ paletteOpen: !s.paletteOpen });
        return;
      }
      const el = e.target as HTMLElement;
      const typing = el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
      const overlayOpen = s.paletteOpen || s.projectForm.open || s.taskForm.open || s.helpOpen || s.githubOpen;
      if (typing || overlayOpen || e.ctrlKey || e.metaKey || e.altKey) return;

      const key = e.key.toLowerCase();
      if (Date.now() - pendingG.current < 1200) {
        pendingG.current = 0;
        const routes: Record<string, string> = { d: "/", p: "/projetos", t: "/tarefas", f: "/foco", j: "/diario", c: "/conquistas", s: "/config" };
        if (routes[key]) {
          e.preventDefault();
          navigate(routes[key]);
        }
        return;
      }
      if (key === "g") pendingG.current = Date.now();
      else if (key === "/") {
        e.preventDefault();
        s.set({ paletteOpen: true });
      } else if (key === "?") s.set({ helpOpen: true });
      else if (key === "n") {
        e.preventDefault();
        if (locRef.current.startsWith("/tarefas")) window.dispatchEvent(new Event("afz:quickadd"));
        else s.set({ taskForm: { open: true, projectId: locRef.current.match(/^\/projetos\/([^/]+)/)?.[1] ?? null } });
      } else if (key === "p") {
        e.preventDefault();
        s.set({ projectForm: { open: true } });
      } else if (key === "f") {
        if (s.pomodoro.running) s.pomoPause();
        else s.pomoStart();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);
}

/** Relógio global do pomodoro + título da aba. */
function usePomodoroClock() {
  const running = useStore((s) => s.pomodoro.running);
  useEffect(() => {
    if (!running) {
      document.title = "afazeres · やること";
      return;
    }
    const id = setInterval(() => {
      const s = useStore.getState();
      s.pomoTick();
      const p = s.pomodoro;
      if (p.running && p.endsAt) document.title = `${formatClock(p.endsAt - Date.now())} · ${p.mode === "focus" ? "集中" : "休憩"}`;
    }, 500);
    return () => clearInterval(id);
  }, [running]);
}

export function App() {
  const auth = useStore((s) => s.auth);
  const loaded = useStore((s) => s.loaded);
  const prefs = useStore((s) => s.prefs);
  const [setup, setSetup] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = prefs.theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", getComputedStyle(document.documentElement).getPropertyValue("--bg").trim());
  }, [prefs.theme]);

  useEffect(() => {
    setUnauthorizedHandler(() => useStore.getState().setAuth("out"));
    useStore
      .getState()
      .load()
      .catch((e) => {
        if (e instanceof ApiError && e.code === "no_password") setSetup(e.message);
        else if (e instanceof ApiError && e.status === 401) useStore.getState().setAuth("out");
        else setLoadError(e instanceof Error ? e.message : "Erro ao carregar");
      });
  }, []);

  useGlobalShortcuts();
  usePomodoroClock();

  let body: React.ReactNode;
  if (setup) body = <SetupNeeded message={setup} />;
  else if (loadError)
    body = (
      <div className="splash">
        <Empty kanji="壊" title="Não consegui falar com o servidor">
          <p className="muted">{loadError}</p>
          <button className="btn btn-primary" onClick={() => location.reload()}>
            Tentar de novo
          </button>
        </Empty>
      </div>
    );
  else if (auth === "out") body = <Login />;
  else if (!loaded)
    body = (
      <div className="splash">
        <div className="splash-kanji">道</div>
        <div className="splash-bar" />
      </div>
    );
  else
    body = (
      <>
        <Layout>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/projetos" component={Projects} />
            <Route path="/projetos/:id" component={ProjectDetail} />
            <Route path="/tarefas" component={Tasks} />
            <Route path="/foco" component={Focus} />
            <Route path="/diario" component={Journal} />
            <Route path="/conquistas" component={Achievements} />
            <Route path="/config" component={Settings} />
            <Route>
              <Empty kanji="迷子" title="Maigo — perdido?">
                Essa página não existe.
              </Empty>
            </Route>
          </Switch>
        </Layout>
        <ProjectFormModal />
        <TaskFormModal />
        <CommandPalette />
        <ShortcutsHelp />
        <GithubImportModal />
        <Celebration />
      </>
    );

  return (
    <>
      <SakuraPetals enabled={prefs.petals} />
      {body}
      <Toasts />
    </>
  );
}

