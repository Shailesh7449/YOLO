"""
VisionSense Real YOLO Person Detector (Python)
Supports:
  1. Native ONNX Runtime inference on yolo26n.onnx (End-to-End NMS-Free YOLO).
  2. Native ONNX Runtime inference on exported YOLOv8 standard ONNX models.
  3. Ultralytics PyTorch checkpoints (.pt) for fine-tuned or baseline models.
  4. Fallback bridge if dependencies unavailable.
Strictly filters for person class (class_id = 0).
Returns real measured bounding boxes and confidence scores.
"""
import os
import sys
import json
import math
import subprocess
import tempfile
from typing import List, Dict, Tuple, Optional, Any
import numpy as np
import cv2

from visionsense.types import Detection

DEFAULT_BASELINE_ONNX = os.path.abspath("public/models/yolo26n.onnx")
MODEL_ONNX_PATH = DEFAULT_BASELINE_ONNX


def _calculate_iou(boxA: List[float], boxB: List[float]) -> float:
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])
    inter = max(0.0, xB - xA) * max(0.0, yB - yA)
    areaA = max(0.0, boxA[2] - boxA[0]) * max(0.0, boxA[3] - boxA[1])
    areaB = max(0.0, boxB[2] - boxB[0]) * max(0.0, boxB[3] - boxB[1])
    union = areaA + areaB - inter
    return inter / union if union > 0 else 0.0


def _nms(boxes: List[List[float]], scores: List[float], iou_thresh: float = 0.5) -> List[int]:
    if len(boxes) == 0:
        return []
    idxs = np.argsort(scores)[::-1]
    keep = []
    while len(idxs) > 0:
        curr = idxs[0]
        keep.append(int(curr))
        if len(idxs) == 1:
            break
        rem = idxs[1:]
        ious = np.array([_calculate_iou(boxes[curr], boxes[j]) for j in rem])
        idxs = rem[ious < iou_thresh]
    return keep


