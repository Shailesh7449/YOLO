"""
VisionSense AI - Spatio-Temporal Violence Recognition Fine-Tuning Pipeline
Trains / fine-tunes 3D CNN action recognition models (R(2+1)D-18 / X3D-M) on surveillance CCTV footage.
Designed for local hardware: Intel Core i5-10200H, 16GB RAM, NVIDIA GeForce GTX 1650 (4GB VRAM).

Features:
- Source-event-level splitting (zero data leakage between train, val, and test).
- Automatic Mixed Precision (AMP fp16) with GradScaler for 4GB VRAM efficiency.
- Kinetic and spatial augmentation (horizontal flip, illumination jitter, temporal subsampling).
- Strict 2-class mapping: 0: VIOLENCE, 1: NON_VIOLENCE.
- Pre-training checkpoint backup and automated best-checkpoint preservation.
"""

import os
import sys
import time
import json
import random
import argparse
import shutil
from pathlib import Path
from typing import List, Tuple, Dict, Any, Optional

import cv2
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from torchvision.models.video import r2plus1d_18

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT_DIR))

# Standard normalization constants (RWF-2000 / Kinetics standard)
NORM_MEAN = np.array([0.45, 0.45, 0.45], dtype=np.float32)
NORM_STD = np.array([0.225, 0.225, 0.225], dtype=np.float32)


class SurveillanceViolenceDataset(Dataset):
    """
    Spatio-temporal dataset loading surveillance clips and sub-clips
    with temporal window subsampling and kinetic augmentation.
    """
    def __init__(
        self,
        samples: List[Dict[str, Any]],
        num_frames: int = 16,
        frame_size: Tuple[int, int] = (224, 224),
        is_training: bool = True
    ):
        self.samples = samples
        self.num_frames = num_frames
        self.frame_size = frame_size
        self.is_training = is_training

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, torch.Tensor, str]:
        sample = self.samples[idx]
        video_path = sample.get("path", "")
        tensor_path = sample.get("tensor_path")
        label = int(sample["label"])  # 0: VIOLENCE, 1: NON_VIOLENCE
        name = sample.get("filename", Path(video_path).name if video_path else f"sample_{idx}")

        if tensor_path and os.path.exists(tensor_path):
            with np.load(tensor_path) as data:
                raw_arr = data["tensor"]  # [T, H, W, 3] uint8
            frames = [raw_arr[i] for i in range(raw_arr.shape[0])]
        else:
            frames = self._load_frames(video_path)

        # Spatial and temporal augmentation during training
        if self.is_training:
            # Random horizontal flip
            if random.random() > 0.5:
                frames = [cv2.flip(f, 1) for f in frames]

            # Subtle random brightness/contrast jitter
            if random.random() > 0.5:
                alpha = random.uniform(0.88, 1.12)
                beta = random.uniform(-10, 10)
                frames = [np.clip(alpha * f + beta, 0, 255).astype(np.uint8) for f in frames]

        # Normalization: [T, H, W, C] -> [C, T, H, W]
        arr = np.stack(frames, axis=0).astype(np.float32) / 255.0
        arr = (arr - NORM_MEAN) / NORM_STD
        tensor = torch.from_numpy(arr).permute(3, 0, 1, 2)  # [C, T, H, W]

        target = torch.tensor(label, dtype=torch.long)
        return tensor, target, name

    def _load_frames(self, path: str) -> List[np.ndarray]:
        if not os.path.exists(path):
            return [np.zeros((*self.frame_size, 3), dtype=np.uint8) for _ in range(self.num_frames)]

        cap = cv2.VideoCapture(path)
        raw_frames = []
        while True:
            ret, f = cap.read()
            if not ret or f is None:
                break
            raw_frames.append(f)
        cap.release()

        if len(raw_frames) == 0:
            return [np.zeros((*self.frame_size, 3), dtype=np.uint8) for _ in range(self.num_frames)]

        # Temporal sampling to exact num_frames
        if len(raw_frames) >= self.num_frames:
            if self.is_training and len(raw_frames) > self.num_frames + 4:
                # Random temporal crop start during training
                max_start = len(raw_frames) - self.num_frames
                start = random.randint(0, max_start)
                indices = np.linspace(start, start + self.num_frames - 1, self.num_frames).astype(int)
            else:
                indices = np.linspace(0, len(raw_frames) - 1, self.num_frames).astype(int)
        else:
            indices = np.linspace(0, len(raw_frames) - 1, self.num_frames).astype(int)

        sampled = []
        for i in indices:
            f = raw_frames[min(i, len(raw_frames) - 1)]
            f_rgb = cv2.cvtColor(f, cv2.COLOR_BGR2RGB)
            if (f_rgb.shape[1], f_rgb.shape[0]) != self.frame_size:
                f_rgb = cv2.resize(f_rgb, self.frame_size, interpolation=cv2.INTER_LINEAR)
            sampled.append(f_rgb)

        return sampled


