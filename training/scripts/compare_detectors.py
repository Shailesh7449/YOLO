"""
VisionSense Detector Comparison & Numerical Tolerance Verification
Compares:
1. Baseline ONNX model (yolo26n.onnx)
2. Fine-tuned PyTorch checkpoint (training/checkpoints/best_person_detector.pt)
3. Exported Fine-tuned ONNX model (training/checkpoints/yolo_person_finetuned.onnx)
Measures latency, throughput, IoU-matched detection consistency, and saves report.
"""
import os
import sys
import time
import json
from typing import List, Tuple, Dict, Any, Optional
import numpy as np
import cv2
import torch

sys.path.insert(0, os.path.abspath("."))
from visionsense.detector import YOLOPersonDetector
from visionsense.types import Detection


def calculate_iou(boxA: List[float], boxB: List[float]) -> float:
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])
    inter = max(0.0, xB - xA) * max(0.0, yB - yA)
    areaA = max(0.0, boxA[2] - boxA[0]) * max(0.0, boxA[3] - boxA[1])
    areaB = max(0.0, boxB[2] - boxB[0]) * max(0.0, boxB[3] - boxB[1])
    union = areaA + areaB - inter
    return inter / union if union > 0 else 0.0


def match_detections(
    detsA: List[Detection],
    detsB: List[Detection],
    iou_thresh: float = 0.45
) -> Tuple[List[Tuple[int, int, float]], List[int], List[int]]:
    if not detsA or not detsB:
        return [], list(range(len(detsA))), list(range(len(detsB)))

    candidates = []
    for i, a in enumerate(detsA):
        for j, b in enumerate(detsB):
            iou = calculate_iou(a.bbox, b.bbox)
            if iou >= iou_thresh:
                candidates.append((iou, i, j))

    candidates.sort(key=lambda x: x[0], reverse=True)

    matched = []
    matched_A = set()
    matched_B = set()

    for iou, i, j in candidates:
        if i not in matched_A and j not in matched_B:
            matched.append((i, j, float(iou)))
            matched_A.add(i)
            matched_B.add(j)

    unmatched_A = [i for i in range(len(detsA)) if i not in matched_A]
    unmatched_B = [j for j in range(len(detsB)) if j not in matched_B]

    return matched, unmatched_A, unmatched_B


