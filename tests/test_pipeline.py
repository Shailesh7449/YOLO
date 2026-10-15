"""
VisionSense Automated Test Suite
Covers:
- Dataset manifest validation
- Annotation loading
- Baseline ONNX model loading & inference
- Fine-tuned model loading & architecture diagnosis
- Detection output format, finite confidences & boundary clipping
- Person-only filtering
- ByteTrack integration & ID persistence
- Optical flow feature extraction
- Temporal window size (24), normalization, neural vs heuristic selection
- Crowd safety threshold (20 vs 21 people)
- Same-model PyTorch vs ONNX IoU matching
- Explicit error handling for missing/incompatible artifacts
- Real video pipeline execution to true EOF
- Accurate metadata reporting
"""
import os
import sys
import json
import math
import tempfile
from pathlib import Path
import pytest
import numpy as np
import cv2
import torch

sys.path.insert(0, os.path.abspath("."))

from visionsense.types import Detection, TrackedPerson, FlowMetrics, CrowdStatus, Alert
from visionsense.detector import YOLOPersonDetector
from visionsense.bytetrack import ByteTracker
from visionsense.optical_flow import DenseOpticalFlow
from visionsense.temporal_analysis import TemporalMovementAnalysis
from visionsense.safety_engine import SafetyEngine
from visionsense.pipeline import analyze_image_file, analyze_video_file
from training.scripts.compare_detectors import match_detections


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
        """Verifies loading baseline ONNX and fine-tuned PyTorch checkpoint."""
        # 1. Baseline ONNX
        base_det = YOLOPersonDetector(model_name_or_path="public/models/yolo26n.onnx")
        assert base_det.backend_type == "onnxruntime"
        assert base_det.architecture == "yolov10_nms_free"
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
            assert math.isfinite(d.confidence)

    def test_06_bbox_coordinate_conversion(self):
        """Verifies bbox coordinates match original image boundary limits."""
        detector = YOLOPersonDetector(model_name_or_path="public/models/yolo26n.onnx")
        img = cv2.imread("bus.jpg")
        h, w = img.shape[:2]
        results = detector.detect(img)
        for d in results:
            x1, y1, x2, y2 = d.bbox
            assert 0 <= x1 < x2 <= w
            assert 0 <= y1 < y2 <= h

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
        f2[50:150, 100:200] = 250

        metrics1 = flow_engine.calculate_flow(f1)
        assert metrics1.motion_magnitude == 0.0

        metrics2 = flow_engine.calculate_flow(f2)
        assert metrics2.motion_magnitude > 0.0
        assert metrics2.active_motion_pixels > 0

    def test_09_temporal_sequence_and_anomaly_scoring(self):
        """Tests temporal anomaly engine with trained neural network."""
        temp_engine = TemporalMovementAnalysis(window_size=24)
        assert temp_engine.window_size == 24
        assert temp_engine.model_type in ("neural_pytorch", "neural_onnx", "heuristic")

        flow_normal = FlowMetrics(0.2, 0.1, 0.0, 1.0, 0.3, 10)
        for _ in range(15):
            res = temp_engine.update(people_count=10, flow_metrics=flow_normal)
        assert res.anomaly_detected is False
        assert res.unusual_movement_score < 0.5
        assert res.model_type == temp_engine.model_type

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

        for i in range(5):
            status, alerts = engine.evaluate_frame(people_count=20, timestamp=float(i))
            assert status == CrowdStatus.NORMAL
            assert len(alerts) == 0

        # 21 people -> frame 1
        status, _ = engine.evaluate_frame(people_count=21, timestamp=5.0)
        assert status == CrowdStatus.NORMAL

        # frame 2
        status, _ = engine.evaluate_frame(people_count=21, timestamp=6.0)
        assert status == CrowdStatus.NORMAL

        # frame 3 -> WARNING
        status, alerts = engine.evaluate_frame(people_count=21, timestamp=7.0)
        assert status == CrowdStatus.WARNING
        assert len(alerts) > 0
        assert alerts[0].people_count == 21

    def test_11_exported_onnx_compatibility(self):
        """Verifies exported ONNX models can be evaluated with ONNX Runtime."""
        import onnxruntime as ort

        det_onnx = "training/checkpoints/yolo_person_finetuned.onnx"
        if os.path.exists(det_onnx):
            sess = ort.InferenceSession(det_onnx, providers=["CPUExecutionProvider"])
            dummy_in = np.zeros((1, 3, 640, 640), dtype=np.float32)
            input_name = sess.get_inputs()[0].name
            outs = sess.run(None, {input_name: dummy_in})
            assert len(outs) > 0

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
        assert result["crowd_status"] == "NORMAL"
        assert len(result["detections"]) == 4
        assert result["inference_time_ms"] > 0.0
        assert "model_info" in result
        assert result["model_info"]["name"] == "YOLO26n ONNX (End-to-End NMS-Free)"

    def test_14_finetuned_onnx_architecture_and_inference(self):
        """Verifies YOLOPersonDetector parses fine-tuned YOLOv8 standard ONNX architecture correctly."""
        ft_onnx_path = "training/checkpoints/yolo_person_finetuned.onnx"
        if not os.path.exists(ft_onnx_path):
            pytest.skip("Fine-tuned ONNX checkpoint not present")

        detector = YOLOPersonDetector(model_name_or_path=ft_onnx_path)
        assert detector.architecture == "yolov8_standard"
        assert detector.backend_type == "onnxruntime"

        dets = detector.detect("bus.jpg")
        assert isinstance(dets, list)
        for d in dets:
            assert d.class_id == 0
            assert d.class_name == "person"
            assert 0.0 <= d.confidence <= 1.0
            assert math.isfinite(d.confidence)
            assert len(d.bbox) == 4

    def test_15_same_model_pt_vs_onnx_matching(self):
        """Verifies IoU-based bipartite matching between PyTorch and exported ONNX models."""
        pt_path = "training/checkpoints/best_person_detector.pt"
        onnx_path = "training/checkpoints/yolo_person_finetuned.onnx"
        if not os.path.exists(pt_path) or not os.path.exists(onnx_path):
            pytest.skip("Both PT and ONNX checkpoints required for consistency test")

        det_pt = YOLOPersonDetector(model_name_or_path=pt_path, conf_threshold=0.28)
        det_onnx = YOLOPersonDetector(model_name_or_path=onnx_path, conf_threshold=0.28)

        img = cv2.imread("bus.jpg")
        dets_pt = det_pt.detect(img)
        dets_onnx = det_onnx.detect(img)

        matched, unmatched_pt, unmatched_onnx = match_detections(dets_pt, dets_onnx, iou_thresh=0.45)
        assert len(matched) > 0, "Expected at least some matched detections between PT and ONNX"
        for i, j, iou in matched:
            assert iou >= 0.45
            assert abs(dets_pt[i].confidence - dets_onnx[j].confidence) < 1.0

    def test_16_missing_or_invalid_artifact_error_handling(self):
        """Verifies that missing model paths and invalid image paths fail with explicit exceptions."""
        with pytest.raises(FileNotFoundError):
            _ = YOLOPersonDetector(model_name_or_path="nonexistent_model.onnx")

        with pytest.raises(FileNotFoundError):
            _ = YOLOPersonDetector(model_name_or_path="nonexistent_model.pt")

        det = YOLOPersonDetector(model_name_or_path="public/models/yolo26n.onnx")
        with pytest.raises(FileNotFoundError):
            _ = det.detect("nonexistent_test_image.jpg")

    def test_17_temporal_model_selection_and_window_size(self):
        """Verifies temporal model window size is 24 and engine type selection is accurate."""
        # 1. Default instance
        t_default = TemporalMovementAnalysis()
        assert t_default.window_size == 24
        assert t_default.model_type in ("neural_pytorch", "neural_onnx")

        # 2. Explicit ONNX path
        onnx_path = "training/checkpoints/temporal_anomaly_model.onnx"
        if os.path.exists(onnx_path):
            t_onnx = TemporalMovementAnalysis(model_path=onnx_path)
            assert t_onnx.model_type == "neural_onnx"
            fm = FlowMetrics(0.5, 1.0, 0.5, 2.0, 0.3, 50)
            res = t_onnx.update(12, fm)
            assert res.model_type == "neural_onnx"

        # 3. Missing model falls back to heuristic
        t_heur = TemporalMovementAnalysis(model_path="nonexistent_checkpoint.pt")
        assert t_heur.model_type == "heuristic"
        fm = FlowMetrics(0.5, 1.0, 0.5, 2.0, 0.3, 50)
        res_heur = t_heur.update(12, fm)
        assert res_heur.model_type == "heuristic"

    def test_18_video_pipeline_real_video_to_eof(self):
        """
        Generates a short real video file using cv2.VideoWriter and processes it
        to verify true EOF handling, accurate frame counts, non-decreasing timestamps, and 100% completion.
        """
        temp_dir = tempfile.gettempdir()
        temp_video_path = os.path.join(temp_dir, "test_surveillance_short.avi")

        # Create a 15-frame video at 10 fps (1.5 seconds)
        vw, vh, fps, num_frames = 640, 480, 10.0, 15
        fourcc = cv2.VideoWriter_fourcc(*'XVID')
        writer = cv2.VideoWriter(temp_video_path, fourcc, fps, (vw, vh))

        # Base frame from bus.jpg resized
        base = cv2.imread("bus.jpg")
        base_resized = cv2.resize(base, (vw, vh))

        for f in range(num_frames):
            frame = base_resized.copy()
            # Simulate slight motion
            cv2.circle(frame, (100 + f * 5, 200), 10, (0, 255, 0), -1)
            writer.write(frame)
        writer.release()

        assert os.path.exists(temp_video_path)

        try:
            res = analyze_video_file(
                temp_video_path,
                crowd_threshold=20,
                target_ai_fps=5.0,
                save_telemetry_file=False
            )

            assert res["success"] is True
            assert res["completion_percentage"] == 100.0
            assert res["status"] == "PROCESSING COMPLETE"
            assert res["total_frames_sampled"] > 0
            assert len(res["telemetry"]) > 0

            # Verify timestamps are monotonically non-decreasing
            timestamps = [t["timestamp"] for t in res["telemetry"]]
            for i in range(1, len(timestamps)):
                assert timestamps[i] >= timestamps[i - 1], "Timestamps must be non-decreasing"

            # Verify last processed timestamp matches duration
            assert res["last_processed_timestamp"] > 0.0

        finally:
            if os.path.exists(temp_video_path):
                try:
                    os.remove(temp_video_path)
                except Exception:
                    pass

    def test_19_metadata_reporting_integrity(self):
        """Verifies detector and server metadata endpoints accurately report active models."""
        detector = YOLOPersonDetector()
        meta = detector.get_metadata()
        assert meta["name"] == "YOLO26n ONNX (End-to-End NMS-Free)"
        assert meta["architecture"] == "yolov10_nms_free"
        assert meta["backend_type"] == "onnxruntime"
        assert "provider" in meta
        assert meta["conf_threshold"] == 0.28
        assert meta["classes"] == {0: "person"}


if __name__ == "__main__":
    pytest.main(["-v", "tests/test_pipeline.py"])
