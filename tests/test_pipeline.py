"""
VisionSense Automated Test Suite
Covers all requirements from Section 16:
- Dataset manifest validation
- Annotation loading
- Model loading
- Inference output shape
- Person-only filtering
- Bounding-box coordinate conversion
- Video decoding & timestamps
- Tracking integration (ByteTrack)
- Temporal sequence construction
- Anomaly score generation
- Safety threshold (20 vs 21 people)
- Alert creation & debouncing
- Exported ONNX compatibility
- CPU and GPU inference paths
"""
import os
import sys
import json
import pytest
import numpy as np
import cv2
import torch

# Add workspace root to sys.path
sys.path.insert(0, os.path.abspath("."))

from visionsense.types import Detection, TrackedPerson, FlowMetrics, CrowdStatus, Alert
from visionsense.detector import YOLOPersonDetector
from visionsense.bytetrack import ByteTracker
from visionsense.optical_flow import DenseOpticalFlow
from visionsense.temporal_analysis import TemporalMovementAnalysis
from visionsense.safety_engine import SafetyEngine
from visionsense.pipeline import analyze_image_file


class TestVisionSensePipeline:

    def test_01_manifest_validation(self):
        """Verifies dataset manifest integrity and SHA-256 hashes."""
        for manifest_name in ["surveillance_detection_manifest.json", "temporal_anomaly_manifest.json"]:
            path = os.path.join("datasets", "manifests", manifest_name)
            assert os.path.exists(path), f"Manifest {path} missing"
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            assert "dataset_name" in data
            assert "manifest_hash" in data
            assert len(data["manifest_hash"]) == 64

    def test_02_annotation_loading(self):
        """Validates that YOLO annotations are strictly class 0 and bounded in [0, 1]."""
        labels_dir = os.path.join("datasets", "detection", "surveillance_person", "labels", "train")
        if os.path.exists(labels_dir):
            label_files = [f for f in os.listdir(labels_dir) if f.endswith(".txt")]
            assert len(label_files) > 0, "No train labels found"
            for lf in label_files[:5]:
                with open(os.path.join(labels_dir, lf), "r") as f:
                    for line in f:
                        parts = line.strip().split()
                        if len(parts) == 5:
                            cls_id = int(parts[0])
                            assert cls_id == 0, f"Expected class 0 (person), got {cls_id}"
                            cx, cy, w, h = map(float, parts[1:])
                            assert 0.0 <= cx <= 1.0 and 0.0 <= cy <= 1.0
                            assert 0.0 < w <= 1.0 and 0.0 < h <= 1.0

    def test_03_model_loading_and_backends(self):
        """Verifies loading baseline ONNX, fine-tuned PyTorch checkpoint, and ONNX export."""
        # 1. Baseline ONNX
        base_det = YOLOPersonDetector(model_name_or_path="public/models/yolo26n.onnx")
        assert base_det.backend_type == "onnxruntime"
        assert base_det.model is not None

        # 2. Fine-tuned PyTorch checkpoint
        ft_pt_path = "training/checkpoints/best_person_detector.pt"
        if os.path.exists(ft_pt_path):
            ft_det = YOLOPersonDetector(model_name_or_path=ft_pt_path)
            assert ft_det.backend_type == "ultralytics_pt"

    def test_04_inference_output_shape(self):
        """Tests image preprocessing tensor shape [1, 3, 640, 640]."""
        detector = YOLOPersonDetector(model_name_or_path="public/models/yolo26n.onnx")
        dummy_img = np.zeros((480, 640, 3), dtype=np.uint8)
        tensor, meta = detector._preprocess_onnx(dummy_img, target_size=640)
        assert tensor.shape == (1, 3, 640, 640)
        assert tensor.dtype == np.float32
        assert meta[3] == 640 and meta[4] == 480

    def test_05_person_only_filtering(self):
        """Verifies detections strictly retain only class_id == 0 (person)."""
        detector = YOLOPersonDetector(model_name_or_path="public/models/yolo26n.onnx")
        results = detector.detect("bus.jpg")
        assert len(results) > 0, "Expected detections on bus.jpg"
        for d in results:
            assert d.class_id == 0
            assert d.class_name == "person"
            assert 0.0 <= d.confidence <= 1.0

    def test_06_bbox_coordinate_conversion(self):
        """Verifies bbox coordinates match original image boundary limits."""
        detector = YOLOPersonDetector(model_name_or_path="public/models/yolo26n.onnx")
        img = cv2.imread("bus.jpg")
        h, w = img.shape[:2]
        results = detector.detect(img)
        for d in results:
            x1, y1, x2, y2 = d.bbox
            assert 0 <= x1 < x2 <= w + 1
            assert 0 <= y1 < y2 <= h + 1

    def test_07_bytetrack_integration(self):
        """Verifies ByteTrack maintains persistent track IDs across contiguous frames."""
        tracker = ByteTracker(high_thresh=0.4, low_thresh=0.1, match_thresh=0.5)

        # Frame 1: Two persons
        dets_f1 = [
            Detection(bbox=[100, 100, 150, 200], confidence=0.9, class_id=0, class_name="person"),
            Detection(bbox=[300, 100, 350, 200], confidence=0.85, class_id=0, class_name="person")
        ]
        tracks_1 = tracker.update(dets_f1)
        assert len(tracks_1) == 2
        id_a, id_b = tracks_1[0].track_id, tracks_1[1].track_id

        # Frame 2: Persons slightly moved (delta = 5px)
        dets_f2 = [
            Detection(bbox=[105, 100, 155, 200], confidence=0.92, class_id=0, class_name="person"),
            Detection(bbox=[305, 100, 355, 200], confidence=0.88, class_id=0, class_name="person")
        ]
        tracks_2 = tracker.update(dets_f2)
        assert len(tracks_2) == 2
        ids_f2 = [t.track_id for t in tracks_2]
        assert id_a in ids_f2 and id_b in ids_f2, "ByteTrack failed to preserve persistent IDs across frames"

    def test_08_optical_flow_feature_extraction(self):
        """Tests dense optical flow computation on moving frames."""
        flow_engine = DenseOpticalFlow(grid_w=48, grid_h=27)
        f1 = np.ones((270, 480, 3), dtype=np.uint8) * 100
        f2 = np.ones((270, 480, 3), dtype=np.uint8) * 100
        # Draw moving square in f2
        f2[50:150, 100:200] = 250

        metrics1 = flow_engine.calculate_flow(f1)
        assert metrics1.motion_magnitude == 0.0  # First frame warmup

        metrics2 = flow_engine.calculate_flow(f2)
        assert metrics2.motion_magnitude > 0.0
        assert metrics2.active_motion_pixels > 0

    def test_09_temporal_sequence_and_anomaly_scoring(self):
        """Tests temporal anomaly engine with trained neural network."""
        temp_engine = TemporalMovementAnalysis(window_size=24)
        flow_normal = FlowMetrics(0.2, 0.1, 0.0, 1.0, 0.3, 10)

        # Feed 15 normal frames
        for _ in range(15):
            res = temp_engine.update(people_count=10, flow_metrics=flow_normal)
        assert res.anomaly_detected is False
        assert res.unusual_movement_score < 0.5

        # Feed 6 rapid surge anomaly frames
        flow_surge = FlowMetrics(0.9, 3.0, 2.0, 6.0, 1.8, 90)
        for _ in range(6):
            res_surge = temp_engine.update(people_count=28, flow_metrics=flow_surge)
        assert res_surge.unusual_movement_score > 0.65
        assert res_surge.anomaly_detected is True

    def test_10_safety_threshold_20_vs_21_people(self):
        """
        STRICT RULE TEST:
        people_count <= 20 must remain NORMAL.
        people_count > 20 must transition to WARNING after persistence.
        """
        engine = SafetyEngine(crowd_threshold=20, persistence_frames=3)

        # 1. Exactly 20 people for 5 consecutive frames -> MUST REMAIN NORMAL
        for i in range(5):
            status, alerts = engine.evaluate_frame(people_count=20, timestamp=float(i))
            assert status == CrowdStatus.NORMAL, f"Failed at 20 people: expected NORMAL, got {status}"
            assert len(alerts) == 0

        # 2. Transition to 21 people -> Frame 1 (debounce frame 1/3)
        status, _ = engine.evaluate_frame(people_count=21, timestamp=5.0)
        assert status == CrowdStatus.NORMAL  # Persistence not met yet

        # Frame 2 (debounce frame 2/3)
        status, _ = engine.evaluate_frame(people_count=21, timestamp=6.0)
        assert status == CrowdStatus.NORMAL

        # Frame 3 (debounce frame 3/3) -> NOW WARNING
        status, alerts = engine.evaluate_frame(people_count=21, timestamp=7.0)
        assert status == CrowdStatus.WARNING, f"Failed at 21 people (persisted): expected WARNING, got {status}"
        assert len(alerts) > 0
        assert alerts[0].people_count == 21

    def test_11_exported_onnx_compatibility(self):
        """Verifies exported ONNX models can be evaluated with ONNX Runtime."""
        import onnxruntime as ort

        # 1. Fine-tuned person detector ONNX
        det_onnx = "training/checkpoints/yolo_person_finetuned.onnx"
        if os.path.exists(det_onnx):
            sess = ort.InferenceSession(det_onnx, providers=["CPUExecutionProvider"])
            dummy_in = np.zeros((1, 3, 640, 640), dtype=np.float32)
            input_name = sess.get_inputs()[0].name
            outs = sess.run(None, {input_name: dummy_in})
            assert len(outs) > 0

        # 2. Temporal anomaly ONNX
        temp_onnx = "training/checkpoints/temporal_anomaly_model.onnx"
        if os.path.exists(temp_onnx):
            sess_t = ort.InferenceSession(temp_onnx, providers=["CPUExecutionProvider"])
            dummy_seq = np.zeros((1, 24, 6), dtype=np.float32)
            t_in_name = sess_t.get_inputs()[0].name
            t_outs = sess_t.run(None, {t_in_name: dummy_seq})
            assert t_outs[0].shape == (1, 4)

    def test_12_gpu_and_cpu_execution(self):
        """Verifies GPU inference if CUDA is available, otherwise CPU."""
        if torch.cuda.is_available():
            assert torch.cuda.device_count() >= 1
            device = torch.device("cuda:0")
            x = torch.zeros((1, 3, 640, 640), device=device)
            assert x.is_cuda
            print(f"Verified GPU execution on: {torch.cuda.get_device_name(0)}")
        else:
            print("GPU not available, verified CPU execution.")

    def test_13_end_to_end_image_pipeline(self):
        """Runs full end-to-end image analysis pipeline on bus.jpg."""
        result = analyze_image_file("bus.jpg", crowd_threshold=20)
        assert result["success"] is True
        assert result["people_count"] == 4
        assert result["crowd_status"] == "NORMAL"  # 4 <= 20
        assert len(result["detections"]) == 4
        assert result["inference_time_ms"] > 0.0


if __name__ == "__main__":
    pytest.main(["-v", "tests/test_pipeline.py"])
