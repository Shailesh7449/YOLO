import * as cocoSsd from '@tensorflow-models/coco-ssd';
import '@tensorflow/tfjs';
import { IPersonDetector, DetectionItem, DetectorStatus } from './detectorInterface';

export class CocoSsdFallbackDetector implements IPersonDetector {
  readonly id = 'coco-ssd-mobilenet';
  readonly name = 'MobileNetV2 COCO-SSD (Fallback)';
  readonly modelFamily = 'FALLBACK';
  readonly version = '2.2.3';

  private model: cocoSsd.ObjectDetection | null = null;
  private status: DetectorStatus = 'NOT_READY';
  private latencySamples: number[] = [];

  async init(): Promise<boolean> {
    if (this.model) return true;
    this.status = 'LOADING';

    try {
      this.model = await cocoSsd.load({ base: 'mobilenet_v2' });
      this.status = 'READY';
      console.log(`[VisionSense] ${this.name} initialized successfully.`);
      return true;
    } catch (err: any) {
      console.warn(`[VisionSense] ${this.name} failed to load:`, err?.message || err);
      this.status = 'NOT_READY';
      return false;
    }
  }

  getStatus(): DetectorStatus {
    return this.status;
  }

  getAverageLatencyMs(): number {
    if (this.latencySamples.length === 0) return 0;
    const sum = this.latencySamples.reduce((a, b) => a + b, 0);
    return Math.round(sum / this.latencySamples.length);
  }

  async detect(
    source: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
    renderWidth: number,
    renderHeight: number
  ): Promise<DetectionItem[]> {
    if (!this.model || this.status !== 'READY') return [];

    const startTime = performance.now();

    try {
      const predictions = await this.model.detect(source);
      const detections: DetectionItem[] = [];

      // Source dimensions
      let srcW = renderWidth;
      let srcH = renderHeight;
      if (source instanceof HTMLVideoElement && source.videoWidth) {
        srcW = source.videoWidth;
        srcH = source.videoHeight;
      } else if (source instanceof HTMLCanvasElement) {
        srcW = source.width;
        srcH = source.height;
      }

      const scaleX = renderWidth / srcW;
      const scaleY = renderHeight / srcH;

      for (const pred of predictions) {
        // STRICTLY PERSON CLASS ONLY
        if (pred.class === 'person' && pred.score >= 0.35) {
          const [px, py, pw, ph] = pred.bbox;
          const x1 = Math.max(0, px * scaleX);
          const y1 = Math.max(0, py * scaleY);
          const x2 = Math.min(renderWidth, (px + pw) * scaleX);
          const y2 = Math.min(renderHeight, (py + ph) * scaleY);

          if (x2 > x1 && y2 > y1) {
            detections.push({
              bbox: [x1, y1, x2, y2],
              confidence: Math.round(pred.score * 100) / 100,
              class_id: 0,
              class_name: 'person',
            });
          }
        }
      }

      const elapsed = performance.now() - startTime;
      this.latencySamples.push(elapsed);
      if (this.latencySamples.length > 30) this.latencySamples.shift();

      return detections;
    } catch (err: any) {
      console.warn(`[VisionSense] Detection error in ${this.name}:`, err?.message || err);
      return [];
    }
  }

  reset(): void {
    this.latencySamples = [];
  }
}