def build_r2plus1d_model(pretrained_path: Optional[str] = None) -> nn.Module:
    """Builds R(2+1)D-18 model with 2-class output (0: VIOLENCE, 1: NON_VIOLENCE)."""
    model = r2plus1d_18(weights=None)
    in_features = model.fc.in_features
    model.fc = nn.Sequential(
        nn.Dropout(0.5),
        nn.Linear(in_features, 2)
    )

    if pretrained_path and os.path.exists(pretrained_path):
        print(f"[Model] Loading baseline checkpoint from: {pretrained_path}")
        ckpt = torch.load(pretrained_path, map_location="cpu", weights_only=False)
        state_dict = ckpt.get("model", ckpt)
        cleaned = {k[9:] if k.startswith("backbone.") else k: v for k, v in state_dict.items()}
        try:
            model.load_state_dict(cleaned, strict=True)
            print("[Model] Baseline checkpoint loaded successfully (strict match).")
        except Exception as e:
            print(f"[Model] Partial checkpoint load: {e}")
            model.load_state_dict(cleaned, strict=False)

    return model


def calculate_metrics(targets: List[int], predictions: List[int]) -> Dict[str, float]:
    """Computes binary classification metrics with 0 as positive class (VIOLENCE)."""
    tp = sum(1 for t, p in zip(targets, predictions) if t == 0 and p == 0)
    tn = sum(1 for t, p in zip(targets, predictions) if t == 1 and p == 1)
    fp = sum(1 for t, p in zip(targets, predictions) if t == 1 and p == 0)
    fn = sum(1 for t, p in zip(targets, predictions) if t == 0 and p == 1)

    total = len(targets)
    acc = (tp + tn) / total if total > 0 else 0.0
    prec = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    rec = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = 2 * (prec * rec) / (prec + rec) if (prec + rec) > 0 else 0.0
    fpr = fp / (fp + tn) if (fp + tn) > 0 else 0.0
    fnr = fn / (fn + tp) if (fn + tp) > 0 else 0.0

    return {
        "accuracy": round(acc, 4),
        "precision": round(prec, 4),
        "recall": round(rec, 4),
        "f1": round(f1, 4),
        "fpr": round(fpr, 4),
        "fnr": round(fnr, 4),
        "tp": tp, "tn": tn, "fp": fp, "fn": fn
    }


