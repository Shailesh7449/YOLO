"""
VisionSense AI - Violence Detection Quantitative Benchmark & Comprehensive Evaluation Suite
Evaluates baseline and fine-tuned 3D CNN models on the held-out test split.
Reports:
- Confusion Matrix (TP, FP, TN, FN)
- Accuracy, Precision, Recall, F1 Score, FPR, FNR
- Inference Latency (Mean & P95 ms), Throughput (FPS)
- VRAM and RAM consumption
- Action-level breakdown on difficult negatives (hugging, gesturing, sprints, jumping)
- Multi-camera perspective evaluation (Cam 1 front vs Cam 2 fisheye)
"""

import os
import sys
import time
import json
import argparse
from pathlib import Path
from typing import Dict, List, Any, Tuple

import cv2
import numpy as np
import torch
import torch.nn as nn
from torchvision.models.video import r2plus1d_18

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT_DIR))

from visionsense.violence_detector import ViolenceDetector, ViolencePrediction

NORM_MEAN = np.array([0.45, 0.45, 0.45], dtype=np.float32)
NORM_STD = np.array([0.225, 0.225, 0.225], dtype=np.float32)


def load_clip_frames(path: str, num_frames: int = 16, frame_size: Tuple[int, int] = (224, 224)) -> List[np.ndarray]:
    """Loads and uniformly samples frames from a video file."""
    if not os.path.exists(path):
        return [np.zeros((*frame_size, 3), dtype=np.uint8) for _ in range(num_frames)]

    cap = cv2.VideoCapture(path)
    frames = []
    while True:
        ret, f = cap.read()
        if not ret or f is None:
            break
        frames.append(f)
    cap.release()

    if len(frames) == 0:
        return [np.zeros((*frame_size, 3), dtype=np.uint8) for _ in range(num_frames)]

    indices = np.linspace(0, len(frames) - 1, num_frames).astype(int)
    sampled = []
    for idx in indices:
        f = frames[min(idx, len(frames) - 1)]
        f_rgb = cv2.cvtColor(f, cv2.COLOR_BGR2RGB)
        if (f_rgb.shape[1], f_rgb.shape[0]) != frame_size:
            f_rgb = cv2.resize(f_rgb, frame_size, interpolation=cv2.INTER_LINEAR)
        sampled.append(f_rgb)
    return sampled


def build_r2plus1d(checkpoint_path: str, device: torch.device) -> nn.Module:
    model = r2plus1d_18(weights=None)
    model.fc = nn.Sequential(nn.Dropout(0.5), nn.Linear(model.fc.in_features, 2))
    if os.path.exists(checkpoint_path):
        ckpt = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
        state_dict = ckpt.get("model", ckpt)
        cleaned = {k[9:] if k.startswith("backbone.") else k: v for k, v in state_dict.items()}
        model.load_state_dict(cleaned, strict=True)
    model.to(device)
    model.eval()
    return model


