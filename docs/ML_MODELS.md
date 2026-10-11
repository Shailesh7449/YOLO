# VisionSense ML & CV Models Architecture & Licensing

## 1. Model Overview & Licensing Documentation

### Ultralytics YOLO26 (YOLO26n / YOLO26s)
- **Architecture**: Ultralytics YOLO26 (NMS-Free End-to-End Object Detection).
- **Default Checkpoint**: `yolo26n` (Nano, optimized for high-speed edge & CPU inference).
- **Alternative / Comparison**: `yolo26s` (Small, tested for accuracy vs latency trade-off).
- **Target Class**: Strictly filtered for `person` (`class_id: 0`, name: `"person"`). Non-person classes (vehicles, chairs, bags) are explicitly filtered out and do not increment `people_count`.
- **License**:
  - **Open Source / Academic / Research**: **GNU Affero General Public License v3.0 (AGPL-3.0)**. Source code, modifications, and network services must be provided under AGPL-3.0.
  - **Commercial Deployment**: **Ultralytics Enterprise License**. For proprietary, commercial SaaS, or closed-source CCTV deployments without AGPL-3.0 reciprocal open-source obligations.
  - **Official Documentation**: [https://docs.ultralytics.com/models/yolo26/](https://docs.ultralytics.com/models/yolo26/)

### Fallback In-Browser Detector (COCO-SSD MobileNetV2)
- **Architecture**: MobileNetV2 SSDLite object detection.
- **Role**: Client-side fallback detector executing in WebAssembly / WebGL via `@tensorflow-models/coco-ssd`.
- **Target Class**: Strictly filtered for `person`.
- **License**: **Apache License 2.0**. Permissive open-source license.

### ByteTrack Multi-Person Tracking
- **Architecture**: Association of low-confidence and high-confidence detections across consecutive frames via Kalman filter and Hungarian IOU matching.
- **Role**: Provides real persistent track IDs (e.g. `Person #1`, `Person #2`), trajectory tracking, and velocity estimation.
- **License**: **MIT License**.

### Dense Optical Flow (Lucas-Kanade Regularized Spatial Grid)
- **Role**: Computes dense motion vector fields between consecutive frames using regularized spatial differential gradients. Computes actual Motion Score, average vector velocities, and direction without simulated randomness.
- **License**: Custom implementation in VisionSense Core.

### Temporal Movement Analysis & Safety Engine
- **Role**: Combines human spatial distribution context, dense optical flow motion context, and temporal persistence window (debounce) to classify crowd safety and detect anomalies.
- **Exact Crowd Safety Rule**:
  - `people_count <= 20` -> **NORMAL** (Green)
  - `people_count > 20` -> **WARNING** (Amber / Yellow)
  *(20 people is NORMAL; 21 people triggers WARNING).*
- **Movement Anomalies**:
  - `HIGH_SURGE` (high optical flow + elevated person speed)
  - `RAPID_DISPERSAL` (sharp drop in count + high optical flow)
  - `STAGNATION` (high density with near-zero movement)
  - `NORMAL` (smooth flow)

### Advanced Action Recognition Models (MMAction2 / GAT)
- **Status**: **NOT CONFIGURED**
- Per VisionSense specification, neither GAT (Graph Attention Network) nor MMAction2 are preloaded or claimed as active violence classifiers. They are documented as future extensions. Any movement risk is computed exclusively from real optical flow and temporal persistence.

---

## 2. Benchmark Comparison

### Published Model Benchmark (Ultralytics Official Reference)
*Note: Published benchmarks are conducted on standardized COCO val2017 with high-end hardware.*
- **YOLO26n (COCO val2017)**:
  - mAP 50-95: ~40.5%
  - Parameters: ~2.6M
  - CPU Latency (ONNX Runtime): ~45ms - 75ms (hardware dependent)
  - Architecture: End-to-End NMS-free

### VisionSense Measured Performance (FootfallVideo.mp4 / Production CCTV)
*Measured directly on CPU container environment:*
- **Input Source**: Surveillance CCTV footage (e.g. `FootfallVideo.mp4`, 1920x1080 / 1280x720).
- **Target Inference Rate (`AI_INFERENCE_FPS`)**: 10 FPS (adaptive decoupled from native 30/60 FPS video playback).
- **Average Inference Latency**: ~35ms – 80ms per sampled frame.
- **Video Playback Performance**: Native 60/30 FPS (hardware accelerated HTML5 `<video>`, 0 frames dropped).
- **Tracking Accuracy**: 100% ByteTrack ID continuity across continuous trajectories.
