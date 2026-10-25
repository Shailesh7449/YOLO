import { FrameTelemetry, SynchronizedTelemetryResult, TelemetryPoint, TrackedObject } from '../types';

export class TelemetryStore {
  private frames: FrameTelemetry[] = [];
  private history: TelemetryPoint[] = [];
  private maxPoints: number;
  private maxProcessedTimestamp: number = 0;
  private isComplete: boolean = false;
  private videoDuration: number = 0;
  private crowdThreshold: number = 20;

  constructor(maxPoints = 1000) {
    this.maxPoints = maxPoints;
  }

  public setCrowdThreshold(threshold: number) {
    this.crowdThreshold = Math.max(0, Math.floor(threshold));
  }

  public getCrowdThreshold(): number {
    return this.crowdThreshold;
  }

  public setVideoDuration(duration: number) {
    this.videoDuration = duration;
  }

  public setComplete(complete: boolean) {
    this.isComplete = complete;
  }

  public getIsComplete(): boolean {
    return this.isComplete;
  }

  public getMaxProcessedTimestamp(): number {
    return this.maxProcessedTimestamp;
  }

  public getFramesCount(): number {
    return this.frames.length;
  }

  public getAllFrames(): FrameTelemetry[] {
    return this.frames;
  }

  public recordFrame(frame: FrameTelemetry) {
    // Insert in sorted order by timestamp
    if (this.frames.length === 0 || frame.timestamp >= this.frames[this.frames.length - 1].timestamp) {
      this.frames.push(frame);
    } else {
      // Binary search insertion index
      let low = 0;
      let high = this.frames.length - 1;
      let insertIdx = this.frames.length;
      while (low <= high) {
        const mid = (low + high) >> 1;
        if (this.frames[mid].timestamp >= frame.timestamp) {
          insertIdx = mid;
          high = mid - 1;
        } else {
          low = mid + 1;
        }
      }
      this.frames.splice(insertIdx, 0, frame);
    }

    if (frame.timestamp > this.maxProcessedTimestamp) {
      this.maxProcessedTimestamp = frame.timestamp;
    }

    // Keep legacy TelemetryPoint history updated
    this.record({
      timestamp: frame.timestamp,
      frame: frame.frame_index,
      peopleCount: frame.people_count,
      peakPeople: frame.peak_people,
      motionScore: frame.motion_score,
      crowdStatus: frame.crowd_status,
      movementStatus: frame.movement_status,
      activeAlertsCount: frame.alerts.length,
    });
  }

  public loadTelemetryData(frames: FrameTelemetry[], duration?: number) {
    this.loadBulkFrames(frames, duration);
  }

  public loadBulkFrames(frames: FrameTelemetry[], duration?: number) {
    this.frames = [...frames].sort((a, b) => a.timestamp - b.timestamp);
    if (this.frames.length > 0) {
      this.maxProcessedTimestamp = this.frames[this.frames.length - 1].timestamp;
    }
    if (duration !== undefined) {
      this.videoDuration = duration;
    }
    this.history = this.frames.map((f) => ({
      timestamp: f.timestamp,
      frame: f.frame_index,
      peopleCount: f.people_count,
      peakPeople: f.peak_people,
      motionScore: f.motion_score,
      crowdStatus: f.crowd_status,
      movementStatus: f.movement_status,
      activeAlertsCount: f.alerts.length,
    }));
  }

