import { useRef, useState } from "react";
import { Download, LogOut, Upload, Volume2 } from "lucide-react";
import type { BackupFile } from "@shared/types";
import { api } from "../api";
import { useStore, type ThemeId } from "../store";
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
