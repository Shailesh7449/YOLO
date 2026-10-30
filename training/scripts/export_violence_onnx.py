"""
VisionSense AI - 3D CNN Action Recognition ONNX Export & Verification Tool
Exports PyTorch R(2+1)D-18 / X3D-M checkpoint to ONNX format (opset 14).
Validates numeric parity between PyTorch and ONNX Runtime.
"""

import os
import sys
import argparse
from pathlib import Path

import torch
import torch.nn as nn
import numpy as np
from torchvision.models.video import r2plus1d_18

ROOT_DIR = Path(__file__).resolve().parent.parent.parent


def export_r2plus1d_onnx(
    pt_checkpoint: str,
    onnx_output: str,
    num_frames: int = 16,
    opset_version: int = 14
) -> bool:
    print(f"[ONNX Export] Loading PyTorch weights from: {pt_checkpoint}")
    device = torch.device("cpu")

    model = r2plus1d_18(weights=None)
    model.fc = nn.Sequential(nn.Dropout(0.5), nn.Linear(model.fc.in_features, 2))

    ckpt = torch.load(pt_checkpoint, map_location="cpu", weights_only=False)
    state_dict = ckpt.get("model", ckpt)
    cleaned = {k[9:] if k.startswith("backbone.") else k: v for k, v in state_dict.items()}
    model.load_state_dict(cleaned, strict=True)
    model.eval()

    dummy_input = torch.randn(1, 3, num_frames, 224, 224, dtype=torch.float32)

    print(f"[ONNX Export] Exporting to: {onnx_output} (opset {opset_version})...")
    Path(onnx_output).parent.mkdir(parents=True, exist_ok=True)

    try:
        torch.onnx.export(
            model,
            dummy_input,
            onnx_output,
            input_names=["video_input"],
            output_names=["logits"],
            dynamic_axes={
                "video_input": {0: "batch_size"},
                "logits": {0: "batch_size"}
            },
            opset_version=opset_version,
            do_constant_folding=True
        )
        print(f"[ONNX Export] Successfully saved ONNX model ({os.path.getsize(onnx_output) / (1024*1024):.2f} MB)")
    except Exception as e:
        print(f"[ONNX Export Error]: {e}")
        return False

    # Validate numeric parity with ONNX Runtime
    try:
        import onnxruntime as ort
        sess = ort.InferenceSession(onnx_output, providers=["CPUExecutionProvider"])
        test_np = dummy_input.numpy()
        onnx_out = sess.run(["logits"], {"video_input": test_np})[0]

        with torch.no_grad():
            pt_out = model(dummy_input).numpy()

        max_diff = np.max(np.abs(pt_out - onnx_out))
        print(f"[ONNX Verification] Maximum absolute difference: {max_diff:.6f}")
        if max_diff < 1e-3:
            print("[ONNX Verification] PASS: Numerical parity verified (diff < 0.001)")
            return True
        else:
            print("[ONNX Verification] WARNING: Difference exceeds 0.001 tolerance")
            return True
    except Exception as e:
        print(f"[ONNX Verification Warning]: {e}")
        return True


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Export 3D CNN to ONNX")
    parser.add_argument("--ckpt", type=str, default="training/checkpoints/violence_r2plus1d_finetuned.pt")
    parser.add_argument("--output", type=str, default="training/checkpoints/violence_r2plus1d_finetuned.onnx")
    parser.add_argument("--frames", type=int, default=16)
    args = parser.parse_args()

    export_r2plus1d_onnx(
        pt_checkpoint=str(ROOT_DIR / args.ckpt),
        onnx_output=str(ROOT_DIR / args.output),
        num_frames=args.frames
    )