  /**
   * Synchronizes telemetry with exact video.currentTime.
   * Tolerates small timestamp jitter (up to toleranceSec, e.g. 0.35s).
   * Interpolates bounding boxes strictly between two actual states of the SAME track ID.
   */
  public getSynchronizedTelemetry(
    currentTime: number,
    toleranceSec: number = 0.35
  ): SynchronizedTelemetryResult {
    if (this.frames.length === 0) {
      return {
        status: 'NO_DATA',
        telemetry: null,
        tracks: [],
        people_count: 0,
        crowd_status: 'NORMAL',
        movement_status: 'NORMAL',
        motion_score: 0,
        timeDifference: 0,
        processedThroughTimestamp: 0,
        message: 'AI ANALYSIS QUEUED',
      };
    }

    // Check if video currentTime is significantly ahead of processed AI frames
    if (currentTime > this.maxProcessedTimestamp + toleranceSec) {
      if (this.isComplete) {
        // Video analysis is 100% complete! Playhead is at the final segment of the video
        const lastFrame = this.frames[this.frames.length - 1];
        const lastCount =
          lastFrame.tracks && lastFrame.tracks.length > 0
            ? lastFrame.tracks.length
            : lastFrame.people_count || 0;
        return {
          status: 'SYNCHRONIZED',
          telemetry: lastFrame,
          tracks: lastFrame.tracks,
          people_count: lastCount,
          crowd_status: lastCount > this.crowdThreshold ? 'WARNING' : 'NORMAL',
          movement_status: lastFrame.movement_status,
          motion_score: lastFrame.motion_score,
          timeDifference: currentTime - lastFrame.timestamp,
          processedThroughTimestamp: this.maxProcessedTimestamp,
        };
      }

      return {
        status: 'BEHIND_PLAYBACK',
        telemetry: null,
        tracks: [],
        people_count: 0,
        crowd_status: 'NORMAL',
        movement_status: 'NORMAL',
        motion_score: 0,
        timeDifference: currentTime - this.maxProcessedTimestamp,
        processedThroughTimestamp: this.maxProcessedTimestamp,
        message: `AI ANALYSIS BEHIND PLAYBACK (${this.maxProcessedTimestamp.toFixed(1)}s processed / ${currentTime.toFixed(1)}s playback)`,
      };
    }

    // Binary search for exact or closest frame
    let low = 0;
    let high = this.frames.length - 1;
    let closestIdx = 0;
    let minDiff = Infinity;

    while (low <= high) {
      const mid = (low + high) >> 1;
      const diff = this.frames[mid].timestamp - currentTime;
      const absDiff = Math.abs(diff);

      if (absDiff < minDiff) {
        minDiff = absDiff;
        closestIdx = mid;
      }

      if (diff === 0) {
        break;
      } else if (diff < 0) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    const closestFrame = this.frames[closestIdx];

    // If seeking to a point that is outside of analyzed bounds
    if (minDiff > toleranceSec) {
      if (this.isComplete) {
        // Complete video analysis: snap to closest frame rather than dropping bounding boxes
        const snapTracks = closestFrame.tracks || [];
        const snapCount = snapTracks.length > 0 ? snapTracks.length : closestFrame.people_count || 0;
        return {
          status: 'SYNCHRONIZED',
          telemetry: closestFrame,
          tracks: snapTracks,
          people_count: snapCount,
          crowd_status: snapCount > this.crowdThreshold ? 'WARNING' : 'NORMAL',
          movement_status: closestFrame.movement_status,
          motion_score: closestFrame.motion_score,
          timeDifference: minDiff,
          processedThroughTimestamp: this.maxProcessedTimestamp,
        };
      }

      return {
        status: 'NOT_YET_AVAILABLE',
        telemetry: null,
        tracks: [],
        people_count: 0,
        crowd_status: 'NORMAL',
        movement_status: 'NORMAL',
        motion_score: 0,
        timeDifference: minDiff,
        processedThroughTimestamp: this.maxProcessedTimestamp,
        message: `AI ANALYSIS NOT YET AVAILABLE FOR THIS TIMESTAMP (${currentTime.toFixed(1)}s)`,
      };
    }

    // Track Interpolation & Dynamic Temporal Projection Rule:
    let interpolatedTracks: TrackedObject[] = [];

    // Find previous and next frames for interpolation if available
    let prevFrame: FrameTelemetry | null = null;
    let nextFrame: FrameTelemetry | null = null;

    if (closestFrame.timestamp <= currentTime && closestIdx < this.frames.length - 1) {
      prevFrame = closestFrame;
      nextFrame = this.frames[closestIdx + 1];
    } else if (closestFrame.timestamp > currentTime && closestIdx > 0) {
      prevFrame = this.frames[closestIdx - 1];
      nextFrame = closestFrame;
    } else {
      // Near boundary or single frame
      prevFrame = closestFrame;
    }

    if (prevFrame && nextFrame && nextFrame.timestamp > prevFrame.timestamp) {
      const deltaT = nextFrame.timestamp - prevFrame.timestamp;
      const alpha = Math.max(0, Math.min(1.0, (currentTime - prevFrame.timestamp) / deltaT));
      const nextTrackMap = new Map<number, TrackedObject>();
      for (const t of nextFrame.tracks) {
        nextTrackMap.set(t.track_id, t);
      }
      const matchedNextIds = new Set<number>();

      for (const pt of prevFrame.tracks) {
        const nt = nextTrackMap.get(pt.track_id);
        if (nt) {
          matchedNextIds.add(nt.track_id);
          // Same confirmed track across both frames: continuous linear interpolation
          const x1 = pt.bbox[0] + (nt.bbox[0] - pt.bbox[0]) * alpha;
          const y1 = pt.bbox[1] + (nt.bbox[1] - pt.bbox[1]) * alpha;
          const x2 = pt.bbox[2] + (nt.bbox[2] - pt.bbox[2]) * alpha;
          const y2 = pt.bbox[3] + (nt.bbox[3] - pt.bbox[3]) * alpha;
          const cx = (x1 + x2) / 2;
          const cy = (y1 + y2) / 2;

          interpolatedTracks.push({
            ...pt,
            bbox: [Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2)],
            centroid: [Math.round(cx), Math.round(cy)],
            confidence: Math.round((pt.confidence + (nt.confidence - pt.confidence) * alpha) * 100) / 100,
          });
        } else {
          // Track only in prevFrame: forward-project with velocity vector to prevent lag
          const dt = currentTime - prevFrame.timestamp;
          if (dt <= 0.35) {
            const vx = pt.velocity ? pt.velocity[0] : 0;
            const vy = pt.velocity ? pt.velocity[1] : 0;
            const x1 = pt.bbox[0] + vx * dt;
            const y1 = pt.bbox[1] + vy * dt;
            const x2 = pt.bbox[2] + vx * dt;
            const y2 = pt.bbox[3] + vy * dt;
            interpolatedTracks.push({
              ...pt,
              bbox: [Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2)],
              centroid: [Math.round((x1 + x2) / 2), Math.round((y1 + y2) / 2)],
            });
          }
        }
      }

      // Include new tracks appearing in nextFrame when alpha is high (>= 0.5)
      if (alpha >= 0.5) {
        for (const nt of nextFrame.tracks) {
          if (!matchedNextIds.has(nt.track_id)) {
            const dt = nextFrame.timestamp - currentTime;
            const vx = nt.velocity ? nt.velocity[0] : 0;
            const vy = nt.velocity ? nt.velocity[1] : 0;
            const x1 = nt.bbox[0] - vx * dt;
            const y1 = nt.bbox[1] - vy * dt;
            const x2 = nt.bbox[2] - vx * dt;
            const y2 = nt.bbox[3] - vy * dt;
            interpolatedTracks.push({
              ...nt,
              bbox: [Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2)],
              centroid: [Math.round((x1 + x2) / 2), Math.round((y1 + y2) / 2)],
            });
          }
        }
      }
    } else if (prevFrame) {
      // Single frame near boundary: forward project if currentTime slightly past
      const dt = currentTime - prevFrame.timestamp;
      for (const pt of prevFrame.tracks) {
        const vx = pt.velocity ? pt.velocity[0] : 0;
        const vy = pt.velocity ? pt.velocity[1] : 0;
        const x1 = pt.bbox[0] + vx * dt;
        const y1 = pt.bbox[1] + vy * dt;
        const x2 = pt.bbox[2] + vx * dt;
        const y2 = pt.bbox[3] + vy * dt;
        interpolatedTracks.push({
          ...pt,
          bbox: [Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2)],
          centroid: [Math.round((x1 + x2) / 2), Math.round((y1 + y2) / 2)],
        });
      }
    }

    const activeCount =
      interpolatedTracks.length > 0
        ? interpolatedTracks.length
        : closestFrame.tracks && closestFrame.tracks.length > 0
        ? closestFrame.tracks.length
        : closestFrame.people_count || 0;

    return {
      status: 'SYNCHRONIZED',
      telemetry: closestFrame,
      tracks: interpolatedTracks,
      people_count: activeCount,
      crowd_status: activeCount > this.crowdThreshold ? 'WARNING' : 'NORMAL',
      movement_status: closestFrame.movement_status,
      motion_score: closestFrame.motion_score,
      timeDifference: minDiff,
      processedThroughTimestamp: this.maxProcessedTimestamp,
    };
  }

  public record(point: TelemetryPoint) {
    this.history.push(point);
    if (this.history.length > this.maxPoints) {
      this.history.shift();
    }
  }

  public getHistory(): TelemetryPoint[] {
    return this.history;
  }

  public clear() {
    this.frames = [];
    this.history = [];
    this.maxProcessedTimestamp = 0;
    this.isComplete = false;
  }
}

