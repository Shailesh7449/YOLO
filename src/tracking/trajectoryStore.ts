import { TrackedObject, TrajectoryExportRecord, COCO_CLASSES } from '../types';

export interface TrajectoryRecord {
  trackId: number;
  classId: number;
  trail: [number, number][]; // FIFO capped at maxTrailLength
  fullPath: { frame: number; cx: number; cy: number }[];
  frameFirst: number;
  frameLast: number;
  isActive: boolean;
}

export class TrajectoryStore {
  maxTrailLength: number;
  minTrackLength: number;
  private records: Map<number, TrajectoryRecord> = new Map();

  constructor(maxTrailLength: number = 60, minTrackLength: number = 5) {
    this.maxTrailLength = maxTrailLength;
    this.minTrackLength = minTrackLength;
  }

  update(objects: TrackedObject[], frameIdx: number) {
    const activeIds = new Set<number>();

    for (const obj of objects) {
      const tid = obj.track_id;
      activeIds.add(tid);

      let rec = this.records.get(tid);
      if (!rec) {
        rec = {
          trackId: tid,
          classId: obj.class_id,
          trail: [],
          fullPath: [],
          frameFirst: frameIdx,
          frameLast: frameIdx,
          isActive: true,
        };
        this.records.set(tid, rec);
      }

      rec.trail.push(obj.centroid);
      if (rec.trail.length > this.maxTrailLength) {
        rec.trail.shift();
      }

      rec.fullPath.push({ frame: frameIdx, cx: obj.centroid[0], cy: obj.centroid[1] });
      rec.frameLast = frameIdx;
      rec.isActive = true;
    }

    for (const [tid, rec] of this.records.entries()) {
      if (!activeIds.has(tid)) {
        rec.isActive = false;
      }
    }
  }

  getTrail(trackId: number): [number, number][] | null {
    const rec = this.records.get(trackId);
    if (!rec || rec.trail.length < this.minTrackLength) {
      return null;
    }
    return rec.trail;
  }

  getAllCentroids(): [number, number][] {
    const pts: [number, number][] = [];
    for (const rec of this.records.values()) {
      for (const p of rec.fullPath) {
        pts.push([p.cx, p.cy]);
      }
    }
    return pts;
  }

  totalUniqueTracks(): number {
    return this.records.size;
  }

  reset() {
    this.records.clear();
  }

  toExportList(fps: number = 30): TrajectoryExportRecord[] {
    const list: TrajectoryExportRecord[] = [];

    for (const rec of this.records.values()) {
      const durationFrames = rec.frameLast - rec.frameFirst + 1;
      const durationS = Math.round((durationFrames / fps) * 100) / 100;
      const first = rec.fullPath[0];
      const last = rec.fullPath[rec.fullPath.length - 1];

      let totalDist = 0;
      for (let i = 0; i < rec.fullPath.length - 1; i++) {
        const dx = rec.fullPath[i + 1].cx - rec.fullPath[i].cx;
        const dy = rec.fullPath[i + 1].cy - rec.fullPath[i].cy;
        totalDist += Math.hypot(dx, dy);
      }
      const avgSpeedPs = durationS > 0 ? Math.round((totalDist / durationS) * 10) / 10 : 0;

      list.push({
        track_id: rec.trackId,
        class_id: rec.classId,
        class_name: COCO_CLASSES[rec.classId] ?? `class_${rec.classId}`,
        frame_first: rec.frameFirst,
        frame_last: rec.frameLast,
        duration_frames: durationFrames,
        duration_s: durationS,
        path: rec.fullPath,
        start_cx: Math.round((first?.cx ?? 0) * 10) / 10,
        start_cy: Math.round((first?.cy ?? 0) * 10) / 10,
        end_cx: Math.round((last?.cx ?? 0) * 10) / 10,
        end_cy: Math.round((last?.cy ?? 0) * 10) / 10,
        avg_speed_ps: avgSpeedPs,
      });
    }

    return list;
  }
}