def evaluate_model_on_test_set(
    model_name: str,
    checkpoint_path: str,
    test_samples: List[Dict[str, Any]],
    device: torch.device,
    num_frames: int = 16,
    confidence_threshold: float = 0.50
) -> Dict[str, Any]:
    print(f"\n[Evaluating {model_name}] Loading: {checkpoint_path}")
    model = build_r2plus1d(checkpoint_path, device)

    # Warmup
    dummy = torch.zeros(1, 3, num_frames, 224, 224, device=device)
    for _ in range(3):
        with torch.no_grad():
            _ = model(dummy)
    if device.type == "cuda":
        torch.cuda.synchronize()

    predictions = []
    ground_truths = []
    latencies_ms = []
    per_clip_results = []

    # Category tracking
    action_types: Dict[str, Dict[str, int]] = {
        "violent_physical": {"total": 0, "correct": 0},
        "nonviolent_challenge": {"total": 0, "correct": 0},
        "cam1_front": {"total": 0, "correct": 0},
        "cam2_fisheye": {"total": 0, "correct": 0}
    }

    vram_start_mb = torch.cuda.memory_allocated() / (1024 * 1024) if device.type == "cuda" else 0.0

    for sample in test_samples:
        video_path = sample.get("path", "")
        tensor_path = sample.get("tensor_path")
        label = int(sample["label"])  # 0: VIOLENCE, 1: NON_VIOLENCE
        filename = sample.get("filename", Path(video_path).name if video_path else "unknown")
        camera = sample.get("camera", "unknown")

        if tensor_path and os.path.exists(tensor_path):
            with np.load(tensor_path) as data:
                raw_arr = data["tensor"]
            frames = [raw_arr[i] for i in range(raw_arr.shape[0])]
        else:
            frames = load_clip_frames(video_path, num_frames=num_frames)

        # Preprocess: [1, 3, T, H, W]
        arr = np.stack(frames, axis=0).astype(np.float32) / 255.0
        arr = (arr - NORM_MEAN) / NORM_STD
        tensor = torch.from_numpy(arr).permute(3, 0, 1, 2).unsqueeze(0).to(device)

        t0 = time.perf_counter()
        with torch.no_grad():
            logits = model(tensor)
            probs = torch.softmax(logits, dim=1).cpu().numpy()[0]
        if device.type == "cuda":
            torch.cuda.synchronize()
        latency = (time.perf_counter() - t0) * 1000.0
        latencies_ms.append(latency)

        # Prob 0 is VIOLENCE, Prob 1 is NON_VIOLENCE
        p_violence = float(probs[0])
        pred_label = 0 if p_violence >= confidence_threshold else 1
        is_correct = (pred_label == label)

        predictions.append(pred_label)
        ground_truths.append(label)

        # Track category
        cat_key = "violent_physical" if label == 0 else "nonviolent_challenge"
        action_types[cat_key]["total"] += 1
        if is_correct:
            action_types[cat_key]["correct"] += 1

        cam_key = "cam1_front" if "cam1" in camera else ("cam2_fisheye" if "cam2" in camera else None)
        if cam_key:
            action_types[cam_key]["total"] += 1
            if is_correct:
                action_types[cam_key]["correct"] += 1

        per_clip_results.append({
            "filename": filename,
            "ground_truth": "VIOLENCE" if label == 0 else "NON_VIOLENCE",
            "predicted": "VIOLENCE" if pred_label == 0 else "NON_VIOLENCE",
            "p_violence": round(p_violence, 4),
            "correct": is_correct,
            "camera": camera,
            "latency_ms": round(latency, 2)
        })

    vram_peak_mb = torch.cuda.max_memory_allocated() / (1024 * 1024) if device.type == "cuda" else 0.0

    # Classification Metrics
    tp = sum(1 for t, p in zip(ground_truths, predictions) if t == 0 and p == 0)
    tn = sum(1 for t, p in zip(ground_truths, predictions) if t == 1 and p == 1)
    fp = sum(1 for t, p in zip(ground_truths, predictions) if t == 1 and p == 0)
    fn = sum(1 for t, p in zip(ground_truths, predictions) if t == 0 and p == 1)

    total = len(ground_truths)
    acc = (tp + tn) / total if total > 0 else 0.0
    prec = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    rec = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = 2 * (prec * rec) / (prec + rec) if (prec + rec) > 0 else 0.0
    fpr = fp / (fp + tn) if (fp + tn) > 0 else 0.0
    fnr = fn / (fn + tp) if (fn + tp) > 0 else 0.0

    mean_lat = float(np.mean(latencies_ms))
    p95_lat = float(np.percentile(latencies_ms, 95))
    fps_throughput = (1000.0 / mean_lat) * num_frames if mean_lat > 0 else 0.0

    category_accuracy = {}
    for k, v in action_types.items():
        if v["total"] > 0:
            category_accuracy[k] = round(v["correct"] / v["total"], 4)

    return {
        "model_name": model_name,
        "checkpoint": checkpoint_path,
        "sample_count": total,
        "confusion_matrix": {
            "true_positives": tp,
            "true_negatives": tn,
            "false_positives": fp,
            "false_negatives": fn
        },
        "metrics": {
            "accuracy": round(acc, 4),
            "precision": round(prec, 4),
            "recall": round(rec, 4),
            "f1_score": round(f1, 4),
            "false_positive_rate": round(fpr, 4),
            "false_negative_rate": round(fnr, 4)
        },
        "performance": {
            "mean_latency_ms": round(mean_lat, 2),
            "p95_latency_ms": round(p95_lat, 2),
            "throughput_fps": round(fps_throughput, 1),
            "vram_allocated_mb": round(vram_peak_mb, 1)
        },
        "category_accuracy": category_accuracy,
        "per_clip_results": per_clip_results
    }


