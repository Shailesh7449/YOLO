"""
VisionSense AI - Fast Spatio-Temporal Video Preprocessor
Pre-extracts 16-frame 224x224 RGB tensors from raw Full HD surveillance clips
into datasets/processed/violence_tensors/ to eliminate video decode bottlenecks during model training.
"""

import os
import sys
import json
import time
from pathlib import Path
from typing import List, Dict, Any

import cv2
import numpy as np

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
MANIFEST_PATH = ROOT_DIR / "datasets/manifests/violence_training_manifest.json"
OUTPUT_DIR = ROOT_DIR / "datasets/processed/violence_tensors"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def extract_16_frames(video_path: str, target_size=(224, 224), num_frames=16) -> np.ndarray:
    cap = cv2.VideoCapture(video_path)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)

    raw = []
    # If video is short, read sequentially
    if total_frames <= 150:
        while True:
            ret, f = cap.read()
            if not ret or f is None:
                break
            raw.append(f)
        cap.release()
        if len(raw) == 0:
            return np.zeros((num_frames, target_size[1], target_size[0], 3), dtype=np.uint8)
        indices = np.linspace(0, len(raw) - 1, num_frames).astype(int)
        sampled = [raw[min(i, len(raw) - 1)] for i in indices]
    else:
        # Step through with skip to avoid decoding every frame
        stride = max(1, total_frames // (num_frames * 2))
        f_idx = 0
        while len(raw) < num_frames * 3 and f_idx < total_frames:
            ret, f = cap.read()
            if not ret or f is None:
                break
            if f_idx % stride == 0:
                raw.append(f)
            f_idx += 1
        cap.release()
        if len(raw) == 0:
            return np.zeros((num_frames, target_size[1], target_size[0], 3), dtype=np.uint8)
        indices = np.linspace(0, len(raw) - 1, num_frames).astype(int)
        sampled = [raw[min(i, len(raw) - 1)] for i in indices]

    # Convert to RGB and resize to target_size
    tensor = np.zeros((num_frames, target_size[1], target_size[0], 3), dtype=np.uint8)
    for idx, f in enumerate(sampled):
        f_rgb = cv2.cvtColor(f, cv2.COLOR_BGR2RGB)
        if (f_rgb.shape[1], f_rgb.shape[0]) != target_size:
            f_rgb = cv2.resize(f_rgb, target_size, interpolation=cv2.INTER_AREA)
        tensor[idx] = f_rgb

    return tensor


def preprocess_all():
    print("======================================================================")
    print("  VisionSense AI - High-Speed 3D Spatio-Temporal Tensor Preprocessor  ")
    print("======================================================================")

    if not MANIFEST_PATH.exists():
        print(f"Error: Manifest not found at {MANIFEST_PATH}")
        return

    with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    all_clips = []
    for split_name in ["train", "val", "test"]:
        for c in manifest["splits"][split_name]:
            c["split"] = split_name
            all_clips.append(c)

    print(f"Total clips to preprocess: {len(all_clips)}")
    t0 = time.time()

    processed_manifest = {
        "dataset_name": "VisionSense-Preprocessed-3DTensors",
        "num_frames": 16,
        "frame_size": [224, 224],
        "format": "uint8 [16, 224, 224, 3] RGB in .npz format",
        "splits": {"train": [], "val": [], "test": []}
    }

    for idx, clip in enumerate(all_clips, 1):
        v_path = clip["path"]
        v_file = Path(v_path)
        tensor_name = f"{v_file.stem}_16x224.npz"
        tensor_path = OUTPUT_DIR / tensor_name

        if not tensor_path.exists():
            arr = extract_16_frames(v_path)
            # Save compressed npz
            np.savez_compressed(str(tensor_path), tensor=arr)
            print(f"[{idx:03d}/{len(all_clips):03d}] Preprocessed: {v_file.name} -> {tensor_name}")
        else:
            print(f"[{idx:03d}/{len(all_clips):03d}] Cached: {tensor_name}")

        rec = dict(clip)
        rec["tensor_path"] = str(tensor_path.resolve())
        processed_manifest["splits"][clip["split"]].append(rec)

    elapsed = time.time() - t0
    out_manifest = ROOT_DIR / "datasets/manifests/violence_preprocessed_manifest.json"
    with open(out_manifest, "w", encoding="utf-8") as f:
        json.dump(processed_manifest, f, indent=2)

    print("\n======================================================================")
    print(f"Preprocessing completed in {elapsed:.1f}s.")
    print(f"Preprocessed manifest saved to: {out_manifest}")
    print("======================================================================")


if __name__ == "__main__":
    preprocess_all()
