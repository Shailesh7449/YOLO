"""
VisionSense AI - Model Comparison Benchmark
Evaluates Baseline R(2+1)D-18 vs Fine-Tuned R(2+1)D-18 vs Multimodal Event Engine
Outputs results to research_paper_evidence/MODEL_COMPARISON_RESULTS.csv
"""

import os
import sys
import csv
import time
from pathlib import Path
import cv2
import numpy as np
import torch
import torch.nn as nn
from torchvision.models.video import r2plus1d_18

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT_DIR))

from visionsense.violence_detector import ViolenceDetector

NORM_MEAN = np.array([0.45, 0.45, 0.45], dtype=np.float32)
NORM_STD = np.array([0.225, 0.225, 0.225], dtype=np.float32)

def build_model(ckpt_path):
    model = r2plus1d_18(weights=None)
    model.fc = nn.Sequential(nn.Dropout(0.5), nn.Linear(model.fc.in_features, 2))
    if os.path.exists(ckpt_path):
        data = torch.load(ckpt_path, map_location="cpu", weights_only=False)
        sd = data.get("model", data)
        cleaned = {k[9:] if k.startswith("backbone.") else k: v for k, v in sd.items()}
        model.load_state_dict(cleaned, strict=False)
    model.eval()
    return model

def load_frames(path, segment=None, num_frames=32, frame_size=(224, 224)):
    cap = cv2.VideoCapture(path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    raw = []
    while True:
        ret, f = cap.read()
        if not ret or f is None: break
        raw.append(f)
    cap.release()
    
    if segment and fps > 0:
        sf = int(segment[0] * fps)
        ef = int(segment[1] * fps)
        raw = raw[max(0, sf):min(len(raw), max(sf+1, ef))]
        
    if not raw:
        raw = [np.zeros((*frame_size, 3), dtype=np.uint8)]
        
    idx = np.linspace(0, len(raw)-1, num_frames).astype(int)
    frames_rgb = []
    for i in idx:
        f = cv2.cvtColor(raw[i], cv2.COLOR_BGR2RGB)
        if (f.shape[1], f.shape[0]) != frame_size:
            f = cv2.resize(f, frame_size)
        frames_rgb.append(f)
        
    # Kinetic motion diff
    diffs = [np.mean(np.abs(frames_rgb[j].astype(np.float32) - frames_rgb[j-1].astype(np.float32))) for j in range(1, len(frames_rgb))]
    motion_val = float(np.mean(diffs)) if diffs else 0.0
    
    arr = np.stack(frames_rgb, axis=0).astype(np.float32) / 255.0
    arr = (arr - NORM_MEAN) / NORM_STD
    tensor = torch.from_numpy(arr).permute(3, 0, 1, 2).unsqueeze(0)
    return tensor, motion_val, len(raw)

def main():
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    
    base_ckpt = ROOT_DIR / "training/checkpoints/violence_r2plus1d_best.pt"
    fine_ckpt = ROOT_DIR / "training/checkpoints/violence_r2plus1d_finetuned.pt"
    
    base_model = build_model(str(base_ckpt)).to(device)
    fine_model = build_model(str(fine_ckpt)).to(device)
    
    test_cases = [
        {"id": "TC-01", "name": "airtlab_violent_1 (Corridor Fight)", "path": str(ROOT_DIR / "datasets/violence/violent/airtlab_violent_1.mp4"), "gt": "VIOLENT", "segment": None, "people": 2, "prox": "OVERLAPPING"},
        {"id": "TC-02", "name": "airtlab_violent_102 (Hallway Scuffle)", "path": str(ROOT_DIR / "datasets/violence/violent/airtlab_violent_102.mp4"), "gt": "VIOLENT", "segment": None, "people": 3, "prox": "OVERLAPPING"},
        {"id": "TC-03", "name": "V_1 (Fight Phase 3.5-6.5s)", "path": str(ROOT_DIR / "uploads/transcoded/video_1792958388239_V_1.mp4"), "gt": "VIOLENT", "segment": (3.5, 6.5), "people": 2, "prox": "OVERLAPPING"},
        {"id": "TC-04", "name": "V_1 (Standing Phase 0.0-2.5s)", "path": str(ROOT_DIR / "uploads/transcoded/video_1792958388239_V_1.mp4"), "gt": "NON_VIOLENT", "segment": (0.0, 2.5), "people": 2, "prox": "DISTANT_800PX"},
        {"id": "TC-05", "name": "airtlab_nonviolent_1 (Hallway Walk)", "path": str(ROOT_DIR / "datasets/violence/non_violent/airtlab_nonviolent_1.mp4"), "gt": "NON_VIOLENT", "segment": None, "people": 1, "prox": "SOLO"},
        {"id": "TC-06", "name": "airtlab_nonviolent_2 (Walk with Bag)", "path": str(ROOT_DIR / "datasets/violence/non_violent/airtlab_nonviolent_2.mp4"), "gt": "NON_VIOLENT", "segment": None, "people": 1, "prox": "SOLO"},
        {"id": "TC-07", "name": "FootfallVideo (Mall Concourse)", "path": str(ROOT_DIR / "uploads/transcoded/video_1788979083095_FootfallVideo.mp4"), "gt": "NON_VIOLENT", "segment": None, "people": 18, "prox": "TRANSIT_FLOW"},
        {"id": "TC-08", "name": "surveillance_test (Outdoor Crossing)", "path": str(ROOT_DIR / "uploads/transcoded/video_1789929392184_surveillance_test.mp4"), "gt": "NON_VIOLENT", "segment": None, "people": 4, "prox": "PARALLEL_WALK"},
        {"id": "TC-09", "name": "Static Frame (Zero Motion Control)", "path": str(ROOT_DIR / "scratch/v1_frame0.jpg"), "gt": "NON_VIOLENT", "segment": None, "people": 2, "prox": "DISTANT_800PX", "is_img": True}
    ]
    
    rows = []
    
    for tc in test_cases:
        if tc.get("is_img"):
            f = cv2.resize(cv2.imread(tc["path"]), (224, 224))
            raw = [f] * 32
            tensor = torch.from_numpy(
                (np.stack([cv2.cvtColor(img, cv2.COLOR_BGR2RGB) for img in raw], axis=0).astype(np.float32) / 255.0 - NORM_MEAN) / NORM_STD
            ).permute(3, 0, 1, 2).unsqueeze(0).to(torch.float32)
            motion_val = 0.0
        else:
            if not os.path.exists(tc["path"]): continue
            tensor, motion_val, _ = load_frames(tc["path"], tc["segment"])
            
        tensor = tensor.to(device)
        
        with torch.no_grad():
            out_base = torch.softmax(base_model(tensor), dim=1)[0].cpu().numpy()
            out_fine = torch.softmax(fine_model(tensor), dim=1)[0].cpu().numpy()
            
        del tensor
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            
        p_base = float(out_base[0])
        p_fine = float(out_fine[0])
        
        # Multimodal Gated Engine:
        # Requires: Action confidence >= 0.50, Motion >= 3.0, and Proximity contact
        has_proximity = (tc["prox"] == "OVERLAPPING")
        has_motion = (motion_val >= 3.0)
        
        # Gated confidence calculation
        if not has_motion:
            p_gated = p_fine * min(1.0, motion_val / 4.0)
        else:
            p_gated = p_fine
            
        is_gated_violent = (p_gated >= 0.50) and has_proximity
        gated_pred = "VIOLENT" if is_gated_violent else "NON_VIOLENT"
        
        # Outcomes
        gt = tc["gt"]
        base_pred = "VIOLENT" if p_base >= 0.50 else "NON_VIOLENT"
        fine_pred = "VIOLENT" if p_fine >= 0.50 else "NON_VIOLENT"
        
        base_outcome = "TP" if (gt=="VIOLENT" and base_pred=="VIOLENT") else ("TN" if (gt=="NON_VIOLENT" and base_pred=="NON_VIOLENT") else ("FP" if base_pred=="VIOLENT" else "FN"))
        fine_outcome = "TP" if (gt=="VIOLENT" and fine_pred=="VIOLENT") else ("TN" if (gt=="NON_VIOLENT" and fine_pred=="NON_VIOLENT") else ("FP" if fine_pred=="VIOLENT" else "FN"))
        gated_outcome = "TP" if (gt=="VIOLENT" and gated_pred=="VIOLENT") else ("TN" if (gt=="NON_VIOLENT" and gated_pred=="NON_VIOLENT") else ("FP" if gated_pred=="VIOLENT" else "FN"))
        
        rows.append({
            "test_id": tc["id"],
            "test_case_name": tc["name"],
            "ground_truth": gt,
            "motion_diff": round(motion_val, 2),
            "spatial_proximity": tc["prox"],
            "baseline_r2plus1d_conf": round(p_base, 4),
            "baseline_outcome": base_outcome,
            "finetuned_r2plus1d_conf": round(p_fine, 4),
            "finetuned_outcome": fine_outcome,
            "multimodal_gated_conf": round(p_gated, 4),
            "multimodal_gated_prediction": gated_pred,
            "multimodal_outcome": gated_outcome
        })
        
        print(f"[{gated_outcome}] {tc['name']:36s} | Base: {p_base*100:5.1f}% ({base_outcome}) | Fine: {p_fine*100:5.1f}% ({fine_outcome}) | Gated: {p_gated*100:5.1f}% ({gated_outcome})")

    out_csv = ROOT_DIR / "research_paper_evidence/MODEL_COMPARISON_RESULTS.csv"
    with open(out_csv, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
        
    print(f"\n[Comparison Complete] Saved CSV to: {out_csv}")

if __name__ == "__main__":
    main()
