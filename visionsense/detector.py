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
import numpy as np
import cv2

from visionsense.types import Detection

MODEL_ONNX_PATH = os.path.abspath("public/models/yolo26n.onnx")


class YOLOPersonDetector:
    """
    VisionSense Real YOLO Person Detector.
    Supports:
      1. Native ONNX Runtime inference on yolo26n.onnx (End-to-End NMS-Free YOLO).
      2. Ultralytics PyTorch checkpoints (.pt) for fine-tuned or baseline models.
      3. Fallback bridge if dependencies unavailable.
    Strictly filters for COCO person class (class_id = 0).
    """
    def __init__(self, model_name_or_path: Optional[str] = None, conf_threshold: float = 0.28):
        self.conf_threshold = conf_threshold
        self.model = None
        self.backend_type = "none"
        self.model_path = model_name_or_path or MODEL_ONNX_PATH

        # 1. If explicit .pt or Ultralytics model requested
        if self.model_path.endswith(".pt"):
            try:
                from ultralytics import YOLO
                self.model = YOLO(self.model_path)
                self.backend_type = "ultralytics_pt"
                return
            except Exception as e:
                print(f"[VisionSense Detector] Warning: Failed to load .pt checkpoint: {e}", file=sys.stderr)

        # 2. Try native ONNX Runtime
        if os.path.exists(self.model_path) and self.model_path.endswith(".onnx"):
            try:
                import onnxruntime as ort
                opts = ort.SessionOptions()
                opts.intra_op_num_threads = 4
                available = ort.get_available_providers()
                providers = [p for p in ["CUDAExecutionProvider", "CPUExecutionProvider"] if p in available]
                self.model = ort.InferenceSession(self.model_path, opts, providers=providers)
                self.backend_type = "onnxruntime"
                self.active_provider = self.model.get_providers()[0] if self.model.get_providers() else "CPU"
                return
            except Exception as e:
                print(f"[VisionSense Detector] Warning: Failed to load ONNX Runtime: {e}", file=sys.stderr)

        # 3. Try Ultralytics default
        try:
            from ultralytics import YOLO
            if os.path.exists(self.model_path):
                self.model = YOLO(self.model_path)
                self.backend_type = "ultralytics_onnx"
            else:
                self.model = YOLO("yolov8n.pt")
                self.backend_type = "ultralytics_v8"
            return
        except Exception:
            pass

        # 4. Fallback bridge
        bridge_script = os.path.join(os.path.dirname(__file__), "node_yolo_bridge.cjs")
        if os.path.exists(bridge_script):
            self.backend_type = "bridge"

    def _preprocess_onnx(self, img_bgr: np.ndarray, target_size: int = 640) -> Tuple[np.ndarray, Tuple[float, int, int, int, int]]:
        h, w = img_bgr.shape[:2]
        scale = min(target_size / w, target_size / h)
        nw, nh = int(round(w * scale)), int(round(h * scale))
        resized = cv2.resize(img_bgr, (nw, nh), interpolation=cv2.INTER_LINEAR)
        pad_x = (target_size - nw) // 2
        pad_y = (target_size - nh) // 2

        padded = np.zeros((target_size, target_size, 3), dtype=np.uint8)
        padded[pad_y:pad_y + nh, pad_x:pad_x + nw] = resized

        # BGR to RGB, float32, normalized to [0, 1]
        rgb = cv2.cvtColor(padded, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        # HWC -> CHW -> NCHW
        chw = np.transpose(rgb, (2, 0, 1))
        tensor = np.expand_dims(chw, axis=0)
        return tensor, (scale, pad_x, pad_y, w, h)

    def _postprocess_onnx(self, outputs: List[np.ndarray], meta: Tuple[float, int, int, int, int]) -> List[Detection]:
        scale, pad_x, pad_y, orig_w, orig_h = meta
        logits = outputs[0]  # [1, 300, 80]
        pred_boxes = outputs[1]  # [1, 300, 4]

        # Class 0 = Person. Sigmoid activation
        person_logits = logits[0, :, 0]
        confs = 1.0 / (1.0 + np.exp(-person_logits))
        boxes = pred_boxes[0]

        mask = confs >= self.conf_threshold
        matched_indices = np.where(mask)[0]

        detections: List[Detection] = []
        for idx in matched_indices:
            conf = float(confs[idx])
            cx_640 = boxes[idx, 0] * 640.0
            cy_640 = boxes[idx, 1] * 640.0
            bw_640 = boxes[idx, 2] * 640.0
            bh_640 = boxes[idx, 3] * 640.0

            orig_cx = (cx_640 - pad_x) / scale
            orig_cy = (cy_640 - pad_y) / scale
            orig_w_box = bw_640 / scale
            orig_h_box = bh_640 / scale

            x1 = max(0.0, min(float(orig_w), orig_cx - orig_w_box / 2.0))
            y1 = max(0.0, min(float(orig_h), orig_cy - orig_h_box / 2.0))
            x2 = max(0.0, min(float(orig_w), orig_cx + orig_w_box / 2.0))
            y2 = max(0.0, min(float(orig_h), orig_cy + orig_h_box / 2.0))

            if (x2 - x1) > 5 and (y2 - y1) > 5:
                detections.append(Detection(
                    bbox=[round(float(x1), 1), round(float(y1), 1), round(float(x2), 1), round(float(y2), 1)],
                    confidence=round(float(conf), 3),
                    class_id=0,
                    class_name="person"
                ))
        return detections

    def detect(self, image_bgr_or_path, orig_w: Optional[int] = None, orig_h: Optional[int] = None) -> List[Detection]:
        detections: List[Detection] = []

        # Load image if path given
        if isinstance(image_bgr_or_path, str):
            if not os.path.exists(image_bgr_or_path):
                return []
            img_bgr = cv2.imread(image_bgr_or_path)
            if img_bgr is None:
                return []
        else:
            img_bgr = image_bgr_or_path

        # 1. Native ONNX Runtime path
        if self.backend_type == "onnxruntime" and self.model is not None:
            tensor, meta = self._preprocess_onnx(img_bgr, target_size=640)
            input_name = self.model.get_inputs()[0].name
            outputs = self.model.run(None, {input_name: tensor})
            return self._postprocess_onnx(outputs, meta)

        # 2. Ultralytics path
        if self.backend_type.startswith("ultralytics") and self.model is not None:
            results = self.model(img_bgr, verbose=False, conf=self.conf_threshold)
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

        # 3. Fallback Bridge execution
        try:
            needs_unlink = False
            if not isinstance(image_bgr_or_path, str):
                tmp = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
                tmp_path = tmp.name
                tmp.close()
                cv2.imwrite(tmp_path, img_bgr)
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
