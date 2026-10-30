"""
VisionSense Python HTTP Microservice & Storage Bridge Server
"""
import os
import sys
import json
import urllib.parse
import shutil
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Dict, Any, Optional

from visionsense.storage_bridge import (
    get_connected_drives, get_system_shortcuts, browse_directory
)
from visionsense.pipeline import analyze_image_file, analyze_video_file
from visionsense.detector import YOLOPersonDetector
from visionsense.temporal_analysis import TemporalMovementAnalysis
from visionsense.violence_detector import ViolenceDetector

DEFAULT_PORT = 5050

_VIOLENCE_DETECTOR: Optional[ViolenceDetector] = None

def get_violence_detector() -> Optional[ViolenceDetector]:
    global _VIOLENCE_DETECTOR
    if _VIOLENCE_DETECTOR is None:
        try:
            _VIOLENCE_DETECTOR = ViolenceDetector()
        except Exception as e:
            print(f"[Server] Violence detector initialization warning: {e}", file=sys.stderr)
    return _VIOLENCE_DETECTOR

class VisionSenseHTTPHandler(BaseHTTPRequestHandler):
    def _set_cors_headers(self, content_type: str = "application/json"):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Range, Authorization")
        self.send_header("Content-Type", content_type)

    def do_OPTIONS(self):
        self.send_response(204)
        self._set_cors_headers()
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        if path == "/api/health" or path == "/api/status":
            self.send_response(200)
            self._set_cors_headers()
            self.end_headers()
            try:
                detector = YOLOPersonDetector()
                det_meta = detector.get_metadata()
            except Exception as e:
                det_meta = {"name": "Unavailable", "model_path": None, "backend_type": "none", "provider": "N/A"}

            try:
                temporal = TemporalMovementAnalysis()
                temp_meta = temporal.get_metadata()
            except Exception:
                temp_meta = {"model_type": "heuristic"}

            cuda_avail = False
            gpu_name = "N/A"
            try:
                import torch
                cuda_avail = torch.cuda.is_available()
                if cuda_avail:
                    gpu_name = torch.cuda.get_device_name(0)
            except Exception:
                pass

            v_detector = get_violence_detector()
            v_status = v_detector.get_status() if v_detector else {"ready": False, "model_name": "Unavailable"}

            resp = {
                "status": "online",
                "ready": True,
                "service": "VisionSense Python AI & MLOps Engine",
                "version": "1.0.0",
                "platform": sys.platform,
                "hardware": {
                    "device": "cuda:0" if cuda_avail else "cpu",
                    "gpu": gpu_name if cuda_avail else "N/A"
                },
                "models": {
                    "person_detector": det_meta["name"],
                    "person_detector_checkpoint": det_meta["model_path"],
                    "person_detector_backend": det_meta["backend_type"],
                    "person_detector_provider": det_meta.get("provider", "CPU"),
                    "tracking": "ByteTrack Multi-Object Tracking (Greedy/Kalman)",
                    "motion_analysis": "Farneback Dense Optical Flow (48x27 Grid)",
                    "temporal_anomaly_model": f"TemporalCrowdAnomalyNet ({temp_meta.get('model_type', 'heuristic')})",
                    "violence_classifier": f"{v_status.get('model_name', 'R(2+1)D-18 / X3D-M')} ({v_status.get('backend', 'cpu')})",
                    "violence_ready": v_status.get("ready", False)
                },
                "crowd_safety_rule": "people_count <= 20: NORMAL, people_count > 20: WARNING"
            }
            self.wfile.write(json.dumps(resp).encode("utf-8"))
            return

        if path == "/api/models/metadata":
            self.send_response(200)
            self._set_cors_headers()
            self.end_headers()

            try:
                detector = YOLOPersonDetector()
                det_meta = detector.get_metadata()
            except Exception as e:
                det_meta = {"name": "Unavailable", "model_path": None, "backend_type": "none", "architecture": "none", "conf_threshold": 0.28, "input_resolution": [640, 640]}

            try:
                temporal = TemporalMovementAnalysis()
                temp_meta = temporal.get_metadata()
            except Exception:
                temp_meta = {"model_type": "heuristic", "window_size": 24, "classes": ["Normal", "Surge", "Dispersal", "Congestion"]}

            v_detector = get_violence_detector()

            meta = {
                "success": True,
                "person_detector": {
                    "active_checkpoint": det_meta["model_path"],
                    "active_model_name": det_meta["name"],
                    "active_backend": det_meta["backend_type"],
                    "active_architecture": det_meta.get("architecture", "yolov10_nms_free"),
                    "baseline_onnx": "public/models/yolo26n.onnx",
                    "finetuned_candidate_pt": "training/checkpoints/best_person_detector.pt",
                    "finetuned_candidate_onnx": "training/checkpoints/yolo_person_finetuned.onnx",
                    "candidate_status": "evaluated_baseline_active",
                    "classes": {0: "person"},
                    "confidence_threshold": det_meta.get("conf_threshold", 0.28),
                    "input_resolution": det_meta.get("input_resolution", [640, 640])
                },
                "temporal_anomaly_detector": {
                    "active_checkpoint": "training/checkpoints/temporal_anomaly_model.pt",
                    "exported_onnx": "training/checkpoints/temporal_anomaly_model.onnx",
                    "architecture": "TemporalCrowdAnomalyNet (Bi-directional GRU with Attention)",
                    "active_inference_engine": temp_meta.get("model_type", "heuristic"),
                    "sequence_window": temp_meta.get("window_size", 24),
                    "feature_dim": 6,
                    "features": ["people_count", "count_delta", "velocity_x", "velocity_y", "motion_magnitude", "directional_dispersion"],
                    "classes": temp_meta.get("classes", ["Normal", "Surge", "Dispersal", "Congestion"]),
                    "evaluation_note": "Validation accuracy on small benchmark does not guarantee general domain performance."
                },
                "violence_classifier": {
                    "status": "ready" if (v_detector and v_detector.is_ready) else "loading",
                    "active_model_name": v_detector.model_name if v_detector else "R(2+1)D-18 Fine-Tuned (RWF-2000)",
                    "active_backend": v_detector.backend_type if v_detector else "pytorch_cuda",
                    "architecture": "3D CNN (R(2+1)D-18 Spatio-Temporal Video Action Recognition with Multimodal Gating)",
                    "dataset": "RWF-2000 + AIRTLAB Surveillance Action Dataset",
                    "num_frames": v_detector.num_frames if v_detector else 32,
                    "confidence_threshold": v_detector.confidence_threshold if v_detector else 0.50,
                    "license": "MIT License (visionlab-ai/school-violence-detection-models)",
                    "checkpoints": {
                        "r2plus1d_finetuned_pt": "training/checkpoints/violence_r2plus1d_finetuned.pt",
                        "r2plus1d_best_baseline_pt": "training/checkpoints/violence_r2plus1d_best.pt",
                        "x3d_pt": "training/checkpoints/violence_x3d_realtime.pt",
                        "x3d_onnx": "training/checkpoints/violence_x3d_realtime.onnx"
                    }
                },
                "safety_engine": {
                    "crowd_threshold": 20,
                    "exact_rule": "count <= 20: NORMAL; count > 20: WARNING",
                    "persistence_debounce_frames": 3
                }
            }
            self.wfile.write(json.dumps(meta, indent=2).encode("utf-8"))
            return

        if path == "/api/models/evaluations":
            self.send_response(200)
            self._set_cors_headers()
            self.end_headers()
            evaluations = {}
            for report_file in ["baseline_detector_report.json", "yolo_finetune_report.json", "temporal_anomaly_report.json", "detector_comparison_report.json"]:
                p = os.path.join("training", "evaluation", report_file)
                if os.path.exists(p):
                    try:
                        with open(p, "r", encoding="utf-8") as f:
                            evaluations[report_file.replace(".json", "")] = json.load(f)
                    except Exception:
                        pass
            self.wfile.write(json.dumps({"success": True, "evaluations": evaluations}, indent=2).encode("utf-8"))
            return

        if path == "/api/storage/drives":
            drives = get_connected_drives()
            shortcuts = get_system_shortcuts()
            self.send_response(200)
            self._set_cors_headers()
            self.end_headers()
            resp = {
                "success": True,
                "drives": drives,
                "shortcuts": shortcuts,
                "platform": sys.platform
            }
            self.wfile.write(json.dumps(resp).encode("utf-8"))
            return

        if path == "/api/storage/browse":
            target_path = query.get("path", [None])[0]
            result = browse_directory(target_path)
            self.send_response(200)
            self._set_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps(result).encode("utf-8"))
            return

        self.send_response(404)
        self._set_cors_headers()
        self.end_headers()
        self.wfile.write(json.dumps({"error": "Endpoint not found"}).encode("utf-8"))

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == "/api/storage/analyze-image" or path == "/api/analyze-image":
            content_len = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(content_len).decode("utf-8"))
            image_path = body.get("filePath") or body.get("path") or body.get("imagePath")
            crowd_threshold = int(body.get("crowdThreshold", 20))

            if not image_path or not os.path.exists(image_path):
                self.send_response(400)
                self._set_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"error": f"Image file not found: {image_path}"}).encode("utf-8"))
                return

            try:
                result = analyze_image_file(image_path, crowd_threshold=crowd_threshold)
                self.send_response(200)
                self._set_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps(result).encode("utf-8"))
            except Exception as e:
                self.send_response(500)
                self._set_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
            return

        if path == "/api/analyze-video":
            content_len = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(content_len).decode("utf-8"))
            video_path = body.get("videoPath") or body.get("filePath")
            crowd_threshold = int(body.get("crowdThreshold", 20))

            if not video_path or not os.path.exists(video_path):
                self.send_response(400)
                self._set_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"error": f"Video not found: {video_path}"}).encode("utf-8"))
                return

            try:
                result = analyze_video_file(video_path, crowd_threshold=crowd_threshold)
                self.send_response(200)
                self._set_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps(result).encode("utf-8"))
            except Exception as e:
                self.send_response(500)
                self._set_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
            return

        if path == "/api/violence/predict":
            content_len = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(content_len).decode("utf-8"))
            video_path = body.get("videoPath") or body.get("filePath")
            base64_frames = body.get("frames") or body.get("frames_b64")
            source_id = body.get("source_id", "live_stream")
            timestamps = body.get("timestamps", [])
            tracks = body.get("tracks", [])
            segment = body.get("segment")

            v_detector = get_violence_detector()
            if not v_detector or not v_detector.is_ready:
                self.send_response(503)
                self._set_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Violence detection model not ready"}).encode("utf-8"))
                return

            if video_path and os.path.exists(video_path):
                import cv2
                import numpy as np
                cap = cv2.VideoCapture(video_path)
                total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
                fps_val = cap.get(cv2.CAP_PROP_FPS) or 30.0

                start_idx = 0
                end_idx = total_frames - 1
                if segment and len(segment) == 2:
                    start_idx = max(0, int(segment[0] * fps_val))
                    end_idx = min(total_frames - 1, int(segment[1] * fps_val))
                    if end_idx <= start_idx:
                        end_idx = total_frames - 1

                n_target = v_detector.num_frames
                if (end_idx - start_idx + 1) > n_target:
                    sampled_indices = np.linspace(start_idx, end_idx, n_target).astype(int)
                    sampled_set = set(sampled_indices)
                    frame_dict = {}
                    f_idx = 0
                    while f_idx <= end_idx:
                        ret, f = cap.read()
                        if not ret:
                            break
                        if f_idx in sampled_set:
                            frame_dict[f_idx] = f
                        f_idx += 1
                    cap.release()
                    last_f = None
                    frames = []
                    for i in sampled_indices:
                        if i in frame_dict:
                            last_f = frame_dict[i]
                            frames.append(last_f)
                        elif last_f is not None:
                            frames.append(last_f)
                    f_times = [float(i / fps_val) for i in sampled_indices]
                else:
                    frames = []
                    f_times = []
                    f_idx = 0
                    while f_idx <= end_idx:
                        ret, f = cap.read()
                        if not ret or f is None:
                            break
                        if f_idx >= start_idx:
                            frames.append(f)
                            f_times.append(float(f_idx / fps_val))
                        f_idx += 1
                    cap.release()

                pred = v_detector.predict_clip(frames, f_times, source_id=source_id, tracks=tracks)
                _, updated_tracks = v_detector.associate_participants(tracks, is_violence_candidate=pred.is_violence)
                self.send_response(200)
                self._set_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({
                    "success": True,
                    "prediction": pred.to_dict(),
                    "tracks": updated_tracks
                }).encode("utf-8"))
                return

            elif base64_frames and isinstance(base64_frames, list):
                import cv2
                import base64
                import numpy as np
                frames = []
                for b64 in base64_frames:
                    try:
                        if "," in b64:
                            b64 = b64.split(",", 1)[1]
                        img_bytes = base64.b64decode(b64)
                        np_arr = np.frombuffer(img_bytes, np.uint8)
                        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
                        if img is not None:
                            frames.append(img)
                    except Exception:
                        pass

                if len(timestamps) != len(frames):
                    timestamps = [i * 0.1 for i in range(len(frames))]

                pred = v_detector.predict_clip(frames, timestamps, source_id=source_id, tracks=tracks)
                _, updated_tracks = v_detector.associate_participants(tracks, is_violence_candidate=pred.is_violence)
                self.send_response(200)
                self._set_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({
                    "success": True,
                    "prediction": pred.to_dict(),
                    "tracks": updated_tracks
                }).encode("utf-8"))
                return

            self.send_response(400)
            self._set_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Either videoPath or frames (list of base64 images) must be provided"}).encode("utf-8"))
            return

        if path == "/api/violence/reset":
            v_detector = get_violence_detector()
            if v_detector:
                v_detector.reset()
            self.send_response(200)
            self._set_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({"success": True, "message": "Violence detector streaming state reset"}).encode("utf-8"))
            return

        self.send_response(404)
        self._set_cors_headers()
        self.end_headers()
        self.wfile.write(json.dumps({"error": "Endpoint not found"}).encode("utf-8"))

def run_server(port: int = DEFAULT_PORT):
    server_address = ("0.0.0.0", port)
    httpd = HTTPServer(server_address, VisionSenseHTTPHandler)
    print(f"VisionSense Python Backend Server running on port {port}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        httpd.server_close()
