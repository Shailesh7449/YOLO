import json
import cv2
import os
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT_DIR))

from visionsense.violence_detector import ViolenceDetector

def audit_storage_demo():
    manifest_path = ROOT_DIR / "public/datasets/manifest.json"
    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    d = ViolenceDetector()
    print("=" * 70)
    print(f"Active Model: {d.model_name}")
    print(f"Backend:      {d.backend_type}")
    print(f"Threshold:    {d.confidence_threshold}")
    print(f"Frames:       {d.num_frames}")
    print("=" * 70)

    results = []
    for v in manifest["videos"]:
        rel_path = v.get("relative_path") or v.get("local_path", "")
        path = str(ROOT_DIR / rel_path) if not os.path.isabs(rel_path) else rel_path
        gt = "VIOLENCE" if v.get("expected_label") == "VIOLENCE" else "NON_VIOLENCE"
        vid = v["id"]
        fname = v.get("filename", Path(path).name)

        if not os.path.exists(path):
            print(f"[{vid}] Missing file: {path}")
            continue

        cap = cv2.VideoCapture(path)
        frames = []
        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        while True:
            ret, frame = cap.read()
            if not ret or frame is None:
                break
            frames.append(frame)
        cap.release()

        timestamps = [i / fps for i in range(len(frames))]
        pred = d.predict_clip(frames, timestamps, source_id=vid)
        correct = (pred.label == gt)
        status = "PASS" if correct else "FAIL"

        results.append({
            "id": vid,
            "filename": fname,
            "gt": gt,
            "pred": pred.label,
            "conf": round(pred.confidence, 4),
            "mot": round(pred.motion_diff, 2),
            "correct": correct,
            "status": status
        })
        print(f"[{vid}] GT={gt:<12} Pred={pred.label:<12} Conf={pred.confidence:.3f} Mot={pred.motion_diff:.2f} -> {status}")

    total = len(results)
    correct_count = sum(1 for r in results if r["correct"])
    acc = correct_count / total if total > 0 else 0.0

    v_tp = sum(1 for r in results if r["gt"] == "VIOLENCE" and r["pred"] == "VIOLENCE")
    v_fn = sum(1 for r in results if r["gt"] == "VIOLENCE" and r["pred"] == "NON_VIOLENCE")
    nv_tn = sum(1 for r in results if r["gt"] == "NON_VIOLENCE" and r["pred"] == "NON_VIOLENCE")
    nv_fp = sum(1 for r in results if r["gt"] == "NON_VIOLENCE" and r["pred"] == "VIOLENCE")

    print("=" * 70)
    print(f"Storage Demonstration Library Audit Results (Total: {total} clips):")
    print(f"Overall Accuracy:  {acc*100:.1f}% ({correct_count}/{total})")
    print(f"Violence Detection: TP={v_tp}/15, FN={v_fn}/15 (Recall: {v_tp/15*100:.1f}%)")
    print(f"Normal Detection:   TN={nv_tn}/15, FP={nv_fp}/15 (Specificity: {nv_tn/15*100:.1f}%)")
    print("=" * 70)

    # Save details
    out_path = ROOT_DIR / "training/evaluation/storage_demo_audit.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({
            "accuracy": round(acc, 4),
            "violence_tp": v_tp,
            "violence_fn": v_fn,
            "normal_tn": nv_tn,
            "normal_fp": nv_fp,
            "results": results
        }, f, indent=2)
    print(f"Detailed audit saved to {out_path}")

if __name__ == "__main__":
    audit_storage_demo()
