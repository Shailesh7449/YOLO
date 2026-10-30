"""
VisionSense AI - Independent Violence & Fight Detection Module
Spatio-Temporal Video Action Recognition using fine-tuned 3D CNN (X3D-M / R(2+1)D-18)
Trained on RWF-2000 (Real-World Fight) Benchmark Dataset.

License: MIT License (visionlab-ai/school-violence-detection-models, PyTorchVideo)
"""

import os
import sys
import time
from collections import deque
from typing import List, Dict, Optional, Tuple, Any
import numpy as np

# Default checkpoint paths
DEFAULT_X3D_PT = os.path.abspath("training/checkpoints/violence_x3d_realtime.pt")
DEFAULT_X3D_ONNX = os.path.abspath("training/checkpoints/violence_x3d_realtime.onnx")
DEFAULT_R2PLUS1D_FINETUNED = os.path.abspath("training/checkpoints/violence_r2plus1d_finetuned.pt")
DEFAULT_R2PLUS1D_BEST = os.path.abspath("training/checkpoints/violence_r2plus1d_best.pt")
DEFAULT_R2PLUS1D_PT = DEFAULT_R2PLUS1D_FINETUNED if os.path.exists(DEFAULT_R2PLUS1D_FINETUNED) else DEFAULT_R2PLUS1D_BEST

# Standard normalization constants (RWF-2000 / Kinetics standard)
NORM_MEAN = np.array([0.45, 0.45, 0.45], dtype=np.float32)
NORM_STD = np.array([0.225, 0.225, 0.225], dtype=np.float32)


class ViolencePrediction:
    """Structured result from a video clip violence evaluation."""
    def __init__(
        self,
        label: str,
        is_violence: bool,
        confidence: float,
        start_timestamp: float,
        end_timestamp: float,
        source_id: str = "camera_stream",
        model_name: str = "R(2+1)D-18 Fine-Tuned (RWF-2000)",
        model_version: str = "v1.1.0",
        status: str = "SUCCESS",
        error_details: Optional[str] = None,
        latency_ms: float = 0.0,
        event_state: str = "NORMAL",
        motion_diff: float = 0.0,
        participant_track_ids: Optional[List[int]] = None,
        proximity_cluster: bool = False
    ):
        self.label = label  # "VIOLENCE" or "NON_VIOLENCE"
        self.is_violence = is_violence
        self.confidence = float(confidence)
        self.start_timestamp = float(start_timestamp)
        self.end_timestamp = float(end_timestamp)
        self.source_id = source_id
        self.model_name = model_name
        self.model_version = model_version
        self.status = status
        self.error_details = error_details
        self.latency_ms = float(latency_ms)
        self.event_state = event_state  # "ANALYZING" | "NORMAL" | "POSSIBLE" | "CONFIRMED" | "CLEARED"
        self.motion_diff = float(motion_diff)
        self.participant_track_ids = participant_track_ids or []
        self.proximity_cluster = proximity_cluster

    def to_dict(self) -> Dict[str, Any]:
        return {
            "label": self.label,
            "is_violence": self.is_violence,
            "confidence": round(self.confidence, 4),
            "start_timestamp": round(self.start_timestamp, 3),
            "end_timestamp": round(self.end_timestamp, 3),
            "source_id": self.source_id,
            "model_name": self.model_name,
            "model_version": self.model_version,
            "status": self.status,
            "error_details": self.error_details,
            "latency_ms": round(self.latency_ms, 2),
            "event_state": self.event_state,
            "motion_diff": round(self.motion_diff, 2),
            "participant_track_ids": self.participant_track_ids,
            "proximity_cluster": self.proximity_cluster
        }


