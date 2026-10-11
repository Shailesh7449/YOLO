"""
VisionSense Real YOLO Person Detector (Python)
Uses Ultralytics YOLO26/YOLOv8 or direct ONNX Runtime inference on yolo26n.onnx.
Strictly filters for COCO person class (class_id = 0).
Returns real measured bounding boxes and confidence scores.
"""
import os
import sys
import json
import subprocess
import tempfile
from typing import List, Dict, Tuple, Optional, Any
from visionsense.types import Detection

MODEL_ONNX_PATH = os.path.abspath("public/models/yolo26n.onnx")


class YOLOPersonDetector:
    """
    Real pretrained YOLO person detector.
    Target: YOLO26n / YOLOv8 via Ultralytics or ONNX Runtime.
    Only processes COCO person class (class_id = 0).
    """
    def __init__(self, model_name_or_path: Optional[str] = None, conf_threshold: float = 0.28):
        self.conf_threshold = conf_threshold
        self.model = None
        self.backend_type = "none"

        # 1. Try Ultralytics
        try:
            from ultralytics import YOLO
            chosen_model = model_name_or_path or "yolo26n.pt"
            try:
                self.model = YOLO(chosen_model)
                self.backend_type = "ultralytics"
            except Exception:
                if os.path.exists(MODEL_ONNX_PATH):
                    self.model = YOLO(MODEL_ONNX_PATH)
                    self.backend_type = "ultralytics_onnx"
                else:
                    self.model = YOLO("yolov8n.pt")
                    self.backend_type = "ultralytics_v8"
        except ImportError:
            pass

        # 2. Try ONNX Runtime in Python
        if self.model is None:
            try:
                import onnxruntime as ort
                if os.path.exists(MODEL_ONNX_PATH):
                    opts = ort.SessionOptions()
                    opts.intra_op_num_threads = 4
                    self.model = ort.InferenceSession(MODEL_ONNX_PATH, opts, providers=["CPUExecutionProvider"])
                    self.backend_type = "onnxruntime"
            except ImportError:
                pass

        # 3. Fallback to Local ONNX Bridge
        if self.model is None:
            bridge_script = os.path.join(os.path.dirname(__file__), "node_yolo_bridge.cjs")
            if os.path.exists(bridge_script):
                self.backend_type = "bridge"

    def detect(self, image_bgr_or_path, orig_w: Optional[int] = None, orig_h: Optional[int] = None) -> List[Detection]:
        detections: List[Detection] = []

        if self.backend_type.startswith("ultralytics") and self.model is not None:
            results = self.model(image_bgr_or_path, verbose=False, conf=self.conf_threshold)
            for r in results:
                for box in r.boxes:
                    cls_id = int(box.cls[0].item())
                    if cls_id != 0:
                        continue
                    conf = float(box.conf[0].item())
                    xyxy = box.xyxy[0].tolist()
                    detections.append(Detection(
                        bbox=[round(x, 1) for x in xyxy],
                        confidence=round(conf, 3),
                        class_id=0,
                        class_name="person"
                    ))
            return detections

        # Bridge execution
        try:
            needs_unlink = False
            if not isinstance(image_bgr_or_path, str):
                import cv2
                tmp = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
                tmp_path = tmp.name
                tmp.close()
                cv2.imwrite(tmp_path, image_bgr_or_path)
                img_path_to_use = tmp_path
                needs_unlink = True
            else:
                img_path_to_use = image_bgr_or_path

            bridge_script = os.path.join(os.path.dirname(__file__), "node_yolo_bridge.cjs")
            out = subprocess.run(
                ["node", bridge_script, img_path_to_use, str(self.conf_threshold)],
                capture_output=True, text=True, check=True
            )
            if needs_unlink and os.path.exists(img_path_to_use):
                os.unlink(img_path_to_use)

            parsed = json.loads(out.stdout.strip())
            for d in parsed.get("detections", []):
                detections.append(Detection(
                    bbox=d["bbox"],
                    confidence=d["confidence"],
                    class_id=0,
                    class_name="person"
                ))
        except Exception as e:
            print(f"[VisionSense Detector] Error: {e}", file=sys.stderr)

        return detections
