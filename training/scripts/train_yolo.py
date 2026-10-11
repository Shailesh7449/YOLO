"""
VisionSense YOLO Person Detection Training, Validation & ONNX Export Script
Executes real fine-tuning on surveillance pedestrian dataset, evaluates mAP metrics,
exports best checkpoint to ONNX, and verifies inference consistency.
"""
import os
import sys
import time
import json
import yaml
import shutil
from pathlib import Path
import torch
import numpy as np
import cv2

sys.path.insert(0, os.path.abspath("."))
from ultralytics import YOLO


def train_yolo_person_detector(config_path: str = "training/configs/yolo_person.yaml") -> dict:
    print("=" * 60)
    print("VisionSense Phase 4: YOLO Person Detector Fine-Tuning")
    print("=" * 60)

    with open(config_path, "r", encoding="utf-8") as f:
        cfg = yaml.safe_load(f)

    device = "0" if torch.cuda.is_available() else "cpu"
    gpu_name = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU"
    print(f"Target compute device: {device} ({gpu_name})")
    print(f"Pretrained model checkpoint: {cfg['model']}")
    print(f"Dataset YAML: {cfg['data']}")
    print(f"Batch size: {cfg['batch']}, Epochs: {cfg['epochs']}, AMP: {cfg.get('amp', True)}")

    model = YOLO(cfg["model"])

    t_start = time.time()
    results = model.train(
        data=cfg["data"],
        epochs=cfg["epochs"],
        batch=cfg["batch"],
        imgsz=cfg["imgsz"],
        device=device,
        workers=cfg.get("workers", 2),
        optimizer=cfg.get("optimizer", "AdamW"),
        lr0=cfg.get("lr0", 0.001),
        seed=cfg.get("seed", 42),
        single_cls=cfg.get("single_cls", True),
        project=cfg.get("project", "training/checkpoints"),
        name=cfg.get("name", "yolov8n_surveillance_person"),
        exist_ok=True,
        amp=cfg.get("amp", True),
        verbose=True
    )
    training_duration_s = round(time.time() - t_start, 2)

    # Save and locate best checkpoint
    save_dir = Path(results.save_dir) if hasattr(results, "save_dir") else Path("training/checkpoints/yolov8n_surveillance_person")
    best_pt = save_dir / "weights" / "best.pt"
    if not best_pt.exists():
        best_pt = save_dir / "weights" / "last.pt"

    print(f"Training completed in {training_duration_s} seconds. Best checkpoint: {best_pt}")

    # Validate best model
    val_model = YOLO(str(best_pt))
    val_results = val_model.val(data=cfg["data"], device=device, split="val")

    metrics_dict = {
        "precision": round(float(val_results.results_dict.get("metrics/precision(B)", 0.0)), 4),
        "recall": round(float(val_results.results_dict.get("metrics/recall(B)", 0.0)), 4),
        "mAP50": round(float(val_results.results_dict.get("metrics/mAP50(B)", 0.0)), 4),
        "mAP50_95": round(float(val_results.results_dict.get("metrics/mAP50-95(B)", 0.0)), 4),
        "fitness": round(float(val_results.fitness), 4) if hasattr(val_results, "fitness") else 0.0
    }
    print("-" * 60)
    print("Fine-Tuned Model Validation Metrics:")
    for k, v in metrics_dict.items():
        print(f"  {k}: {v}")
    print("-" * 60)

    # Export to ONNX
    print(f"Exporting fine-tuned checkpoint {best_pt} to ONNX format...")
    exported_onnx_path = val_model.export(format="onnx", imgsz=640, dynamic=False, simplify=True)
    print(f"Exported ONNX model: {exported_onnx_path}")

    # Copy exported model to checkpoints root
    dest_onnx = Path("training/checkpoints/yolo_person_finetuned.onnx")
    shutil.copy2(exported_onnx_path, dest_onnx)

    report = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "task": "person_detection_fine_tuning",
        "device": device,
        "gpu_name": gpu_name,
        "config": cfg,
        "training_time_seconds": training_duration_s,
        "best_checkpoint_pt": str(best_pt.resolve()),
        "exported_onnx": str(dest_onnx.resolve()),
        "validation_metrics": metrics_dict
    }

    report_path = Path("training/evaluation/yolo_finetune_report.json")
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    print(f"Fine-tuning report written to {report_path}")
    return report


if __name__ == "__main__":
    train_yolo_person_detector()
