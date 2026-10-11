"""
VisionSense Safety Engine (Python)
Rules: people_count <= 20: NORMAL, people_count > 20: WARNING
"""
import time
import uuid
from typing import List, Tuple, Optional
from visionsense.types import CrowdStatus, Alert

class SafetyEngine:
    def __init__(self, crowd_threshold: int = 20, persistence_frames: int = 3):
        self.crowd_threshold = crowd_threshold
        self.persistence_frames = persistence_frames
        self.consecutive_warning_frames = 0
        self.consecutive_normal_frames = 0
        self.current_status: CrowdStatus = CrowdStatus.NORMAL
        self.alerts_history: List[Alert] = []
        self._last_alert_time: float = 0.0
        self._cooldown_seconds: float = 5.0

    def evaluate_frame(
        self,
        people_count: int,
        timestamp: float,
        unusual_movement_score: float = 0.0,
        anomaly_type: Optional[str] = None
    ) -> Tuple[CrowdStatus, List[Alert]]:
        new_alerts: List[Alert] = []
        time_formatted = self._format_timestamp(timestamp)

        # EXACT CROWD SAFETY RULE
        if people_count > self.crowd_threshold:
            self.consecutive_warning_frames += 1
            self.consecutive_normal_frames = 0
            if self.consecutive_warning_frames >= self.persistence_frames:
                self.current_status = CrowdStatus.WARNING
        else:
            self.consecutive_normal_frames += 1
            self.consecutive_warning_frames = 0
            if self.consecutive_normal_frames >= self.persistence_frames:
                self.current_status = CrowdStatus.NORMAL

        now = time.time()
        if self.current_status == CrowdStatus.WARNING and (now - self._last_alert_time) > self._cooldown_seconds:
            self._last_alert_time = now
            alert = Alert(
                id=str(uuid.uuid4())[:8],
                timestamp=round(timestamp, 2),
                time_formatted=time_formatted,
                severity="WARNING",
                title="Crowd threshold exceeded",
                message=f"Surge detected: {people_count} individuals present (Threshold: {self.crowd_threshold})",
                people_count=people_count
            )
            self.alerts_history.append(alert)
            new_alerts.append(alert)

        if unusual_movement_score > 0.75 and (now - self._last_alert_time) > self._cooldown_seconds:
            self._last_alert_time = now
            m_type = anomaly_type or "Rapid Dispersal / High Surge"
            alert = Alert(
                id=str(uuid.uuid4())[:8],
                timestamp=round(timestamp, 2),
                time_formatted=time_formatted,
                severity="WARNING",
                title="Unusual Movement Detected",
                message=f"{m_type} observed (Score: {unusual_movement_score:.2f})",
                people_count=people_count
            )
            self.alerts_history.append(alert)
            new_alerts.append(alert)

        return self.current_status, new_alerts

    @staticmethod
    def _format_timestamp(seconds: float) -> str:
        mins = int(seconds // 60)
        secs = seconds % 60
        return f"{mins:02d}:{secs:05.2f}"
