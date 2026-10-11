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
                "service": "VisionSense Python Engine",
                "version": "1.0.0",
                "platform": sys.platform,
                "supported_models": ["Ultralytics YOLO26n", "ByteTrack", "Dense Optical Flow"],
                "crowd_safety_rule": "people_count <= 20: NORMAL, people_count > 20: WARNING"
            }
            self.wfile.write(json.dumps(resp).encode("utf-8"))
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

        if path == "/api/storage/analyze-image":
            content_len = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(content_len).decode("utf-8"))
            image_path = body.get("filePath") or body.get("path")
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
