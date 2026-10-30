/**
 * VisionSense AI - Dedicated Security Notification Service
 * Manages threshold monitoring, state transitions, event deduplication,
 * in-app audit history, and desktop Browser Notification API integration.
 */

export interface SecurityNotificationEvent {
  id: string;
  type: 'CROWD_THRESHOLD_EXCEEDED' | 'ANOMALOUS_SURGE' | 'SAFETY_WARNING' | 'VIOLENCE_DETECTED';
  timestamp: number; // Video or stream timestamp in seconds
  wallClockIso: string;
  sourceId: string; // e.g. 'CAM-01', 'webcam', 'video.mp4'
  sourceLabel: string;
  detectedCount: number;
  configuredThreshold: number;
  severity: 'CRITICAL' | 'WARNING' | 'NORMAL';
  message: string;
  deliveredToBrowser: boolean;
  browserError?: string;
}

export type NotificationPermissionStatus = 'default' | 'granted' | 'denied' | 'unsupported';

interface StreamState {
  isExceeded: boolean;
  lastAlertTimestamp: number;
  lastAlertWallClock: number;
  lastAlertCount: number;
}

class NotificationService {
  private sourceStates: Map<string, StreamState> = new Map();
  private violenceStates: Map<string, { isViolent: boolean; lastAlertTimestamp: number; lastAlertWallClock: number }> = new Map();
  private eventHistory: SecurityNotificationEvent[] = [];
  private listeners: Set<(event: SecurityNotificationEvent) => void> = new Set();
  private maxHistory: number = 200;

  constructor() {
    this.loadHistory();
  }

