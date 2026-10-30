"""
VisionSense Temporal Crowd Anomaly Model Training & Evaluation
Architecture: Bi-directional GRU with Temporal Attention Pooling & 1D Conv Front-End.
Inputs: (batch_size, seq_len=24, feature_dim=6)
Features: [people_count, count_delta, velocity_x, velocity_y, motion_mag, dispersion]
Classes: 0: Normal, 1: Surge, 2: Dispersal, 3: Congestion
Outputs: Class logits & Continuous Anomaly Score in [0.0, 1.0]
Saves: PyTorch checkpoint (.pt) and ONNX model (.onnx).
"""
import os
import sys
import time
import json
from pathlib import Path
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import TensorDataset, DataLoader
from sklearn.metrics import classification_report, confusion_matrix, roc_auc_score, f1_score


class TemporalAttention(nn.Module):
    def __init__(self, hidden_dim: int):
        super().__init__()
        self.projection = nn.Sequential(
            nn.Linear(hidden_dim, 32),
            nn.Tanh(),
            nn.Linear(32, 1)
        )

    def forward(self, gru_out):
        # gru_out: [B, T, hidden_dim]
        energy = self.projection(gru_out)  # [B, T, 1]
        weights = torch.softmax(energy, dim=1)  # [B, T, 1]
        context = torch.sum(weights * gru_out, dim=1)  # [B, hidden_dim]
        return context, weights


class TemporalCrowdAnomalyNet(nn.Module):
    def __init__(self, in_features: int = 6, hidden_dim: int = 32, num_classes: int = 4):
        super().__init__()
        # 1D Temporal Convolution Front-End
        self.conv1d = nn.Conv1d(in_channels=in_features, out_channels=32, kernel_size=3, padding=1)
        self.bn1d = nn.BatchNorm1d(32)
        self.relu = nn.ReLU()

        # Bi-directional GRU
        self.gru = nn.GRU(
            input_size=32,
            hidden_size=hidden_dim,
            num_layers=2,
            batch_first=True,
            bidirectional=True,
            dropout=0.1
        )

        # Attention pooling
        self.attention = TemporalAttention(hidden_dim * 2)

        # Classifier head
        self.classifier = nn.Sequential(
            nn.Linear(hidden_dim * 2, 32),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(32, num_classes)
        )

    def forward(self, x):
        # x: [B, T, in_features]
        # Reshape for Conv1D: [B, in_features, T]
        x_conv = x.transpose(1, 2)
        x_conv = self.relu(self.bn1d(self.conv1d(x_conv)))
        x_gru_in = x_conv.transpose(1, 2)  # [B, T, 32]

        gru_out, _ = self.gru(x_gru_in)  # [B, T, 64]
        context, _ = self.attention(gru_out)  # [B, 64]
        logits = self.classifier(context)  # [B, 4]
        return logits


