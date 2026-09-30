import { useEffect } from "react";
import { useStore } from "../store";

/** Carimbo hanko (判子) ao finalizar projeto e tela de level-up. */
export function Celebration() {
  const c = useStore((s) => s.celebrations[0]);
  const close = useStore((s) => s.dismissCelebration);

  useEffect(() => {
    if (!c) return;
    const t = setTimeout(close, c.kind === "level" ? 4200 : 3000);
    const onKey = () => close();
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [c, close]);

  if (!c) return null;

  return (
    <div className="celebration" key={c.kind + ("title" in c ? c.title : c.level)} onClick={close}>
      <div className="burst" aria-hidden="true">
        {Array.from({ length: 18 }, (_, i) => (
          <span key={i} style={{ "--i": i } as React.CSSProperties} />
        ))}
      </div>
      {c.kind === "project" ? (
        <div className="celebration-inner">
          <div className="hanko">
            <span>完</span>
            <small>了</small>
          </div>
          <p className="celebration-sub">Projeto finalizado</p>
          <h2 className="celebration-title">{c.title}</h2>
          <p className="celebration-xp">+150 XP · お疲れ様でした!</p>
        </div>
      ) : (
        <div className="celebration-inner">
          <div className="levelup-kanji">{c.rankKanji}</div>
          <p className="celebration-sub">レベルアップ · Level up!</p>
          <h2 className="celebration-title">Nível {c.level}</h2>
          <p className="celebration-xp">Patente: {c.rank}</p>
        </div>
      )}
    </div>
  );
}
