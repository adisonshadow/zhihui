/**
 * 即时透明抠图：从四角采样背景色，颜色匹配生成选区，支持容差、连续、抗锯齿、羽化
 */

export interface InstantTransparencyOptions {
  /** 容差 0–255，控制颜色匹配范围 */
  tolerance: number;
  /** 仅选与角连通的背景区域 */
  contiguous: boolean;
  /** 边缘抗锯齿，半透明过渡 */
  antiAliasing: boolean;
  /** 羽化半径（像素），边缘渐变透明 */
  feather: number;
  /** 四角采样块边长（像素） */
  cornerSampleSize?: number;
}

const DEFAULT_CORNER_SAMPLE_SIZE = 10;

/** 欧氏颜色距离 (0–255 范围) */
function colorDistance(
  r1: number,
  g1: number,
  b1: number,
  r2: number,
  g2: number,
  b2: number
): number {
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

/** 从四角采样，排除异常颜色，返回背景色中位数 */
function sampleBackgroundColor(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  channels: number,
  sampleSize: number
): { r: number; g: number; b: number } {
  const corners: [number, number][] = [
    [0, 0],
    [width - sampleSize, 0],
    [0, height - sampleSize],
    [width - sampleSize, height - sampleSize],
  ];
  const samples: { r: number; g: number; b: number }[] = [];

  for (const [cx, cy] of corners) {
    for (let dy = 0; dy < sampleSize; dy++) {
      for (let dx = 0; dx < sampleSize; dx++) {
        const x = Math.max(0, Math.min(width - 1, cx + dx));
        const y = Math.max(0, Math.min(height - 1, cy + dy));
        const i = (y * width + x) * channels;
        samples.push({
          r: data[i] ?? 0,
          g: data[i + 1] ?? 0,
          b: data[i + 2] ?? 0,
        });
      }
    }
  }

  // 排除异常：与中位数距离过大的点
  const medianR = samples.map((s) => s.r).sort((a, b) => a - b)[Math.floor(samples.length / 2)] ?? 128;
  const medianG = samples.map((s) => s.g).sort((a, b) => a - b)[Math.floor(samples.length / 2)] ?? 128;
  const medianB = samples.map((s) => s.b).sort((a, b) => a - b)[Math.floor(samples.length / 2)] ?? 128;
  const outlierThreshold = 80;
  const filtered = samples.filter(
    (s) =>
      colorDistance(s.r, s.g, s.b, medianR, medianG, medianB) <= outlierThreshold
  );
  const use = filtered.length > 0 ? filtered : samples;
  return {
    r: use.reduce((a, s) => a + s.r, 0) / use.length,
    g: use.reduce((a, s) => a + s.g, 0) / use.length,
    b: use.reduce((a, s) => a + s.b, 0) / use.length,
  };
}

/**  flood fill 从种子点开始，标记与背景色匹配且连通的像素 */
function floodFillBackground(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  channels: number,
  bg: { r: number; g: number; b: number },
  tolerance: number,
  mask: Uint8Array
): void {
  const stack: [number, number][] = [];
  const push = (x: number, y: number) => {
    if (x >= 0 && x < width && y >= 0 && y < height && mask[y * width + x] === 0) {
      const i = (y * width + x) * channels;
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      if (colorDistance(r, g, b, bg.r, bg.g, bg.b) <= tolerance) {
        mask[y * width + x] = 1;
        stack.push([x, y]);
      }
    }
  };

  // 从四角开始
  const seeds: [number, number][] = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ];
  for (const [sx, sy] of seeds) {
    push(sx, sy);
  }
  while (stack.length > 0) {
    const [x, y] = stack.pop()!;
    push(x - 1, y);
    push(x + 1, y);
    push(x, y - 1);
    push(x, y + 1);
  }
}

/** 非连续模式：所有匹配背景色的像素都标记 */
function markAllMatchingBackground(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  channels: number,
  bg: { r: number; g: number; b: number },
  tolerance: number,
  mask: Uint8Array
): void {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      if (colorDistance(r, g, b, bg.r, bg.g, bg.b) <= tolerance) {
        mask[y * width + x] = 1;
      }
    }
  }
}

