import React, { useRef, useEffect } from 'react';
import {
  TrackedObject,
  VisualConfig,
  StatsSnapshot,
  DEFAULT_COLORS,
  COCO_CLASSES,
  OpticalFlowResult,
} from '../types';
import { LineCounter } from '../analytics/lineCounter';
import { HeatmapGenerator } from '../analytics/heatmapGenerator';
import { TrajectoryStore } from '../tracking/trajectoryStore';

interface TrackingCanvasProps {
  objects: TrackedObject[];
  trajectoryStore: TrajectoryStore;
  lineCounter: LineCounter;
  heatmapGen: HeatmapGenerator;
  stats: StatsSnapshot;
  visualConfig: VisualConfig;
  videoElement: HTMLVideoElement | null;
  imageElement?: HTMLImageElement | null;
  opticalFlowResult?: OpticalFlowResult | null;
  renderBackground: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  canvasWidth: number;
  canvasHeight: number;
  onSnapshotSaved?: (dataUrl: string) => void;
}

export const TrackingCanvas: React.FC<TrackingCanvasProps> = ({
  objects,
  trajectoryStore,
  lineCounter,
  heatmapGen,
  stats,
  visualConfig,
  videoElement,
  imageElement,
  opticalFlowResult,
  renderBackground,
  canvasWidth,
  canvasHeight,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvasWidth;
    const h = canvasHeight;

    // 0. Base frame: real video, uploaded image, or simulated CCTV feed
    if (videoElement && videoElement.readyState >= 2) {
      ctx.drawImage(videoElement, 0, 0, w, h);
    } else if (imageElement && imageElement.complete && imageElement.naturalWidth > 0) {
      ctx.drawImage(imageElement, 0, 0, w, h);
    } else {
      renderBackground(ctx, w, h);
    }

    // 1. Heatmap overlay
    if (visualConfig.heatmap_enabled) {
      heatmapGen.renderToCanvas(ctx, w, h);
    }

    // 2. Dense Optical Flow vectors overlay (Computer Vision Technique)
    if (visualConfig.show_flow_vectors && opticalFlowResult && opticalFlowResult.gridVectors.length > 0) {
      ctx.save();
      ctx.lineWidth = 1.2;
      for (const vec of opticalFlowResult.gridVectors) {
        if (vec.magnitude < 0.8) continue;
        const color = vec.magnitude > 4.0 ? 'rgba(239, 68, 68, 0.7)' : 'rgba(56, 189, 248, 0.6)';
        ctx.strokeStyle = color;
        ctx.fillStyle = color;

        ctx.beginPath();
        ctx.moveTo(vec.x, vec.y);
        ctx.lineTo(vec.x + vec.u * 3, vec.y + vec.v * 3);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(vec.x + vec.u * 3, vec.y + vec.v * 3, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 3. Virtual Counting Lines
    if (visualConfig.show_lines && lineCounter.lines.length > 0) {
      for (const line of lineCounter.lines) {
        const x1 = line.points[0][0] * w;
        const y1 = line.points[0][1] * h;
        const x2 = line.points[1][0] * w;
        const y2 = line.points[1][1] * h;

        ctx.save();
        ctx.strokeStyle = 'rgba(234, 179, 8, 0.3)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        ctx.strokeStyle = '#eab308';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const label = `${line.name}  IN:${line.count_in}  OUT:${line.count_out}`;

        ctx.font = 'bold 11px monospace';
        const metrics = ctx.measureText(label);
        const badgeW = metrics.width + 16;
        const badgeH = 20;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.strokeStyle = '#eab308';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(mx - badgeW / 2, my - badgeH / 2, badgeW, badgeH, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#fef08a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, mx, my);
        ctx.restore();
      }
    }

    // 4. Trajectory trails
    if (visualConfig.show_trails) {
      for (const obj of objects) {
        const trail = trajectoryStore.getTrail(obj.track_id);
        if (!trail || trail.length < 2) continue;

        const color = obj.class_id === 0 ? '#10b981' : DEFAULT_COLORS[obj.class_id] ?? '#94a3b8';
        const n = trail.length;

        ctx.save();
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        for (let i = 1; i < n; i++) {
          const alpha = visualConfig.trail_fade ? Math.max(0.15, (i / n) * 0.9) : 0.85;
          ctx.strokeStyle = color;
          ctx.globalAlpha = alpha;

          ctx.beginPath();
          ctx.moveTo(trail[i - 1][0], trail[i - 1][1]);
          ctx.lineTo(trail[i][0], trail[i][1]);
          ctx.stroke();
        }

        const lastPt = trail[n - 1];
        ctx.globalAlpha = 1.0;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(lastPt[0], lastPt[1], 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // 5. Bounding boxes + ByteTrack IDs + Confidence (Primary focus: Person ID: X)
    if (visualConfig.show_boxes) {
      for (const obj of objects) {
        const [x1, y1, x2, y2] = obj.bbox;
        const bw = x2 - x1;
        const bh = y2 - y1;
        // Automatic Red/Blue Person Tracking:
        // Blue (#00f0ff) for normal tracked persons; Red (#ef4444) for confirmed violence participants
        const isParticipant = Boolean(obj.is_violence_participant);
        const color = isParticipant
          ? '#ef4444'
          : obj.class_id === 0
          ? '#00f0ff'
          : DEFAULT_COLORS[obj.class_id] ?? '#94a3b8';

        ctx.save();
        // Box outline
        ctx.strokeStyle = color;
        ctx.lineWidth = visualConfig.box_thickness;
        ctx.strokeRect(x1, y1, bw, bh);

        // Subtle corner accents
        const cornerLen = Math.min(14, bw / 4, bh / 4);
        ctx.lineWidth = visualConfig.box_thickness + 2.0;
        ctx.beginPath();
        // Top-left
        ctx.moveTo(x1, y1 + cornerLen); ctx.lineTo(x1, y1); ctx.lineTo(x1 + cornerLen, y1);
        // Top-right
        ctx.moveTo(x2 - cornerLen, y1); ctx.lineTo(x2, y1); ctx.lineTo(x2, y1 + cornerLen);
        // Bottom-left
        ctx.moveTo(x1, y2 - cornerLen); ctx.lineTo(x1, y2); ctx.lineTo(x1 + cornerLen, y2);
        // Bottom-right
        ctx.moveTo(x2 - cornerLen, y2); ctx.lineTo(x2, y2); ctx.lineTo(x2, y2 - cornerLen);
        ctx.stroke();

        // Center crosshair
        const cx = x1 + bw / 2;
        const cy = y1 + bh / 2;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx - 5, cy); ctx.lineTo(cx + 5, cy);
        ctx.moveTo(cx, cy - 5); ctx.lineTo(cx, cy + 5);
        ctx.stroke();

        // Exact Label: Violence Participant or Person ID
        const parts: string[] = [];
        if (isParticipant) {
          parts.push(`VIOLENCE PARTICIPANT #${obj.track_id}`);
        } else if (obj.class_id === 0) {
          if (visualConfig.show_ids) {
            parts.push(`Person ID: ${obj.track_id}`);
          } else {
            parts.push('Person');
          }
        } else {
          const className = COCO_CLASSES[obj.class_id] ?? `Obj`;
          if (visualConfig.show_ids) {
            parts.push(`${className} #${obj.track_id}`);
          } else {
            parts.push(className);
          }
        }

        if (visualConfig.show_confidence) {
          parts.push(`${(obj.confidence * 100).toFixed(0)}%`);
        }

        if (parts.length > 0) {
          const labelText = parts.join(' • ');
          ctx.font = `bold ${Math.round(11 * visualConfig.font_scale)}px sans-serif`;
          const textMetrics = ctx.measureText(labelText);
          const tagW = textMetrics.width + 10;
          const tagH = 17 * visualConfig.font_scale;
          const tagY = Math.max(0, y1 - tagH - 2);

          ctx.fillStyle = color;
          ctx.fillRect(x1, tagY, tagW, tagH);

          ctx.fillStyle = '#090d16'; // High-contrast dark text
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(labelText, x1 + 5, tagY + tagH / 2);
        }

        // Motion direction arrow if speed > 1
        if (obj.speed_px > 1 && !obj.is_stationary) {
          const [cx, cy] = obj.centroid;
          const [vx, vy] = obj.velocity;
          const arrowLen = Math.min(22, obj.speed_px * 3);
          const mag = Math.hypot(vx, vy);
          if (mag > 0) {
            const dx = (vx / mag) * arrowLen;
            const dy = (vy / mag) * arrowLen;

            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + dx, cy + dy);
            ctx.stroke();
          }
        }
        ctx.restore();
      }
    }

    // 6. Professional CCTV Security HUD
    if (visualConfig.show_hud) {
      ctx.save();
      const peopleCount = objects.filter((o) => o.class_id === 0).length;
      // Exact rule: people_count > 20 -> WARNING, <= 20 -> NORMAL
      const isWarning = peopleCount > 20;

      const barW = 320;
      const barH = 100;

      // Dark security panel
      ctx.fillStyle = 'rgba(9, 13, 22, 0.9)';
      ctx.strokeStyle = isWarning ? 'rgba(245, 158, 11, 0.8)' : 'rgba(16, 185, 129, 0.8)';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.roundRect(16, 16, barW, barH, 8);
      ctx.fill();
      ctx.stroke();

      // Header row
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('VISION SENSE • TACTICAL AI ENGINE', 28, 24);

      // People & Crowd Status
      ctx.font = 'bold 16px monospace';
      ctx.fillStyle = isWarning ? '#facc15' : '#34d399';
      ctx.fillText(
        `TARGETS: ${peopleCount.toString().padStart(2, '0')} [${isWarning ? 'CROWD WARNING' : 'SAFE'}]`,
        28,
        42
      );

      // Secondary telemetry
      ctx.font = '12px monospace';
      ctx.fillStyle = '#94a3b8';
      const motionStr = opticalFlowResult ? opticalFlowResult.motionScore.toFixed(2) : '0.00';
      ctx.fillText(`FPS: ${stats.fps.toFixed(1)} | MOTION: ${motionStr}`, 28, 64);

      ctx.fillStyle = '#64748b';
      ctx.fillText(`DETECTION: YOLO | TRACK: BYTETRACK`, 28, 84);

      // Blinking record indicator
      const timeMs = Date.now();
      if (Math.floor(timeMs / 500) % 2 === 0) {
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(barW - 10, 30, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fca5a5';
        ctx.font = 'bold 10px monospace';
        ctx.fillText('REC', barW - 32, 25);
      }

      ctx.restore();
    }
  }, [
    objects,
    trajectoryStore,
    lineCounter,
    heatmapGen,
    stats,
    visualConfig,
    videoElement,
    imageElement,
    opticalFlowResult,
    renderBackground,
    canvasWidth,
    canvasHeight,
  ]);

  return (
    <div
      id="tracking-canvas-container"
      className="relative w-full h-full flex items-center justify-center overflow-hidden bg-slate-950 rounded-xl border border-slate-800/80 shadow-2xl"
    >
      <canvas
        ref={canvasRef}
        id="video-tracking-viewport"
        width={canvasWidth}
        height={canvasHeight}
        className="w-full h-full object-contain max-h-[640px]"
      />
    </div>
  );
};
