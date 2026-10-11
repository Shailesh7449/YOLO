"""
VisionSense Temporal Movement & Crowd Anomaly Analysis (Python)
Integrates trained TemporalCrowdAnomalyNet (Bi-GRU + Attention) with graceful fallback.
"""
import os
import sys
from collections import deque
from typing import Optional, List
import numpy as np

from visionsense.types import TemporalAnalysisResult, FlowMetrics

TEMPORAL_MODEL_PT = os.path.abspath("training/checkpoints/temporal_anomaly_model.pt")
TEMPORAL_MODEL_ONNX = os.path.abspath("training/checkpoints/temporal_anomaly_model.onnx")


class TemporalMovementAnalysis:
    """
    Temporal Movement Analysis Engine.
    Executes trained TemporalCrowdAnomalyNet neural network on rolling 24-frame feature windows:
      [people_count, count_delta, vx, vy, motion_magnitude, directional_dispersion]
    Outputs predicted anomaly class and continuous anomaly score with debounce persistence.
    """
    def __init__(self, window_size: int = 24, model_path: Optional[str] = None):
        self.window_size = window_size
        self.history = deque(maxlen=window_size)
        self.persistence_counter = 0
        self.model_type = "heuristic"
        self.model = None
        self.mean = None
        self.std = None
        self.class_names = ["Normal Surveillance Flow", "Sudden Crowd Surge", "Rapid Dispersal", "Congestion Bottleneck"]

        # Attempt to load trained PyTorch checkpoint
        target_pt = model_path or TEMPORAL_MODEL_PT
        if os.path.exists(target_pt) and target_pt.endswith(".pt"):
            try:
                import torch
                from training.scripts.train_temporal_model import TemporalCrowdAnomalyNet
                device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
                checkpoint = torch.load(target_pt, map_location=device)
                net = TemporalCrowdAnomalyNet(in_features=6, hidden_dim=32, num_classes=4)
                net.load_state_dict(checkpoint["model_state_dict"])
                net.to(device)
                net.eval()

                self.model = net
                self.device = device
                self.mean = np.array(checkpoint["normalization"]["mean"], dtype=np.float32)
                self.std = np.array(checkpoint["normalization"]["std"], dtype=np.float32)
                self.class_names = checkpoint.get("class_names", self.class_names)
                self.model_type = "neural_pytorch"
            except Exception as e:
                pass

        # Attempt to load trained ONNX model if PyTorch not active
        if self.model is None and os.path.exists(TEMPORAL_MODEL_ONNX):
            try:
                import onnxruntime as ort
                opts = ort.SessionOptions()
                opts.intra_op_num_threads = 2
                self.model = ort.InferenceSession(TEMPORAL_MODEL_ONNX, opts, providers=["CPUExecutionProvider"])
                self.model_type = "neural_onnx"
            except Exception:
                pass

    def update(self, people_count: int, flow_metrics: FlowMetrics) -> TemporalAnalysisResult:
        first_count = self.history[0]["people_count"] if len(self.history) > 0 else people_count
        count_delta = people_count - first_count

        record = {
            "people_count": float(people_count),
            "count_delta": float(count_delta),
            "vx": float(flow_metrics.avg_velocity_x),
            "vy": float(flow_metrics.avg_velocity_y),
            "magnitude": float(flow_metrics.motion_magnitude),
            "dispersion": float(flow_metrics.directional_dispersion)
        }
        self.history.append(record)

        if len(self.history) < 5:
            return TemporalAnalysisResult(False, 0.0, None, 0.0, 0)

        unusual_score = 0.0
        anomaly_type = None

        # 1. Neural forward pass if model loaded
        if self.model_type == "neural_pytorch" and self.model is not None:
            try:
                import torch
                # Build feature window of size 24 (pad if history < 24)
                raw_seq = np.zeros((1, self.window_size, 6), dtype=np.float32)
                hist_list = list(self.history)
                for t, r in enumerate(hist_list):
                    idx = self.window_size - len(hist_list) + t
                    raw_seq[0, idx] = [r["people_count"], r["count_delta"], r["vx"], r["vy"], r["magnitude"], r["dispersion"]]

                # Normalize using dataset stats
                if self.mean is not None and self.std is not None:
                    norm_seq = (raw_seq - self.mean) / self.std
                else:
                    norm_seq = raw_seq

                tensor = torch.tensor(norm_seq, dtype=torch.float32, device=self.device)
                with torch.no_grad():
                    logits = self.model(tensor)
                    probs = torch.softmax(logits, dim=1).cpu().numpy()[0]
                    pred_cls = int(np.argmax(probs))

                # Anomaly score is probability of non-normal event
                unusual_score = float(1.0 - probs[0])
                if pred_cls != 0:
                    anomaly_type = self.class_names[pred_cls]
            except Exception:
                self.model_type = "heuristic"

        # 2. Heuristic fallback
        if self.model_type == "heuristic":
            recent_mag = [r["magnitude"] for r in list(self.history)[-5:]]
            older_mag = [r["magnitude"] for r in list(self.history)[:-5]]
            mag_jump = (sum(recent_mag) / len(recent_mag)) - (sum(older_mag) / len(older_mag)) if older_mag else 0.0
            avg_motion = sum(r["magnitude"] for r in self.history) / len(self.history)

            if mag_jump > 2.5 and people_count > 5:
                unusual_score = min(1.0, 0.4 + (mag_jump / 5.0) * 0.6)
                anomaly_type = "Sudden Crowd Surge / Acceleration"
            elif count_delta < -8 and avg_motion > 0.4:
                unusual_score = min(1.0, 0.5 + abs(count_delta) * 0.05)
                anomaly_type = "Rapid Dispersal / Evacuation Pattern"
            elif people_count > 15 and avg_motion < 0.05:
                unusual_score = min(1.0, 0.3 + (people_count / 30.0) * 0.5)
                anomaly_type = "Congestion Stagnation / Bottleneck"
            else:
                unusual_score = round(min(1.0, avg_motion * 0.15), 3)

        # Persistence debounce
        if unusual_score > 0.65:
            self.persistence_counter += 1
        else:
            self.persistence_counter = max(0, self.persistence_counter - 1)

        anomaly_detected = self.persistence_counter >= 3 and unusual_score > 0.65

        return TemporalAnalysisResult(
            anomaly_detected=anomaly_detected,
            unusual_movement_score=round(float(unusual_score), 3),
            anomaly_type=anomaly_type if anomaly_detected else None,
            confidence=round(min(1.0, float(unusual_score)), 2),
            persistence_counter=self.persistence_counter
        )
