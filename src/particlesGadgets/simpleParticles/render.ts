/**
 * 飘花/飘叶 —— 全部 Canvas 2D
 * 花瓣：心形 💗；树叶：椭圆；物理与 3D 翻滚一致
 */

export interface ParticlesGadgetFields {
  particleType?: string;
  count?: number;
  windDirection?: number;
  windSpeed?: number;
  fallSpeed?: number;
  size?: number;
  /** 0–100：随机多大比例粒子使用景深式模糊 */
  blurRatio?: number;
  /** 0–100：飞行变异程度（花瓣/树叶/雪适用，雨线忽略） */
  flightVariation?: number;
  [key: string]: string | number | undefined;
}

const PARTICLE_COLORS: Record<string, string[]> = {
  petal: ['#ffb7c5', '#ff8fab', '#ffc0cb', '#ffa6c9', '#ffd1dc', '#ff9eb5', '#ffe4e6'],
  leaf_green: ['#228b22', '#2e8b57', '#3cb371', '#4caf50', '#66bb6a', '#81c784'],
  leaf_autumn: ['#daa520', '#d4a017', '#b8860b', '#cd853f', '#d2691e', '#bc8f8f'],
  snow: ['#ffffff', '#e8f4ff', '#f0f8ff', '#fafafa', '#e6f2ff'],
  rain: ['rgba(255,255,255,0.5)', 'rgba(200,220,255,0.5)', 'rgba(180,200,230,0.55)'],
};

interface CanvasParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  type: string;
  color: string;
  euler: [number, number, number];
  rot: [number, number, number];
  /** 是否景深模糊（创建时按 blurRatio 随机） */
  blurred: boolean;
}

function normalizeParticleType(fields: ParticlesGadgetFields): string {
  const raw = fields.particleType ?? 'petal';
  const s = String(raw).trim().toLowerCase();
  if (s === '花瓣') return 'petal';
  if (s === '下雪') return 'snow';
  if (s === '下雨') return 'rain';
  return s || 'petal';
}

/**
 * 基于经典心形参数式，x 收窄、y 拉长，更接近窄长花瓣而非圆胖「爱心」
 */
function appendPetalHeartPath(ctx: CanvasRenderingContext2D, size: number): void {
  const sc = (size * 0.52) / 16;
  const narrowX = 0.46;
  const stretchY = 1.38;
  ctx.beginPath();
  let first = true;
  for (let t = 0; t <= Math.PI * 2 + 0.02; t += 0.07) {
    const xm = 16 * Math.sin(t) ** 3;
    const ym = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    const x = sc * xm * narrowX;
    const y = -sc * ym * stretchY;
    if (first) {
      ctx.moveTo(x, y);
      first = false;
    } else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function fillHeartPetal(ctx: CanvasRenderingContext2D, p: CanvasParticle): void {
  const w = p.size;
  appendPetalHeartPath(ctx, w);
  const g = ctx.createRadialGradient(0, -w * 0.22, w * 0.06, 0, w * 0.05, w * 1.05);
  g.addColorStop(0, '#fff8fa');
  g.addColorStop(0.5, p.color);
  g.addColorStop(1, p.color);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,100,140,0.22)';
  ctx.lineWidth = Math.max(0.5, w * 0.05);
  ctx.stroke();
}

function createCanvasParticles(
  count: number,
  width: number,
  height: number,
  type: string,
  baseSize: number,
  windDirDeg: number,
  windSpeed: number,
  fallSpeed: number,
  blurRatio01: number,
  flightVariation01: number
): CanvasParticle[] {
  const particles: CanvasParticle[] = [];
  const wind = (windDirDeg * Math.PI) / 180;
  const windX = Math.cos(wind) * windSpeed * 0.5;
  const windY = Math.sin(wind) * windSpeed * 0.5;
  const PI2 = Math.PI * 2;
  const sym = () => Math.random() * 2 - 1;
  const palette = PARTICLE_COLORS[type] ?? PARTICLE_COLORS.petal;
  const sizeMul = type === 'petal' ? 1.95 : type === 'rain' ? 3.5 : 1;
  const varF = type === 'rain' ? 0 : flightVariation01;

  for (let i = 0; i < count; i++) {
    const baseVy = fallSpeed * (0.5 + Math.random() * 0.5) + windY;
    const speedVar = sym() * fallSpeed * 0.45 * varF;
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: windX + sym() * 0.7 * varF,
      vy: baseVy + speedVar,
      size: baseSize * (0.85 + Math.random() * 0.3) * sizeMul,
      type,
      color: palette[Math.floor(Math.random() * palette.length)] ?? '#ffb7c5',
      euler: [Math.random() * PI2, Math.random() * PI2, Math.random() * PI2],
      rot: [sym() * PI2 * 0.5, sym() * PI2 * 0.5, sym() * PI2 * 0.5],
      blurred: Math.random() < blurRatio01,
    });
  }
  return particles;
}

