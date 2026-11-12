// Fête de fin de partie : confettis aux couleurs du zellige (grande fête au 100 %, petite à 80 %).
import { useEffect, useRef } from 'react';
import { sfx } from './sound';

const COLORS = ['#1E5AA8', '#1F8A5B', '#F2B705', '#E8590C', '#FFFFFF'];

function star8(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number, color: string) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.fillStyle = color; ctx.beginPath();
  for (let i = 0; i < 16; i++) { const a = (i * Math.PI) / 8, rr = i % 2 ? r * 0.55 : r; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill(); ctx.restore();
}

/** big : deux canons depuis le bas ; small : une pluie légère depuis le haut. */
export function Confetti({ size }: { size: 'big' | 'small' }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const c = ref.current!;
    const ctx = c.getContext('2d')!;
    const d = devicePixelRatio || 1;
    const W = innerWidth, H = innerHeight;
    c.width = W * d; c.height = H * d; ctx.setTransform(d, 0, 0, d, 0, 0);
    type P = { x: number; y: number; vx: number; vy: number; rot: number; vr: number; w: number; h: number; col: string; star: boolean };
    const parts: P[] = [];
    const n = size === 'big' ? Math.min(220, Math.round(W / 3)) : 70;
    for (let i = 0; i < n; i++) {
      const base = { rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, w: 6 + Math.random() * 7, h: 4 + Math.random() * 4, col: COLORS[i % 4], star: i % 6 === 0 };
      if (size === 'big') {
        const left = i % 2 === 0;
        const sp = (H / 60) * (0.75 + Math.random() * 0.55);
        parts.push({ ...base, x: left ? 0 : W, y: H, vx: (left ? 1 : -1) * (2 + Math.random() * (W / 160)), vy: -sp });
      } else parts.push({ ...base, x: Math.random() * W, y: -20 - Math.random() * H * 0.4, vx: (Math.random() - 0.5) * 1.5, vy: 1 + Math.random() * 2 });
    }
    if (size === 'big') { sfx.end(); setTimeout(() => sfx.end(), 380); }
    const t0 = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.vy += size === 'big' ? 0.24 : 0.04; p.vx *= 0.99; p.vy *= 0.99; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        if (p.star) star8(ctx, p.x, p.y, 6, p.rot, p.col);
        else { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, Math.cos(p.rot * 2)); ctx.fillStyle = p.col; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore(); }
      }
      if (now - t0 < (size === 'big' ? 4500 : 3500)) raf = requestAnimationFrame(loop);
      else ctx.clearRect(0, 0, W, H);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [size]);
  return <canvas ref={ref} className="confetti" aria-hidden="true" />;
}
