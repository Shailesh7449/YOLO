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

DEFAULT_PORT = 5050

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
                    "violence_classifier": "Disabled (Documented: RWF-2000 Protocol Required)"
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
                    "status": "disabled",
                    "reason": "Requires licensed RWF-2000 video dataset and action recognition backbone. Modularly decoupled."
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
