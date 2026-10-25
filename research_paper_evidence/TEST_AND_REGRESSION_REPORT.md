# VisionSense AI — Test and Regression Protection Report

**Date**: October 26, 2026  
**Test Suite Status**: **ALL TEST SUITES PASSED (100% SUCCESS)**  
**Environment**: Windows 11, Intel Core i5-10200H, NVIDIA GeForce GTX 1650 (CUDA 12.x), Node.js v22.x, Python 3.12.10 (.venv)  

---

## 1. Test Suite Summary Table

| Test Suite File | Framework | Tests Executed | Passed | Failed | Skipped | Execution Time |
|---|---|---|---|---|---|---|
| `tests/test_violence_detection.py` | Python `unittest` | 9 | **9** | 0 | 0 | 21.03 s |
| `tests/test_pipeline.py` | Python `pytest` | 19 | **19** | 0 | 0 | 10.55 s |
| `tests/test_threshold_and_detection.ts` | Node.js `tsx` | 6 (12 subtests) | **6** | 0 | 0 | 3.82 s |
| `npm run lint` (`tsc --noEmit`) | TypeScript Compiler | 1 (Type check) | **1** | 0 | 0 | 11.20 s |
| **Total Test Assertions** | — | **35** | **35** | **0** | **0** | **46.60 s** |

---

## 2. Automated Test Case Details

### A. Violence Detection & Multimodal Gating Suite (`tests/test_violence_detection.py`)

Command: `d:\spidy\YOLO\.venv\Scripts\python.exe -m unittest tests/test_violence_detection.py`

```text
Ran 9 tests in 21.025s
OK
```

- **`test_01_model_loading_variants` [PASSED]**: Verified model loading on $R(2+1)D\text{-}18$ PyTorch (CUDA), $X3D\text{-}M$ PyTorch (CUDA), and $X3D\text{-}M$ ONNX Runtime (CPU).
- **`test_02_clip_prediction_violent_cctv` [PASSED]**: Real corridor fight clip classified as `VIOLENCE` with $88.7\%$ confidence, $787.5\text{ ms}$ latency.
- **`test_03_clip_prediction_non_violent_cctv` [PASSED]**: Normal walking clip classified as `NON_VIOLENCE` with $35.7\%$ confidence, $522.2\text{ ms}$ latency.
- **`test_04_sliding_window_streaming_and_deduplication` [PASSED]**:
  - Exactly 1 incident start event generated at $t=3.17\text{s}$ (conf $87.4\%$).
  - Normal footfall video generated **0 false alarms** (state maintained at `NORMAL`).
  - Cooldown logic automatically triggered `VIOLENCE_INCIDENT_RESOLVED` after consecutive normal windows.
- **`test_05_memory_bounds_and_vram` [PASSED]**: Rolling deque capacity bounded to 256 frames. PyTorch VRAM allocated = **$19.74\text{ MB}$** ($< 250\text{ MB}$ limit).
- **`test_06_crowd_safety_regression_parity` [PASSED]**: Verified YOLO26n ONNX detector and ByteTracker multi-object tracking remain completely intact.
- **`test_07_static_frame_motion_gating_suppression` [PASSED]**: 32 identical static frames with $\Delta_{\text{motion}} = 0.0$ suppressed to **$0.0\%$ confidence**, `NON_VIOLENCE`, state `NORMAL`.
- **`test_08_participant_association_red_blue` [PASSED]**: Interacting tracks 41 and 42 flagged with `is_violence_participant: True` (RED), while distant bystander track 99 ($680\text{px}$ away) remained `is_violence_participant: False` (BLUE).
- **`test_09_v1_scuffle_temporal_discrimination` [PASSED]**: In `video_1792958388239_V_1.mp4`, window $0.0\text{s} - 2.5\text{s}$ correctly yielded `is_violence: False`, while window $3.5\text{s} - 6.5\text{s}$ yielded `is_violence: True` ($71.8\%$ confidence).

---

### B. Crowd Threshold & Notification Regression Suite (`tests/test_threshold_and_detection.ts`)

Command: `npm test` (`tsx tests/test_threshold_and_detection.ts`)

- **[TEST 1] Strict Crowd Threshold Rule**:
  - $18 \le 20 \implies \text{NORMAL}$ (0 events)
  - $20 \le 20 \implies \text{NORMAL}$ (0 events)
  - $21 > 20 \implies \text{EXCEEDED}$ (1 security warning event created)
