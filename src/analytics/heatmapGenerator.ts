import { ColormapName } from '../types';

export class HeatmapGenerator {
  width: number;
  height: number;
  blurKernel: number;
  colormap: ColormapName;
  alpha: number;

  // Float32 accumulation grid downscaled for performance (e.g., 1/4 or 1/2 scale, or 160x90)
  gridW: number;
  gridH: number;
  scaleX: number;
  scaleY: number;
  private grid: Float32Array;
  private maxDensity: number = 0;
  private offscreenCanvas: HTMLCanvasElement;
  private offscreenCtx: CanvasRenderingContext2D;

  constructor(
    width: number = 1280,
    height: number = 720,
    blurKernel: number = 25,
    colormap: ColormapName = 'HOT',
    alpha: number = 0.5
  ) {
    this.width = width;
    this.height = height;
    this.blurKernel = blurKernel % 2 === 0 ? blurKernel + 1 : blurKernel;
    this.colormap = colormap;
    this.alpha = alpha;

    // Density grid at 1/4 scale for super fast blur & accumulation
    this.gridW = Math.max(80, Math.floor(width / 4));
    this.gridH = Math.max(45, Math.floor(height / 4));
    this.scaleX = this.gridW / width;
    this.scaleY = this.gridH / height;
    this.grid = new Float32Array(this.gridW * this.gridH);

    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCanvas.width = this.gridW;
    this.offscreenCanvas.height = this.gridH;
    const ctx = this.offscreenCanvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2d context for heatmap');
    this.offscreenCtx = ctx;
  }

  setDimensions(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.gridW = Math.max(80, Math.floor(width / 4));
    this.gridH = Math.max(45, Math.floor(height / 4));
    this.scaleX = this.gridW / width;
    this.scaleY = this.gridH / height;
    this.grid = new Float32Array(this.gridW * this.gridH);
    this.offscreenCanvas.width = this.gridW;
    this.offscreenCanvas.height = this.gridH;
  }

  update(centroids: [number, number][]) {
    for (const [cx, cy] of centroids) {
      const gx = Math.min(this.gridW - 1, Math.max(0, Math.floor(cx * this.scaleX)));
      const gy = Math.min(this.gridH - 1, Math.max(0, Math.floor(cy * this.scaleY)));
      const idx = gy * this.gridW + gx;
      this.grid[idx] += 1.0;
      if (this.grid[idx] > this.maxDensity) {
        this.maxDensity = this.grid[idx];
      }
    }
  }

  addCentroids(centroids: [number, number][]) {
    this.update(centroids);
  }

  reset() {
    this.grid.fill(0);
    this.maxDensity = 0;
  }

  renderToCanvas(ctx: CanvasRenderingContext2D, targetWidth: number, targetHeight: number) {
    if (this.maxDensity <= 0) return;

    const imgData = this.offscreenCtx.createImageData(this.gridW, this.gridH);
    const data = imgData.data;

    // Colormap generation
    for (let y = 0; y < this.gridH; y++) {
      for (let x = 0; x < this.gridW; x++) {
        const val = this.grid[y * this.gridW + x];
        if (val > 0) {
          const norm = Math.min(1.0, val / Math.max(1, this.maxDensity));
          const [r, g, b] = this.sampleColormap(norm, this.colormap);
          const pIdx = (y * this.gridW + x) * 4;
          data[pIdx] = r;
          data[pIdx + 1] = g;
          data[pIdx + 2] = b;
          data[pIdx + 3] = Math.round(norm * 255 * this.alpha);
        }
      }
    }

    this.offscreenCtx.putImageData(imgData, 0, 0);

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.filter = `blur(${Math.max(2, Math.round(this.blurKernel / 2))}px)`;
    ctx.drawImage(this.offscreenCanvas, 0, 0, targetWidth, targetHeight);
    ctx.restore();
  }

  toDataURL(referenceCanvas?: HTMLCanvasElement): string {
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = this.width;
    exportCanvas.height = this.height;
    const ctx = exportCanvas.getContext('2d')!;

    if (referenceCanvas) {
      ctx.drawImage(referenceCanvas, 0, 0, this.width, this.height);
    } else {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, this.width, this.height);
    }

    this.renderToCanvas(ctx, this.width, this.height);
    return exportCanvas.toDataURL('image/png');
  }

  private sampleColormap(norm: number, colormap: ColormapName): [number, number, number] {
    const t = Math.max(0, Math.min(1, norm));

    switch (colormap) {
      case 'HOT': {
        // Black -> Red -> Orange -> Yellow -> White
        if (t < 0.33) {
          return [Math.round((t / 0.33) * 255), 0, 0];
        } else if (t < 0.66) {
          const s = (t - 0.33) / 0.33;
          return [255, Math.round(s * 200), 0];
        } else {
          const s = (t - 0.66) / 0.34;
          return [255, 200 + Math.round(s * 55), Math.round(s * 255)];
        }
      }
      case 'JET': {
        // Blue -> Cyan -> Green -> Yellow -> Red
        const r = Math.max(0, Math.min(1, 1.5 - Math.abs(t * 4 - 3)));
        const g = Math.max(0, Math.min(1, 1.5 - Math.abs(t * 4 - 2)));
        const b = Math.max(0, Math.min(1, 1.5 - Math.abs(t * 4 - 1)));
        return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
      }
      case 'INFERNO': {
        // Black -> Purple -> Bright Orange -> Pale Yellow
        const r = Math.round(Math.min(255, Math.max(0, 255 * (1.2 * t))));
        const g = Math.round(Math.min(255, Math.max(0, 255 * (t > 0.4 ? (t - 0.4) * 1.6 : 0))));
        const b = Math.round(Math.min(255, Math.max(0, 255 * (t < 0.3 ? t * 2.5 : (1 - t) * 1.2))));
        return [r, g, b];
      }
      case 'PLASMA': {
        // Blue-purple -> Magenta -> Orange -> Yellow
        const r = Math.round(255 * Math.sin(t * Math.PI * 0.5));
        const g = Math.round(255 * Math.pow(t, 2));
        const b = Math.round(255 * (1 - t * 0.8));
        return [r, g, b];
      }
      case 'TURBO': {
        // Smooth Google Turbo colormap approximation
        const r = Math.round(255 * Math.min(1, Math.max(0, 0.13 + 3.9 * t - 3.2 * t * t)));
        const g = Math.round(255 * Math.min(1, Math.max(0, 0.05 + 2.5 * t - 1.5 * t * t)));
        const b = Math.round(255 * Math.min(1, Math.max(0, 0.62 + 0.8 * t - 2.8 * t * t)));
        return [r, g, b];
      }
      case 'VIRIDIS':
      default: {
        // Purple -> Teal -> Green -> Yellow
        const r = Math.round(255 * (0.27 + 0.7 * t * t));
        const g = Math.round(255 * (0.0 + 0.9 * t));
        const b = Math.round(255 * (0.33 + 0.6 * (1 - t)));
        return [r, g, b];
      }
    }
  }
}
