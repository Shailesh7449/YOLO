import * as cocoSsd from '@tensorflow-models/coco-ssd';
import '@tensorflow/tfjs';
import { RawDetection } from '../types';

/**
 * ML Model: YOLO / COCO-SSD Real In-Browser Person Detector
 * 
 * Executes real neural network inference directly on video frames,
 * filtering strictly for 'person' (Class ID: 0) with real bounding boxes
 * and confidence scores.
 */
export class YoloPersonDetector {
  private model: cocoSsd.ObjectDetection | null = null;
  private isLoading: boolean = false;
  private isReady: boolean = false;
  private loadError: string | null = null;
  private isDetecting: boolean = false;
  private cachedDetections: RawDetection[] = [];

  constructor() {
    this.initModel();
  }

  async initModel() {
    if (this.model || this.isLoading) return;
    this.isLoading = true;
    try {
      // Load lite mobilenet_v2 based COCO-SSD for fast in-browser inference
      this.model = await cocoSsd.load({ base: 'mobilenet_v2' });
      this.isReady = true;
      this.isLoading = false;
    } catch (err: any) {
      console.warn('[YOLO Detector] Failed to load browser COCO-SSD model:', err);
      this.loadError = err?.message || 'Model load failed';
      this.isLoading = false;
    }
  }

  getStatus(): 'READY' | 'LOADING' | 'NOT_READY' {
    if (this.isReady) return 'READY';
    if (this.isLoading) return 'LOADING';
    return 'NOT_READY';
  }

  /**
   * Run real neural person detection on the input video/canvas/image
   */
  async detect(
    source: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
    renderWidth: number,
    renderHeight: number
  ): Promise<RawDetection[]> {
    if (!this.model || !this.isReady) {
      return this.cachedDetections;
    }

    if (this.isDetecting) {
      return this.cachedDetections;
    }

    try {
      this.isDetecting = true;
      const predictions = await this.model.detect(source);
      this.isDetecting = false;

      // Filter strictly for class 'person'
      const personDetections: RawDetection[] = [];

      for (const pred of predictions) {
        if (pred.class.toLowerCase() === 'person' && pred.score >= 0.3) {
          const [bx, by, bw, bh] = pred.bbox;

          // Scale coordinates to target render dimensions if necessary
          const sourceW =
            'videoWidth' in source && source.videoWidth > 0
              ? source.videoWidth
              : 'naturalWidth' in source && source.naturalWidth > 0
              ? source.naturalWidth
              : source.width;
          const sourceH =
            'videoHeight' in source && source.videoHeight > 0
              ? source.videoHeight
              : 'naturalHeight' in source && source.naturalHeight > 0
              ? source.naturalHeight
              : source.height;

          const scaleX = sourceW > 0 ? renderWidth / sourceW : 1;
          const scaleY = sourceH > 0 ? renderHeight / sourceH : 1;

          const x1 = Math.max(0, bx * scaleX);
          const y1 = Math.max(0, by * scaleY);
          const x2 = Math.min(renderWidth, (bx + bw) * scaleX);
          const y2 = Math.min(renderHeight, (by + bh) * scaleY);

          // Format: [x1, y1, x2, y2, conf, classId 0 = Person]
          personDetections.push([x1, y1, x2, y2, Number(pred.score.toFixed(2)), 0]);
        }
      }

      this.cachedDetections = personDetections;
      return personDetections;
    } catch (err) {
      this.isDetecting = false;
      return this.cachedDetections;
    }
  }

  reset() {
    this.cachedDetections = [];
    this.isDetecting = false;
  }
}