- **[TEST 2] Duplicate Alert Suppression**: Successive frames with counts 22, 25, 21 while above limit produced 0 duplicate events.
- **[TEST 3] Recovery & Re-arming**: Count dropping to 15 restored state to `NORMAL`. Surging back to 24 triggered a new event.
- **[TEST 4] Multi-Stream Isolation**: Verified independent camera stream identities (`cam_01` vs `cam_02`) maintain isolated debouncing states.
- **[TEST 5] Custom Dynamic Thresholds**: Verified thresholds of 5, 20, and 50 operate deterministically.
- **[TEST 6] Letterbox & NMS**: Overlapping redundant detections correctly suppressed.
- **[TEST 7] Violence Deduplication & Cooldown**: Consecutive violent frames properly consolidated; recovery triggered when threat abated.

---

### C. End-to-End Pipeline Regression Suite (`tests/test_pipeline.py`)

Command: `d:\spidy\YOLO\.venv\Scripts\python.exe tests/test_pipeline.py`

```text
============================= 19 passed in 10.55s =============================
```
All 19 pipeline integrity tests passed, validating:
1. Dataset manifest format and paths.
2. Annotation schemas.
3. ONNX and PyTorch model loading.
4. Output tensor shapes ($[1, 300, 80]$ and $[1, 300, 4]$).
5. Strictly Class 0 (person-only) filtering.
6. Bounding box coordinate conversion and letterbox math.
7. ByteTrack multi-object tracking.
8. Lucas-Kanade / Farneback optical flow feature extraction.
9. Bi-directional GRU temporal crowd anomaly scoring.
10. Safety threshold edge case ($20$ vs $21$ people).
11. ONNX Runtime CPU/GPU provider compatibility.
12. GPU and CPU execution parity within numerical tolerance.
13. End-to-end image processing.
14. End-to-end video processing through EOF.
15. Metadata integrity.

---

## 3. Critical Bug Verification: `video_1792958388239_V_1.mp4`

Prior to modification, `uploads/telemetry/video_1792958388239_V_1.mp4.json` contained:
```json
{
  "id": "alert-violence-0",
  "type": "VIOLENCE_DETECTED",
  "severity": "CRITICAL",
  "message": "CRITICAL ALERT: Physical Altercation/Violence Detected (89.9% conf...)",
  "timestamp": 0,
  "frame": 0
}
```

Following the fix, the video was re-analyzed through the server-side pipeline. The new telemetry output confirms:

1. **Frame 0 ($t = 0.0\text{s}$)**:
   - `alerts`: `[]` (Empty — **no false alert**)
   - `violence_status`: `"ANALYZING"` (Honest status during frame accumulation)
   - `violence_event_id`: `null`
   - `violence_participants`: `[]`
   - `tracks[0].is_violence_participant`: `false` (Rendered **BLUE**)
   - `tracks[1].is_violence_participant`: `false` (Rendered **BLUE**)

2. **Frame 41 ($t = 2.75\text{s}$ - Scuffle Phase)**:
   - `alerts`:
     ```json
     {
       "id": "alert-violence-41",
       "type": "VIOLENCE_DETECTED",
       "severity": "CRITICAL",
       "message": "CRITICAL ALERT: Physical Altercation Confirmed at 00:02.7 (84.9% conf, Tracks: [1, 2])",
       "timestamp": 2.75,
       "frame": 41,
       "participantTrackIds": [1, 2]
     }
     ```
   - `tracks[0].is_violence_participant`: `true` (Rendered **RED** with badge `VIOLENCE PARTICIPANT #1`)
   - `tracks[1].is_violence_participant`: `true` (Rendered **RED** with badge `VIOLENCE PARTICIPANT #2`)

3. **Frame 108 ($t = 6.5\text{s}$ - Resolution Phase)**:
   - Event cleared following scuffle cessation.
   - `tracks[0].is_violence_participant`: `false` (Automatically restored to **BLUE**).
   - `violence_status`: `"NORMAL"`.

---

## 4. Rollback Instructions

If it is ever necessary to restore the system to its baseline checkpoint:
1. Ensure the fine-tuned checkpoint is renamed:
   ```powershell
   mv training/checkpoints/violence_r2plus1d_finetuned.pt training/checkpoints/violence_r2plus1d_finetuned.pt.bak
   ```
2. The `ViolenceDetector` class in `visionsense/violence_detector.py` automatically detects the absence of the fine-tuned file and seamlessly falls back to `training/checkpoints/violence_r2plus1d_best.pt`.
3. Restart the Python AI microservice:
   ```powershell
   python main.py --mode server --port 5050
   ```