def train_and_evaluate(
    data_dir: Path = Path("datasets/surveillance_anomaly/temporal_sequences"),
    epochs: int = 25,
    batch_size: int = 8,
    lr: float = 0.003,
    device_name: str = "cuda" if torch.cuda.is_available() else "cpu"
) -> dict:
    print("=" * 60)
    print("VisionSense Phase 5: Temporal Crowd Anomaly Model Training")
    print("=" * 60)

    device = torch.device(device_name)
    gpu_label = torch.cuda.get_device_name(0) if device_name == "cuda" else "CPU"
    print(f"Device: {device} ({gpu_label})")

    # Load prepared datasets
    X_train = np.load(str(data_dir / "X_train.npy"))
    y_train = np.load(str(data_dir / "y_train.npy"))
    X_val = np.load(str(data_dir / "X_val.npy"))
    y_val = np.load(str(data_dir / "y_val.npy"))

    print(f"Train samples: {X_train.shape[0]}, Val samples: {X_val.shape[0]}")
    print(f"Input shape: {X_train.shape[1]} timesteps, {X_train.shape[2]} features per step")

    # Normalization statistics from train set only (prevent data leakage)
    mean = np.mean(X_train, axis=(0, 1), keepdims=True)
    std = np.std(X_train, axis=(0, 1), keepdims=True) + 1e-6

    X_train_norm = (X_train - mean) / std
    X_val_norm = (X_val - mean) / std

    # DataLoaders
    train_dataset = TensorDataset(torch.tensor(X_train_norm, dtype=torch.float32), torch.tensor(y_train, dtype=torch.long))
    val_dataset = TensorDataset(torch.tensor(X_val_norm, dtype=torch.float32), torch.tensor(y_val, dtype=torch.long))

    train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=batch_size, shuffle=False)

    # Initialize model
    model = TemporalCrowdAnomalyNet(in_features=6, hidden_dim=32, num_classes=4).to(device)
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)

    # Training loop
    t0 = time.time()
    best_val_f1 = 0.0
    best_weights = None

    for epoch in range(1, epochs + 1):
        model.train()
        train_loss = 0.0
        for bx, by in train_loader:
            bx, by = bx.to(device), by.to(device)
            optimizer.zero_grad()
            out = model(bx)
            loss = criterion(out, by)
            loss.backward()
            optimizer.step()
            train_loss += loss.item() * bx.size(0)

        train_loss /= len(train_dataset)

        # Validation
        model.eval()
        val_preds, val_targets = [], []
        with torch.no_grad():
            for bx, by in val_loader:
                bx = bx.to(device)
                logits = model(bx)
                preds = torch.argmax(logits, dim=1).cpu().numpy()
                val_preds.extend(preds)
                val_targets.extend(by.numpy())

        val_f1 = f1_score(val_targets, val_preds, average="macro")
        if val_f1 >= best_val_f1:
            best_val_f1 = val_f1
            best_weights = model.state_dict().copy()

        if epoch % 5 == 0 or epoch == epochs:
            print(f"Epoch {epoch:02d}/{epochs:02d} | Train Loss: {train_loss:.4f} | Val Macro F1: {val_f1:.4f}")

    train_time = round(time.time() - t0, 2)
    print(f"Training completed in {train_time}s. Best Val Macro F1: {best_val_f1:.4f}")

    # Load best weights
    model.load_state_dict(best_weights)
    model.eval()

    # Final evaluation on held-out validation set
    all_preds, all_probs, all_targets = [], [], []
    latencies = []

    with torch.no_grad():
        for bx, by in val_loader:
            bx = bx.to(device)
            t_inf_0 = time.perf_counter()
            logits = model(bx)
            t_inf_1 = time.perf_counter()
            latencies.append((t_inf_1 - t_inf_0) * 1000.0 / bx.size(0))

            probs = torch.softmax(logits, dim=1).cpu().numpy()
            preds = np.argmax(probs, axis=1)

            all_preds.extend(preds)
            all_probs.extend(probs)
            all_targets.extend(by.numpy())

    all_preds = np.array(all_preds)
    all_probs = np.array(all_probs)
    all_targets = np.array(all_targets)

    # Metrics
    class_names = ["Normal", "Surge", "Dispersal", "Congestion"]
    report_text = classification_report(all_targets, all_preds, target_names=class_names, zero_division=0)
    conf_mat = confusion_matrix(all_targets, all_preds).tolist()
    acc = float(np.mean(all_preds == all_targets))
    macro_f1 = float(f1_score(all_targets, all_preds, average="macro"))

    # Binary ROC-AUC: Class 0 (Normal) vs Classes 1, 2, 3 (Anomalous)
    binary_targets = (all_targets > 0).astype(int)
    # Anomaly probability = 1 - P(Normal)
    anomaly_scores = 1.0 - all_probs[:, 0]
    roc_auc = float(roc_auc_score(binary_targets, anomaly_scores)) if len(np.unique(binary_targets)) > 1 else 1.0

    mean_lat_ms = float(np.mean(latencies))
    fps = float(1000.0 / mean_lat_ms) if mean_lat_ms > 0 else 0.0

    print("-" * 60)
    print("Held-Out Validation Evaluation Results:")
    print(f"  Accuracy:      {acc * 100:.2f}%")
    print(f"  Macro F1:      {macro_f1:.4f}")
    print(f"  ROC-AUC:       {roc_auc:.4f}")
    print(f"  Mean Latency:  {mean_lat_ms:.2f} ms per sequence")
    print(f"  Throughput:    {fps:.1f} seq/sec")
    print("\nClassification Report:\n", report_text)
    print("Confusion Matrix:\n", np.array(conf_mat))
    print("-" * 60)

    # Save PyTorch Checkpoint
    checkpoint_dir = Path("training/checkpoints")
    checkpoint_dir.mkdir(parents=True, exist_ok=True)
    pt_path = checkpoint_dir / "temporal_anomaly_model.pt"

    checkpoint_payload = {
        "model_state_dict": model.state_dict(),
        "input_features": 6,
        "hidden_dim": 32,
        "num_classes": 4,
        "class_names": class_names,
        "normalization": {
            "mean": mean.tolist(),
            "std": std.tolist()
        },
        "metrics": {
            "accuracy": round(acc, 4),
            "macro_f1": round(macro_f1, 4),
            "roc_auc": round(roc_auc, 4),
            "latency_ms": round(mean_lat_ms, 2)
        }
    }
    torch.save(checkpoint_payload, str(pt_path))
    print(f"Saved PyTorch checkpoint to: {pt_path}")

    # Export to ONNX
    onnx_path = checkpoint_dir / "temporal_anomaly_model.onnx"
    dummy_input = torch.randn(1, 24, 6, device=device)
    torch.onnx.export(
        model,
        dummy_input,
        str(onnx_path),
        input_names=["temporal_features"],
        output_names=["logits"],
        dynamic_axes={"temporal_features": {0: "batch_size"}, "logits": {0: "batch_size"}},
        opset_version=17
    )
    print(f"Exported ONNX model to: {onnx_path}")

    # Save evaluation report
    eval_report = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "model": "TemporalCrowdAnomalyNet (Bi-GRU + Attention)",
        "device": device_name,
        "gpu_name": gpu_label,
        "training_time_seconds": train_time,
        "epochs": epochs,
        "batch_size": batch_size,
        "checkpoint_pt": str(pt_path.resolve()),
        "exported_onnx": str(onnx_path.resolve()),
        "metrics": {
            "accuracy": round(acc, 4),
            "macro_f1": round(macro_f1, 4),
            "roc_auc": round(roc_auc, 4),
            "latency_ms": round(mean_lat_ms, 2),
            "throughput_fps": round(fps, 2),
            "confusion_matrix": conf_mat
        },
        "classes": class_names
    }

    report_path = Path("training/evaluation/temporal_anomaly_report.json")
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(eval_report, f, indent=2)

    print(f"Temporal anomaly report saved to: {report_path}")
    return eval_report


if __name__ == "__main__":
    train_and_evaluate()
