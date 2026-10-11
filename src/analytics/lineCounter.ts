import { CountingLineConfig, CrossingEvent, TrackedObject } from '../types';

export class LineCounter {
  public lines: CountingLineConfig[] = [];
  private previousTrackPositions: Map<number, [number, number]> = new Map();
  private crossingEvents: CrossingEvent[] = [];

  constructor(initialLines: CountingLineConfig[] = []) {
    this.lines = initialLines;
  }

  public setLines(lines: CountingLineConfig[]) {
    this.lines = lines;
  }

  public getLines(): CountingLineConfig[] {
    return this.lines;
  }

  public getCounts(): Record<string, { count_in: number; count_out: number; total: number }> {
    const counts: Record<string, { count_in: number; count_out: number; total: number }> = {};
    for (const line of this.lines) {
      counts[line.id] = {
        count_in: line.count_in,
        count_out: line.count_out,
        total: line.count_in + line.count_out,
      };
    }
    return counts;
  }

  public update(
    tracks: TrackedObject[],
    frameIdx: number,
    timestamp: number = frameIdx / 30,
    canvasWidth: number = 1280,
    canvasHeight: number = 720
  ): CrossingEvent[] {
    return this.processTracks(tracks, frameIdx, timestamp, canvasWidth, canvasHeight);
  }

  public getEvents(): CrossingEvent[] {
    return this.crossingEvents;
  }

  public reset() {
    this.previousTrackPositions.clear();
    this.crossingEvents = [];
    this.lines = this.lines.map((l) => ({ ...l, count_in: 0, count_out: 0 }));
  }

  public processTracks(
    tracks: TrackedObject[],
    frameIdx: number,
    timestamp: number,
    canvasWidth: number,
    canvasHeight: number
  ): CrossingEvent[] {
    const newEvents: CrossingEvent[] = [];
    if (this.lines.length === 0) return newEvents;

    for (const track of tracks) {
      const currentPos: [number, number] = [track.centroid[0], track.centroid[1]];
      const prevPos = this.previousTrackPositions.get(track.track_id);

      if (prevPos) {
        for (const line of this.lines) {
          const p1: [number, number] = [line.points[0][0] * canvasWidth, line.points[0][1] * canvasHeight];
          const p2: [number, number] = [line.points[1][0] * canvasWidth, line.points[1][1] * canvasHeight];

          if (this.intersects(prevPos, currentPos, p1, p2)) {
            // Determine direction
            const lineVector: [number, number] = [p2[0] - p1[0], p2[1] - p1[1]];
            const moveVector: [number, number] = [currentPos[0] - prevPos[0], currentPos[1] - prevPos[1]];
            const crossProduct = lineVector[0] * moveVector[1] - lineVector[1] * moveVector[0];

            const dir: 'in' | 'out' = crossProduct > 0 ? 'in' : 'out';

            if (dir === 'in') line.count_in += 1;
            else line.count_out += 1;

            const ev: CrossingEvent = {
              id: `crossing-${frameIdx}-${track.track_id}`,
              frame_idx: frameIdx,
              timestamp,
              track_id: track.track_id,
              class_id: track.class_id,
              class_name: 'person',
              line_name: line.name,
              direction: dir,
            };
            newEvents.push(ev);
            this.crossingEvents.unshift(ev);
          }
        }
      }

      this.previousTrackPositions.set(track.track_id, currentPos);
    }

    if (this.crossingEvents.length > 50) {
      this.crossingEvents = this.crossingEvents.slice(0, 50);
    }

    return newEvents;
  }

  private ccw(a: [number, number], b: [number, number], c: [number, number]): boolean {
    return (c[1] - a[1]) * (b[0] - a[0]) > (b[1] - a[1]) * (c[0] - a[0]);
  }

  private intersects(
    p1: [number, number],
    p2: [number, number],
    p3: [number, number],
    p4: [number, number]
  ): boolean {
    return (
      this.ccw(p1, p3, p4) !== this.ccw(p2, p3, p4) &&
      this.ccw(p1, p2, p3) !== this.ccw(p1, p2, p4)
    );
  }
}
