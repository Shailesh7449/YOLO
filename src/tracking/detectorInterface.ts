import { RawDetection } from '../types';

export interface DetectionItem {
  bbox: [number, number, number, number]; // [x1, y1, x2, y2]
  confidence: number;
  class_id: number;
  class_name: string; // strictly 'person' for crowd safety
}

export type DetectorStatus = 'READY' | 'LOADING' | 'NOT_READY';

export interface IPersonDetector {
  readonly id: string;
  readonly name: string;
  readonly modelFamily: 'YOLO26' | 'YOLOv8' | 'FALLBACK';
  readonly version: string;
  
  getStatus(): DetectorStatus;
  getAverageLatencyMs(): number;
  
  /**
   * Run real person inference on input frame source.
   * Scales coordinates to renderWidth x renderHeight.
   */
  detect(
    source: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
    renderWidth: number,
    renderHeight: number
  ): Promise<DetectionItem[]>;

  reset(): void;
}

export function detectionItemToRaw(item: DetectionItem): RawDetection {
  return [
    item.bbox[0],
    item.bbox[1],
    item.bbox[2],
    item.bbox[3],
    item.confidence,
    item.class_id,
  ];
}

export function rawToDetectionItem(raw: RawDetection): DetectionItem {
  return {
    bbox: [raw[0], raw[1], raw[2], raw[3]],
    confidence: raw[4],
    class_id: raw[5],
    class_name: raw[5] === 0 ? 'person' : 'object',
  };
}