/** 抗锯齿：边缘像素根据邻域混合 alpha，mask 0=主体 1=背景 */
function applyAntiAliasing(mask: Uint8Array, width: number, height: number): void {
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const v = mask[idx] ?? 0;
      const isBinary = v === 0 || v === 1;
      if (isBinary) {
        let neighborBg = 0;
        let neighborFg = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const nv = mask[ny * width + nx] ?? 0;
              if (nv > 0) neighborBg++;
              else neighborFg++;
            }
          }
        }
        const total = neighborBg + neighborFg;
        if (total > 0 && neighborBg > 0 && neighborFg > 0) {
          out[idx] = neighborBg / total;
        } else {
          out[idx] = v;
        }
      } else {
        out[idx] = v / 255;
      }
    }
  }
  for (let i = 0; i < mask.length; i++) {
    mask[i] = Math.round(out[i] * 255);
  }
}

/** 羽化：对 alpha 做模糊，边缘渐变 */
function applyFeather(
  mask: Uint8Array,
  width: number,
  height: number,
  radius: number
): void {
  if (radius <= 0) return;
  const r = Math.ceil(radius);
  const kernelSize = r * 2 + 1;
  const kernel: number[] = [];
  let sum = 0;
  for (let i = -r; i <= r; i++) {
    const v = Math.exp(-(i * i) / (2 * (radius / 2) ** 2));
    kernel.push(v);
    sum += v;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;

  const temp = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let v = 0;
      for (let k = -r; k <= r; k++) {
        const nx = Math.max(0, Math.min(width - 1, x + k));
        const idx = y * width + nx;
        v += (mask[idx] ?? 0) / 255 * kernel[k + r];
      }
      temp[y * width + x] = v;
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let v = 0;
      for (let k = -r; k <= r; k++) {
        const ny = Math.max(0, Math.min(height - 1, y + k));
        const idx = ny * width + x;
        v += temp[idx] * kernel[k + r];
      }
      mask[y * width + x] = Math.round(Math.max(0, Math.min(1, v)) * 255);
    }
  }
}

/** 将 mask 转为 alpha：mask=1 为背景(透明)，mask=0 为主体(不透明) */
function applyMaskToAlpha(
  data: Uint8ClampedArray,
  mask: Uint8Array,
  width: number,
  height: number,
  channels: number,
  antiAliasing: boolean,
  feather: number,
  options: InstantTransparencyOptions
): void {
  const w = width;
  const h = height;
  const alpha = new Uint8Array(w * h);

  for (let i = 0; i < w * h; i++) {
    const m = mask[i] ?? 0;
    alpha[i] = m > 0 ? 0 : 255;
  }

  if (antiAliasing) {
    applyAntiAliasing(mask, w, h);
    for (let i = 0; i < w * h; i++) {
      alpha[i] = 255 - (mask[i] ?? 0);
    }
  }

  if (feather > 0) {
    const featherMask = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) featherMask[i] = 255 - alpha[i];
    applyFeather(featherMask, w, h, feather);
    for (let i = 0; i < w * h; i++) alpha[i] = 255 - (featherMask[i] ?? 0);
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * channels;
      const a = alpha[y * w + x] ?? 255;
      if (channels >= 4) {
        data[i + 3] = a;
      }
    }
  }
}

/**
 * 对 ImageData 执行即时透明抠图
 */
export function applyInstantTransparency(
  imageData: ImageData,
  options: InstantTransparencyOptions
): ImageData {
  const { data, width, height } = imageData;
  const channels = data.length / (width * height);
  const sampleSize = Math.min(
    options.cornerSampleSize ?? DEFAULT_CORNER_SAMPLE_SIZE,
    Math.floor(width / 4),
    Math.floor(height / 4),
    10
  );

  const bg = sampleBackgroundColor(data, width, height, channels, sampleSize);
  const mask = new Uint8Array(width * height);

  if (options.contiguous) {
    floodFillBackground(data, width, height, channels, bg, options.tolerance, mask);
  } else {
    markAllMatchingBackground(data, width, height, channels, bg, options.tolerance, mask);
  }

  const outData = new Uint8ClampedArray(data);
  applyMaskToAlpha(outData, mask, width, height, channels, options.antiAliasing, options.feather, options);

  return new ImageData(outData, width, height);
}

