import { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { api, ApiError } from "../api";
import { useStore } from "../store";
import { greeting } from "../lib/dates";
import { kotowazaOfDay } from "../lib/kotowaza";

export function Login() {
  const load = useStore((s) => s.load);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const g = greeting();
  const k = kotowazaOfDay();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError("");
    try {
      await api("/auth/login", { method: "POST", body: { password } });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao entrar");
      setPassword("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="login-sun" aria-hidden="true" />
      <form className="login-card" onSubmit={submit}>
        <h1>
          <span className="jp">{g.jp}</span>
          <span>afazeres</span>
        </h1>
        <p className="muted">Dōjō pessoal de ramosxzz</p>
        <div className={`login-field ${error ? "shake" : ""}`}>
          <input
            type="password"
            autoFocus
            autoComplete="current-password"
            placeholder="Senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-label="Senha"
          />
          <button type="submit" disabled={!password || busy} aria-label="Entrar">
            {busy ? <Loader2 className="spin" size={18} /> : <ArrowRight size={18} />}
          </button>
        </div>
        {error && <p className="login-error">{error}</p>}
        <p className="login-quote">
          <span>{k.jp}</span>
          <small>{k.pt}</small>
        </p>
      </form>
    </div>
  );
}

export function SetupNeeded({ message }: { message: string }) {
  return (
    <div className="login">
      <div className="login-card">
        <span className="login-kanji">設</span>
        <h1>
          <span>Quase lá!</span>
        </h1>
        <p>{message}</p>
        <pre className="setup-code">npx wrangler secret put APP_PASSWORD</pre>
        <p className="muted small">Ou no painel: Workers &amp; Pages → afazeres → Settings → Variables and Secrets.</p>
      </div>
    </div>
  );
}
