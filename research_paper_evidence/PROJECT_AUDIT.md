# VisionSense AI Crowd Anomaly Detection System
## Comprehensive Repository Audit & Technical Verification Report (Revised)

**Date of Audit**: October 2026  
**Auditor**: Automated System Inspection & Code Verification Agent  
**Repository**: `Shailesh7449/YOLO` (`d:\spidy\YOLO`)  
**Target Publication Venue**: IEEE Conference / Journal (Transactions on Intelligent Transportation Systems / IEEE Access / IEEE ICIP)

---

## 1. Executive Summary & Resolution of Evidence Contradictions

This document provides a grounded, rigorous audit of the **VisionSense AI Crowd Anomaly Detection System** repository. Every module, mathematical function, dependency manifest, and model artifact has been inspected directly from source code and compiled binaries.

### 1.1 Resolution of Documented Contradictions

| Topic / Claim | Initial / Marketing Claim | Empirical Code & Binary Finding | Resolution for IEEE Paper |
| :--- | :--- | :--- | :--- |
| **Model Identity & Provenance** | "Ultralytics YOLO26n" | The ONNX protobuf header contains producer `pytorch 2.9.1` with no Ultralytics author or version strings. Layer topology (`one2one_cv2`, `one2one_cv3`, `model.10` attention) matches the **YOLOv10-Nano** architecture (Wang et al., 2024). | **State provenance as an End-to-End NMS-Free YOLO architecture (topologically identical to YOLOv10-Nano)** exported to ONNX. Do not claim official Ultralytics authorship. |
| **Parameter Count** | "$\sim 2.6\text{M}$" or inferred from $9.43\text{ MB}$ file size | Direct protobuf parsing of all 231 initializer tensors yields **exactly 2,434,188 parameters** ($2.434\text{ M}$ parameters). | **Report the verified count: 2,434,188 parameters.** Do not estimate from file size. |
| **GFLOPs** | "$\sim 8.5\text{ GFLOPs}$" | GFLOPs cannot be verified from the static ONNX binary without dynamic profiling or original PyTorch model definitions. | **Label GFLOPs as "Unverified / Theoretical estimate ($\sim 8.2 - 8.5\text{ GFLOPs}$)"**, pending tool-based profiling. |
| **Throughput & Latency** | "$11 - 21\text{ FPS}$" and "$< 850\text{ ms}$ alert latency" | Active Python 3.13 environment lacks `cv2`, `torch`, `ultralytics`. Node lacks `node_modules`. PATH lacks `ffmpeg`. Zero test videos exist in repo. | **Label all throughput and latency numbers as theoretical estimates.** State clearly that empirical latency benchmarking is **Pending controlled experiment**. |
| **Motion Processing Methods** | "Dense Optical Flow" across all stacks | Source code uses **three distinct algorithms**: (1) Python uses OpenCV Farneback flow on $48 \times 27$ grid; (2) Frontend TS uses regularized Lucas-Kanade on $320 \times 180$; (3) Server TS uses luminance frame differencing. | **Document the three methods separately.** Do not claim they are identical or combine their performance metrics. |
| **Architecture Verification vs. Runtime Testing** | "Architecture verified" | Static code analysis confirms the data structures and mathematical routines are written, but end-to-end video decoding and neural inference have not run successfully. | **Strictly separate "Implemented in source code" from "Successfully validated through actual runtime test".** |

---

## 2. Four-State Verification Matrix of Repository Components

Every major component in the repository is categorized into one of four mutually exclusive verification states:
1. **Implemented in source code**: Complete code logic exists in repository files.
2. **Successfully validated through an actual runtime test**: Executed live in the environment and produced verified correct output.
3. **Implemented but runtime validation pending**: Code exists, but runtime execution failed or was blocked by missing dependencies, missing assets, or environment bugs.
4. **Planned or unsupported**: Documented or referenced as future extensions, but not active in execution paths.

### 2.1 Verification State Table