  private loadHistory() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = localStorage.getItem('visionsense_security_events');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            this.eventHistory = parsed.slice(0, this.maxHistory);
          }
        }
      }
    } catch {
      // LocalStorage access may be restricted
    }
  }

  private persistHistory() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(
          'visionsense_security_events',
          JSON.stringify(this.eventHistory.slice(0, 100))
        );
      }
    } catch {}
  }

  /**
   * Check browser Notification API permission status
   */
  public getPermissionStatus(): NotificationPermissionStatus {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'unsupported';
    }
    return Notification.permission as NotificationPermissionStatus;
  }

  /**
   * Request browser Notification permission upon explicit operator gesture
   */
  public async requestPermission(): Promise<NotificationPermissionStatus> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'unsupported';
    }

    try {
      const res = await Notification.requestPermission();
      return res as NotificationPermissionStatus;
    } catch (err: any) {
      console.warn('[NotificationService] Permission request failed:', err?.message || err);
      return 'denied';
    }
  }

  /**
   * Core Threshold Evaluation Rule:
   * Rule: detectedPeople > configuredCrowdLimit
   * - Transition NORMAL -> EXCEEDED: Triggers exactly ONE event.
   * - Remaining EXCEEDED: Prevents duplicate notifications on subsequent frames.
   * - Transition EXCEEDED -> NORMAL: Resets state to allow a new alert upon next exceed.
   */
  public evaluateCrowdThreshold(
    sourceId: string,
    sourceLabel: string,
    detectedCount: number,
    configuredThreshold: number,
    timestamp: number,
    cooldownSec: number = 5
  ): SecurityNotificationEvent | null {
    // Validate threshold as a non-negative integer
    const threshold = Math.max(0, Math.floor(configuredThreshold));
    const nowWallClock = Date.now();

    // Strict evaluation rule
    const isExceeded = detectedCount > threshold;

    let state = this.sourceStates.get(sourceId);
    if (!state) {
      state = {
        isExceeded: false,
        lastAlertTimestamp: -999,
        lastAlertWallClock: 0,
        lastAlertCount: 0,
      };
      this.sourceStates.set(sourceId, state);
    }

    if (isExceeded) {
      // Check if we are entering the exceeded state for the first time
      const isEnteringExceeded = !state.isExceeded;

      // Also respect cooldown window (handles seeking or edge flutter)
      const elapsedVideoTime = Math.abs(timestamp - state.lastAlertTimestamp);
      const elapsedWallClock = (nowWallClock - state.lastAlertWallClock) / 1000;
      const cooldownElapsed = elapsedVideoTime >= cooldownSec || elapsedWallClock >= cooldownSec;

      if (isEnteringExceeded && cooldownElapsed) {
        state.isExceeded = true;
        state.lastAlertTimestamp = timestamp;
        state.lastAlertWallClock = nowWallClock;
        state.lastAlertCount = detectedCount;

        const event: SecurityNotificationEvent = {
          id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          type: 'CROWD_THRESHOLD_EXCEEDED',
          timestamp: Math.round(timestamp * 1000) / 1000,
          wallClockIso: new Date().toISOString(),
          sourceId,
          sourceLabel,
          detectedCount,
          configuredThreshold: threshold,
          severity: 'WARNING',
          message: `Crowd limit exceeded on ${sourceLabel}: ${detectedCount} detected (Threshold: ${threshold})`,
          deliveredToBrowser: false,
        };

        // Attempt real browser notification delivery
        this.dispatchBrowserNotification(event);

        // Record in internal event history
        this.recordEvent(event);

        return event;
      }

      // If already in exceeded state, suppress duplicate alerts
      return null;
    } else {
      // Count has returned to or below threshold: recover state to NORMAL
      if (state.isExceeded) {
        state.isExceeded = false;
        console.log(`[NotificationService] ${sourceLabel} crowd normalized: ${detectedCount} <= ${threshold}`);
      }
      return null;
    }
  }

  /**
   * Dedicated Violence Incident Evaluation & Alert Trigger
   */
  public evaluateViolenceIncident(
    sourceId: string,
    sourceLabel: string,
    isViolence: boolean,
    confidence: number,
    timestamp: number,
    modelName: string = 'R(2+1)D-18 / X3D-M',
    cooldownSec: number = 6
  ): SecurityNotificationEvent | null {
    const nowWallClock = Date.now();
    let state = this.violenceStates.get(sourceId);
    if (!state) {
      state = { isViolent: false, lastAlertTimestamp: -999, lastAlertWallClock: 0 };
      this.violenceStates.set(sourceId, state);
    }

    if (isViolence) {
      const isEnteringViolent = !state.isViolent;
      const elapsedVideoTime = Math.abs(timestamp - state.lastAlertTimestamp);
      const elapsedWallClock = (nowWallClock - state.lastAlertWallClock) / 1000;
      const cooldownElapsed = elapsedVideoTime >= cooldownSec || elapsedWallClock >= cooldownSec;

      if (isEnteringViolent && cooldownElapsed) {
        state.isViolent = true;
        state.lastAlertTimestamp = timestamp;
        state.lastAlertWallClock = nowWallClock;

        const event: SecurityNotificationEvent = {
          id: `violence_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          type: 'VIOLENCE_DETECTED',
          timestamp: Math.round(timestamp * 1000) / 1000,
          wallClockIso: new Date().toISOString(),
          sourceId,
          sourceLabel,
          detectedCount: 0,
          configuredThreshold: 0,
          severity: 'CRITICAL',
          message: `CRITICAL ALERT: Physical Altercation/Violence Detected on ${sourceLabel} (${(confidence * 100).toFixed(1)}% conf, ${modelName})`,
          deliveredToBrowser: false,
        };

        this.dispatchBrowserNotification(event);
        this.recordEvent(event);
        return event;
      }
      return null;
    } else {
      if (state.isViolent) {
        state.isViolent = false;
        console.log(`[NotificationService] ${sourceLabel} returned to non-violent state.`);
      }
      return null;
    }
  }

  /**
   * Reset state for a specific source (e.g. video reset or seek)
   */
  public resetSourceState(sourceId: string): void {
    this.sourceStates.delete(sourceId);
    this.violenceStates.delete(sourceId);
  }

  /**
   * Record security event in history and notify active subscribers
   */
  public recordEvent(event: SecurityNotificationEvent): void {
    this.eventHistory = [event, ...this.eventHistory.slice(0, this.maxHistory - 1)];
    this.persistHistory();
    this.notifyListeners(event);
  }

  /**
   * Dispatch system notification via browser Notification API
   */
  private async dispatchBrowserNotification(event: SecurityNotificationEvent): Promise<boolean> {
    if (this.getPermissionStatus() !== 'granted') {
      event.deliveredToBrowser = false;
      event.browserError = 'Browser notification permission not granted';
      return false;
    }

    try {
      const title = `⚠️ VisionSense Alert: ${event.sourceLabel}`;
      const options: NotificationOptions = {
        body: event.message,
        icon: '/favicon.ico',
        tag: `visionsense_${event.sourceId}_${event.type}`, // Replaces existing alert for same stream
        requireInteraction: false,
        silent: false,
      };

      const notification = new Notification(title, options);
      event.deliveredToBrowser = true;

      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      return true;
    } catch (err: any) {
      console.warn('[NotificationService] Desktop notification dispatch failed:', err?.message || err);
      event.deliveredToBrowser = false;
      event.browserError = err?.message || 'Dispatch error';
      return false;
    }
  }

  public getEventHistory(): SecurityNotificationEvent[] {
    return [...this.eventHistory];
  }

  public clearHistory(): void {
    this.eventHistory = [];
    this.persistHistory();
  }

  public resetState(): void {
    this.sourceStates.clear();
  }

  public subscribe(listener: (event: SecurityNotificationEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(event: SecurityNotificationEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.warn('[NotificationService] Listener error:', err);
      }
    }
  }
}

export const notificationService = new NotificationService();
