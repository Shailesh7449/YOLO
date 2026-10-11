import { OpticalFlowResult, OpticalFlowVector } from '../types';

export class DenseOpticalFlow {
  private prevGray: Uint8Array | null = null;
  private width: number = 0;
  private height: number = 0;
  private step: number;
  private offscreenCanvas: HTMLCanvasElement;
  private offscreenCtx: CanvasRenderingContext2D | null;

  constructor(step: number = 24) {
    this.step = step;
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: true });
  }

  public reset() {
    this.prevGray = null;
    this.width = 0;
    this.height = 0;
  }

  /**
   * Computes dense optical flow vector field between current video frame and previous frame
   */
  public compute(
    source: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
    targetWidth: number = 320,
    targetHeight: number = 180
  ): OpticalFlowResult {
    if (!this.offscreenCtx) {
      return this.emptyResult();
    }

    if (this.width !== targetWidth || this.height !== targetHeight) {
      this.width = targetWidth;
      this.height = targetHeight;
      this.offscreenCanvas.width = targetWidth;
      this.offscreenCanvas.height = targetHeight;
      this.prevGray = null;
    }

    // 1. Render frame downscaled for high-speed motion field computation
    this.offscreenCtx.drawImage(source, 0, 0, this.width, this.height);
    const imgData = this.offscreenCtx.getImageData(0, 0, this.width, this.height);
    const data = imgData.data;

    // 2. Convert to Grayscale luminance
    const currentGray = new Uint8Array(this.width * this.height);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      currentGray[j] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    }

    // If first frame, save and return initial zero motion
    if (!this.prevGray) {
      this.prevGray = currentGray;
      return this.emptyResult();
    }

    const vectors: OpticalFlowVector[] = [];
    let sumU = 0;
    let sumV = 0;
    let sumMag = 0;
    const halfWin = 3;
    const w = this.width;
    const h = this.height;

    // 3. Regularized Lucas-Kanade on spatial grid
    for (let y = this.step; y < h - this.step; y += this.step) {
      for (let x = this.step; x < w - this.step; x += this.step) {
        let Sxx = 0, Sxy = 0, Syy = 0, Sxt = 0, Syt = 0;

        for (let wy = -halfWin; wy <= halfWin; wy++) {
          const cy = y + wy;
          const rowOffset = cy * w;
          for (let wx = -halfWin; wx <= halfWin; wx++) {
            const cx = x + wx;
            const idx = rowOffset + cx;

            // Spatial and temporal gradients
            const Ix = (this.prevGray[idx + 1] - this.prevGray[idx - 1]) * 0.5;
            const Iy = (this.prevGray[idx + w] - this.prevGray[idx - w]) * 0.5;
            const It = currentGray[idx] - this.prevGray[idx];

            Sxx += Ix * Ix;
            Sxy += Ix * Iy;
            Syy += Iy * Iy;
            Sxt += Ix * It;
            Syt += Iy * It;
          }
        }

        // Tikhonov regularizer for numerical stability
        const lambda = 4.0;
        const det = (Sxx + lambda) * (Syy + lambda) - Sxy * Sxy;

        if (det > 1e-4) {
          const u = (Sxy * Syt - (Syy + lambda) * Sxt) / det;
          const v = (Sxy * Sxt - (Sxx + lambda) * Syt) / det;
          const mag = Math.sqrt(u * u + v * v);

          if (mag > 0.3) {
            vectors.push({
              x: Math.round(x),
              y: Math.round(y),
              u: Math.round(u * 10) / 10,
              v: Math.round(v * 10) / 10,
              magnitude: Math.round(mag * 10) / 10,
            });
            sumU += u;
            sumV += v;
            sumMag += mag;
          }
        }
      }
    }

    this.prevGray = currentGray;

    const count = vectors.length;
    if (count === 0) {
      return this.emptyResult();
    }

    const avgU = Math.round((sumU / count) * 10) / 10;
    const avgV = Math.round((sumV / count) * 10) / 10;
    const avgMag = sumMag / count;

    // Motion score normalized between 0.00 and 1.00
    const motionScore = Math.min(1.0, Math.round((avgMag / 12.0) * 100) / 100);

    return {
      motionScore,
      averageMotion: [avgU, avgV],
      motionRegions: [],
      gridVectors: vectors,
    };
  }

  private emptyResult(): OpticalFlowResult {
    return {
      motionScore: 0,
      averageMotion: [0, 0],
      motionRegions: [],
      gridVectors: [],
    };
  }
}