| Component | Repository-Relative Location | Verification State | Verification Evidence / Command Output / Root Cause |
| :--- | :--- | :--- | :--- |
| **YOLO Person Detection (ONNX)** | `public/models/yolo26n.onnx`, `visionsense/detector.py`, `src/server/videoAnalyzer.ts` | **Implemented but runtime validation pending** | Model binary verified ($9,890,454$ bytes, 2,434,188 params, input `pixel_values` $[1, 3, 640, 640]$, outputs `logits` $[1, 300, 80]$, `pred_boxes` $[1, 300, 4]$). Runtime inference failed: Python lacks `cv2`/`onnxruntime`; Node lacks `onnxruntime` module. |
| **Fallback Detection (COCO-SSD)** | `src/tracking/cocoSsdFallbackDetector.ts`, `src/tracking/yoloDetector.ts` | **Implemented but runtime validation pending** | Source code imports `@tensorflow-models/coco-ssd`. Test script `node test_yolo.js` failed with `ERR_MODULE_NOT_FOUND` because `node_modules` is not installed. |
| **ByteTrack Tracking (TypeScript)** | `src/tracking/bytetrack.ts` (`ByteTracker.update()`) | **Implemented but runtime validation pending** | Full 2-stage IoU matching and Kalman/linear velocity filtering implemented. Unit test suite or video pipeline execution pending `node_modules` installation. |
| **ByteTrack Tracking (Python)** | `visionsense/bytetrack.py` (`ByteTracker.update()`) | **Implemented but runtime validation pending** | Full 2-stage IoU greedy matching implemented. Execution pending detection inputs from OpenCV/ONNX. |
| **Dense Optical Flow (Python Farneback)** | `visionsense/optical_flow.py` (`DenseOpticalFlow.calculate_flow()`) | **Implemented but runtime validation pending** | Implemented using `cv2.calcOpticalFlowFarneback` on $48 \times 27$ grid. Execution failed because `cv2` is not installed in Python 3.13. |
| **Lucas-Kanade Flow (TS Browser)** | `src/cv/denseOpticalFlow.ts` (`DenseOpticalFlow.compute()`) | **Implemented but runtime validation pending** | Tikhonov-regularized Lucas-Kanade ($\lambda=4.0$, step=24) implemented on HTML5 canvas. Browser runtime testing pending application launch. |
| **Luminance Differencing (TS Server)** | `src/server/videoAnalyzer.ts` (lines 410–425) | **Implemented but runtime validation pending** | 8-pixel stride luminance differencing implemented. Execution blocked by missing FFmpeg in PATH. |
| **Temporal Movement Anomaly Engine** | `visionsense/temporal_analysis.py`, `src/analytics/temporalMovementAnalysis.ts` | **Implemented but runtime validation pending** | Moving window ($K=20-30$), surge jump, count delta, and persistence debouncer ($C_{\text{pers}} \ge 3$) fully coded in both stacks. |
| **Crowd Safety Decision Rule** | `visionsense/safety_engine.py`, `src/analytics/temporalMovementAnalysis.ts` | **Implemented but runtime validation pending** | Exact threshold rule ($N_t \le 20 \implies \text{NORMAL}$, $N_t > 20 \implies \text{WARNING}$) with debouncing and refractory cooldown coded. |
| **Storage Discovery (Python)** | `visionsense/storage_bridge.py` (`get_windows_drives()`) | **Successfully validated through an actual runtime test** | Command: `python main.py --mode drives`<br>Output: Successfully returned JSON for `C:` (455.5 GB), `D:` (476.9 GB), and `G:` (455.5 GB). Exit code: 0. |
| **Filesystem Directory Browser (Python)** | `visionsense/storage_bridge.py` (`browse_directory()`) | **Successfully validated through an actual runtime test** | Command: `python main.py --mode browse --path .`<br>Output: Enumerated folders (`docs`, `public`, `src`, `visionsense`) and identified `bus.jpg` ($134.2\text{ KB}$). Exit code: 0. |
| **Video Decoding & Pipeline Loop (Python)** | `visionsense/pipeline.py` (`analyze_video_file()`) | **Implemented but runtime validation pending** | Frame extraction loop coded to 100% EOF. Runtime test command `python main.py --mode analyze-video --video bus.jpg` raised `RuntimeError: OpenCV (cv2) is required`. |
| **Video Transcoding & Server (Node.js)** | `server.ts` (`/api/upload`, `probeVideoFile()`) | **Implemented but runtime validation pending** | Code spawns `ffmpeg` and `ffprobe`. Failed at runtime because `ffmpeg` is not in Windows system PATH. |
| **GAT / MMAction2 Action Recognition** | Referenced in `docs/ML_MODELS.md` | **Planned or unsupported** | Codebase contains zero model files, imports, or routines for Graph Attention Networks or MMAction2. Explicitly unsupported. |
| **Simulated Scene Generator** | `src/simulation/scenes.ts` | **Implemented in source code** | Programmatic test scenes (`cctv_normal`, `cctv_surge`, `synthetic`, `bus_demo`) implemented for UI demonstration without video. |

