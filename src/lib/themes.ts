import type { ThemeId } from "../store";

export const THEMES: Record<ThemeId, { name: string; kanji: string; desc: string; bg: string; fg: string; accent: string }> = {
  sumi: { name: "Sumi", kanji: "墨", desc: "Nanquim, com destaque vermelho", bg: "#0e0e0e", fg: "#ededed", accent: "#e5484d" },
  washi: { name: "Washi", kanji: "和紙", desc: "Papel claro e tinta preta", bg: "#f7f6f3", fg: "#1c1b19", accent: "#c8372d" },
  ai: { name: "Ai", kanji: "藍", desc: "Escuro com índigo", bg: "#0e0f11", fg: "#eceef1", accent: "#4f8cd6" },
  matcha: { name: "Matcha", kanji: "抹茶", desc: "Escuro com verde chá", bg: "#0e0f0e", fg: "#ecefeb", accent: "#7fae5f" },
};
