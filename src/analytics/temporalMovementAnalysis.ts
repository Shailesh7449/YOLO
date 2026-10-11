import { CrowdSafetyStatus, MovementSafetyStatus, OpticalFlowResult, TrackedObject, VisionSenseAlert } from '../types';

export interface SafetyAnalysisSnapshot {
  peopleCount: number;
  crowdStatus: CrowdSafetyStatus;
  movementStatus: MovementSafetyStatus;
  motionScore: number;
  activeAlerts: VisionSenseAlert[];
  peakPeopleCount: number;
}

export class TemporalMovementAnalysis {
  private historyWindow: Array<{ peopleCount: number; motionScore: number; timestamp: number }> = [];
  private maxHistory: number = 30;
  private peakPeople: number = 0;

  // Exact crowd safety status with debouncing to prevent flicker around threshold 20/21
  private confirmedCrowdStatus: CrowdSafetyStatus = 'NORMAL';
  private crowdCandidateStatus: CrowdSafetyStatus = 'NORMAL';
  private crowdCandidateFrames: number = 0;
  private readonly DEBOUNCE_FRAMES = 5;

  private recentAlerts: VisionSenseAlert[] = [];
  private lastAlertTimestamp: number = 0;

  public reset() {
    this.historyWindow = [];
    this.peakPeople = 0;
    this.confirmedCrowdStatus = 'NORMAL';
    this.crowdCandidateStatus = 'NORMAL';
    this.crowdCandidateFrames = 0;
    this.recentAlerts = [];
    this.lastAlertTimestamp = 0;
  }

  /**
   * Evaluates crowd safety and movement anomaly indicators for the current frame
   * 
   * EXACT CROWD SAFETY RULE:
   * peopleCount <= 20 => NORMAL (Green)
   * peopleCount > 20  => WARNING (Amber/Yellow)
   */
  public update(
    tracks: TrackedObject[],
    opticalFlow: OpticalFlowResult,
    timestamp: number,
    frameIndex: number
  ): SafetyAnalysisSnapshot {
    const peopleCount = tracks.length;
    if (peopleCount > this.peakPeople) {
      this.peakPeople = peopleCount;
    }

    const motionScore = opticalFlow.motionScore;

    this.historyWindow.push({ peopleCount, motionScore, timestamp });
    if (this.historyWindow.length > this.maxHistory) {
      this.historyWindow.shift();
    }

    // 1. EXACT Crowd Safety Rule: <= 20 is NORMAL, > 20 is WARNING
    const instantStatus: CrowdSafetyStatus = peopleCount > 20 ? 'WARNING' : 'NORMAL';

    if (instantStatus === this.crowdCandidateStatus) {
      this.crowdCandidateFrames += 1;
      if (this.crowdCandidateFrames >= this.DEBOUNCE_FRAMES) {
        this.confirmedCrowdStatus = instantStatus;
      }
    } else {
      this.crowdCandidateStatus = instantStatus;
      this.crowdCandidateFrames = 1;
    }

    // 2. Movement Safety Status Analysis
    let movementStatus: MovementSafetyStatus = 'NORMAL';

    // Calculate velocity and optical flow trends
    const avgPersonSpeed = tracks.length > 0
      ? tracks.reduce((sum, t) => sum + t.speed_px, 0) / tracks.length
      : 0;

    const countDelta = this.historyWindow.length > 5
      ? peopleCount - this.historyWindow[0].peopleCount
      : 0;

    if (motionScore > 0.65 && avgPersonSpeed > 4.0) {
      movementStatus = 'HIGH_SURGE';
    } else if (countDelta < -6 && motionScore > 0.45) {
      movementStatus = 'RAPID_DISPERSAL';
    } else if (peopleCount > 15 && avgPersonSpeed < 0.8 && motionScore < 0.12) {
      movementStatus = 'STAGNATION';
    } else if (motionScore > 0.4 || avgPersonSpeed > 2.5) {
      movementStatus = 'ELEVATED';
    } else {
      movementStatus = 'NORMAL';
    }

    // 3. Genuine Event & Alert Generation (Throttled with 3-second cooldown)
    const activeAlerts: VisionSenseAlert[] = [];

    if (timestamp - this.lastAlertTimestamp >= 3.0) {
      if (this.confirmedCrowdStatus === 'WARNING') {
        const alert: VisionSenseAlert = {
          id: `alert-crowd-${frameIndex}`,
          type: 'CROWD_THRESHOLD_EXCEEDED',
          severity: 'WARNING',
          message: `Crowd threshold exceeded (${peopleCount} persons > 20 safety limit)`,
          timestamp: Math.round(timestamp * 10) / 10,
          frame: frameIndex,
          peopleCount,
          motionScore,
        };
        activeAlerts.push(alert);
        this.recentAlerts.unshift(alert);
        this.lastAlertTimestamp = timestamp;
      } else if (movementStatus === 'HIGH_SURGE') {
        const alert: VisionSenseAlert = {
          id: `alert-surge-${frameIndex}`,
          type: 'HIGH_MOTION_SURGE',
          severity: 'WARNING',
          message: `High velocity motion surge detected (motion index ${(motionScore * 100).toFixed(0)}%)`,
          timestamp: Math.round(timestamp * 10) / 10,
          frame: frameIndex,
          peopleCount,
          motionScore,
        };
        activeAlerts.push(alert);
        this.recentAlerts.unshift(alert);
        this.lastAlertTimestamp = timestamp;
      } else if (movementStatus === 'RAPID_DISPERSAL') {
        const alert: VisionSenseAlert = {
          id: `alert-dispersal-${frameIndex}`,
          type: 'RAPID_DISPERSAL',
          severity: 'WARNING',
          message: `Rapid crowd dispersal detected in monitored zone`,
          timestamp: Math.round(timestamp * 10) / 10,
          frame: frameIndex,
          peopleCount,
          motionScore,
        };
        activeAlerts.push(alert);
        this.recentAlerts.unshift(alert);
        this.lastAlertTimestamp = timestamp;
      }

      if (this.recentAlerts.length > 50) {
        this.recentAlerts = this.recentAlerts.slice(0, 50);
      }
    }

    return {
      peopleCount,
      crowdStatus: this.confirmedCrowdStatus,
      movementStatus,
      motionScore,
      activeAlerts: [...this.recentAlerts],
      peakPeopleCount: this.peakPeople,
    };
  }

  public getRecentAlerts(): VisionSenseAlert[] {
    return this.recentAlerts;
  }
}
