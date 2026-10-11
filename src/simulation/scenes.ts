import { RawDetection } from '../types';

export interface SceneEntity {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  classId: number;
  confidence: number;
  baseX?: number;
  baseY?: number;
  phase?: number;
}

export interface SimulationScene {
  id: string;
  name: string;
  description: string;
  background: (ctx: CanvasRenderingContext2D, width: number, height: number, frame: number) => void;
  update: (width: number, height: number, frame: number) => RawDetection[];
  reset: () => void;
}

/**
 * CCTV Concourse Scene: Normal Crowd Density (14 People)
 * Tests people_count <= 20 -> NORMAL (Green)
 */
export function createCctvNormalCrowdScene(width: number, height: number): SimulationScene {
  const peopleCount = 14;
  const entities: SceneEntity[] = [];

  const init = () => {
    entities.length = 0;
    // Deterministic positions and trajectories
    for (let i = 0; i < peopleCount; i++) {
      const row = Math.floor(i / 5);
      const col = i % 5;
      const baseX = (col + 1) * (width / 6);
      const baseY = (row + 1) * (height / 4);
      const angle = (i * 0.45) % (Math.PI * 2);
      const speed = 1.2 + (i % 3) * 0.4;

      entities.push({
        id: i + 1,
        x: baseX,
        y: baseY,
        baseX,
        baseY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        w: 38 + (i % 4) * 3,
        h: 74 + (i % 4) * 4,
        classId: 0, // Person
        confidence: 0.86 + (i % 5) * 0.02,
        phase: i * 1.3,
      });
    }
  };

  init();

  return {
    id: 'cctv_normal',
    name: 'CCTV Feed 01: Concourse (Normal Density, 14 People)',
    description: 'Indoor CCTV surveillance feed of an airport concourse with 14 pedestrians (Capacity <= 20: NORMAL).',
    reset: init,
    background: (ctx, w, h) => {
      // Modern security tiled floor
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, w, h);

      // Floor tiles grid
      ctx.strokeStyle = 'rgba(51, 65, 85, 0.4)';
      ctx.lineWidth = 1;
      const tileSize = 60;
      for (let x = 0; x < w; x += tileSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = 0; y < h; y += tileSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }

      // Security zone corridor markers
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.2)';
      ctx.lineWidth = 2;
      ctx.strokeRect(40, 40, w - 80, h - 80);

      // CCTV Camera overlay stamp
      ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
      ctx.font = '11px monospace';
      ctx.fillText('CAM 01 - CONCOURSE MAIN [30 FPS - 1080p]', 48, 62);
    },
    update: (w, h, frame) => {
      const detections: RawDetection[] = [];

      for (let i = 0; i < entities.length; i++) {
        const e = entities[i];
        const phase = (e.phase || 0) + frame * 0.02;

        // Smooth continuous walking path
        e.x = (e.baseX || 200) + Math.sin(phase) * 120 + (e.vx * frame * 0.4) % (w * 0.6);
        e.y = (e.baseY || 200) + Math.cos(phase * 0.8) * 80;

        // Wrap around bounds
        if (e.x < 30) e.x = w - 60;
        if (e.x > w - 50) e.x = 40;
        if (e.y < 50) e.y = h - 100;
        if (e.y > h - 90) e.y = 60;

        const x1 = Math.max(0, e.x);
        const y1 = Math.max(0, e.y);
        const x2 = Math.min(w, e.x + e.w);
        const y2 = Math.min(h, e.y + e.h);

        detections.push([x1, y1, x2, y2, e.confidence, 0]);
      }

      return detections;
    },
  };
}

/**
 * CCTV Surge Scene: High Crowd Density (23 People)
 * Tests people_count > 20 -> WARNING (Yellow)
 */
