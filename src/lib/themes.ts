import type { ThemeId } from "../store";

export const THEMES: Record<ThemeId, { name: string; kanji: string; desc: string; swatch: string[] }> = {
  yozakura: { name: "Yozakura", kanji: "夜桜", desc: "Cerejeiras sob a lua", swatch: ["#0d0a18", "#ff7eb6", "#9d8cff", "#ffd27f"] },
  neotokyo: { name: "Neo-Tokyo", kanji: "東京", desc: "Neon, chuva e cyberpunk", swatch: ["#05060d", "#00f0ff", "#ff2e97", "#fcee0a"] },
  washi: { name: "Washi", kanji: "和紙", desc: "Papel, tinta sumi e selo vermelho", swatch: ["#f3ecdf", "#c0392b", "#2f5d8a", "#231f1c"] },
  matcha: { name: "Matcha", kanji: "抹茶", desc: "Chá verde, bambu e ouro", swatch: ["#0b120e", "#a6d98a", "#e8c07d", "#f2a6a6"] },
};
