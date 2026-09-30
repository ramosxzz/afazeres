import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { useStore, type Pomodoro } from "./store";
import "./styles/theme.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/components.css";
import "./styles/pages.css";

// Aplica o tema salvo antes do primeiro paint.
document.documentElement.dataset.theme = useStore.getState().prefs.theme;

// Pomodoro sobrevive a reload: salva/restaura do localStorage.
try {
  const raw = localStorage.getItem("afz_pomodoro");
  if (raw) {
    const saved = JSON.parse(raw) as Pomodoro;
    useStore.setState({ pomodoro: { ...useStore.getState().pomodoro, ...saved } });
  }
} catch {
  /* noop */
}
useStore.subscribe((s, prev) => {
  if (s.pomodoro !== prev.pomodoro) {
    try {
      localStorage.setItem("afz_pomodoro", JSON.stringify(s.pomodoro));
    } catch {
      /* noop */
    }
  }
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
