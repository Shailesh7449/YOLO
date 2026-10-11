import { RawDetection } from '../types';

export class VideoMotionDetector {
  private prevFrameData: Uint8ClampedArray | null = null;
  private width: number = 0;
  private height: number = 0;
  private offscreenCanvas: HTMLCanvasElement;
  private offscreenCtx: CanvasRenderingContext2D;

  constructor() {
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: true })!;
  }

  detect(videoEl: HTMLVideoElement, renderWidth: number, renderHeight: number): RawDetection[] {
    if (videoEl.readyState < 2 || videoEl.videoWidth === 0) {
      return [];
    }

    // Downscale for fast motion differencing
    const sampleW = 160;
    const sampleH = 90;

    if (this.offscreenCanvas.width !== sampleW || this.offscreenCanvas.height !== sampleH) {
      this.offscreenCanvas.width = sampleW;
      this.offscreenCanvas.height = sampleH;
      this.width = sampleW;
      this.height = sampleH;
      this.prevFrameData = null;
    }

    this.offscreenCtx.drawImage(videoEl, 0, 0, sampleW, sampleH);
    const frame = this.offscreenCtx.getImageData(0, 0, sampleW, sampleH);
    const data = frame.data;

    const detections: RawDetection[] = [];

    if (this.prevFrameData) {
      const diffGrid: boolean[] = new Array(sampleW * sampleH).fill(false);
      const threshold = 32;

      for (let i = 0; i < data.length; i += 4) {
        const rDiff = Math.abs(data[i] - this.prevFrameData[i]);
        const gDiff = Math.abs(data[i + 1] - this.prevFrameData[i + 1]);
        const bDiff = Math.abs(data[i + 2] - this.prevFrameData[i + 2]);
        const grayDiff = (rDiff + gDiff + bDiff) / 3;

        if (grayDiff > threshold) {
          diffGrid[i / 4] = true;
        }
      }

      // Cluster active cells into bounding boxes
      const visited = new Uint8Array(sampleW * sampleH);
      const scaleX = renderWidth / sampleW;
      const scaleY = renderHeight / sampleH;

      for (let y = 0; y < sampleH; y += 2) {
        for (let x = 0; x < sampleW; x += 2) {
          const idx = y * sampleW + x;
          if (diffGrid[idx] && !visited[idx]) {
            // BFS connected components
            let minX = x;
            let maxX = x;
            let minY = y;
            let maxY = y;
            let count = 0;

            const queue: [number, number][] = [[x, y]];
            visited[idx] = 1;

            while (queue.length > 0 && queue.length < 500) {
              const [qx, qy] = queue.pop()!;
              count++;
              if (qx < minX) minX = qx;
              if (qx > maxX) maxX = qx;
              if (qy < minY) minY = qy;
              if (qy > maxY) maxY = qy;

              const neighbors: [number, number][] = [
                [qx + 2, qy],
                [qx - 2, qy],
                [qx, qy + 2],
                [qx, qy - 2],
              ];

              for (const [nx, ny] of neighbors) {
                if (nx >= 0 && nx < sampleW && ny >= 0 && ny < sampleH) {
                  const nIdx = ny * sampleW + nx;
                  if (diffGrid[nIdx] && !visited[nIdx]) {
                    visited[nIdx] = 1;
                    queue.push([nx, ny]);
                  }
                }
              }
            }

            const boxW = maxX - minX;
            const boxH = maxY - minY;
            const area = boxW * boxH;

            // Only significant motion patches
            if (count >= 15 && area >= 80 && boxW > 8 && boxH > 12) {
              const padX = 4;
              const padY = 4;
              const x1 = Math.max(0, (minX - padX) * scaleX);
              const y1 = Math.max(0, (minY - padY) * scaleY);
              const x2 = Math.min(renderWidth, (maxX + padX) * scaleX);
              const y2 = Math.min(renderHeight, (maxY + padY) * scaleY);

              // Aspect ratio heuristic: taller is person (0), wider is vehicle (2)
              const aspectRatio = (y2 - y1) / Math.max(1, x2 - x1);
              const classId = aspectRatio > 1.2 ? 0 : 2;
              const conf = Math.min(0.95, Math.max(0.45, count / 120));

              detections.push([x1, y1, x2, y2, conf, classId]);
            }
          }
        }
      }
    }

    this.prevFrameData = new Uint8ClampedArray(data);
    return detections;
  }

  reset() {
    this.prevFrameData = null;
  }
}
