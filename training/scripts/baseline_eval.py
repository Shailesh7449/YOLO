"""
VisionSense Baseline Model Evaluation Script
Measures real latency, throughput, model size, and memory usage for the existing
public/models/yolo26n.onnx detector and Ultralytics models.
Saves reproducible empirical metrics to training/evaluation/baseline_detector_report.json.
"""
import os
import sys
import time
import json
import psutil
import numpy as np
import cv2

# Add workspace to path
sys.path.insert(0, os.path.abspath("."))
from visionsense.detector import YOLOPersonDetector


def evaluate_detector_baseline(
    image_path: str = "bus.jpg",
    warmup_runs: int = 5,
    benchmark_runs: int = 30,
    output_report_path: str = "training/evaluation/baseline_detector_report.json"
):
    print("=" * 60)
    print("VisionSense Phase 2: Baseline Detector Empirical Evaluation")
    print("=" * 60)

    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Benchmark test image '{image_path}' not found.")

    img = cv2.imread(image_path)
    h, w = img.shape[:2]
    print(f"Test image: {image_path} ({w}x{h})")

    # Audit model file
    onnx_path = os.path.abspath("public/models/yolo26n.onnx")
    onnx_size_bytes = os.path.getsize(onnx_path) if os.path.exists(onnx_path) else 0
    print(f"Model path: {onnx_path}")
    print(f"Model file size: {onnx_size_bytes} bytes ({onnx_size_bytes / (1024*1024):.2f} MB)")

    # Initialize detector
    detector = YOLOPersonDetector(model_name_or_path=onnx_path, conf_threshold=0.28)
    print(f"Active backend: {detector.backend_type}")
    active_provider = getattr(detector, "active_provider", "N/A")
    print(f"Execution provider: {active_provider}")

    # Warmup runs
    print(f"Running {warmup_runs} warmup iterations...")
    for _ in range(warmup_runs):
        _ = detector.detect(img)

    # Benchmark runs
    print(f"Running {benchmark_runs} benchmark iterations...")
    latencies = []
    process = psutil.Process(os.getpid())
    mem_before = process.memory_info().rss / (1024 * 1024)

    detections = []
    for i in range(benchmark_runs):
        t0 = time.perf_counter()
        dets = detector.detect(img)
        t1 = time.perf_counter()
        latencies.append((t1 - t0) * 1000.0)
        if i == 0:
            detections = dets

    mem_after = process.memory_info().rss / (1024 * 1024)
    peak_mem = mem_after - mem_before

    latencies = np.array(latencies)
    mean_lat = float(np.mean(latencies))
    std_lat = float(np.std(latencies))
    median_lat = float(np.median(latencies))
    p95_lat = float(np.percentile(latencies, 95))
    min_lat = float(np.min(latencies))
    max_lat = float(np.max(latencies))
    fps = float(1000.0 / mean_lat) if mean_lat > 0 else 0.0

    print("-" * 60)
    print(f"Baseline Results ({benchmark_runs} iterations):")
    print(f"  Mean Latency:   {mean_lat:.2f} ms (+/- {std_lat:.2f} ms)")
    print(f"  Median Latency: {median_lat:.2f} ms")
    print(f"  p95 Latency:    {p95_lat:.2f} ms")
    print(f"  Min / Max:      {min_lat:.2f} ms / {max_lat:.2f} ms")
    print(f"  Throughput:     {fps:.2f} FPS")
    print(f"  Detections:     {len(detections)} persons detected")
    print(f"  Memory Delta:   {peak_mem:.2f} MB")
    print("-" * 60)

    report = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "model": {
            "name": "yolo26n.onnx",
            "path": onnx_path,
            "size_bytes": onnx_size_bytes,
            "size_mb": round(onnx_size_bytes / (1024 * 1024), 3),
            "backend": detector.backend_type,
            "provider": active_provider,
            "confidence_threshold": detector.conf_threshold,
            "input_resolution": [640, 640]
        },
        "hardware": {
            "cpu": os.environ.get("PROCESSOR_IDENTIFIER", "x86_64"),
            "ram_total_gb": round(psutil.virtual_memory().total / (1024**3), 2)
        },
        "benchmark_sample": {
            "file": image_path,
            "dimensions": [w, h]
        },
        "metrics": {
            "iterations": benchmark_runs,
            "mean_latency_ms": round(mean_lat, 2),
            "std_latency_ms": round(std_lat, 2),
            "median_latency_ms": round(median_lat, 2),
            "p95_latency_ms": round(p95_lat, 2),
            "min_latency_ms": round(min_lat, 2),
            "max_latency_ms": round(max_lat, 2),
            "throughput_fps": round(fps, 2),
            "peak_memory_mb": round(peak_mem, 2)
        },
        "sample_detections": [d.to_dict() for d in detections]
    }

    os.makedirs(os.path.dirname(output_report_path), exist_ok=True)
    with open(output_report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    print(f"Baseline report successfully written to: {output_report_path}")
    return report


if __name__ == "__main__":
    evaluate_detector_baseline()
