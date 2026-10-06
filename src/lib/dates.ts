// Datas "de calendário" são strings YYYY-MM-DD no fuso local do navegador.

export function toKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const todayKey = () => toKey(new Date());

export function addDays(key: string, n: number): string {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

export function fromKey(key: string): Date {
  const [y, m, d] = key.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function diffDays(a: string, b: string): number {
  return Math.round((fromKey(a).getTime() - fromKey(b).getTime()) / 86400_000);
}

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const WEEKDAYS_JP = ["日", "月", "火", "水", "木", "金", "土"];
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function formatShort(key: string): string {
  const d = fromKey(key);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function formatLong(key: string): string {
  const d = fromKey(key);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()}`;
}

export function weekdayJp(key: string) {
  return WEEKDAYS_JP[fromKey(key).getDay()];
}

export function monthName(i: number) {
  return MONTHS[i];
}

/** "hoje", "amanhã", "em 3 dias", "há 2 dias"… */
export function relativeDue(key: string): { text: string; tone: "late" | "today" | "soon" | "later" } {
  const d = diffDays(key, todayKey());
  if (d < 0) return { text: d === -1 ? "ontem" : `${-d} dias atrás`, tone: "late" };
  if (d === 0) return { text: "hoje", tone: "today" };
  if (d === 1) return { text: "amanhã", tone: "soon" };
  if (d <= 6) return { text: `em ${d} dias`, tone: "soon" };
  return { text: formatShort(key), tone: "later" };
}

export function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "agora";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} d`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo} ${mo > 1 ? "meses" : "mês"}`;
  return `${Math.floor(mo / 12)} ano${mo >= 24 ? "s" : ""}`;
}

/** "agora" ou "há 5 min" */
export function ago(iso: string): string {
  const t = timeAgo(iso);
  return t === "agora" ? t : `há ${t}`;
}

export function greeting(): { jp: string; romaji: string; pt: string } {
  const h = new Date().getHours();
  if (h < 5) return { jp: "こんばんは", romaji: "konbanwa", pt: "Codando de madrugada?" };
  if (h < 12) return { jp: "おはよう", romaji: "ohayō", pt: "Bom dia" };
  if (h < 18) return { jp: "こんにちは", romaji: "konnichiwa", pt: "Boa tarde" };
  return { jp: "こんばんは", romaji: "konbanwa", pt: "Boa noite" };
}

export function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}min` : `${h}h`;
}