export function createRenderer(
  container: HTMLDivElement,
  fields: ParticlesGadgetFields,
  width: number,
  height: number
): () => void {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.remove();
    return () => {};
  }
  const c = ctx;

  const particleType = normalizeParticleType(fields);
  const count = Math.min(200, Math.max(10, (fields.count as number) ?? 80));
  const windDirection = (fields.windDirection as number) ?? 90;
  const windSpeed = (fields.windSpeed as number) ?? 0.5;
  const fallSpeed = (fields.fallSpeed as number) ?? 0.8;
  const size = Math.min(24, Math.max(4, (fields.size as number) ?? 12));
  const blurRatioPct = Math.min(100, Math.max(0, Number(fields.blurRatio ?? 35)));
  const blurRatio01 = blurRatioPct / 100;
  const flightVariationPct = Math.min(100, Math.max(0, Number(fields.flightVariation ?? 60)));
  const flightVariation01 = flightVariationPct / 100;

  const particles = createCanvasParticles(
    count,
    width,
    height,
    particleType,
    size,
    windDirection,
    windSpeed,
    fallSpeed,
    blurRatio01,
    flightVariation01
  );
  let animationId: number;
  let timePrev = performance.now();
  const PI2 = Math.PI * 2;

  const windRad = (windDirection * Math.PI) / 180;
  const windX = Math.cos(windRad) * windSpeed * 0.5;
  const windY = Math.sin(windRad) * windSpeed * 0.5;
  const rainAngle =
    particleType === 'rain' ? Math.atan2(fallSpeed * 0.75 + windY, windX) - Math.PI / 2 : 0;

  const hasBlurred = particles.some((p) => p.blurred);
  const blurCanvas = hasBlurred ? document.createElement('canvas') : null;
  const blurCtx = blurCanvas ? blurCanvas.getContext('2d') : null;
  if (blurCanvas && blurCtx) {
    blurCanvas.width = width;
    blurCanvas.height = height;
  }

  function drawParticle(ctx: CanvasRenderingContext2D, p: CanvasParticle): void {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.filter = 'none';
    const w = p.size;

    if (p.type === 'snow') {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(0, 0, w * 0.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.type === 'rain') {
      ctx.rotate(rainAngle);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = Math.max(0.8, w * 0.04);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, -w * 0.5);
      ctx.lineTo(0, w * 0.5);
      ctx.stroke();
    } else {
      const cx = Math.cos(p.euler[0]);
      const cy = Math.cos(p.euler[1]);
      const face = Math.max(0.15, Math.abs(cx) * Math.abs(cy));
      ctx.rotate(p.euler[2]);
      ctx.scale(face, face);
      ctx.transform(1, Math.sin(p.euler[0]) * 0.45, Math.sin(p.euler[1]) * 0.28, 1, 0, 0);
      ctx.globalAlpha = 0.35 + 0.65 * face;
      if (p.type === 'petal') {
        fillHeartPetal(ctx, p);
      } else {
        ctx.fillStyle = p.color;
        const h = p.type === 'leaf_green' ? w * 2.2 : w * 1.2;
        ctx.beginPath();
        ctx.ellipse(0, 0, w * 0.5, h, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function tick() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - timePrev) / 1000);
    timePrev = now;

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.euler[0] += p.rot[0] * dt;
      p.euler[1] += p.rot[1] * dt;
      p.euler[2] += p.rot[2] * dt;
      for (let k = 0; k < 3; k++) {
        p.euler[k] = p.euler[k] % PI2;
        if (p.euler[k] < 0) p.euler[k] += PI2;
      }
      if (p.y > height + p.size * 2) {
        p.y = -p.size * 2;
        p.x = Math.random() * width;
      } else if (p.y < -p.size * 2) {
        p.y = height + p.size * 2;
        p.x = Math.random() * width;
      }
      if (p.x > width + p.size * 2) p.x = -p.size * 2;
      else if (p.x < -p.size * 2) p.x = width + p.size * 2;
    }

    c.clearRect(0, 0, width, height);

    if (blurCanvas && blurCtx && hasBlurred) {
      blurCtx.clearRect(0, 0, width, height);
      for (const p of particles) {
        if (p.blurred) drawParticle(blurCtx, p);
      }
      c.save();
      c.filter = 'blur(2.5px)';
      c.drawImage(blurCanvas, 0, 0);
      c.restore();
    }

    for (const p of particles) {
      if (!p.blurred) drawParticle(c, p);
    }

    animationId = requestAnimationFrame(tick);
  }
  tick();
  return () => {
    cancelAnimationFrame(animationId);
    canvas.remove();
  };
}