class ViolenceDetector:
    """
    Independent Violence and Fight Detection Engine.
    Processes spatio-temporal video windows using R(2+1)D-18 / X3D-M.
    Provides clip prediction, sliding window streaming, event persistence, and deduplication.
    """
    def __init__(
        self,
        model_variant: str = "r2plus1d_18",  # Default to R(2+1)D-18 (83-93% benchmark accuracy on CCTV)
        checkpoint_path: Optional[str] = None,
        device: Optional[str] = None,  # "cuda" or "cpu" or None (auto)
        confidence_threshold: float = 0.50,  # 0.50 calibrated for R(2+1)D-18, 0.40 for X3D-M
        num_frames: int = 32,
        frame_size: Tuple[int, int] = (224, 224),
        sample_stride: int = 3,  # Sample every Nth frame (at 25-30 FPS, stride 3-4 spans 2.5-4s)
        persistence_threshold: int = 2,  # Must be violent for 2 consecutive windows to confirm
        cooldown_threshold: int = 3      # Consecutive normal windows required to reset state
    ):
        self.model_variant = model_variant
        self.confidence_threshold = confidence_threshold
        self.num_frames = num_frames
        self.frame_size = frame_size
        self.sample_stride = sample_stride
        self.persistence_threshold = persistence_threshold
        self.cooldown_threshold = cooldown_threshold

        self.model = None
        self.onnx_session = None
        self.backend_type = "none"
        self.model_name = "Unavailable"
        self.model_version = "v1.0.0"
        self.is_ready = False
        self.init_error = None

        # Rolling frame buffer for live streaming: store enough raw frames to span stride * num_frames
        max_buf = max(num_frames * sample_stride * 2, 128)
        self.frame_buffer = deque(maxlen=max_buf)
        self.time_buffer = deque(maxlen=max_buf)

        # State machine for event debouncing / deduplication
        self.active_state = "NORMAL"  # "NORMAL" or "VIOLENT"
        self.consecutive_violent_windows = 0
        self.consecutive_normal_windows = 0
        self.last_event_time = 0.0

        # Auto-detect device
        if device is None:
            try:
                import torch
                self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            except Exception:
                self.device = "cpu"
        else:
            try:
                import torch
                self.device = torch.device(device)
            except Exception:
                self.device = device

        self._load_model(model_variant, checkpoint_path)

    def _load_model(self, variant: str, custom_path: Optional[str] = None):
        """Loads selected model with explicit error handling."""
        try:
            if variant == "onnx" or (custom_path and custom_path.endswith(".onnx")):
                self._load_onnx(custom_path or DEFAULT_X3D_ONNX)
            elif variant == "r2plus1d_18":
                self._load_r2plus1d(custom_path or DEFAULT_R2PLUS1D_PT)
            else:
                # Default to X3D-M Realtime
                self._load_x3d_pytorch(custom_path or DEFAULT_X3D_PT)
        except Exception as e:
            self.is_ready = False
            self.init_error = str(e)
            print(f"[ViolenceDetector] Initialization failed: {e}", file=sys.stderr)

    def _load_x3d_pytorch(self, pt_path: str):
        """Loads X3D-M PyTorch model fine-tuned on RWF-2000."""
        import torch
        import torch.nn as nn

        if not os.path.exists(pt_path):
            # Fallback to ONNX if .pt missing
            if os.path.exists(DEFAULT_X3D_ONNX):
                print(f"[ViolenceDetector] PT checkpoint {pt_path} missing; falling back to ONNX.")
                self._load_onnx(DEFAULT_X3D_ONNX)
                return
            raise FileNotFoundError(f"Violence checkpoint not found at: {pt_path}")

        hub_model = torch.hub.load("facebookresearch/pytorchvideo", "x3d_m", pretrained=False)
        hub_model.blocks[5].proj = nn.Sequential(nn.Dropout(0.3), nn.Linear(2048, 2))

        ckpt = torch.load(pt_path, map_location="cpu", weights_only=False)
        state_dict = ckpt["model"] if "model" in ckpt else ckpt

        cleaned = {k[9:] if k.startswith("backbone.") else k: v for k, v in state_dict.items()}
        hub_model.load_state_dict(cleaned, strict=True)
        hub_model.to(self.device)
        hub_model.eval()

        self.model = hub_model
        self.backend_type = f"pytorch_{self.device.type if hasattr(self.device, 'type') else self.device}"
        self.model_name = "X3D-M Realtime (RWF-2000 Fine-Tuned)"
        self.num_frames = 16
        self.confidence_threshold = 0.40
        self.is_ready = True
        self.init_error = None
        print(f"[ViolenceDetector] Loaded {self.model_name} on {self.backend_type}")

    def _load_r2plus1d(self, pt_path: str):
        """Loads R(2+1)D-18 PyTorch model fine-tuned on RWF-2000."""
        import torch
        import torch.nn as nn
        from torchvision.models.video import r2plus1d_18

        if not os.path.exists(pt_path):
            raise FileNotFoundError(f"R(2+1)D-18 checkpoint not found at: {pt_path}")

        model = r2plus1d_18(weights=None)
        model.fc = nn.Sequential(nn.Dropout(0.5), nn.Linear(model.fc.in_features, 2))

        ckpt = torch.load(pt_path, map_location="cpu", weights_only=False)
        state_dict = ckpt["model"] if "model" in ckpt else ckpt
        cleaned = {k[9:] if k.startswith("backbone.") else k: v for k, v in state_dict.items()}

        model.load_state_dict(cleaned, strict=True)
        model.to(self.device)
        model.eval()

        self.model = model
        self.backend_type = f"pytorch_{self.device.type if hasattr(self.device, 'type') else self.device}"
        self.model_name = "R(2+1)D-18 Fine-Tuned (VisionSense Surveillance)" if "finetuned" in pt_path else "R(2+1)D-18 High-Accuracy (RWF-2000)"
        self.num_frames = ckpt.get("num_frames", 16) if isinstance(ckpt, dict) else 16
        self.confidence_threshold = 0.45
        self.is_ready = True
        self.init_error = None
        print(f"[ViolenceDetector] Loaded {self.model_name} on {self.backend_type}")

    def _load_onnx(self, onnx_path: str):
        """Loads ONNX Runtime session for cross-platform inference."""
        import onnxruntime as ort

        if not os.path.exists(onnx_path):
            raise FileNotFoundError(f"ONNX model not found at: {onnx_path}")

        opts = ort.SessionOptions()
        opts.intra_op_num_threads = 2
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

        providers = ["CPUExecutionProvider"]
        available = ort.get_available_providers()
        if "CUDAExecutionProvider" in available:
            providers.insert(0, "CUDAExecutionProvider")

        sess = ort.InferenceSession(onnx_path, sess_options=opts, providers=providers)
        self.onnx_session = sess
        self.backend_type = f"onnx_{sess.get_providers()[0]}"
        self.model_name = "X3D-M Realtime ONNX (RWF-2000)"
        self.num_frames = 16
        self.confidence_threshold = 0.40
        self.is_ready = True
        self.init_error = None
        print(f"[ViolenceDetector] Loaded {self.model_name} with provider {self.backend_type}")

    def reset(self):
        """Resets all rolling buffers and temporal debouncing state when switching video streams."""
        self.frame_buffer.clear()
        self.time_buffer.clear()
        self.active_state = "NORMAL"
        self.consecutive_violent_windows = 0
        self.consecutive_normal_windows = 0
        self.last_event_time = 0.0

    def get_status(self) -> Dict[str, Any]:
        """Returns health status and metadata for dashboard."""
        return {
            "ready": self.is_ready,
            "model_name": self.model_name,
            "model_version": self.model_version,
            "backend": self.backend_type,
            "required_frames": self.num_frames,
            "confidence_threshold": self.confidence_threshold,
            "error": self.init_error
        }

    def preprocess_frames(self, frames: List[np.ndarray]) -> np.ndarray:
        """
        Preprocesses a list of raw frames (RGB or BGR):
        - Resizes to (224, 224)
        - Normalizes with mean=[0.45, 0.45, 0.45], std=[0.225, 0.225, 0.225]
        - Formats to [1, 3, T, 224, 224] float32
        """
        import cv2

        processed = []
        for f in frames:
            if f is None or f.size == 0:
                f = np.zeros((*self.frame_size, 3), dtype=np.uint8)
            # Ensure RGB
            if len(f.shape) == 2:
                f = cv2.cvtColor(f, cv2.COLOR_GRAY2RGB)
            elif f.shape[2] == 4:
                f = cv2.cvtColor(f, cv2.COLOR_BGRA2RGB)
            elif f.shape[2] == 3:
                # Assume BGR from OpenCV, convert to RGB
                f = cv2.cvtColor(f, cv2.COLOR_BGR2RGB)

            if (f.shape[1], f.shape[0]) != self.frame_size:
                f = cv2.resize(f, self.frame_size, interpolation=cv2.INTER_LINEAR)
            processed.append(f)

        arr = np.stack(processed, axis=0).astype(np.float32) / 255.0  # [T, H, W, C]
        arr = (arr - NORM_MEAN) / NORM_STD
        # Transpose [T, H, W, C] -> [1, C, T, H, W]
        tensor_np = np.transpose(arr, (3, 0, 1, 2))[np.newaxis, ...]
        return tensor_np

    def compute_kinetic_motion(self, frames: List[np.ndarray]) -> float:
        """
        Calculates average inter-frame pixel intensity displacement across the temporal window.
        Suppresses false activations on static frames, frozen feeds, or non-moving postures.
        """
        import cv2
        if len(frames) < 2:
            return 0.0
        diffs = []
        step = max(1, len(frames) // 16)
        for i in range(step, len(frames), step):
            prev_f = frames[i - step]
            curr_f = frames[i]
            if prev_f is None or curr_f is None:
                continue
            g_prev = cv2.cvtColor(prev_f, cv2.COLOR_BGR2GRAY) if len(prev_f.shape) == 3 else prev_f
            g_curr = cv2.cvtColor(curr_f, cv2.COLOR_BGR2GRAY) if len(curr_f.shape) == 3 else curr_f
            if g_prev.shape != (112, 112):
                g_prev = cv2.resize(g_prev, (112, 112))
                g_curr = cv2.resize(g_curr, (112, 112))
            diffs.append(float(np.mean(np.abs(g_curr.astype(np.float32) - g_prev.astype(np.float32)))))
        return float(np.mean(diffs)) if diffs else 0.0

    def associate_participants(
        self,
        tracks: Optional[List[Dict[str, Any]]],
        is_violence_candidate: bool
    ) -> Tuple[List[int], List[Dict[str, Any]]]:
        """
        Associates person tracks with a violence event based on spatial proximity and bounding box overlap.
        Tracks in close physical contact (<220px or IoU > 0.05) are flagged as participants.
        Bystanders / distant persons remain normal.
        """
        if not tracks:
            return [], []

        if not is_violence_candidate:
            normal_tracks = []
            for t in tracks:
                tc = dict(t)
                tc["is_violence_participant"] = False
                tc["participant_role"] = "BYSTANDER"
                tc["violence_association_conf"] = 0.0
                normal_tracks.append(tc)
            return [], normal_tracks

        participant_ids = set()
        n = len(tracks)
        for i in range(n):
            b1 = tracks[i].get("bbox", [0, 0, 0, 0])
            c1 = tracks[i].get("centroid", [(b1[0] + b1[2]) / 2, (b1[1] + b1[3]) / 2])
            for j in range(i + 1, n):
                b2 = tracks[j].get("bbox", [0, 0, 0, 0])
                c2 = tracks[j].get("centroid", [(b2[0] + b2[2]) / 2, (b2[1] + b2[3]) / 2])

                dist = np.hypot(c1[0] - c2[0], c1[1] - c2[1])

                ix1 = max(b1[0], b2[0])
                iy1 = max(b1[1], b2[1])
                ix2 = min(b1[2], b2[2])
                iy2 = min(b1[3], b2[3])
                inter_area = max(0, ix2 - ix1) * max(0, iy2 - iy1)
                a1 = (b1[2] - b1[0]) * (b1[3] - b1[1])
                a2 = (b2[2] - b2[0]) * (b2[3] - b2[1])
                union_area = a1 + a2 - inter_area
                iou = (inter_area / union_area) if union_area > 0 else 0.0

                if dist < 220.0 or iou > 0.05:
                    participant_ids.add(tracks[i].get("track_id"))
                    participant_ids.add(tracks[j].get("track_id"))

        updated_tracks = []
        for t in tracks:
            tc = dict(t)
            tid = t.get("track_id")
            if tid in participant_ids:
                tc["is_violence_participant"] = True
                tc["participant_role"] = "POTENTIAL VIOLENCE PARTICIPANT"
                tc["violence_association_conf"] = 0.90
            else:
                tc["is_violence_participant"] = False
                tc["participant_role"] = "BYSTANDER"
                tc["violence_association_conf"] = 0.10
            updated_tracks.append(tc)

        return list(participant_ids), updated_tracks

    def predict_clip(
        self,
        frames: List[np.ndarray],
        timestamps: Optional[List[float]] = None,
        source_id: str = "camera_stream",
        tracks: Optional[List[Dict[str, Any]]] = None
    ) -> ViolencePrediction:
        """
        Executes action recognition on an exact temporal window of frames with kinetic and proximity gating.
        """
        if timestamps is None:
            timestamps = [float(i) * 0.04 for i in range(len(frames))]
        if not self.is_ready:
            return ViolencePrediction(
                label="NON_VIOLENCE",
                is_violence=False,
                confidence=0.0,
                start_timestamp=timestamps[0] if timestamps else 0.0,
                end_timestamp=timestamps[-1] if timestamps else 0.0,
                source_id=source_id,
                model_name=self.model_name,
                status="ERROR",
                error_details=f"Model not initialized: {self.init_error}",
                event_state="NORMAL"
            )

        if len(frames) < self.num_frames:
            last_frame = frames[-1] if frames else np.zeros((*self.frame_size, 3), dtype=np.uint8)
            frames = list(frames) + [last_frame] * (self.num_frames - len(frames))
            last_ts = timestamps[-1] if timestamps else 0.0
            timestamps = list(timestamps) + [last_ts] * (self.num_frames - len(timestamps))
        elif len(frames) > self.num_frames:
            idx = np.linspace(0, len(frames) - 1, self.num_frames).astype(int)
            frames = [frames[i] for i in idx]
            timestamps = [timestamps[i] for i in idx]

        start_ts = timestamps[0] if timestamps else 0.0
        end_ts = timestamps[-1] if timestamps else start_ts

        t0 = time.perf_counter()
        motion_diff = self.compute_kinetic_motion(frames)
        tensor_np = self.preprocess_frames(frames)

        try:
            if self.onnx_session is not None:
                onnx_out = self.onnx_session.run(["logits"], {"video_input": tensor_np})[0]
                exp_logits = np.exp(onnx_out - np.max(onnx_out, axis=1, keepdims=True))
                probs = (exp_logits / np.sum(exp_logits, axis=1, keepdims=True))[0]
            else:
                import torch
                tensor = torch.from_numpy(tensor_np).to(self.device)
                with torch.no_grad():
                    logits = self.model(tensor)
                    probs = torch.softmax(logits, dim=1).cpu().numpy()[0]

            # RWF-2000 convention: Index 0 is Fight (Violence), Index 1 is NonFight
            raw_p_violence = float(probs[0])

            # Kinetic Gating: Suppress static frame false positives
            if motion_diff < 2.8:
                calibrated_violence = raw_p_violence * min(1.0, motion_diff / 3.0)
            else:
                calibrated_violence = raw_p_violence

            participant_ids, _ = self.associate_participants(
                tracks,
                is_violence_candidate=(calibrated_violence >= self.confidence_threshold)
            )

            has_proximity = bool(participant_ids) if (tracks and len(tracks) >= 2) else True

            is_violent = (calibrated_violence >= self.confidence_threshold) and (motion_diff >= 2.8) and has_proximity
            label = "VIOLENCE" if is_violent else "NON_VIOLENCE"
            event_state = "CONFIRMED" if is_violent else ("POSSIBLE" if (raw_p_violence >= self.confidence_threshold and motion_diff >= 2.5) else "NORMAL")

            latency_ms = (time.perf_counter() - t0) * 1000

            return ViolencePrediction(
                label=label,
                is_violence=is_violent,
                confidence=calibrated_violence,
                start_timestamp=start_ts,
                end_timestamp=end_ts,
                source_id=source_id,
                model_name=self.model_name,
                status="SUCCESS",
                latency_ms=latency_ms,
                event_state=event_state,
                motion_diff=motion_diff,
                participant_track_ids=participant_ids,
                proximity_cluster=bool(participant_ids)
            )

        except Exception as e:
            return ViolencePrediction(
                label="NON_VIOLENCE",
                is_violence=False,
                confidence=0.0,
                start_timestamp=start_ts,
                end_timestamp=end_ts,
                source_id=source_id,
                model_name=self.model_name,
                status="ERROR",
                error_details=str(e),
                latency_ms=(time.perf_counter() - t0) * 1000,
                event_state="NORMAL"
            )

    def ingest_stream_frame(
        self,
        frame: np.ndarray,
        timestamp: float,
        source_id: str = "camera_stream",
        stride_frames: int = 8,
        tracks: Optional[List[Dict[str, Any]]] = None
    ) -> Tuple[Optional[ViolencePrediction], Optional[str]]:
        """
        Ingests a frame into the sliding window queue.
        When enough frames have accumulated and stride interval is met, runs prediction.
        Returns:
            (prediction, event_trigger):
                - prediction: The latest ViolencePrediction (or None if window not full)
                - event_trigger: "VIOLENCE_INCIDENT_STARTED" if a new confirmed event begins,
                                 "VIOLENCE_INCIDENT_RESOLVED" if returning to normal,
                                 or None if state unchanged.
        """
        self.frame_buffer.append(frame.copy())
        self.time_buffer.append(timestamp)

        # Minimum required buffer length to draw num_frames with sample_stride
        required_span = self.num_frames * self.sample_stride
        if len(self.frame_buffer) < required_span:
            return None, None

        if len(self.frame_buffer) % stride_frames != 0:
            return None, None

        # Sample num_frames uniformly across the temporal window
        buf_frames = list(self.frame_buffer)
        buf_times = list(self.time_buffer)
        sampled_indices = [
            len(buf_frames) - 1 - i * self.sample_stride
            for i in reversed(range(self.num_frames))
        ]
        recent_frames = [buf_frames[i] for i in sampled_indices]
        recent_times = [buf_times[i] for i in sampled_indices]

        pred = self.predict_clip(recent_frames, recent_times, source_id=source_id, tracks=tracks)
        event_trigger = None

        if pred.is_violence:
            self.consecutive_violent_windows += 1
            self.consecutive_normal_windows = 0

            # Check if entering confirmed violent state (persistence filter)
            if self.consecutive_violent_windows >= self.persistence_threshold:
                if self.active_state == "NORMAL":
                    self.active_state = "VIOLENT"
                    self.last_event_time = timestamp
                    event_trigger = "VIOLENCE_INCIDENT_STARTED"
        else:
            self.consecutive_normal_windows += 1
            self.consecutive_violent_windows = 0

            # Check if returning to normal state (cooldown filter)
            if self.consecutive_normal_windows >= self.cooldown_threshold:
                if self.active_state == "VIOLENT":
                    self.active_state = "NORMAL"
                    event_trigger = "VIOLENCE_INCIDENT_RESOLVED"

        return pred, event_trigger

    def reset(self):
        """Resets streaming buffers and debouncing states."""
        self.frame_buffer.clear()
        self.time_buffer.clear()
        self.active_state = "NORMAL"
        self.consecutive_violent_windows = 0
        self.consecutive_normal_windows = 0
        self.last_event_time = 0.0