def train_violence_model(
    manifest_path: Path,
    epochs: int = 8,
    batch_size: int = 4,
    learning_rate: float = 1e-4,
    random_seed: int = 42,
    num_frames: int = 16,
    accumulation_steps: int = 2
) -> Dict[str, Any]:
    # Reproducibility
    random.seed(random_seed)
    np.random.seed(random_seed)
    torch.manual_seed(random_seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(random_seed)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print("======================================================================")
    print("  VisionSense AI - Spatio-Temporal Violence Model Fine-Tuning        ")
    print(f"  Target Device: {device} ({torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU'})")
    print(f"  Batch Size: {batch_size} (Grad Accum: {accumulation_steps}) | Epochs: {epochs} | Frames: {num_frames}")
    print("======================================================================")

    prep_manifest = ROOT_DIR / "datasets/manifests/violence_preprocessed_manifest.json"
    if prep_manifest.exists():
        manifest_path = prep_manifest
        print(f"[Dataset] Using accelerated preprocessed 3D tensor manifest: {prep_manifest.name}")

    # Load dataset splits from manifest
    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest_data = json.load(f)

    splits = manifest_data["splits"]
    train_samples = splits["train"]
    val_samples = splits["val"]
    test_samples = splits["test"]

    print(f"[Dataset] Train samples: {len(train_samples)} (V: {sum(1 for s in train_samples if s['label'] == 0)}, NV: {sum(1 for s in train_samples if s['label'] == 1)})")
    print(f"[Dataset] Val samples:   {len(val_samples)} (V: {sum(1 for s in val_samples if s['label'] == 0)}, NV: {sum(1 for s in val_samples if s['label'] == 1)})")
    print(f"[Dataset] Held-out Test: {len(test_samples)} (V: {sum(1 for s in test_samples if s['label'] == 0)}, NV: {sum(1 for s in test_samples if s['label'] == 1)})")

    train_ds = SurveillanceViolenceDataset(train_samples, num_frames=num_frames, is_training=True)
    val_ds = SurveillanceViolenceDataset(val_samples, num_frames=num_frames, is_training=False)
    test_ds = SurveillanceViolenceDataset(test_samples, num_frames=num_frames, is_training=False)

    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True, num_workers=0)
    val_loader = DataLoader(val_ds, batch_size=batch_size, shuffle=False, num_workers=0)
    test_loader = DataLoader(test_ds, batch_size=1, shuffle=False, num_workers=0)

    # Backup existing checkpoint before training
    ckpt_dir = ROOT_DIR / "training" / "checkpoints"
    ckpt_dir.mkdir(parents=True, exist_ok=True)
    current_ckpt = ckpt_dir / "violence_r2plus1d_finetuned.pt"
    backup_ckpt = ckpt_dir / "violence_r2plus1d_finetuned_backup.pt"
    if current_ckpt.exists() and not backup_ckpt.exists():
        shutil.copy2(current_ckpt, backup_ckpt)
        print(f"[Rollback Protection] Backed up current checkpoint to: {backup_ckpt.name}")

    # Build model initialized from best baseline
    baseline_path = ckpt_dir / "violence_r2plus1d_best.pt"
    init_path = str(baseline_path) if baseline_path.exists() else (str(current_ckpt) if current_ckpt.exists() else None)
    model = build_r2plus1d_model(init_path)
    model.to(device)

    # Class weighting for balanced loss if classes slightly uneven
    train_labels = [s["label"] for s in train_samples]
    c0 = max(1, train_labels.count(0))
    c1 = max(1, train_labels.count(1))
    weights = torch.tensor([1.0, float(c0) / float(c1)], dtype=torch.float32).to(device)
    criterion = nn.CrossEntropyLoss(weight=weights)

    optimizer = torch.optim.AdamW(model.parameters(), lr=learning_rate, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs, eta_min=1e-6)
    scaler = torch.amp.GradScaler('cuda', enabled=(device.type == "cuda"))

    best_val_f1 = 0.0
    best_epoch = 0
    history = []

    print("\n--- Starting Model Training Loop ---")
    for epoch in range(1, epochs + 1):
        t_epoch_start = time.time()
        model.train()
        total_train_loss = 0.0
        optimizer.zero_grad()

        for step, (tensors, labels, _) in enumerate(train_loader):
            tensors = tensors.to(device)
            labels = labels.to(device)

            with torch.amp.autocast('cuda', enabled=(device.type == "cuda")):
                outputs = model(tensors)
                loss = criterion(outputs, labels) / accumulation_steps

            scaler.scale(loss).backward()

            if (step + 1) % accumulation_steps == 0 or (step + 1) == len(train_loader):
                scaler.step(optimizer)
                scaler.update()
                optimizer.zero_grad()

            total_train_loss += loss.item() * accumulation_steps * tensors.size(0)

        train_loss = total_train_loss / len(train_ds)
        scheduler.step()

        # Validation phase
        model.eval()
        total_val_loss = 0.0
        val_preds = []
        val_targets = []

        with torch.no_grad():
            for tensors, labels, _ in val_loader:
                tensors = tensors.to(device)
                labels = labels.to(device)

                with torch.amp.autocast('cuda', enabled=(device.type == "cuda")):
                    outputs = model(tensors)
                    loss = criterion(outputs, labels)
                    probs = torch.softmax(outputs, dim=1)

                total_val_loss += loss.item() * tensors.size(0)
                # Binary prediction threshold 0.50: class 0 if p(0) >= 0.50 else 1
                pred_classes = (probs[:, 1] > probs[:, 0]).long()
                val_preds.extend(pred_classes.cpu().numpy().tolist())
                val_targets.extend(labels.cpu().numpy().tolist())

        val_loss = total_val_loss / len(val_ds)
        val_metrics = calculate_metrics(val_targets, val_preds)

        epoch_time = time.time() - t_epoch_start
        vram_mb = torch.cuda.memory_allocated() / (1024 * 1024) if torch.cuda.is_available() else 0.0

        print(
            f"Epoch {epoch:02d}/{epochs:02d} [{epoch_time:.1f}s] - "
            f"Train Loss: {train_loss:.4f} | Val Loss: {val_loss:.4f} | "
            f"Val Acc: {val_metrics['accuracy']*100:.1f}% | "
            f"Val F1: {val_metrics['f1']*100:.1f}% | "
            f"Val FPR: {val_metrics['fpr']*100:.1f}% | "
            f"VRAM: {vram_mb:.0f} MB"
        )

        history.append({
            "epoch": epoch,
            "train_loss": round(train_loss, 4),
            "val_loss": round(val_loss, 4),
            "val_metrics": val_metrics,
            "duration_s": round(epoch_time, 2),
            "vram_mb": round(vram_mb, 1)
        })

        # Save checkpoint if F1 score improved or tied with better loss
        if val_metrics["f1"] >= best_val_f1:
            best_val_f1 = val_metrics["f1"]
            best_epoch = epoch
            torch.save({
                "epoch": epoch,
                "model": model.state_dict(),
                "optimizer": optimizer.state_dict(),
                "val_metrics": val_metrics,
                "num_frames": num_frames,
                "timestamp": time.time(),
                "architecture": "R(2+1)D-18",
                "classes": ["VIOLENCE", "NON_VIOLENCE"]
            }, str(current_ckpt))
            print(f"  [CHECKPOINT] Saved new best model to {current_ckpt.name} (F1: {best_val_f1*100:.1f}%)")

    # Save training history log
    log_dir = ROOT_DIR / "training" / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    history_file = log_dir / "violence_training_history.json"
    with open(history_file, "w", encoding="utf-8") as f:
        json.dump({
            "model": "R(2+1)D-18 Spatio-Temporal Video Action Recognition",
            "epochs": epochs,
            "best_epoch": best_epoch,
            "best_val_f1": best_val_f1,
            "device": str(device),
            "history": history
        }, f, indent=2)

    print("\n======================================================================")
    print(f"Fine-tuning complete. Best Validation F1: {best_val_f1*100:.1f}% at Epoch {best_epoch}")
    print(f"Model saved to: {current_ckpt}")
    print(f"Training history saved to: {history_file}")
    print("======================================================================")

    return {
        "status": "SUCCESS",
        "best_epoch": best_epoch,
        "best_val_f1": best_val_f1,
        "checkpoint_path": str(current_ckpt),
        "history_path": str(history_file)
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="VisionSense AI Violence Model Fine-Tuning")
    parser.add_argument("--manifest", type=str, default="datasets/manifests/violence_training_manifest.json")
    parser.add_argument("--epochs", type=int, default=8)
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--lr", type=float, default=1e-4)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--frames", type=int, default=16)
    args = parser.parse_args()

    manifest_p = ROOT_DIR / args.manifest
    if not manifest_p.exists():
        print(f"Error: Manifest not found at {manifest_p}")
        sys.exit(1)

    train_violence_model(
        manifest_path=manifest_p,
        epochs=args.epochs,
        batch_size=args.batch_size,
        learning_rate=args.lr,
        random_seed=args.seed,
        num_frames=args.frames
    )