export function createCctvSurgeCrowdScene(width: number, height: number): SimulationScene {
  const peopleCount = 23; // Exactly > 20 -> triggers WARNING
  const entities: SceneEntity[] = [];

  const init = () => {
    entities.length = 0;
    for (let i = 0; i < peopleCount; i++) {
      const row = Math.floor(i / 6);
      const col = i % 6;
      const baseX = (col + 1) * (width / 7);
      const baseY = (row + 1) * (height / 5);
      const angle = (i * 0.55) % (Math.PI * 2);
      const speed = 1.4 + (i % 3) * 0.5;

      entities.push({
        id: i + 1,
        x: baseX,
        y: baseY,
        baseX,
        baseY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        w: 36 + (i % 4) * 2,
        h: 72 + (i % 4) * 3,
        classId: 0, // Person
        confidence: 0.84 + (i % 5) * 0.02,
        phase: i * 1.1,
      });
    }
  };

  init();

  return {
    id: 'cctv_surge',
    name: 'CCTV Feed 02: Transit Gate (Elevated Density, 23 People)',
    description: 'High-density gate exit with 23 pedestrians traversing security line (Capacity > 20: WARNING).',
    reset: init,
    background: (ctx, w, h) => {
      // Dark surveillance room
      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, w, h);

      // Warning perimeter hatched line
      ctx.strokeStyle = 'rgba(234, 179, 8, 0.3)';
      ctx.lineWidth = 3;
      ctx.setLineDash([12, 8]);
      ctx.strokeRect(30, 30, w - 60, h - 60);
      ctx.setLineDash([]);

      // Security barrier stanchions
      ctx.fillStyle = 'rgba(71, 85, 105, 0.6)';
      ctx.fillRect(w * 0.48, 0, 12, h * 0.4);
      ctx.fillRect(w * 0.48, h * 0.6, 12, h * 0.4);

      // CCTV Camera overlay stamp
      ctx.fillStyle = 'rgba(234, 179, 8, 0.7)';
      ctx.font = 'bold 11px monospace';
      ctx.fillText('CAM 02 - GATE 4 SURGE ZONE [ACTIVE MONITORING]', 40, 50);
    },
    update: (w, h, frame) => {
      const detections: RawDetection[] = [];

      for (let i = 0; i < entities.length; i++) {
        const e = entities[i];
        const phase = (e.phase || 0) + frame * 0.03;

        e.x = (e.baseX || 200) + Math.sin(phase) * 90 + (e.vx * frame * 0.5) % (w * 0.7);
        e.y = (e.baseY || 200) + Math.cos(phase * 0.9) * 70;

        if (e.x < 25) e.x = w - 50;
        if (e.x > w - 40) e.x = 35;
        if (e.y < 40) e.y = h - 90;
        if (e.y > h - 80) e.y = 50;

        const x1 = Math.max(0, e.x);
        const y1 = Math.max(0, e.y);
        const x2 = Math.min(w, e.x + e.w);
        const y2 = Math.min(h, e.y + e.h);

        detections.push([x1, y1, x2, y2, e.confidence, 0]);
      }

      return detections;
    },
  };
}

/**
 * Static COCO bus sample image with real person & bus ground truth
 */
export function createBusDemoScene(width: number, height: number): SimulationScene {
  const img = new Image();
  img.src = '/bus.jpg';
  let isLoaded = false;
  img.onload = () => {
    isLoaded = true;
  };

  return {
    id: 'bus_demo',
    name: 'Sample Feed: bus.jpg (COCO/YOLO Person Detections)',
    description: 'Reference COCO dataset sample image demonstrating real person detections around an urban transit stop.',
    reset: () => {},
    background: (ctx, w, h) => {
      if (isLoaded && img.complete) {
        ctx.drawImage(img, 0, 0, w, h);
      } else {
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Loading bus.jpg...', w / 2, h / 2);
      }
    },
    update: (w, h, frame) => {
      const jitter = Math.sin(frame * 0.1) * 1.5;

      // Primary output focuses on Persons as per VisionSense requirements:
      return [
        [w * 0.08, h * 0.38 + jitter * 0.5, w * 0.24, h * 0.86 + jitter * 0.5, 0.89, 0], // Person 1
        [w * 0.23, h * 0.40 - jitter * 0.5, w * 0.36, h * 0.85 - jitter * 0.5, 0.86, 0], // Person 2
        [w * 0.65, h * 0.42 + jitter * 0.3, w * 0.74, h * 0.78 + jitter * 0.3, 0.83, 0], // Person 3
        [w * 0.78, h * 0.44 - jitter * 0.3, w * 0.86, h * 0.76 - jitter * 0.3, 0.81, 0], // Person 4
      ];
    },
  };
}

/**
 * Deterministic Synthetic Smoke-Test (prepare_video.py)
 */
export function createSyntheticTestScene(width: number, height: number): SimulationScene {
  interface Box {
    x: number;
    y: number;
    w: number;
    h: number;
    vx: number;
    vy: number;
  }

  let boxes: Box[] = [];

  const init = () => {
    boxes = [
      { x: 100, y: 100, w: 40, h: 70, vx: 3.5, vy: 2.2 },
      { x: 300, y: 200, w: 45, h: 75, vx: -2.8, vy: 3.1 },
      { x: 500, y: 150, w: 38, h: 72, vx: 2.4, vy: -2.6 },
      { x: 700, y: 300, w: 42, h: 74, vx: -3.2, vy: -1.9 },
    ];
  };

  init();

  return {
    id: 'synthetic',
    name: 'Synthetic Smoke-Test (prepare_video.py)',
    description: 'Deterministic bouncing object simulation replicating Python prepare_video.py --synthetic for MOT benchmark.',
    reset: init,
    background: (ctx, w, h) => {
      ctx.fillStyle = '#18181b';
      ctx.fillRect(0, 0, w, h);
    },
    update: (w, h) => {
      const detections: RawDetection[] = [];

      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        b.x += b.vx;
        b.y += b.vy;

        if (b.x < 0) { b.x = 0; b.vx = -b.vx; }
        if (b.x + b.w > w) { b.x = w - b.w; b.vx = -b.vx; }
        if (b.y < 0) { b.y = 0; b.vy = -b.vy; }
        if (b.y + b.h > h) { b.y = h - b.h; b.vy = -b.vy; }

        detections.push([b.x, b.y, b.x + b.w, b.y + b.h, 0.95, 0]);
      }

      return detections;
    },
  };
}