def compare_models(test_image_path: str = "bus.jpg", num_runs: int = 15) -> dict:
    print("=" * 60)
    print("VisionSense Phase 4: Pretrained Baseline vs Fine-Tuned Model Comparison")
    print("=" * 60)

    if not os.path.exists(test_image_path):
        raise FileNotFoundError(f"Image not found: {test_image_path}")

    img = cv2.imread(test_image_path)
    if img is None:
        raise ValueError(f"Failed to decode test image: {test_image_path}")

    # 1. Baseline ONNX (yolo26n.onnx)
    baseline_onnx_path = os.path.abspath("public/models/yolo26n.onnx")
    baseline_detector = YOLOPersonDetector(model_name_or_path=baseline_onnx_path, conf_threshold=0.28)

    # Warmup
    for _ in range(3):
        _ = baseline_detector.detect(img)
    t0 = time.perf_counter()
    for _ in range(num_runs):
        base_dets = baseline_detector.detect(img)
    t_base = (time.perf_counter() - t0) / num_runs * 1000.0

    # 2. Fine-Tuned PyTorch (.pt)
    finetuned_pt_path = os.path.abspath("training/checkpoints/best_person_detector.pt")
    if os.path.exists(finetuned_pt_path):
        ft_pt_detector = YOLOPersonDetector(model_name_or_path=finetuned_pt_path, conf_threshold=0.28)
        for _ in range(3):
            _ = ft_pt_detector.detect(img)
        t0 = time.perf_counter()
        for _ in range(num_runs):
            ft_pt_dets = ft_pt_detector.detect(img)
        t_ft_pt = (time.perf_counter() - t0) / num_runs * 1000.0
        pt_provider = ft_pt_detector.active_provider
    else:
        ft_pt_dets = []
        t_ft_pt = 0.0
        pt_provider = "BLOCKED_FILE_NOT_FOUND"

    # 3. Fine-Tuned Exported ONNX
    finetuned_onnx_path = os.path.abspath("training/checkpoints/yolo_person_finetuned.onnx")
    if os.path.exists(finetuned_onnx_path):
        ft_onnx_detector = YOLOPersonDetector(model_name_or_path=finetuned_onnx_path, conf_threshold=0.28)
        for _ in range(3):
            _ = ft_onnx_detector.detect(img)
        t0 = time.perf_counter()
        for _ in range(num_runs):
            ft_onnx_dets = ft_onnx_detector.detect(img)
        t_ft_onnx = (time.perf_counter() - t0) / num_runs * 1000.0
        onnx_provider = ft_onnx_detector.active_provider
    else:
        ft_onnx_dets = []
        t_ft_onnx = 0.0
        onnx_provider = "BLOCKED_FILE_NOT_FOUND"

    print("-" * 60)
    print(f"{'Model':<35} | {'Latency (ms)':<12} | {'FPS':<8} | {'Persons'}")
    print("-" * 60)
    print(f"{'1. Pretrained Baseline ONNX (yolo26n)':<35} | {t_base:<12.2f} | {1000.0/t_base:<8.1f} | {len(base_dets)}")
    if ft_pt_dets:
        print(f"{'2. Fine-Tuned PyTorch (.pt)':<35} | {t_ft_pt:<12.2f} | {1000.0/t_ft_pt:<8.1f} | {len(ft_pt_dets)}")
    if ft_onnx_dets:
        print(f"{'3. Exported Fine-Tuned ONNX':<35} | {t_ft_onnx:<12.2f} | {1000.0/t_ft_onnx:<8.1f} | {len(ft_onnx_dets)}")
    print("-" * 60)

    # IoU Bipartite Matching between PyTorch and Exported ONNX of the SAME model
    if ft_pt_dets and ft_onnx_dets:
        matched_pairs, unmatched_pt, unmatched_onnx = match_detections(ft_pt_dets, ft_onnx_dets, iou_thresh=0.45)
        box_diffs = []
        conf_diffs = []
        for i, j, iou in matched_pairs:
            b_pt = np.array(ft_pt_dets[i].bbox)
            b_onnx = np.array(ft_onnx_dets[j].bbox)
            box_diffs.append(float(np.max(np.abs(b_pt - b_onnx))))
            conf_diffs.append(abs(ft_pt_dets[i].confidence - ft_onnx_dets[j].confidence))

        if len(box_diffs) > 0:
            max_box_diff = round(float(np.max(box_diffs)), 2)
            mean_box_diff = round(float(np.mean(box_diffs)), 2)
            max_conf_diff = round(float(np.max(conf_diffs)), 4)
            mean_conf_diff = round(float(np.mean(conf_diffs)), 4)
        else:
            max_box_diff = None
            mean_box_diff = None
            max_conf_diff = None
            mean_conf_diff = None

        passes_tolerance = (
            len(unmatched_pt) == 0 and
            len(unmatched_onnx) == 0 and
            max_box_diff is not None and
            max_box_diff < 5.0 and
            max_conf_diff is not None and
            max_conf_diff < 0.05
        )
    else:
        matched_pairs, unmatched_pt, unmatched_onnx = [], [], []
        max_box_diff = None
        mean_box_diff = None
        max_conf_diff = None
        mean_conf_diff = None
        passes_tolerance = False

    print("PyTorch vs Exported ONNX Consistency:")
    print(f"  Matched Detections (IoU >= 0.45): {len(matched_pairs)}")
    print(f"  Unmatched PyTorch Detections:      {len(unmatched_pt)}")
    print(f"  Unmatched ONNX Detections:         {len(unmatched_onnx)}")
    if max_box_diff is not None:
        print(f"  Max Box Coordinate Difference:    {max_box_diff:.2f} px")
        print(f"  Mean Box Coordinate Difference:   {mean_box_diff:.2f} px")
        print(f"  Max Confidence Difference:        {max_conf_diff:.4f}")
    else:
        print("  Box Coordinate Difference:        N/A (No matched detections)")
    print(f"  Consistency Verification Status:   {'PASSED' if passes_tolerance else 'DISCREPANCY_DETECTED'}")

    comparison_report = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "test_image": test_image_path,
        "runs": num_runs,
        "models": {
            "baseline_onnx": {
                "name": baseline_detector.model_name,
                "checkpoint": baseline_onnx_path,
                "latency_ms": round(t_base, 2),
                "fps": round(1000.0 / t_base, 2),
                "detected_persons": len(base_dets),
                "backend": baseline_detector.backend_type,
                "provider": baseline_detector.active_provider
            },
            "finetuned_pytorch": {
                "name": "best_person_detector.pt",
                "checkpoint": finetuned_pt_path if os.path.exists(finetuned_pt_path) else None,
                "latency_ms": round(t_ft_pt, 2),
                "fps": round(1000.0 / t_ft_pt, 2) if t_ft_pt > 0 else 0.0,
                "detected_persons": len(ft_pt_dets),
                "backend": "ultralytics_pt" if ft_pt_dets else "not_available",
                "provider": pt_provider
            },
            "finetuned_exported_onnx": {
                "name": "yolo_person_finetuned.onnx",
                "checkpoint": finetuned_onnx_path if os.path.exists(finetuned_onnx_path) else None,
                "latency_ms": round(t_ft_onnx, 2),
                "fps": round(1000.0 / t_ft_onnx, 2) if t_ft_onnx > 0 else 0.0,
                "detected_persons": len(ft_onnx_dets),
                "backend": "onnxruntime" if ft_onnx_dets else "not_available",
                "provider": onnx_provider
            }
        },
        "numerical_tolerance": {
            "matched_count": len(matched_pairs),
            "unmatched_pt_count": len(unmatched_pt),
            "unmatched_onnx_count": len(unmatched_onnx),
            "max_box_diff_px": max_box_diff,
            "mean_box_diff_px": mean_box_diff,
            "max_conf_diff": max_conf_diff,
            "mean_conf_diff": mean_conf_diff,
            "passes_strict_tolerance": passes_tolerance
        }
    }

    out_file = "training/evaluation/detector_comparison_report.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(comparison_report, f, indent=2)

    print(f"Detector comparison report saved to: {out_file}")
    return comparison_report


if __name__ == "__main__":
    compare_models()
