// Sistema de níveis e patentes (de aprendiz a lenda).

export interface Rank {
  level: number;
  kanji: string;
  romaji: string;
  title: string;
}

export const RANKS: Rank[] = [
  { level: 1, kanji: "見習い", romaji: "minarai", title: "Aprendiz" },
  { level: 3, kanji: "足軽", romaji: "ashigaru", title: "Soldado raso" },
  { level: 6, kanji: "浪人", romaji: "rōnin", title: "Rōnin" },
  { level: 10, kanji: "侍", romaji: "samurai", title: "Samurai" },
  { level: 15, kanji: "忍", romaji: "shinobi", title: "Shinobi" },
  { level: 21, kanji: "師範", romaji: "shihan", title: "Mestre" },
  { level: 28, kanji: "大名", romaji: "daimyō", title: "Daimyō" },
  { level: 36, kanji: "将軍", romaji: "shōgun", title: "Shōgun" },
  { level: 45, kanji: "伝説", romaji: "densetsu", title: "Lenda" },
];

/** XP acumulado necessário para atingir o nível n. */
export const xpForLevel = (n: number) => 50 * n * (n - 1);

export function levelInfo(xp: number) {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  const base = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const rank = [...RANKS].reverse().find((r) => level >= r.level)!;
  const nextRank = RANKS.find((r) => r.level > level) ?? null;
  return { level, xp, into: xp - base, needed: next - base, pct: (xp - base) / (next - base), rank, nextRank };
}

export const XP_RULES = [
  { label: "Tarefa concluída", value: "5 · 10 · 20 · 35 XP (por prioridade)" },
  { label: "Projeto finalizado", value: "150 XP" },
  { label: "Minuto de foco", value: "1 XP" },
  { label: "Entrada no diário", value: "15 XP" },
];
