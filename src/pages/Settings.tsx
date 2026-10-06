import { useRef, useState } from "react";
import { BookOpen, Download, FolderGit2, Loader2, LogOut, RefreshCw, Upload, Volume2 } from "lucide-react";
import type { BackupFile } from "@shared/types";
import { api } from "../api";
import { useStore, type Prefs, type ThemeId } from "../store";
import { ago } from "../lib/dates";
import { THEMES } from "../lib/themes";
import { playFurin } from "../lib/sound";
import { PageHeader } from "../components/ui";
import { SHORTCUTS } from "../components/ShortcutsHelp";

export function Settings() {
  const prefs = useStore((s) => s.prefs);
  const setPrefs = useStore((s) => s.setPrefs);
  const toast = useStore((s) => s.toast);
  const load = useStore((s) => s.load);
  const setAuth = useStore((s) => s.setAuth);
  const automation = useStore((s) => s.automation);
  const syncing = useStore((s) => s.syncing);
  const syncNow = useStore((s) => s.syncNow);
  const [journaling, setJournaling] = useState(false);

  const AUTO_OPTIONS: { key: keyof Prefs; title: string; desc: string }[] = [
    { key: "auto_commits", title: "Commits viram atividade", desc: "Entram no mapa de calor, na sequência de dias e valem +2 XP cada" },
    { key: "auto_issues", title: "Issues viram tarefas", desc: "Issue aberta vira tarefa no projeto; issue fechada conclui a tarefa. Tipo e prioridade pelas labels" },
    { key: "auto_status", title: "Status segue os pushes", desc: "Push num projeto pausado → Em andamento; 30 dias sem push e sem mexer → Pausado; repo arquivado → Arquivado" },
    { key: "auto_import", title: "Repositórios novos viram projetos", desc: "Todo repositório novo com push entra sozinho em Em andamento" },
    { key: "auto_journal", title: "Diário automático", desc: "Depois das 23h, escreve o resumo do dia: commits, tarefas, foco e o que vence amanhã" },
  ];

  const generateJournal = async () => {
    setJournaling(true);
    try {
      await api("/automation/journal", { method: "POST", body: {} });
      toast("Resumo de hoje escrito no diário", "success", { kanji: "記" });
      void useStore.getState().refreshStats();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao gerar o resumo", "error");
    } finally {
      setJournaling(false);
    }
  };
  const file = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(prefs.display_name);
  const [mascotName, setMascotName] = useState(prefs.mascot_name);

  const exportData = async () => {
    const data = await api<BackupFile>("/export");
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `afazeres-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("Backup exportado", "success", { kanji: "保" });
  };

  const importData = async (f: File) => {
    try {
      const data = JSON.parse(await f.text()) as BackupFile;
      if (!window.confirm(`Importar ${data.projects?.length ?? 0} projetos e ${data.tasks?.length ?? 0} tarefas? Isso SUBSTITUI todos os dados atuais.`)) return;
      await api("/import", { method: "POST", body: data });
      await load();
      toast("Backup importado", "success", { kanji: "入" });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Arquivo inválido", "error");
    }
  };

  const logout = async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    setAuth("out");
  };

  return (
    <div className="page settings-page">
      <PageHeader kanji="設定" romaji="settei" title="Configurações" />

      <section className="card">
        <h3 className="settings-title">
          <span className="card-kanji">名</span> Perfil
        </h3>
        <div className="settings-row">
          <label className="field grow">
            <span className="field-label">Nome de exibição</span>
            <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && setPrefs({ display_name: name.trim() })} />
          </label>
          <label className="field grow">
            <span className="field-label">Nome da kitsune 🦊</span>
            <input
              value={mascotName}
              maxLength={24}
              onChange={(e) => setMascotName(e.target.value)}
              onBlur={() => mascotName.trim() && setPrefs({ mascot_name: mascotName.trim() })}
            />
          </label>
        </div>
      </section>

      <section className="card">
        <h3 className="settings-title">
          <span className="card-kanji">色</span> Tema
        </h3>
        <div className="theme-grid">
          {(Object.keys(THEMES) as ThemeId[]).map((t) => (
            <button key={t} className={`theme-card ${prefs.theme === t ? "active" : ""}`} onClick={() => setPrefs({ theme: t })}>
              <div className="theme-preview" style={{ background: THEMES[t].bg }}>
                <span style={{ color: THEMES[t].fg }}>{THEMES[t].kanji}</span>
                <div className="theme-dots">
                  <i style={{ background: THEMES[t].accent }} />
                </div>
              </div>
              <strong>{THEMES[t].name}</strong>
              <small>{THEMES[t].desc}</small>
            </button>
          ))}
        </div>
        <div className="settings-toggles">
          <label className="switch">
            <input type="checkbox" checked={prefs.petals} onChange={(e) => setPrefs({ petals: e.target.checked })} />
            <span className="switch-ui" />
            <span>
              <b>Pétalas caindo</b>
              <small>Animação discreta de fundo (respeita "reduzir movimento" do sistema)</small>
            </span>
          </label>
          <label className="switch">
            <input type="checkbox" checked={prefs.sound} onChange={(e) => setPrefs({ sound: e.target.checked })} />
            <span className="switch-ui" />
            <span>
              <b>Sons</b>
              <small>Sino de vento no pomodoro, taiko ao finalizar projeto</small>
            </span>
          </label>
          <button className="btn btn-ghost sm" onClick={playFurin}>
            <Volume2 size={14} /> Testar 風鈴
          </button>
        </div>
      </section>

      <section className="card">
        <h3 className="settings-title">
          <span className="card-kanji">自動</span> Automação
        </h3>
        <p className="muted small">
          O app se preenche sozinho a partir do GitHub, a cada 30 minutos (e quando você abre o app).
        </p>
        {automation && !automation.has_token && (
          <div className="gh-hint">
            <strong>Falta o token do GitHub.</strong>
            <p>
              A automação precisa do segredo <code>GITHUB_TOKEN</code> no Cloudflare (passo a passo no README).
            </p>
          </div>
        )}
        <label className="switch">
          <input type="checkbox" checked={prefs.auto_sync} onChange={(e) => setPrefs({ auto_sync: e.target.checked })} />
          <span className="switch-ui" />
          <span>
            <b>Sincronizar com o GitHub automaticamente</b>
            <small>
              {automation?.last_sync
                ? `Última sincronização ${ago(automation.last_sync.at)} · ${automation.last_sync.message}`
                : "Ainda não sincronizou"}
            </small>
          </span>
        </label>
        {automation?.last_sync && automation.last_sync.errors.length > 0 && (
          <div className="gh-hint">
            <strong>Avisos da última sincronização</strong>
            <ul className="auto-errors">
              {automation.last_sync.errors.slice(0, 6).map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}
        <div className={`auto-options ${prefs.auto_sync ? "" : "disabled"}`}>
          {AUTO_OPTIONS.map((o) => (
            <label key={o.key} className="switch">
              <input
                type="checkbox"
                checked={Boolean(prefs[o.key])}
                disabled={!prefs.auto_sync && o.key !== "auto_journal"}
                onChange={(e) => setPrefs({ [o.key]: e.target.checked } as Partial<Prefs>)}
              />
              <span className="switch-ui" />
              <span>
                <b>{o.title}</b>
                <small>{o.desc}</small>
              </span>
            </label>
          ))}
        </div>
        <div className="settings-row">
          <button className="btn btn-ghost" disabled={syncing} onClick={() => void syncNow()}>
            {syncing ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />} Sincronizar agora
          </button>
          <button className="btn btn-ghost" disabled={journaling} onClick={() => void generateJournal()}>
            {journaling ? <Loader2 size={16} className="spin" /> : <BookOpen size={16} />} Gerar resumo de hoje
          </button>
        </div>
      </section>

      <section className="card">
        <h3 className="settings-title">
          <span className="card-kanji">連携</span> GitHub
        </h3>
        <p className="muted small">
          Importe seus repositórios como projetos e veja último commit, push e issues na página de cada projeto. Sem token
          funciona só com repositórios públicos e com limite baixo de consultas. Para incluir os privados, crie um token
          read-only e salve no Cloudflare como o segredo <code>GITHUB_TOKEN</code> (passo a passo no README).
        </p>
        <div className="settings-row">
          <button className="btn btn-ghost" onClick={() => useStore.getState().set({ githubOpen: true })}>
            <FolderGit2 size={16} /> Importar do GitHub
          </button>
        </div>
      </section>

      <section className="card">
        <h3 className="settings-title">
          <span className="card-kanji">保存</span> Backup
        </h3>
        <p className="muted small">
          Seus dados ficam no Cloudflare D1. Exporte um JSON de vez em quando por garantia (備えあれば憂いなし).
        </p>
        <div className="settings-row">
          <button className="btn btn-ghost" onClick={() => void exportData()}>
            <Download size={16} /> Exportar JSON
          </button>
          <button className="btn btn-ghost" onClick={() => file.current?.click()}>
            <Upload size={16} /> Importar JSON
          </button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importData(f);
              e.target.value = "";
            }}
          />
        </div>
      </section>

      <section className="card">
        <h3 className="settings-title">
          <span className="card-kanji">鍵</span> Atalhos de teclado
        </h3>
        <ul className="shortcut-list">
          {SHORTCUTS.map((s) => (
            <li key={s.keys}>
              <span>{s.label}</span>
              <kbd>{s.keys}</kbd>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h3 className="settings-title">
          <span className="card-kanji">退出</span> Sessão
        </h3>
        <button className="btn btn-danger-ghost" onClick={() => void logout()}>
          <LogOut size={16} /> Sair
        </button>
      </section>
    </div>
  );
}
