import { useMemo, useState } from "react";
import { addDays, formatLong, formatMinutes, fromKey, monthName, todayKey, toKey } from "../lib/dates";

/** Mapa de calor de atividade (estilo contribuições do GitHub), 1 ano. */
export function Heatmap({ data, weeks = 53 }: { data: { day: string; count: number }[]; weeks?: number }) {
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const { cells, months, max } = useMemo(() => {
    const map = new Map(data.map((d) => [d.day, d.count]));
    const today = fromKey(todayKey());
    const end = toKey(today);
    // começa num domingo
    const start = addDays(end, -(weeks - 1) * 7 - today.getDay());
    const cells: { day: string; count: number; col: number; row: number }[] = [];
    const months: { col: number; label: string }[] = [];
    let lastMonth = -1;
    for (let i = 0; ; i++) {
      const day = addDays(start, i);
      if (day > end) break;
      const col = Math.floor(i / 7);
      const row = i % 7;
      const m = fromKey(day).getMonth();
      if (row === 0 && m !== lastMonth) {
        // evita rótulos colados (ex.: primeira semana parcial)
        if (!months.length || col - months[months.length - 1].col >= 3) months.push({ col, label: monthName(m) });
        lastMonth = m;
      }
      cells.push({ day, count: map.get(day) ?? 0, col, row });
    }
    const max = Math.max(1, ...cells.map((c) => c.count));
    return { cells, months, max };
  }, [data, weeks]);

  const level = (n: number) => (n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4)));
  const size = 12;
  const gap = 3;
  const cols = Math.max(...cells.map((c) => c.col)) + 1;
  const width = cols * (size + gap);
  const total = cells.reduce((a, c) => a + c.count, 0);

  return (
    <div className="heatmap">
      <div className="heatmap-scroll">
        <svg viewBox={`0 0 ${width + 28} ${7 * (size + gap) + 18}`} role="img" aria-label={`${total} atividades no último ano`}>
          {months.map((m) => (
            <text key={`${m.col}-${m.label}`} x={28 + m.col * (size + gap)} y={10} className="heatmap-label">
              {m.label}
            </text>
          ))}
          {["", "seg", "", "qua", "", "sex", ""].map((d, i) =>
            d ? (
              <text key={d} x={0} y={18 + i * (size + gap) + size - 2} className="heatmap-label">
                {d}
              </text>
            ) : null,
          )}
          {cells.map((c) => (
            <rect
              key={c.day}
              x={28 + c.col * (size + gap)}
              y={16 + c.row * (size + gap)}
              width={size}
              height={size}
              rx={3}
              fill={`var(--heat-${level(c.count)})`}
              className="heatmap-cell"
              onMouseEnter={(e) => {
                const r = (e.target as SVGRectElement).getBoundingClientRect();
                setTip({
                  x: r.left + r.width / 2,
                  y: r.top,
                  text: `${c.count} atividade${c.count === 1 ? "" : "s"} · ${formatLong(c.day)}`,
                });
              }}
              onMouseLeave={() => setTip(null)}
            />
          ))}
        </svg>
      </div>
      <div className="heatmap-legend">
        <span>{total} atividades no último ano</span>
        <span className="spacer" />
        <span>menos</span>
        {[0, 1, 2, 3, 4].map((l) => (
          <i key={l} style={{ background: `var(--heat-${l})` }} />
        ))}
        <span>mais</span>
      </div>
      {tip && (
        <div className="chart-tip" style={{ left: tip.x, top: tip.y }}>
          {tip.text}
        </div>
      )}
    </div>
  );
}

/** Barras horizontais com rótulo direto (identidade nunca só pela cor). */
export function HBars({
  rows,
  format = (n: number) => String(n),
}: {
  rows: { key: string; label: React.ReactNode; value: number; color: string }[];
  format?: (n: number) => string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="hbars">
      {rows.map((r) => (
        <div key={r.key} className="hbar" title={`${format(r.value)}`}>
          <span className="hbar-label">{r.label}</span>
          <div className="hbar-track">
            <div className="hbar-fill" style={{ width: `${(r.value / max) * 100}%`, background: r.color }} />
          </div>
          <span className="hbar-value">{format(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

/** Colunas de minutos de foco por dia (últimos N dias). */
export function FocusColumns({ data, days = 14 }: { data: { day: string; minutes: number }[]; days?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const map = new Map(data.map((d) => [d.day, d.minutes]));
  const today = todayKey();
  const series = Array.from({ length: days }, (_, i) => {
    const day = addDays(today, i - days + 1);
    return { day, minutes: map.get(day) ?? 0 };
  });
  const max = Math.max(30, ...series.map((s) => s.minutes));
  return (
    <div className="columns">
      <div className="columns-plot">
        {series.map((s, i) => (
          <div
            key={s.day}
            className={`column ${hover === i ? "hover" : ""}`}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            {hover === i && (
              <div className="column-tip">
                <b>{formatMinutes(s.minutes)}</b>
                <span>{formatLong(s.day)}</span>
              </div>
            )}
            <div className="column-bar" style={{ height: `${Math.max(s.minutes ? 4 : 0, (s.minutes / max) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="columns-axis">
        {series.map((s, i) => (
          <span key={s.day}>{i % 2 === (days - 1) % 2 ? fromKey(s.day).getDate() : ""}</span>
        ))}
      </div>
    </div>
  );
}
