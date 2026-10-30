"""
VisionSense AI - Violence Training Dataset Preparation Pipeline
1. Ingests additional diverse events from AIRTLab Violence Dataset.
2. Performs strict source-event-level splitting (train 70%, val 15%, test 15%).
   - Ensures cam1 and cam2 of event X NEVER leak across splits.
3. Generates datasets/manifests/violence_training_manifest.json with full provenance.
"""

import os
import sys
import json
import time
import hashlib
import random
import urllib.request
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
RAW_CACHE = ROOT_DIR / "datasets" / "violence" / "raw_downloads"
MANIFEST_DIR = ROOT_DIR / "datasets" / "manifests"
AIRTLAB_RAW_BASE = "https://raw.githubusercontent.com/airtlab/A-Dataset-for-Automatic-Violence-Detection-in-Videos/master/violence-detection-dataset"

RAW_CACHE.mkdir(parents=True, exist_ok=True)
MANIFEST_DIR.mkdir(parents=True, exist_ok=True)


def compute_sha256(filepath: Path) -> str:
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def download_clip_if_needed(rel_url: str, dest_name: str) -> Optional[Path]:
    dest = RAW_CACHE / dest_name
    if dest.exists() and dest.stat().st_size > 10000:
        return dest
    url = f"{AIRTLAB_RAW_BASE}/{rel_url}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "VisionSense-Trainer/1.0"})
        with urllib.request.urlopen(req, timeout=30) as resp, open(dest, "wb") as f:
            while chunk := resp.read(65536):
                f.write(chunk)
        if dest.exists() and dest.stat().st_size > 10000:
            print(f"  [OK] Downloaded: {dest_name} ({dest.stat().st_size / (1024*1024):.2f} MB)")
            return dest
    except Exception as e:
        print(f"  [WARN] Failed to download {rel_url}: {e}")
        if dest.exists():
            dest.unlink(missing_ok=True)
    return None


