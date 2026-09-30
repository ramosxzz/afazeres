import { useStore } from "../store";
import { ACHIEVEMENTS } from "../lib/achievements";
import { levelInfo, XP_RULES } from "../lib/xp";
import { ALL_STAGES, mascotMood, stageForLevel } from "../lib/mascot";
import { Kitsune } from "../components/Kitsune";
import { PageHeader } from "../components/ui";

export function Achievements() {
  const stats = useStore((s) => s.stats);
  const projects = useStore((s) => s.projects);
  const tasks = useStore((s) => s.tasks);
  const mascotName = useStore((s) => s.prefs.mascot_name);
  const focusing = useStore((s) => s.pomodoro.running && s.pomodoro.mode === "focus");

  if (!stats) return <div className="loading-block">読み込み中…</div>;
  const info = levelInfo(stats.xp);
  const list = ACHIEVEMENTS.map((a) => {
    const [cur, goal] = a.progress({ stats, projects, tasks });
    return { ...a, cur, goal, unlocked: cur >= goal };
  });
  const unlocked = list.filter((a) => a.unlocked).length;
  const stage = stageForLevel(info.level);
  const mood = mascotMood({ stats, tasks, focusing, name: mascotName });

  return (
    <div className="page">
      <PageHeader kanji="実績" romaji="jisseki" title="Conquistas" subtitle={`${unlocked} de ${list.length} desbloqueadas · ${stats.xp.toLocaleString("pt-BR")} XP no total`} />

      <section className="card rank-hero">
        <div className="rank-mascot">
          <Kitsune level={info.level} mood={mood.mood} size={132} />
        </div>
        <div className="rank-info">
          <span className="rank-romaji">
            {info.rank.kanji} {info.rank.romaji} · {mascotName}, {stage.title.toLowerCase()} ({stage.kanji})
          </span>
          <h2>
            {info.rank.title} <small>· nível {info.level}</small>
          </h2>
          <div className="xp-bar big">
            <i style={{ width: `${info.pct * 100}%` }} />
          </div>
          <p className="muted small">
            {info.into.toLocaleString("pt-BR")} / {info.needed.toLocaleString("pt-BR")} XP para o nível {info.level + 1}
            {info.nextRank && (
              <>
                {" "}
                · próxima patente: <b>{info.nextRank.kanji} {info.nextRank.title}</b> no nível {info.nextRank.level}
              </>
            )}
          </p>
        </div>
        <div className="rank-streak">
          <span>🔥</span>
          <b>{stats.streak}</b>
          <small>dias seguidos</small>
          <small className="muted">recorde {stats.best_streak}</small>
        </div>
      </section>

      <section>
        <h3 className="section-label">
          Evolução de {mascotName} <span className="muted">· uma cauda nova a cada patente, até a kyūbi (九尾)</span>
        </h3>
        <div className="rank-path">
          {ALL_STAGES.map((s) => (
            <div
              key={s.level}
              className={`rank-step ${info.level >= s.level ? "reached" : ""} ${info.rank.level === s.level ? "current" : ""}`}
              title={s.title}
            >
              <Kitsune level={s.level} size={64} animate={false} mood={info.level >= s.level ? "idle" : "sleepy"} />
              <span className="rank-step-kanji">{s.rank.kanji}</span>
              <span className="rank-step-title">{s.rank.title}</span>
              <span className="rank-step-level">
                nv {s.level} · {s.kanji}
              </span>
            </div>
          ))}
        </div>
      </section>

      <div className="ach-grid">
        {list.map((a) => (
          <div key={a.id} className={`ach ${a.unlocked ? "unlocked" : ""}`}>
            <div className="ach-seal">{a.kanji}</div>
            <div className="ach-body">
              <strong>{a.title}</strong>
              <span>{a.desc}</span>
              <div className="ach-progress">
                <div className="bar">
                  <i style={{ width: `${(a.cur / a.goal) * 100}%` }} />
                </div>
                <small>
                  {a.cur}/{a.goal}
                </small>
              </div>
            </div>
          </div>
        ))}
      </div>

      <section className="card xp-rules">
        <h3>
          <span className="card-kanji">規則</span> Como ganhar XP
        </h3>
        <ul>
          {XP_RULES.map((r) => (
            <li key={r.label}>
              <span>{r.label}</span>
              <b>{r.value}</b>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
