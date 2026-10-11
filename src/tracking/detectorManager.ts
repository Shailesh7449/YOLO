import { IPersonDetector, DetectionItem, DetectorStatus } from './detectorInterface';
import { YOLO26Detector } from './yolo26Detector';
import { CocoSsdFallbackDetector } from './cocoSsdFallbackDetector';

export class DetectorManager {
  private activeDetector: IPersonDetector;
  private yolo26n: YOLO26Detector;
  private yolo26s: YOLO26Detector;
  private fallback: CocoSsdFallbackDetector;
  private selectedVariant: 'yolo26n' | 'yolo26s' | 'fallback' = 'yolo26n';

  constructor() {
    this.yolo26n = new YOLO26Detector('yolo26n');
    this.yolo26s = new YOLO26Detector('yolo26s');
    this.fallback = new CocoSsdFallbackDetector();
    this.activeDetector = this.yolo26n;
  }

  async init(): Promise<boolean> {
    console.log('[VisionSense] Initializing primary detector: YOLO26n ONNX...');
    const ok = await this.yolo26n.init();
    if (ok) {
      this.activeDetector = this.yolo26n;
      this.selectedVariant = 'yolo26n';
      return true;
    }

    console.warn('[VisionSense] YOLO26n unavailable, falling back to COCO-SSD MobileNetV2...');
    const fallbackOk = await this.fallback.init();
    if (fallbackOk) {
      this.activeDetector = this.fallback;
      this.selectedVariant = 'fallback';
      return true;
    }

    return false;
  }

  async setModel(variant: 'yolo26n' | 'yolo26s' | 'fallback'): Promise<boolean> {
    this.selectedVariant = variant;
    if (variant === 'yolo26n') {
      await this.yolo26n.init();
      this.activeDetector = this.yolo26n;
    } else if (variant === 'yolo26s') {
      await this.yolo26s.init();
      this.activeDetector = this.yolo26s;
    } else {
      await this.fallback.init();
      this.activeDetector = this.fallback;
    }
    return this.activeDetector.getStatus() === 'READY';
  }

  getActiveDetector(): IPersonDetector {
    return this.activeDetector;
  }

  getSelectedVariant(): 'yolo26n' | 'yolo26s' | 'fallback' {
    return this.selectedVariant;
  }

  getStatus(): DetectorStatus {
    return this.activeDetector.getStatus();
  }

  getAverageLatencyMs(): number {
    return this.activeDetector.getAverageLatencyMs();
  }

  async detect(
    source: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
    renderWidth: number,
    renderHeight: number
  ): Promise<DetectionItem[]> {
    return this.activeDetector.detect(source, renderWidth, renderHeight);
  }

  reset(): void {
    this.yolo26n.reset();
    this.yolo26s.reset();
    this.fallback.reset();
  }
}

// Export singleton instance
export const detectorManager = new DetectorManager();
