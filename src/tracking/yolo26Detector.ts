import * as ort from 'onnxruntime-web';
import { IPersonDetector, DetectionItem, DetectorStatus } from './detectorInterface';

export class YOLO26Detector implements IPersonDetector {
  readonly id: string;
  readonly name: string;
  readonly modelFamily = 'YOLO26';
  readonly version = '26.0.0-ONNX';

  private session: ort.InferenceSession | null = null;
  private status: DetectorStatus = 'NOT_READY';
  private modelPath: string;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private inputWidth = 640;
  private inputHeight = 640;
  private latencySamples: number[] = [];

  constructor(modelVariant: 'yolo26n' | 'yolo26s' = 'yolo26n') {
    this.id = modelVariant;
    this.name = modelVariant === 'yolo26n' ? 'Ultralytics YOLO26n ONNX' : 'Ultralytics YOLO26s ONNX';
    this.modelPath = `/models/${modelVariant}.onnx`;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.inputWidth;
    this.canvas.height = this.inputHeight;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
  }

  async init(): Promise<boolean> {
    if (this.session) return true;
    this.status = 'LOADING';

    try {
      // Configure ONNX Runtime Web options
      ort.env.wasm.wasmPaths = '/';
      const isCrossIsolated = typeof window !== 'undefined' && Boolean(window.crossOriginIsolated);
      if (isCrossIsolated && typeof SharedArrayBuffer !== 'undefined') {
        ort.env.wasm.numThreads = Math.min(navigator.hardwareConcurrency || 4, 4);
      } else {
        // Essential for sandboxed iframes without SharedArrayBuffer
        ort.env.wasm.numThreads = 1;
      }
      ort.env.wasm.simd = true;

      this.session = await ort.InferenceSession.create(this.modelPath, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      });

      this.status = 'READY';
      console.log(`[VisionSense] ${this.name} initialized successfully.`);
      return true;
    } catch (err: any) {
      console.warn(`[VisionSense] ${this.name} failed to initialize:`, err?.message || err);
      this.status = 'NOT_READY';
      this.session = null;
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
    if (!this.session || this.status !== 'READY' || !this.ctx) {
      return [];
    }

    const startTime = performance.now();

    try {
      // 1. Draw input to 640x640 canvas with aspect-ratio preserving letterboxing
      const srcW = (source as any).videoWidth || (source as any).naturalWidth || (source as any).width || renderWidth;
      const srcH = (source as any).videoHeight || (source as any).naturalHeight || (source as any).height || renderHeight;

      const scale = Math.min(this.inputWidth / srcW, this.inputHeight / srcH);
      const scaledW = Math.round(srcW * scale);
      const scaledH = Math.round(srcH * scale);
      const padX = (this.inputWidth - scaledW) / 2;
      const padY = (this.inputHeight - scaledH) / 2;

      this.ctx.fillStyle = '#000000';
      this.ctx.fillRect(0, 0, this.inputWidth, this.inputHeight);
      this.ctx.drawImage(source, padX, padY, scaledW, scaledH);
      const imageData = this.ctx.getImageData(0, 0, this.inputWidth, this.inputHeight);
      const { data } = imageData;

      // 2. Preprocess: Normalize to [1, 3, 640, 640] CHW RGB float32
      const float32Data = new Float32Array(3 * this.inputWidth * this.inputHeight);
      const channelStride = this.inputWidth * this.inputHeight;

      for (let i = 0; i < channelStride; i++) {
        const r = data[i * 4] / 255.0;
        const g = data[i * 4 + 1] / 255.0;
        const b = data[i * 4 + 2] / 255.0;

        float32Data[i] = r;
        float32Data[channelStride + i] = g;
        float32Data[channelStride * 2 + i] = b;
      }

      const inputTensor = new ort.Tensor('float32', float32Data, [1, 3, this.inputHeight, this.inputWidth]);
      const inputNames = this.session.inputNames;
      const feeds: Record<string, ort.Tensor> = {};
      feeds[inputNames[0]] = inputTensor;

      // 3. Run inference
      const results = await this.session.run(feeds);

      const detections: DetectionItem[] = [];
      const CONFIDENCE_THRESHOLD = 0.35;

      // Case 1: DETR / RT-DETR architecture (e.g. YOLO26n with logits [1, 300, 80] and pred_boxes [1, 300, 4])
      if (results.logits && results.pred_boxes) {
        const logitsTensor = results.logits;
        const boxesTensor = results.pred_boxes;
        const logitsData = logitsTensor.data as Float32Array;
        const boxesData = boxesTensor.data as Float32Array;

        const numQueries = logitsTensor.dims[1] || 300;
        const numClasses = logitsTensor.dims[2] || 80;

        for (let i = 0; i < numQueries; i++) {
          // Class 0 in COCO dataset is strictly 'person'
          const logit = logitsData[i * numClasses + 0];
          const conf = 1 / (1 + Math.exp(-logit)); // Sigmoid activation

          if (conf >= CONFIDENCE_THRESHOLD) {
            const boxOffset = i * 4;
            const cx_640 = boxesData[boxOffset] * this.inputWidth;
            const cy_640 = boxesData[boxOffset + 1] * this.inputHeight;
            const w_640 = boxesData[boxOffset + 2] * this.inputWidth;
            const h_640 = boxesData[boxOffset + 3] * this.inputHeight;

            // Invert letterbox padding and scale back to render dimensions
            const renderScale = Math.min(renderWidth / srcW, renderHeight / srcH);
            const origCx = (cx_640 - padX) / scale;
            const origCy = (cy_640 - padY) / scale;
            const origW = w_640 / scale;
            const origH = h_640 / scale;

            const x1 = Math.max(0, (origCx - origW / 2) * (renderWidth / srcW));
            const y1 = Math.max(0, (origCy - origH / 2) * (renderHeight / srcH));
            const x2 = Math.min(renderWidth, (origCx + origW / 2) * (renderWidth / srcW));
            const y2 = Math.min(renderHeight, (origCy + origH / 2) * (renderHeight / srcH));

            if (x2 > x1 + 4 && y2 > y1 + 4) {
              detections.push({
                bbox: [Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2)],
                confidence: Math.round(conf * 100) / 100,
                class_id: 0,
                class_name: 'person',
              });
            }
          }
        }
      }
      // Case 2: Output0 tensor (e.g. YOLO26s with [1, 300, 6] or standard YOLO)
      else {
        const outputNames = this.session.outputNames;
        const outputTensor = results[outputNames[0]];
        if (!outputTensor) return [];

        const outputData = outputTensor.data as Float32Array;
        const dims = outputTensor.dims; // e.g. [1, 300, 6] or [1, 84, 8400]

        const scaleX = renderWidth / this.inputWidth;
        const scaleY = renderHeight / this.inputHeight;

        // End-to-End NMS-free format [1, N, 6] where each is [x1, y1, x2, y2, score, class_id]
        if (dims.length === 3 && dims[2] === 6) {
          const numDetections = dims[1];
          for (let i = 0; i < numDetections; i++) {
            const offset = i * 6;
            const conf = outputData[offset + 4];
            const classId = Math.round(outputData[offset + 5]);

            // STRICTLY PERSON CLASS ONLY (class_id === 0)
            if (classId === 0 && conf >= CONFIDENCE_THRESHOLD) {
              const x1 = Math.max(0, outputData[offset] * scaleX);
              const y1 = Math.max(0, outputData[offset + 1] * scaleY);
              const x2 = Math.min(renderWidth, outputData[offset + 2] * scaleX);
              const y2 = Math.min(renderHeight, outputData[offset + 3] * scaleY);

              if (x2 > x1 && y2 > y1) {
                detections.push({
                  bbox: [x1, y1, x2, y2],
                  confidence: Math.round(conf * 100) / 100,
                  class_id: 0,
                  class_name: 'person',
                });
              }
            }
          }
        } 
        // Standard YOLO format [1, 84, 8400] or [1, 8400, 84]
        else if (dims.length === 3) {
          let numBoxes = 8400;
          let numAttributes = 84;
          let isTransposed = false;

          if (dims[1] === 84 && dims[2] === 8400) {
            numAttributes = 84;
            numBoxes = 8400;
            isTransposed = false;
          } else if (dims[1] === 8400 && dims[2] === 84) {
            numBoxes = 8400;
            numAttributes = 84;
            isTransposed = true;
          } else {
            numBoxes = dims[1];
            numAttributes = dims[2];
            isTransposed = true;
          }

          for (let i = 0; i < numBoxes; i++) {
            let cx = 0, cy = 0, w = 0, h = 0, personScore = 0;

            if (isTransposed) {
              const base = i * numAttributes;
              cx = outputData[base];
              cy = outputData[base + 1];
              w = outputData[base + 2];
              h = outputData[base + 3];
              personScore = outputData[base + 4]; // class 0 is person
            } else {
              cx = outputData[i];
              cy = outputData[numBoxes + i];
              w = outputData[numBoxes * 2 + i];
              h = outputData[numBoxes * 3 + i];
              personScore = outputData[numBoxes * 4 + i]; // class 0 is person
            }

            if (personScore >= CONFIDENCE_THRESHOLD) {
              const x1 = Math.max(0, (cx - w / 2) * scaleX);
              const y1 = Math.max(0, (cy - h / 2) * scaleY);
              const x2 = Math.min(renderWidth, (cx + w / 2) * scaleX);
              const y2 = Math.min(renderHeight, (cy + h / 2) * scaleY);

              if (x2 > x1 && y2 > y1) {
                detections.push({
                  bbox: [x1, y1, x2, y2],
                  confidence: Math.round(personScore * 100) / 100,
                  class_id: 0,
                  class_name: 'person',
                });
              }
            }
          }
        }
      }

      const elapsed = performance.now() - startTime;
      this.latencySamples.push(elapsed);
      if (this.latencySamples.length > 30) this.latencySamples.shift();

      return detections;
    } catch (err: any) {
      console.warn(`[VisionSense] Inference error in ${this.name}:`, err?.message || err);
      return [];
    }
  }

  reset(): void {
    this.latencySamples = [];
  }
}
