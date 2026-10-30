# Model Card: VisionSense Surveillance Person Detector

## 1. Model Details
- **Model Name**: VisionSense YOLO Person Detector (Fine-Tuned YOLOv8n / Baseline YOLO26n)
- **Model Architecture**: Ultralytics YOLOv8n (Backbone: CSPDarknet with C2f modules; Head: Decoupled Detection Head, Anchor-Free)
- **Baseline Model**: `public/models/yolo26n.onnx` (YOLOv10-Nano End-to-End NMS-Free architecture, 2,434,188 parameters, 9.43 MB)
- **Fine-Tuned Checkpoint**: `training/checkpoints/best_person_detector.pt` (6.25 MB)
- **Exported ONNX Checkpoint**: `training/checkpoints/yolo_person_finetuned.onnx` (12.18 MB, opset 18, onnxslim optimized)
- **Target Category**: Strict single-class filtering for COCO Class 0 (`person`)
- **Input Resolution**: $640 \times 640 \times 3$ (Planar RGB, normalized $[0.0, 1.0]$)
- **Framework & Libraries**: PyTorch 2.6.0+cu124, Ultralytics 8.4.175, ONNX Runtime 1.31.0

---

## 2. Intended Use & Target Application
- **Primary Task**: Real-time person detection and localization in stationary CCTV video feeds.
- **Downstream Pipeline**: Outputs bounding boxes $[x_1, y_1, x_2, y_2]$ and confidence scores to ByteTrack multi-object tracking.
- **Target Environments**: Campus walkways, perimeter boundaries, corridors, public plaza CCTV cameras.
- **Out-of-Scope**: Face recognition, biometric identification, identity re-identification across cameras, autonomous kinetic intervention.

---

## 3. Training Data & Leak-Free Split Protocol
- **Dataset**: `datasets/detection/surveillance_person`
- **Annotation Format**: Standard YOLO bounding box format (`0 cx cy w h` in $[0, 1]$)
- **Data Leakage Prevention**:
  - Grouped strictly by source camera scene (`cam_01` through `cam_20`).
  - Cross-Split Camera Overlap: **0 scenes** (Verified with SHA-256 manifest `ab17209ab162...`).
  - Train: 60 images across 15 independent CCTV scenes (1,240 valid bounding boxes).
  - Validation: 20 images across 5 held-out CCTV scenes.
  - Scene variations: daylight, dusk, night IR illumination, high-angle corridor.

---

## 4. Empirical Evaluation Metrics (Measured)
Evaluated on held-out validation set and hardware (`NVIDIA GeForce GTX 1650 4GB`, `Intel Core i5-10200H`):

| Metric | Measured Value | Benchmark Description |
| :--- | :--- | :--- |
| **Precision** | **0.8343** (83.43%) | IoU $\ge 0.5$ on held-out CCTV validation scenes |
| **Recall** | **0.9082** (90.82%) | Detection completeness on occluded pedestrians |
| **mAP@0.5** | **0.9432** (94.32%) | Mean Average Precision at IoU threshold 0.50 |
| **mAP@0.5:0.95** | **0.7956** (79.56%) | Stricter localization precision threshold |
| **GPU Inference Latency** | **29.28 ms** | Native CUDA forward pass on GTX 1650 |
| **GPU Throughput** | **34.2 FPS** | Real-time surveillance throughput ($> 30\text{ FPS}$) |
| **CPU Baseline Latency** | **65.70 ms** | ONNX Runtime CPU forward pass |
| **CPU Baseline Throughput** | **15.2 FPS** | Standard multi-core CPU throughput |

---

## 5. Ethical Guidelines & Limitations
- **Occlusions**: Distant individuals ($< 15\text{ px}$ height) or severe crowd occlusions may exhibit lower recall.
- **Adverse Weather**: Heavy fog or glare requires sensor-level filtering or thermal integration.
- **Safety Rule Isolation**: Detector outputs feed the deterministic rule (`people_count <= 20: NORMAL, > 20: WARNING`) without hardcoding safety into network weights.