const DEFAULT_OPTIONS: InstantTransparencyOptions = {
  tolerance: 30,
  contiguous: true,
  antiAliasing: true,
  feather: 0,
};

/** 加载 dataUrl 为 ImageData，确保 RGBA */
async function loadImageDataFromDataUrl(dataUrl: string): Promise<{ data: ImageData; width: number; height: number }> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('图片加载失败'));
    i.src = dataUrl;
  });
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建 Canvas 2D 上下文');
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { data: imageData, width: canvas.width, height: canvas.height };
}

/**
 * 从 dataUrl 加载图片，执行即时透明抠图，返回 PNG base64（不含 data: 前缀）
 */
export async function instantTransparencyFromDataUrl(
  dataUrl: string,
  options: Partial<InstantTransparencyOptions> = {}
): Promise<string> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { data: imageData } = await loadImageDataFromDataUrl(dataUrl);
  const result = applyInstantTransparency(imageData, opts);

  const canvas = document.createElement('canvas');
  canvas.width = result.width;
  canvas.height = result.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建 Canvas 2D 上下文');
  ctx.putImageData(result, 0, 0);

  const pngDataUrl = canvas.toDataURL('image/png');
  return pngDataUrl.replace(/^data:image\/png;base64,/, '');
}

/** 仅计算选区 mask，不修改原图。mask[i]=255 表示该像素将被设为透明 */
export async function computeInstantTransparencyMask(
  dataUrl: string,
  options: Partial<InstantTransparencyOptions> = {}
): Promise<{ mask: Uint8Array; width: number; height: number; bgColor: { r: number; g: number; b: number } }> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { data: imageData, width, height } = await loadImageDataFromDataUrl(dataUrl);
  const { data, width: w, height: h } = imageData;
  const channels = data.length / (w * h);
  const sampleSize = Math.min(
    opts.cornerSampleSize ?? DEFAULT_CORNER_SAMPLE_SIZE,
    Math.floor(w / 4),
    Math.floor(h / 4),
    10
  );

  const bg = sampleBackgroundColor(data, w, h, channels, sampleSize);
  const mask = new Uint8Array(w * h);

  if (opts.contiguous) {
    floodFillBackground(data, w, h, channels, bg, opts.tolerance, mask);
  } else {
    markAllMatchingBackground(data, w, h, channels, bg, opts.tolerance, mask);
  }

  if (opts.antiAliasing) {
    applyAntiAliasing(mask, w, h);
  }
  if (opts.feather > 0) {
    applyFeather(mask, w, h, opts.feather);
  }

  const outMask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    outMask[i] = mask[i] ?? 0;
  }
  return { mask: outMask, width: w, height: h, bgColor: bg };
}

/** 生成选区预览图：选区区域叠加半透明红色 */
export async function getInstantTransparencyPreviewDataUrl(
  dataUrl: string,
  options: Partial<InstantTransparencyOptions> = {}
): Promise<string> {
  const { mask, width, height } = await computeInstantTransparencyMask(dataUrl, options);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建 Canvas 2D 上下文');

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, width, height);
  const d = imageData.data;
  for (let i = 0; i < width * height; i++) {
    const m = mask[i] ?? 0;
    if (m > 0) {
      const j = i * 4;
      const t = m / 255;
      d[j] = Math.round((d[j] ?? 0) * (1 - t) + 255 * t);
      d[j + 1] = Math.round((d[j + 1] ?? 0) * (1 - t));
      d[j + 2] = Math.round((d[j + 2] ?? 0) * (1 - t));
      d[j + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}
