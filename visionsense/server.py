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
            resp = {
                "status": "online",
                "ready": True,
                "service": "VisionSense Python AI & MLOps Engine",
                "version": "1.0.0",
                "platform": sys.platform,
                "hardware": {
                    "device": "cuda:0" if (hasattr(sys, "modules") and "torch" in sys.modules and sys.modules["torch"].cuda.is_available()) else "cpu",
                    "gpu": "NVIDIA GeForce GTX 1650 (4 GB GDDR6)" if (hasattr(sys, "modules") and "torch" in sys.modules and sys.modules["torch"].cuda.is_available()) else "N/A"
                },
                "models": {
                    "person_detector": "Fine-Tuned YOLOv8n (Surveillance CCTV)",
                    "person_detector_baseline": "YOLO26n ONNX (End-to-End NMS-Free)",
                    "tracking": "ByteTrack Multi-Object Tracking (Greedy/Kalman)",
                    "motion_analysis": "Farneback Dense Optical Flow (48x27 Grid)",
                    "temporal_anomaly_model": "TemporalCrowdAnomalyNet (Bi-GRU + Attention)",
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
            meta = {
                "success": True,
                "person_detector": {
                    "active_checkpoint": "training/checkpoints/best_person_detector.pt",
                    "baseline_onnx": "public/models/yolo26n.onnx",
                    "exported_onnx": "training/checkpoints/yolo_person_finetuned.onnx",
                    "classes": {0: "person"},
                    "confidence_threshold": 0.28,
                    "input_resolution": [640, 640]
                },
                "temporal_anomaly_detector": {
                    "active_checkpoint": "training/checkpoints/temporal_anomaly_model.pt",
                    "exported_onnx": "training/checkpoints/temporal_anomaly_model.onnx",
                    "architecture": "TemporalCrowdAnomalyNet (Bi-directional GRU with Attention)",
                    "sequence_window": 24,
                    "feature_dim": 6,
                    "features": ["people_count", "count_delta", "velocity_x", "velocity_y", "motion_magnitude", "directional_dispersion"],
                    "classes": ["Normal Surveillance Flow", "Sudden Crowd Surge", "Rapid Dispersal", "Congestion Bottleneck"]
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