class YOLOPersonDetector:
    """
    VisionSense Real YOLO Person Detector.
    Strictly filters for COCO person class (class_id = 0).
    """
    def __init__(self, model_name_or_path: Optional[str] = None, conf_threshold: float = 0.28):
        self.conf_threshold = conf_threshold
        self.model = None
        self.backend_type = "none"
        self.architecture = "unknown"
        self.model_name = "Unknown Detector"
        self.active_provider = "CPU"
        self.model_path = model_name_or_path or os.environ.get("VISIONSENSE_MODEL_PATH") or MODEL_ONNX_PATH

        # 1. If explicit .pt or Ultralytics model requested
        if self.model_path.endswith(".pt"):
            if not os.path.exists(self.model_path):
                raise FileNotFoundError(f"PyTorch checkpoint not found: {self.model_path}")
            try:
                from ultralytics import YOLO
                self.model = YOLO(self.model_path)
                self.backend_type = "ultralytics_pt"
                self.architecture = "pytorch_yolo"
                self.model_name = "Ultralytics PyTorch Checkpoint"
                import torch
                self.active_provider = "cuda:0" if torch.cuda.is_available() else "cpu"
                return
            except Exception as e:
                print(f"[VisionSense Detector] Warning: Failed to load .pt checkpoint: {e}", file=sys.stderr)
                raise

        # 2. Try native ONNX Runtime
        if self.model_path.endswith(".onnx"):
            if not os.path.exists(self.model_path):
                raise FileNotFoundError(f"ONNX model file not found: {self.model_path}")
            try:
                import onnxruntime as ort
                opts = ort.SessionOptions()
                opts.intra_op_num_threads = 4
                available = ort.get_available_providers()
                providers = [p for p in ["CUDAExecutionProvider", "CPUExecutionProvider"] if p in available]
                self.model = ort.InferenceSession(self.model_path, opts, providers=providers)
                self.backend_type = "onnxruntime"
                self.active_provider = self.model.get_providers()[0] if self.model.get_providers() else "CPU"

                # Inspect ONNX outputs to diagnose architecture
                outputs = self.model.get_outputs()
                out_names = [o.name for o in outputs]
                out_shapes = [list(o.shape) for o in outputs]

                # Case A: End-to-End NMS-Free (e.g. YOLOv10/yolo26n: logits and pred_boxes)
                if len(outputs) >= 2 and ("logits" in out_names or out_shapes[0][-1] == 80):
                    self.architecture = "yolov10_nms_free"
                    self.model_name = "YOLO26n ONNX (End-to-End NMS-Free)"
                # Case B: Standard YOLOv8 export (single output: [batch, 4+nc, anchors], e.g. [1, 5, 8400])
                elif len(outputs) == 1 and len(out_shapes[0]) == 3 and out_shapes[0][1] in (5, 84, 85):
                    self.architecture = "yolov8_standard"
                    self.model_name = "Fine-Tuned YOLOv8n ONNX"
                else:
                    raise ValueError(
                        f"Unsupported ONNX model architecture in '{self.model_path}'. "
                        f"Outputs: {[(o.name, o.shape) for o in outputs]}. "
                        "Expected either End-to-End NMS-Free (2 outputs: logits, pred_boxes) "
                        "or Standard YOLOv8 (1 output: [batch, 4+nc, anchors])."
                    )
                return
            except Exception as e:
                print(f"[VisionSense Detector] Error initializing ONNX Runtime for '{self.model_path}': {e}", file=sys.stderr)
                raise

        # 3. Fallback bridge
        bridge_script = os.path.join(os.path.dirname(__file__), "node_yolo_bridge.cjs")
        if os.path.exists(bridge_script):
            self.backend_type = "bridge"
            self.architecture = "node_bridge"
            self.model_name = "Node ONNX Bridge"

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
        detections: List[Detection] = []

        if self.architecture == "yolov10_nms_free":
            # Output 0: logits [1, 300, num_classes], Output 1: pred_boxes [1, 300, 4]
            logits = outputs[0][0]
            pred_boxes = outputs[1][0]

            # Person is class 0
            person_logits = logits[:, 0]
            # Sigmoid activation to convert logits to confidence in [0, 1]
            confs = 1.0 / (1.0 + np.exp(-np.clip(person_logits, -30.0, 30.0)))

            mask = confs >= self.conf_threshold
            matched_indices = np.where(mask)[0]

            cand_boxes = []
            cand_scores = []
            for idx in matched_indices:
                conf = float(confs[idx])
                if not math.isfinite(conf):
                    continue
                # Normalized center coordinates [0, 1] relative to 640x640 letterbox
                cx_640 = float(pred_boxes[idx, 0]) * 640.0
                cy_640 = float(pred_boxes[idx, 1]) * 640.0
                bw_640 = float(pred_boxes[idx, 2]) * 640.0
                bh_640 = float(pred_boxes[idx, 3]) * 640.0

                orig_cx = (cx_640 - pad_x) / scale
                orig_cy = (cy_640 - pad_y) / scale
                orig_w_box = bw_640 / scale
                orig_h_box = bh_640 / scale

                x1 = max(0.0, min(float(orig_w), orig_cx - orig_w_box / 2.0))
                y1 = max(0.0, min(float(orig_h), orig_cy - orig_h_box / 2.0))
                x2 = max(0.0, min(float(orig_w), orig_cx + orig_w_box / 2.0))
                y2 = max(0.0, min(float(orig_h), orig_cy + orig_h_box / 2.0))

                if (x2 - x1) > 5 and (y2 - y1) > 5:
                    cand_boxes.append([x1, y1, x2, y2])
                    cand_scores.append(conf)

            # Duplicate suppression for queries
            kept_indices = _nms(cand_boxes, cand_scores, iou_thresh=0.65)
            for k in kept_indices:
                b = cand_boxes[k]
                detections.append(Detection(
                    bbox=[round(b[0], 1), round(b[1], 1), round(b[2], 1), round(b[3], 1)],
                    confidence=round(cand_scores[k], 3),
                    class_id=0,
                    class_name="person"
                ))

        elif self.architecture == "yolov8_standard":
            # Output 0: [1, 4 + num_classes, num_anchors] e.g. [1, 5, 8400]
            out0 = outputs[0][0]
            scores = out0[4]  # class 0 probability (already sigmoid activated)
            mask = scores >= self.conf_threshold
            matched_indices = np.where(mask)[0]

            cand_boxes = []
            cand_scores = []
            for idx in matched_indices:
                conf = float(scores[idx])
                if not math.isfinite(conf):
                    continue
                cx = float(out0[0, idx])
                cy = float(out0[1, idx])
                bw = float(out0[2, idx])
                bh = float(out0[3, idx])

                orig_cx = (cx - pad_x) / scale
                orig_cy = (cy - pad_y) / scale
                orig_w_box = bw / scale
                orig_h_box = bh / scale

                x1 = max(0.0, min(float(orig_w), orig_cx - orig_w_box / 2.0))
                y1 = max(0.0, min(float(orig_h), orig_cy - orig_h_box / 2.0))
                x2 = max(0.0, min(float(orig_w), orig_cx + orig_w_box / 2.0))
                y2 = max(0.0, min(float(orig_h), orig_cy + orig_h_box / 2.0))

                if (x2 - x1) > 5 and (y2 - y1) > 5:
                    cand_boxes.append([x1, y1, x2, y2])
                    cand_scores.append(conf)

            # Standard NMS (IoU threshold 0.45)
            kept_indices = _nms(cand_boxes, cand_scores, iou_thresh=0.45)
            for k in kept_indices:
                b = cand_boxes[k]
                detections.append(Detection(
                    bbox=[round(b[0], 1), round(b[1], 1), round(b[2], 1), round(b[3], 1)],
                    confidence=round(cand_scores[k], 3),
                    class_id=0,
                    class_name="person"
                ))
        else:
            raise ValueError(f"Unknown architecture '{self.architecture}' in postprocessing")

        return detections

    def detect(self, image_bgr_or_path, orig_w: Optional[int] = None, orig_h: Optional[int] = None) -> List[Detection]:
        # Load image if path given
        if isinstance(image_bgr_or_path, str):
            if not os.path.exists(image_bgr_or_path):
                raise FileNotFoundError(f"Image file not found: {image_bgr_or_path}")
            img_bgr = cv2.imread(image_bgr_or_path)
            if img_bgr is None:
                raise ValueError(f"Failed to decode image file: {image_bgr_or_path}")
        else:
            img_bgr = image_bgr_or_path

        if img_bgr is None or not hasattr(img_bgr, "shape"):
            raise ValueError("Invalid image provided to detector")

        # 1. Native ONNX Runtime path
        if self.backend_type == "onnxruntime" and self.model is not None:
            tensor, meta = self._preprocess_onnx(img_bgr, target_size=640)
            input_name = self.model.get_inputs()[0].name
            outputs = self.model.run(None, {input_name: tensor})
            return self._postprocess_onnx(outputs, meta)

        # 2. Ultralytics path
        if self.backend_type.startswith("ultralytics") and self.model is not None:
            results = self.model(img_bgr, verbose=False, conf=self.conf_threshold)
            detections = []
            h_img, w_img = img_bgr.shape[:2]
            for r in results:
                for box in r.boxes:
                    cls_id = int(box.cls[0].item())
                    if cls_id != 0:
                        continue
                    conf = float(box.conf[0].item())
                    if not math.isfinite(conf):
                        continue
                    xyxy = box.xyxy[0].tolist()
                    x1 = max(0.0, min(float(w_img), float(xyxy[0])))
                    y1 = max(0.0, min(float(h_img), float(xyxy[1])))
                    x2 = max(0.0, min(float(w_img), float(xyxy[2])))
                    y2 = max(0.0, min(float(h_img), float(xyxy[3])))
                    if (x2 - x1) > 5 and (y2 - y1) > 5:
                        detections.append(Detection(
                            bbox=[round(x1, 1), round(y1, 1), round(x2, 1), round(y2, 1)],
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

            detections: List[Detection] = []
            parsed = json.loads(out.stdout.strip())
            for d in parsed.get("detections", []):
                detections.append(Detection(
                    bbox=d["bbox"],
                    confidence=d["confidence"],
                    class_id=0,
                    class_name="person"
                ))
            return detections
        except Exception as e:
            print(f"[VisionSense Detector] Bridge Error: {e}", file=sys.stderr)
            raise

    def get_metadata(self) -> Dict[str, Any]:
        return {
            "name": self.model_name,
            "model_path": self.model_path,
            "backend_type": self.backend_type,
            "architecture": self.architecture,
            "provider": getattr(self, "active_provider", "CPU"),
            "conf_threshold": self.conf_threshold,
            "classes": {0: "person"},
            "input_resolution": [640, 640]
        }
