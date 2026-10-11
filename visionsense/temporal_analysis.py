"""
VisionSense Temporal Movement Analysis (Python)
"""
from collections import deque
from visionsense.types import TemporalAnalysisResult, FlowMetrics

class TemporalMovementAnalysis:
    def __init__(self, window_size: int = 20):
        self.window_size = window_size
        self.history = deque(maxlen=window_size)
        self.persistence_counter = 0

    def update(self, people_count: int, flow_metrics: FlowMetrics) -> TemporalAnalysisResult:
        record = {
            "people_count": people_count,
            "motion_score": flow_metrics.motion_score,
            "magnitude": flow_metrics.motion_magnitude,
            "dispersion": flow_metrics.directional_dispersion,
            "vx": flow_metrics.avg_velocity_x,
            "vy": flow_metrics.avg_velocity_y,
            "active_pixels": flow_metrics.active_motion_pixels
        }
        self.history.append(record)

        if len(self.history) < 5:
            return TemporalAnalysisResult(False, 0.0, None, 0.0, 0)

        first_count = self.history[0]["people_count"]
        curr_count = people_count
        count_delta = curr_count - first_count
        avg_motion = sum(r["motion_score"] for r in self.history) / len(self.history)

        recent_mag = [r["magnitude"] for r in list(self.history)[-5:]]
        older_mag = [r["magnitude"] for r in list(self.history)[:-5]]
        mag_jump = (sum(recent_mag) / len(recent_mag)) - (sum(older_mag) / len(older_mag)) if older_mag else 0.0

        unusual_score = 0.0
        anomaly_type = None

        if mag_jump > 2.5 and curr_count > 5:
            unusual_score = min(1.0, 0.4 + (mag_jump / 5.0) * 0.6)
            anomaly_type = "Sudden Crowd Surge / Acceleration"
        elif count_delta < -8 and avg_motion > 0.4:
            unusual_score = min(1.0, 0.5 + abs(count_delta) * 0.05)
            anomaly_type = "Rapid Dispersal / Evacuation Pattern"
        elif curr_count > 15 and avg_motion < 0.05:
            unusual_score = min(1.0, 0.3 + (curr_count / 30.0) * 0.5)
            anomaly_type = "Congestion Stagnation / Bottleneck"
        else:
            unusual_score = round(avg_motion * 0.4, 2)

        if unusual_score > 0.65:
            self.persistence_counter += 1
        else:
            self.persistence_counter = max(0, self.persistence_counter - 1)

        anomaly_detected = self.persistence_counter >= 3 and unusual_score > 0.65

        return TemporalAnalysisResult(
            anomaly_detected=anomaly_detected,
            unusual_movement_score=round(unusual_score, 3),
            anomaly_type=anomaly_type if anomaly_detected else None,
            confidence=round(min(1.0, unusual_score), 2),
            persistence_counter=self.persistence_counter
        )
