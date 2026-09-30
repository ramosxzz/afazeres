import { stageForLevel, type MascotMood } from "../lib/mascot";

// Kitsune em traço fino (currentColor). Tudo em um viewBox 120×120.
// As caudas saem em leque de trás do corpo: 1 cauda no início, 9 na patente máxima.

const TAIL = "M0 0 C -10 -11 -17 -31 -10 -47 C -6 -55 6 -55 10 -47 C 17 -31 10 -11 0 0 Z";
const TAIL_TIP = "M -8.4 -44 C -5.5 -52 5.5 -52 8.4 -44 C 4.5 -46.5 -4.5 -46.5 -8.4 -44 Z";
const BASE = { x: 60, y: 93 };

function tailAngles(n: number): number[] {
  if (n === 1) return [58];
  const spread = Math.min(170, 70 + 13 * (n - 1));
  return Array.from({ length: n }, (_, i) => -spread / 2 + (spread / (n - 1)) * i);
}

function Eyes({ mood }: { mood: MascotMood }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const };
  switch (mood) {
    case "happy":
      return (
        <g>
          <path d="M49.5 42 Q52.5 38.5 55.5 42" {...common} />
          <path d="M64.5 42 Q67.5 38.5 70.5 42" {...common} />
        </g>
      );
    case "sleepy":
      return (
        <g>
          <path d="M49.5 40.5 Q52.5 43.5 55.5 40.5" {...common} />
          <path d="M64.5 40.5 Q67.5 43.5 70.5 40.5" {...common} />
        </g>
      );
    case "focus":
      return (
        <g>
          <path d="M49.5 41.5 L55.5 40.5" {...common} />
          <path d="M64.5 40.5 L70.5 41.5" {...common} />
        </g>
      );
    case "worried":
      return (
        <g>
          <circle cx={52.5} cy={41.5} r={1.9} fill="currentColor" />
          <circle cx={67.5} cy={41.5} r={1.9} fill="currentColor" />
          <path d="M49 36.5 L55 35.5" {...common} strokeWidth={1.2} />
          <path d="M65 35.5 L71 36.5" {...common} strokeWidth={1.2} />
        </g>
      );
    default:
      return (
        <g className="k-blink">
          <circle cx={52.5} cy={41} r={1.9} fill="currentColor" />
          <circle cx={67.5} cy={41} r={1.9} fill="currentColor" />
        </g>
      );
  }
}

export function Kitsune({
  level,
  mood = "idle",
  size = 96,
  animate = true,
  title,
}: {
  level: number;
  mood?: MascotMood;
  size?: number;
  animate?: boolean;
  title?: string;
}) {
  const stage = stageForLevel(level);
  const angles = tailAngles(stage.tails);
  // desenha de fora pra dentro, pra cauda do meio ficar por cima
  const order = angles.map((a, i) => ({ a, i })).sort((x, y) => Math.abs(y.a) - Math.abs(x.a));
  const line = { fill: "var(--mascot-bg, var(--bg))", stroke: "currentColor", strokeWidth: 1.6, strokeLinejoin: "round" as const };

  return (
    <svg
      className={`kitsune ${animate ? "animated" : ""} mood-${mood}`}
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role="img"
      aria-label={title ?? `Kitsune de ${stage.tails} cauda${stage.tails > 1 ? "s" : ""}`}
    >
      {stage.orbs > 0 && (
        <g className="k-orbs">
          <circle cx={101} cy={30} r={3.2} fill="var(--accent)" />
          <circle cx={101} cy={30} r={6} fill="none" stroke="var(--accent)" strokeWidth={0.8} opacity={0.5} />
          {stage.orbs > 1 && (
            <>
              <circle cx={19} cy={38} r={2.6} fill="var(--accent)" />
              <circle cx={19} cy={38} r={5} fill="none" stroke="var(--accent)" strokeWidth={0.8} opacity={0.5} />
            </>
          )}
        </g>
      )}

      <g className="k-tails">
        {order.map(({ a, i }) => (
          <g key={i} transform={`translate(${BASE.x} ${BASE.y}) rotate(${a})`}>
            <path d={TAIL} {...line} />
            <path d={TAIL_TIP} fill="currentColor" opacity={0.85} />
          </g>
        ))}
      </g>

      {/* corpo sentado */}
      <path d="M46 98 C 43 83 46 69 53 62 L 67 62 C 74 69 77 83 74 98 Z" {...line} />
      <path d="M55 71 L60 77 L65 71" fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" opacity={0.6} />
      <path d="M50 98 q3 -4 6 0 M64 98 q3 -4 6 0" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" />
      <path d="M36 98.5 H84" stroke="currentColor" strokeWidth={1} strokeLinecap="round" opacity={0.25} />

      {/* cabeça */}
      <path d="M41 38 L45 18.5 L55 31 L65 31 L75 18.5 L79 38 C 79 49 70 57 60 61.5 C 50 57 41 49 41 38 Z" {...line} />
      <path d="M46.5 24.5 L50 30.5 M73.5 24.5 L70 30.5" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" opacity={0.6} />
      <path d="M44 44 C 50 45.5 54 49 60 55.5 C 66 49 70 45.5 76 44" fill="none" stroke="currentColor" strokeWidth={1} opacity={0.35} />
      {stage.mark && <path d="M60 29 C 61.9 31.6 61.9 34.2 60 35.4 C 58.1 34.2 58.1 31.6 60 29 Z" fill="var(--hanko)" />}
      <Eyes mood={mood} />
      <path d="M58.2 53.6 L61.8 53.6 L60 55.8 Z" fill="currentColor" />

      {mood === "sleepy" && (
        <g className="k-zzz" fill="currentColor" opacity={0.6} fontFamily="var(--font)" fontWeight={500}>
          <text x={84} y={27} fontSize={9}>
            z
          </text>
          <text x={91} y={19} fontSize={7}>
            z
          </text>
        </g>
      )}
    </svg>
  );
}