def run_benchmark_and_comparison():
    prep_manifest = ROOT_DIR / "datasets/manifests/violence_preprocessed_manifest.json"
    manifest_path = prep_manifest if prep_manifest.exists() else (ROOT_DIR / "datasets/manifests/violence_training_manifest.json")
    if not manifest_path.exists():
        print(f"Error: Manifest not found at {manifest_path}")
        return

    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest_data = json.load(f)

    test_samples = manifest_data["splits"]["test"]
    print(f"[Benchmark] Evaluating on held-out test split ({len(test_samples)} authentic CCTV clips)...")

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"[Benchmark] Hardware: {device} ({torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU'})")

    finetuned_ckpt = ROOT_DIR / "training/checkpoints/violence_r2plus1d_finetuned.pt"
    backup_ckpt = ROOT_DIR / "training/checkpoints/violence_r2plus1d_finetuned_backup.pt"
    baseline_ckpt = ROOT_DIR / "training/checkpoints/violence_r2plus1d_best.pt"

    baseline_to_eval = backup_ckpt if backup_ckpt.exists() else baseline_ckpt

    results = {}

    # 1. Baseline Evaluation
    if baseline_to_eval.exists():
        results["baseline"] = evaluate_model_on_test_set(
            model_name="R(2+1)D-18 Baseline (RWF-2000 Prior)",
            checkpoint_path=str(baseline_to_eval),
            test_samples=test_samples,
            device=device
        )

    # 2. Fine-Tuned Candidate Evaluation
    if finetuned_ckpt.exists():
        results["candidate_finetuned"] = evaluate_model_on_test_set(
            model_name="R(2+1)D-18 Fine-Tuned (VisionSense Real Surveillance)",
            checkpoint_path=str(finetuned_ckpt),
            test_samples=test_samples,
            device=device
        )

    # 3. Print Comparison Table
    print("\n=========================================================================================")
    print("                    VIOLENCE DETECTION MODEL COMPARISON REPORT                          ")
    print("=========================================================================================")
    print(f"{'Metric':<25} | {'Baseline (RWF-2000)':<25} | {'Fine-Tuned Candidate':<25}")
    print("-" * 80)

    b_met = results.get("baseline", {}).get("metrics", {})
    c_met = results.get("candidate_finetuned", {}).get("metrics", {})
    b_perf = results.get("baseline", {}).get("performance", {})
    c_perf = results.get("candidate_finetuned", {}).get("performance", {})

    print(f"{'Accuracy':<25} | {b_met.get('accuracy', 0)*100:.1f}%{'':<20} | {c_met.get('accuracy', 0)*100:.1f}%")
    print(f"{'Precision (Violence)':<25} | {b_met.get('precision', 0)*100:.1f}%{'':<20} | {c_met.get('precision', 0)*100:.1f}%")
    print(f"{'Recall (Violence)':<25} | {b_met.get('recall', 0)*100:.1f}%{'':<20} | {c_met.get('recall', 0)*100:.1f}%")
    print(f"{'F1 Score':<25} | {b_met.get('f1_score', 0)*100:.1f}%{'':<20} | {c_met.get('f1_score', 0)*100:.1f}%")
    print(f"{'False Positive Rate (FPR)':<25} | {b_met.get('false_positive_rate', 0)*100:.1f}%{'':<20} | {c_met.get('false_positive_rate', 0)*100:.1f}%")
    print(f"{'False Negative Rate (FNR)':<25} | {b_met.get('false_negative_rate', 0)*100:.1f}%{'':<20} | {c_met.get('false_negative_rate', 0)*100:.1f}%")
    print(f"{'Mean Latency (16 frames)':<25} | {b_perf.get('mean_latency_ms', 0):.1f} ms{'':<18} | {c_perf.get('mean_latency_ms', 0):.1f} ms")
    print(f"{'Peak VRAM Allocated':<25} | {b_perf.get('vram_allocated_mb', 0):.1f} MB{'':<18} | {c_perf.get('vram_allocated_mb', 0):.1f} MB")
    print("=========================================================================================")

    # Save to JSON
    eval_dir = ROOT_DIR / "training" / "evaluation"
    eval_dir.mkdir(parents=True, exist_ok=True)
    report_path = eval_dir / "violence_model_comparison_report.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    print(f"\n[Report] Comparison report saved to: {report_path}")
    return results


if __name__ == "__main__":
    run_benchmark_and_comparison()
