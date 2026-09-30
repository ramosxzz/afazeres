import { useEffect } from "react";
import { useStore } from "../store";
import { stageForLevel } from "../lib/mascot";
import { Kitsune } from "./Kitsune";

/** Carimbo hanko (判子) ao finalizar projeto e tela de level-up. */
export function Celebration() {
  const c = useStore((s) => s.celebrations[0]);
  const close = useStore((s) => s.dismissCelebration);
  const mascotName = useStore((s) => s.prefs.mascot_name);

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
          <div className="levelup-mascot">
            <Kitsune level={c.level} mood="happy" size={150} />
          </div>
          <p className="celebration-sub">レベルアップ · Level up</p>
          <h2 className="celebration-title">Nível {c.level}</h2>
          <p className="celebration-xp">
            {c.newTail
              ? `${mascotName} ganhou a ${stageForLevel(c.level).tails}ª cauda! Nova patente: ${c.rankKanji} ${c.rank}`
              : `Patente: ${c.rankKanji} ${c.rank}`}
          </p>
        </div>
      )}
    </div>
  );
}