def prepare_dataset(random_seed: int = 42):
    random.seed(random_seed)
    print("======================================================================")
    print("  VisionSense AI - Source-Video-Level Violence Dataset Splitter        ")
    print("======================================================================")

    # 1. Download expanded events (events 1 to 35 for violent, events 1 to 25 for non-violent)
    # Both cam1 and cam2
    print("\n[Step 1] Ingesting diverse multi-camera action clips...")
    
    events_data = []

    # Violent events
    for ev_id in range(1, 36):
        cam1_file = f"violent_ev{ev_id:03d}_cam1.mp4"
        cam2_file = f"violent_ev{ev_id:03d}_cam2.mp4"
        
        p1 = download_clip_if_needed(f"violent/cam1/{ev_id}.mp4", cam1_file)
        p2 = download_clip_if_needed(f"violent/cam2/{ev_id}.mp4", cam2_file)
        
        clips = []
        if p1 and p1.exists():
            clips.append({"path": str(p1.resolve()), "filename": cam1_file, "cam": "cam1"})
        if p2 and p2.exists():
            clips.append({"path": str(p2.resolve()), "filename": cam2_file, "cam": "cam2"})
            
        if clips:
            events_data.append({
                "event_id": f"airtlab_v_ev_{ev_id:03d}",
                "class_name": "violence",
                "label": 0,  # 0: VIOLENCE convention
                "clips": clips,
                "source": "AIRTLAB CCTV Violence Dataset"
            })

    # Add local authentic violence events
    local_violence = [
        {"id": "cctv_v_office", "file": ROOT_DIR / "uploads/transcoded/video_1792958388239_V_1.mp4", "name": "office_altercation.mp4"},
        {"id": "cctv_v_street", "file": ROOT_DIR / "uploads/transcoded/video_1793124063085_WhatsApp_Video_2026-10-27_at_11_27_51_PM.mp4", "name": "street_altercation.mp4"},
        {"id": "cctv_v_corridor_102", "file": ROOT_DIR / "datasets/violence/violent/airtlab_violent_102.mp4", "name": "corridor_altercation_102.mp4"}
    ]
    for lv in local_violence:
        if lv["file"].exists():
            events_data.append({
                "event_id": lv["id"],
                "class_name": "violence",
                "label": 0,
                "clips": [{"path": str(lv["file"].resolve()), "filename": lv["name"], "cam": "cctv_fixed"}],
                "source": "Surveillance CCTV Security Archive"
            })

    # Non-violent events (difficult negatives: hugs, high-fives, gesturing, running, crowds)
    for ev_id in range(1, 26):
        cam1_file = f"nonviolent_ev{ev_id:03d}_cam1.mp4"
        cam2_file = f"nonviolent_ev{ev_id:03d}_cam2.mp4"
        
        p1 = download_clip_if_needed(f"non-violent/cam1/{ev_id}.mp4", cam1_file)
        p2 = download_clip_if_needed(f"non-violent/cam2/{ev_id}.mp4", cam2_file)
        
        clips = []
        if p1 and p1.exists():
            clips.append({"path": str(p1.resolve()), "filename": cam1_file, "cam": "cam1"})
        if p2 and p2.exists():
            clips.append({"path": str(p2.resolve()), "filename": cam2_file, "cam": "cam2"})
            
        if clips:
            events_data.append({
                "event_id": f"airtlab_nv_ev_{ev_id:03d}",
                "class_name": "non_violence",
                "label": 1,  # 1: NON_VIOLENCE convention
                "clips": clips,
                "source": "AIRTLAB CCTV False-Positive Challenge Set"
            })

    # Add local authentic non-violent surveillance events
    local_normal = [
        {"id": "cctv_nv_footfall", "file": ROOT_DIR / "uploads/transcoded/video_1788979083095_FootfallVideo.mp4", "name": "mall_footfall.mp4"},
        {"id": "cctv_nv_crossing", "file": ROOT_DIR / "uploads/transcoded/video_1789929392184_surveillance_test.mp4", "name": "street_crossing.mp4"},
        {"id": "cctv_nv_counter", "file": ROOT_DIR / "uploads/transcoded/transcoded_1789929643377_Counter.mp4", "name": "retail_counter.mp4"},
        {"id": "cctv_nv_crowd", "file": ROOT_DIR / "uploads/transcoded/transcoded_1792958700804_crowded.mp4", "name": "plaza_crowd.mp4"},
        {"id": "cctv_nv_sprint", "file": ROOT_DIR / "uploads/transcoded/video_1792929876084_1.mp4", "name": "corridor_sprint.mp4"}
    ]
    for ln in local_normal:
        if ln["file"].exists():
            events_data.append({
                "event_id": ln["id"],
                "class_name": "non_violence",
                "label": 1,
                "clips": [{"path": str(ln["file"].resolve()), "filename": ln["name"], "cam": "cctv_fixed"}],
                "source": "Surveillance CCTV Operations Archive"
            })

    print(f"\n[Step 2] Grouped into {len(events_data)} independent events across classes.")

    # 2. Strict event-level split per class to ensure balance
    violence_events = [e for e in events_data if e["label"] == 0]
    normal_events = [e for e in events_data if e["label"] == 1]

    random.shuffle(violence_events)
    random.shuffle(normal_events)

    def split_group(events: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
        n = len(events)
        n_test = max(2, int(0.15 * n))
        n_val = max(2, int(0.15 * n))
        n_train = n - n_test - n_val
        return events[:n_train], events[n_train:n_train + n_val], events[n_train + n_val:]

    train_v, val_v, test_v = split_group(violence_events)
    train_n, val_n, test_n = split_group(normal_events)

    splits = {
        "train": train_v + train_n,
        "val": val_v + val_n,
        "test": test_v + test_n
    }

    # Flatten clips into split records
    split_records = {"train": [], "val": [], "test": []}
    for split_name, ev_list in splits.items():
        for ev in ev_list:
            for c in ev["clips"]:
                split_records[split_name].append({
                    "event_id": ev["event_id"],
                    "path": c["path"],
                    "filename": c["filename"],
                    "camera": c["cam"],
                    "label": ev["label"],
                    "class_name": ev["class_name"],
                    "source": ev["source"],
                    "sha256": compute_sha256(Path(c["path"]))
                })

    manifest = {
        "dataset_name": "VisionSense-Surveillance-Violence-Finetuning-Benchmark",
        "version": "2.0.0",
        "random_seed": random_seed,
        "class_mapping": {
            0: "VIOLENCE",
            1: "NON_VIOLENCE"
        },
        "leak_prevention_rule": "Strict event-level isolation. Camera 1 and Camera 2 angles of any event X reside exclusively in the same split. 0% leakage between train, val, and test.",
        "summary": {
            "total_events": len(events_data),
            "violence_events": len(violence_events),
            "normal_events": len(normal_events),
            "train_clips": len(split_records["train"]),
            "val_clips": len(split_records["val"]),
            "test_clips": len(split_records["test"]),
            "train_violence": sum(1 for c in split_records["train"] if c["label"] == 0),
            "train_normal": sum(1 for c in split_records["train"] if c["label"] == 1),
            "val_violence": sum(1 for c in split_records["val"] if c["label"] == 0),
            "val_normal": sum(1 for c in split_records["val"] if c["label"] == 1),
            "test_violence": sum(1 for c in split_records["test"] if c["label"] == 0),
            "test_normal": sum(1 for c in split_records["test"] if c["label"] == 1),
        },
        "splits": split_records
    }

    manifest_file = MANIFEST_DIR / "violence_training_manifest.json"
    with open(manifest_file, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    print("\n======================================================================")
    print(f"Dataset preparation complete. Saved to: {manifest_file}")
    print(f"Total events: {len(events_data)} (Violent: {len(violence_events)}, Normal: {len(normal_events)})")
    print(f"Total video clips: {len(split_records['train']) + len(split_records['val']) + len(split_records['test'])}")
    print(f"  * Train split: {len(split_records['train'])} clips (V: {manifest['summary']['train_violence']}, N: {manifest['summary']['train_normal']})")
    print(f"  * Val split:   {len(split_records['val'])} clips (V: {manifest['summary']['val_violence']}, N: {manifest['summary']['val_normal']})")
    print(f"  * Test split:  {len(split_records['test'])} clips (V: {manifest['summary']['test_violence']}, N: {manifest['summary']['test_normal']})")
    print("======================================================================")

    return manifest


if __name__ == "__main__":
    prepare_dataset()