---

## 3. Discovered Code Bugs & Environmental Blockers

The following issues must be resolved before runtime validation can succeed:

1. **Hardcoded `/tmp` Paths on Windows**:
   - `src/server/videoAnalyzer.ts` (line 246): `path.join('/tmp', ...)`
   - `visionsense/node_yolo_bridge.cjs` (line 48): `path.join('/tmp', ...)`
   - *Impact*: On Windows systems without a root `C:\tmp` folder, attempts to write temporary frame dumps fail with `ENOENT`.
2. **Backend Fallthrough in `visionsense/detector.py`**:
   - In lines 47–56, `self.backend_type = "onnxruntime"` is set when Python's ONNX Runtime is installed.
   - However, in `detect()`, line 67 only checks `if self.backend_type.startswith("ultralytics")`. It lacks an `elif self.backend_type == "onnxruntime"` handler, causing execution to fall through to `node_yolo_bridge.cjs`.
3. **Missing System & Python Dependencies**:
   - `ffmpeg` / `ffprobe` are not recognized in PowerShell PATH.
   - Python 3.13 lacks `opencv-python-headless`, `torch`, `ultralytics`, and `onnxruntime`.
   - Node lacks local `node_modules`.
4. **Absence of Video Assets**:
   - No `.mp4` video files exist in the repository or `uploads/` folder.

---

## 4. Architectural Comparison: Python Engine vs. TypeScript Engine

The repository contains two independent implementations of the surveillance pipeline. Their algorithmic differences are detailed below:

| Dimension | Python Standalone Pipeline (`visionsense/`) | TypeScript Full-Stack Pipeline (`src/`) |
| :--- | :--- | :--- |
| **Primary Entry Point** | `main.py` (CLI / BaseHTTPRequestHandler on port 5050) | `server.ts` (Express + Vite on port 3000) |
| **Frame Ingestion** | OpenCV `cv2.VideoCapture` read loop | `ffmpeg` CLI frame extraction to binary PPM files |
| **Detection Backend** | `YOLOPersonDetector` (Ultralytics / ONNX Runtime / Node Bridge) | `ort.InferenceSession` (`onnxruntime-web` in Node and Browser) |
| **Tracking Algorithm** | `visionsense/bytetrack.py` (SORT/ByteTrack with greedy IoU) | `src/tracking/bytetrack.ts` (KalmanBoxTracker with IoU) |
| **Motion Estimation** | **Dense Farneback Optical Flow** on $48 \times 27$ grid with directional dispersion $\sigma_\theta$ | **Server**: Luminance frame difference (step=8).<br>**Browser**: Regularized Lucas-Kanade ($\lambda=4.0$) on 24px grid. |
| **Temporal Window Size** | $K = 20$ frames | $K = 30$ frames |
| **Alert Cooldown** | $5.0$ seconds refractory period | $3.0$ seconds refractory period |
| **Target Deployment** | Headless edge servers, embedded Linux, Python microservice | Security Operations Center (SOC) web console with video playback |
