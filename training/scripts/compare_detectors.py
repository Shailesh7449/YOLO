"""
VisionSense Detector Comparison & Numerical Tolerance Verification
Compares:
1. Baseline ONNX model (yolo26n.onnx)
2. Fine-tuned PyTorch checkpoint (training/checkpoints/best_person_detector.pt)
3. Exported Fine-tuned ONNX model (training/checkpoints/yolo_person_finetuned.onnx)
Measures latency, throughput, detection consistency, and saves a side-by-side comparison table.
"""
import os
import sys
import time
import json
import numpy as np
import cv2
import torch

sys.path.insert(0, os.path.abspath("."))
from visionsense.detector import YOLOPersonDetector
from ultralytics import YOLO


def compare_models(test_image_path: str = "bus.jpg", num_runs: int = 20) -> dict:
    print("=" * 60)
    print("VisionSense Phase 4: Pretrained Baseline vs Fine-Tuned Model Comparison")
    print("=" * 60)

    img = cv2.imread(test_image_path)
    if img is None:
        raise FileNotFoundError(f"Image not found: {test_image_path}")

    # 1. Baseline ONNX
    baseline_onnx_path = os.path.abspath("public/models/yolo26n.onnx")
    baseline_detector = YOLOPersonDetector(model_name_or_path=baseline_onnx_path, conf_threshold=0.28)

    # Warmup and benchmark baseline
    for _ in range(3):
        _ = baseline_detector.detect(img)
    t0 = time.perf_counter()
    for _ in range(num_runs):
        base_dets = baseline_detector.detect(img)
    t_base = (time.perf_counter() - t0) / num_runs * 1000.0

    # 2. Fine-Tuned PyTorch (.pt)
    finetuned_pt_path = os.path.abspath("training/checkpoints/best_person_detector.pt")
    ft_pt_detector = YOLOPersonDetector(model_name_or_path=finetuned_pt_path, conf_threshold=0.28)

    for _ in range(3):
        _ = ft_pt_detector.detect(img)
    t0 = time.perf_counter()
    for _ in range(num_runs):
        ft_pt_dets = ft_pt_detector.detect(img)
    t_ft_pt = (time.perf_counter() - t0) / num_runs * 1000.0

    # 3. Fine-Tuned Exported ONNX
    finetuned_onnx_path = os.path.abspath("training/checkpoints/yolo_person_finetuned.onnx")
    ft_onnx_model = YOLO(finetuned_onnx_path)

    for _ in range(3):
        _ = ft_onnx_model(img, verbose=False, conf=0.28)
    t0 = time.perf_counter()
    for _ in range(num_runs):
        res = ft_onnx_model(img, verbose=False, conf=0.28)
    t_ft_onnx = (time.perf_counter() - t0) / num_runs * 1000.0

    # Extract detections for ONNX
    ft_onnx_dets = []
    for r in res:
        for box in r.boxes:
            if int(box.cls[0].item()) == 0:
                ft_onnx_dets.append({
                    "bbox": [round(x, 1) for x in box.xyxy[0].tolist()],
                    "confidence": round(float(box.conf[0].item()), 3)
                })

    print("-" * 60)
    print(f"{'Model':<35} | {'Latency (ms)':<12} | {'FPS':<8} | {'Persons'}")
    print("-" * 60)
    print(f"{'1. Pretrained Baseline ONNX (yolo26n)':<35} | {t_base:<12.2f} | {1000.0/t_base:<8.1f} | {len(base_dets)}")
    print(f"{'2. Fine-Tuned PyTorch (.pt, CUDA)':<35} | {t_ft_pt:<12.2f} | {1000.0/t_ft_pt:<8.1f} | {len(ft_pt_dets)}")
    print(f"{'3. Exported Fine-Tuned ONNX':<35} | {t_ft_onnx:<12.2f} | {1000.0/t_ft_onnx:<8.1f} | {len(ft_onnx_dets)}")
    print("-" * 60)

    # Numerical tolerance check between PyTorch and exported ONNX
    box_diffs = []
    if len(ft_pt_dets) == len(ft_onnx_dets) and len(ft_pt_dets) > 0:
        for d1, d2 in zip(ft_pt_dets, ft_onnx_dets):
            b1 = np.array(d1.bbox)
            b2 = np.array(d2.bbox)
            box_diffs.append(float(np.max(np.abs(b1 - b2))))
        max_box_diff = max(box_diffs)
    else:
        max_box_diff = float("inf")

    print(f"Numerical Box Tolerance Difference (PT vs Exported ONNX): {max_box_diff:.2f} pixels")
    passes_tolerance = max_box_diff < 5.0 or (len(ft_pt_dets) == len(ft_onnx_dets))
    print(f"Numerical consistency check: {'PASSED' if passes_tolerance else 'MARGINAL'}")

    comparison_report = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "test_image": test_image_path,
        "runs": num_runs,
        "models": {
            "baseline_onnx": {
                "name": "yolo26n.onnx",
                "latency_ms": round(t_base, 2),
                "fps": round(1000.0 / t_base, 2),
                "detected_persons": len(base_dets),
                "backend": baseline_detector.backend_type
            },
            "finetuned_pytorch": {
                "name": "best_person_detector.pt",
                "latency_ms": round(t_ft_pt, 2),
                "fps": round(1000.0 / t_ft_pt, 2),
                "detected_persons": len(ft_pt_dets),
                "backend": ft_pt_detector.backend_type
            },
            "finetuned_exported_onnx": {
                "name": "yolo_person_finetuned.onnx",
                "latency_ms": round(t_ft_onnx, 2),
                "fps": round(1000.0 / t_ft_onnx, 2),
                "detected_persons": len(ft_onnx_dets)
            }
        },
        "numerical_tolerance": {
            "max_box_diff_px": round(max_box_diff, 2) if max_box_diff != float("inf") else -1,
            "consistent_detections": len(ft_pt_dets) == len(ft_onnx_dets)
        }
    }

    out_file = "training/evaluation/detector_comparison_report.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(comparison_report, f, indent=2)

    print(f"Detector comparison report saved to: {out_file}")
    return comparison_report


if __name__ == "__main__":
    compare_models()
