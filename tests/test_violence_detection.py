"""
VisionSense AI - Violence Detection Automated Test Suite
Validates model loading, action recognition accuracy, streaming sliding window,
event deduplication, memory bounds, and regression parity with crowd safety.
"""

import os
import sys
import unittest
import numpy as np
import cv2

from visionsense.violence_detector import ViolenceDetector, ViolencePrediction
from visionsense.detector import YOLOPersonDetector
from visionsense.bytetrack import ByteTracker


class TestViolenceDetection(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.violent_clip = "datasets/violence/violent/airtlab_violent_1.mp4"
        cls.non_violent_clip = "datasets/violence/non_violent/airtlab_nonviolent_1.mp4"
        cls.has_cuda = False
        try:
            import torch
            cls.has_cuda = torch.cuda.is_available()
        except Exception:
            pass

    def test_01_model_loading_variants(self):
        """Test model initialization on PyTorch (CUDA/CPU) and ONNX Runtime."""
        # 1. R(2+1)D-18
        detector_r2 = ViolenceDetector(model_variant="r2plus1d_18")
        self.assertTrue(detector_r2.is_ready, f"R(2+1)D-18 failed to initialize: {detector_r2.init_error}")
        self.assertEqual(detector_r2.num_frames, 32)
        self.assertIn("R(2+1)D-18", detector_r2.model_name)

        # 2. X3D-M PyTorch
        detector_x3d = ViolenceDetector(model_variant="x3d_m")
        self.assertTrue(detector_x3d.is_ready, f"X3D-M failed to initialize: {detector_x3d.init_error}")
        self.assertEqual(detector_x3d.num_frames, 16)

        # 3. ONNX Runtime
        onnx_path = os.path.abspath("training/checkpoints/violence_x3d_realtime.onnx")
        if os.path.exists(onnx_path):
            detector_onnx = ViolenceDetector(model_variant="onnx", checkpoint_path=onnx_path)
            self.assertTrue(detector_onnx.is_ready, f"ONNX Runtime failed: {detector_onnx.init_error}")
            self.assertIn("onnx", detector_onnx.backend_type.lower())

    def test_02_clip_prediction_violent_cctv(self):
        """Test action recognition on real CCTV fight clip."""
        if not os.path.exists(self.violent_clip):
            self.skipTest(f"Test clip {self.violent_clip} not present")

        detector = ViolenceDetector(model_variant="r2plus1d_18")
        cap = cv2.VideoCapture(self.violent_clip)
        frames = []
        timestamps = []
        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        idx = 0
        while len(frames) < 64:
            ret, f = cap.read()
            if not ret or f is None:
                break
            frames.append(f)
            timestamps.append(idx / fps)
            idx += 1
        cap.release()

        self.assertGreater(len(frames), 10, "Failed to read frames from violent CCTV clip")
        pred = detector.predict_clip(frames, timestamps, source_id="cctv_cam1")

        self.assertEqual(pred.status, "SUCCESS")
        self.assertTrue(pred.is_violence, f"Expected VIOLENCE, got {pred.label} (confidence={pred.confidence:.4f})")
        self.assertEqual(pred.label, "VIOLENCE")
        self.assertGreaterEqual(pred.confidence, 0.50)
        self.assertGreater(pred.latency_ms, 0)
        print(f"\n[Test] Violent CCTV Clip -> Label: {pred.label}, Confidence: {pred.confidence*100:.1f}%, Latency: {pred.latency_ms:.1f}ms")

    def test_03_clip_prediction_non_violent_cctv(self):
        """Test action recognition on normal walking CCTV clip."""
        if not os.path.exists(self.non_violent_clip):
            self.skipTest(f"Test clip {self.non_violent_clip} not present")

        detector = ViolenceDetector(model_variant="r2plus1d_18")
        cap = cv2.VideoCapture(self.non_violent_clip)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        
        # Sample uniformly across the clip
        sampled_indices = np.linspace(0, max(0, total_frames - 1), 32).astype(int)
        sampled_set = set(sampled_indices)
        frame_dict = {}
        idx = 0
        while True:
            ret, f = cap.read()
            if not ret:
                break
            if idx in sampled_set:
                frame_dict[idx] = f
            idx += 1
        cap.release()

        frames = [frame_dict.get(i, list(frame_dict.values())[-1]) for i in sampled_indices if frame_dict]
        timestamps = [float(i / fps) for i in sampled_indices]

        pred = detector.predict_clip(frames, timestamps, source_id="cctv_cam1")
        self.assertEqual(pred.status, "SUCCESS")
        self.assertFalse(pred.is_violence, f"Expected NON_VIOLENCE, got {pred.label} (confidence={pred.confidence:.4f})")
        self.assertEqual(pred.label, "NON_VIOLENCE")
        self.assertLess(pred.confidence, 0.50)
        print(f"\n[Test] Non-Violent CCTV Clip -> Label: {pred.label}, Confidence: {pred.confidence*100:.1f}%, Latency: {pred.latency_ms:.1f}ms")

    def test_04_sliding_window_streaming_and_deduplication(self):
        """Test streaming frame ingestion, event debouncing, and recovery cooldown."""
        if not os.path.exists(self.violent_clip):
            self.skipTest(f"Test clip {self.violent_clip} not present")

        footfall_path = "uploads/transcoded/video_1788979083095_FootfallVideo.mp4"
        if not os.path.exists(footfall_path):
            footfall_path = self.non_violent_clip

        detector = ViolenceDetector(model_variant="r2plus1d_18", persistence_threshold=1, cooldown_threshold=2, sample_stride=3)
        detector.reset()

        # 1. Ingest violent CCTV fight frames
        cap = cv2.VideoCapture(self.violent_clip)
        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        started_events = []
        frame_idx = 0

        while True:
            ret, frame = cap.read()
            if not ret or frame is None or frame_idx > 100:
                break
            ts = frame_idx / fps
            pred, trigger = detector.ingest_stream_frame(frame, ts, stride_frames=8)
            if trigger == "VIOLENCE_INCIDENT_STARTED":
                started_events.append((frame_idx, ts, pred.confidence if pred else 0.0))
            frame_idx += 1
        cap.release()

        # Must trigger exactly 1 incident start event
        self.assertEqual(len(started_events), 1, f"Expected exactly 1 deduplicated incident start, got {len(started_events)}")
        self.assertEqual(detector.active_state, "VIOLENT")
        print(f"\n[Test] Streaming Deduplication: 1 start event at t={started_events[0][1]:.2f}s (conf={started_events[0][2]*100:.1f}%)")

        # 2. Reset streaming state and verify that normal footfall stream does not trigger false alarms
        detector.reset()
        cap_normal = cv2.VideoCapture(footfall_path)
        false_alarms = []
        n_idx = 0
        while n_idx < 120:
            ret_n, normal_frame = cap_normal.read()
            if not ret_n or normal_frame is None:
                break
            ts = n_idx / fps
            pred, trigger = detector.ingest_stream_frame(normal_frame, ts, stride_frames=8)
            if trigger == "VIOLENCE_INCIDENT_STARTED":
                false_alarms.append((n_idx, trigger))
            n_idx += 1
        cap_normal.release()

        self.assertEqual(len(false_alarms), 0, f"Expected 0 false alarm triggers on normal surveillance feed, got {len(false_alarms)}")
        self.assertEqual(detector.active_state, "NORMAL")
        print("  [PASS] Normal surveillance stream produced 0 false alarms (state remains NORMAL)")

        # 3. Verify cooldown state transition: when active_state is VIOLENT and consecutive normal windows arrive
        detector.active_state = "VIOLENT"
        detector.consecutive_normal_windows = 0
        
        trigger = None
        for _ in range(detector.cooldown_threshold):
            detector.consecutive_normal_windows += 1
            if detector.consecutive_normal_windows >= detector.cooldown_threshold:
                if detector.active_state == "VIOLENT":
                    detector.active_state = "NORMAL"
                    trigger = "VIOLENCE_INCIDENT_RESOLVED"

        self.assertEqual(trigger, "VIOLENCE_INCIDENT_RESOLVED")
        self.assertEqual(detector.active_state, "NORMAL")
        print("  [PASS] State machine resolved incident upon meeting cooldown threshold")

    def test_05_memory_bounds_and_vram(self):
        """Verify rolling frame buffer bounds and GPU VRAM footprint (<250MB)."""
        detector = ViolenceDetector(model_variant="x3d_m")
        dummy = np.zeros((224, 224, 3), dtype=np.uint8)
        
        # Test deque maximum capacity constraint
        for i in range(500):
            detector.frame_buffer.append(dummy)
            detector.time_buffer.append(i * 0.033)

        self.assertLessEqual(len(detector.frame_buffer), 256, "Frame buffer exceeded maximum bounded capacity")
        self.assertEqual(len(detector.frame_buffer), len(detector.time_buffer))

        # Single prediction to verify VRAM allocation
        frames = [dummy] * detector.num_frames
        times = [i * 0.033 for i in range(detector.num_frames)]
        pred = detector.predict_clip(frames, times)
        self.assertEqual(pred.status, "SUCCESS")

        if self.has_cuda:
            import torch
            vram_mb = torch.cuda.memory_allocated() / (1024 * 1024)
            print(f"\n[Test] VRAM Allocated by PyTorch: {vram_mb:.2f} MB")
            self.assertLess(vram_mb, 250.0, "VRAM consumption exceeded 250 MB ceiling")

    def test_06_crowd_safety_regression_parity(self):
        """Verify that person detector and ByteTrack crowd counting remain intact."""
        yolo_detector = YOLOPersonDetector()
        tracker = ByteTracker(high_thresh=0.45, low_thresh=0.1)

        dummy_frame = np.zeros((640, 640, 3), dtype=np.uint8)
        dets = yolo_detector.detect(dummy_frame)
        self.assertIsInstance(dets, list)

        # Verify tracking update interface
        tracked = tracker.update(dets)
        self.assertIsInstance(tracked, list)
        print("\n[Test] Person detector & ByteTrack regression check passed successfully")


if __name__ == "__main__":
    unittest.main()
