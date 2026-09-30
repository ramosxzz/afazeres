import { useEffect, useRef } from "react";

interface Petal {
  x: number;
  y: number;
  size: number;
  speedY: number;
  speedX: number;
  rot: number;
  rotSpeed: number;
  flip: number;
  flipSpeed: number;
  hue: 0 | 1;
}

/** Pétalas de sakura caindo num canvas fixo ao fundo. Leve: ~28 pétalas, pausa quando a aba está oculta. */
export function SakuraPetals({ enabled }: { enabled: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !enabled) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d")!;
    let w = 0;
    let h = 0;
    let raf = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const count = Math.round(Math.min(34, Math.max(14, w / 50)));
    const spawn = (initial = false): Petal => ({
      x: Math.random() * w * 1.2 - w * 0.1,
      y: initial ? Math.random() * h : -20 - Math.random() * 60,
      size: 6 + Math.random() * 8,
      speedY: 0.35 + Math.random() * 0.7,
      speedX: 0.2 + Math.random() * 0.6,
      rot: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.02,
      flip: Math.random() * Math.PI,
      flipSpeed: 0.01 + Math.random() * 0.03,
      hue: Math.random() > 0.5 ? 1 : 0,
    });
    const petals = Array.from({ length: count }, () => spawn(true));

    const colors = () => {
      const s = getComputedStyle(document.documentElement);
      return [s.getPropertyValue("--petal-1").trim() || "#ffc0da", s.getPropertyValue("--petal-2").trim() || "#ff8fc0"];
    };
    let palette = colors();
    const observer = new MutationObserver(() => (palette = colors()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    let t = 0;
    const draw = () => {
      t += 1;
      ctx.clearRect(0, 0, w, h);
      const wind = Math.sin(t / 240) * 0.4;
      for (const p of petals) {
        p.y += p.speedY;
        p.x += p.speedX + wind;
        p.rot += p.rotSpeed;
        p.flip += p.flipSpeed;
        if (p.y > h + 20 || p.x > w + 40) Object.assign(p, spawn());
        const scaleY = Math.abs(Math.cos(p.flip));
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.scale(1, 0.35 + scaleY * 0.65);
        ctx.globalAlpha = 0.55 + scaleY * 0.3;
        ctx.fillStyle = palette[p.hue];
        // Pétala: gota com um entalhe na ponta.
        const s = p.size;
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.bezierCurveTo(s * 0.9, -s * 0.6, s * 0.7, s * 0.6, 0, s);
        ctx.bezierCurveTo(-s * 0.7, s * 0.6, -s * 0.9, -s * 0.6, 0, -s);
        ctx.fill();
        ctx.globalAlpha *= 0.5;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.ellipse(-s * 0.15, -s * 0.2, s * 0.15, s * 0.4, 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      raf = requestAnimationFrame(draw);
    };

    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
      ctx.clearRect(0, 0, w, h);
    };
  }, [enabled]);

  return <canvas ref={ref} className="petals" aria-hidden="true" />;
}
