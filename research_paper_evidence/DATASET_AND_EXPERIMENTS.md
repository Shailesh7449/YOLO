# VisionSense AI Crowd Anomaly Detection System
## Dataset Specifications, Empirical Audit & Experimental Protocol (Revised)

**Target Publication**: IEEE Conference / Journal  
**Domain**: Computer Vision, Video Surveillance, Anomaly Detection Benchmarks  
**Status**: Physical Asset Audit Completed — Public Benchmark Specifications Formally Verified

---

## 1. Inventory of Physical Data Assets in Repository

A complete filesystem audit was performed across `d:\spidy\YOLO`:

| Asset | Path | File Size | Dimensions | Format | Ground Truth Status | Verification Finding |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `bus.jpg` | `./bus.jpg` | 137,419 bytes | $810 \times 1080$ px | JPEG | **No annotations present** | Physical sample image present on disk |
| `bus.jpg` | `./public/bus.jpg` | 137,419 bytes | $810 \times 1080$ px | JPEG | **No annotations present** | Mirror copy in static web assets |
| Video Files | `uploads/` or workspace | **0 bytes** | N/A | None | **Zero video files present** | No `.mp4`, `.avi`, `.mov`, or `.mkv` files exist in the repository |
| Ground Truth Files | Repository-wide | **0 bytes** | N/A | None | **Zero ground truth files present** | No COCO `.json`, YOLO `.txt`, or Pascal `.xml` files exist |

### Programmatic Simulation Presets (`src/simulation/scenes.ts`)
The codebase contains four programmatic scene generators (`cctv_normal`, `cctv_surge`, `synthetic`, `bus_demo`). These are synthetic procedural mocks used for frontend user-interface demonstration in the absence of video feeds and must **not** be reported as experimental evaluation datasets.

---

## 2. Empirical Audit of Live Test Commands

To eliminate invented test results, all executable test scripts were evaluated live in the environment:

| Test ID | Executed Command Line | Target Component | Return Code | Empirical Output / Finding | Verification State |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **EXP-01** | `python main.py --mode drives` | Storage Bridge | `0` (Success) | Detected drives: `C:` ($455.5\text{ GB}$), `D:` ($476.9\text{ GB}$), `G:` ($455.5\text{ GB}$). | **Successfully validated through an actual runtime test** |
| **EXP-02** | `python main.py --mode browse --path .` | Directory Browser | `0` (Success) | Successfully parsed directory hierarchy, listing folders (`docs`, `public`, `src`, `visionsense`) and `bus.jpg`. | **Successfully validated through an actual runtime test** |
| **EXP-03** | `python main.py --mode analyze-image --image bus.jpg --threshold 20` | Image Pipeline | `0` (Handled) | Subprocess `node visionsense/node_yolo_bridge.cjs` failed with status 1 (`{"error":"No ONNX runtime"}`). System handled error and emitted fallback `people_count: 0`. | **Implemented but runtime validation pending** |
| **EXP-04** | `node test_yolo.js` | TFJS Model Test | `1` (Failed) | Node exited with `ERR_MODULE_NOT_FOUND`: Cannot find package `@tensorflow/tfjs` (`node_modules` not installed). | **Implemented but runtime validation pending** |
| **EXP-05** | `python main.py --mode analyze-video --video bus.jpg` | Video Pipeline | `1` (Failed) | Exited with `RuntimeError: OpenCV (cv2) is required for video analysis pipeline.` (`cv2` not installed in Python 3.13). | **Implemented but runtime validation pending** |
| **EXP-06** | `ffmpeg -version` | Multimedia Engine | `1` (Failed) | PowerShell error: `The term 'ffmpeg' is not recognized as the name of a cmdlet, function, script file, or operable program.` | **Implemented but runtime validation pending** |

---

## 3. Verified Public Benchmark Dataset Specifications

For the future experimental section of the IEEE research paper, the proposed benchmark datasets have been verified against their original published literature and official documentation:

### 3.1 UCSD Anomaly Detection Dataset (Ped2 Benchmark)
- **Primary Citation**: V. Mahadevan, W. Li, V. Bhalodia, and N. Vasconcelos, "Anomaly detection in crowded scenes," *IEEE Conference on Computer Vision and Pattern Recognition (CVPR)*, pp. 1975–1981, 2010.
- **Scene Characteristics**: Fixed overhead camera observing pedestrian walkways at UC San Diego. Grayscale video at $10\text{ FPS}$ with $360 \times 240$ resolution.
- **Dataset Partition**: 16 training video clips (normal pedestrian traffic only) and 12 testing video clips.
- **Ground Truth Nature**: Frame-level binary labels ($y_t \in \{0, 1\}$) and pixel-level binary masks identifying anomalous regions.
- **Actual Anomalies in Dataset**: Bicycles, skateboards, wheelchairs, small utility carts, and maintenance vehicles traveling on the pedestrian path.
- **Critical Correction for Paper**: **UCSD Ped2 does NOT contain stampedes, panic dispersals, or crowd crushing events.** It is strictly an intruder/non-pedestrian motion anomaly dataset.

### 3.2 ShanghaiTech Campus Dataset
- **Primary Citation**: W. Liu, W. Luo, D. Lian, and S. Gao, "Future frame prediction for anomaly detection - a new baseline," *IEEE Conference on Computer Vision and Pattern Recognition (CVPR)*, pp. 6536–6545, 2018.
- **Scene Characteristics**: 13 diverse surveillance camera angles across the ShanghaiTech University campus with complex lighting, shadows, and perspective variations. Resolution $856 \times 480$ at $24\text{ FPS}$.
- **Dataset Partition**: 330 training videos and 107 testing videos containing 130 abnormal events.
- **Ground Truth Nature**: Frame intervals and spatial pixel bounding boxes annotating anomalous segments.
- **Actual Anomalies in Dataset**: Robbery, fighting, chasing, jumping over barriers, sudden running, bicycling on sidewalks, and vehicle intrusions.
- **Critical Correction for Paper**: While ShanghaiTech contains sudden acceleration and rapid running (suitable for testing VisionSense's **Sudden Crowd Surge** classifier), **it does NOT depict large-scale emergency crowd stampedes or stadium disasters.**

### 3.3 CUHK Avenue Dataset
- **Primary Citation**: C. Lu, J. Shi, and J. Jia, "Abnormal event detection at 150 FPS in MATLAB," *IEEE International Conference on Computer Vision (ICCV)*, pp. 2720–2727, 2013.
- **Scene Characteristics**: Outdoor campus walkway, fixed camera, resolution $640 \times 360$ at $25\text{ FPS}$.
- **Dataset Partition**: 16 training clips (normal walking) and 21 testing clips containing 47 abnormal events.
- **Actual Anomalies in Dataset**: Running, throwing objects, wandering/loitering, and walking in the wrong direction.

### 3.4 MOT17 / MOT20 Multi-Object Tracking Benchmarks
- **Primary Citations**:
  - A. Milan et al., "MOT16: A benchmark for multi-object tracking," *arXiv:1603.00831*, 2016.
  - P. Dendorfer et al., "MOT20: A benchmark for multi object tracking in crowded scenes," *arXiv:2003.09003*, 2020.
- **Dataset Partition**:
  - MOT17: 14 video sequences (7 train, 7 test) in varied indoor/outdoor surveillance settings.
  - MOT20: 8 video sequences (4 train, 4 test) captured in extreme crowd density (average 170 persons per frame).
- **Evaluation Criteria**: Evaluates ByteTrack trajectory retention (MOTA, IDF1, HOTA, ID switches, False Positives, False Negatives).

---

## 4. Evaluation Metrics Formulation

To provide IEEE reviewers with standard quantitative criteria, the paper must report the following metrics:

### 4.1 Frame-Level Anomaly Detection Metrics
- **Receiver Operating Characteristic — Area Under Curve (ROC-AUC)**:
  $$\text{TPR}(\theta) = \frac{\text{TP}(\theta)}{\text{TP}(\theta) + \text{FN}(\theta)}, \quad \text{FPR}(\theta) = \frac{\text{FP}(\theta)}{\text{FP}(\theta) + \text{TN}(\theta)}$$
  $$\text{AUC} = \int_{0}^{1} \text{TPR}(\text{FPR}^{-1}(u)) \, du$$
- **Equal Error Rate (EER)**: Operating point where False Positive Rate equals False Negative Rate ($\text{FPR}(\theta^*) = \text{FNR}(\theta^*)$).

### 4.2 Multi-Target Tracking Metrics (CLEAR MOT)
- **Multiple Object Tracking Accuracy (MOTA)**:
  $$\text{MOTA} = 1 - \frac{\sum_t (m_t + fp_t + id\_sw_t)}{\sum_t g_t}$$
  where $m_t$ is misses, $fp_t$ is false positives, $id\_sw_t$ is ID switches, and $g_t$ is ground truth targets.
- **Identification F1-Score (IDF1)**: Measures identity preservation over long trajectories:
  $$\text{IDF1} = \frac{2 \text{IDTP}}{2 \text{IDTP} + \text{IDFP} + \text{IDFN}}$$

---

## 5. Minimum Set of Experiments Required Before Paper Publication

Before reporting quantitative results in an IEEE submission, the following minimum experimental campaign must be executed:

1. **Environment Installation**:
   ```bash
   pip install -r requirements.txt
   npm install
   # Place ffmpeg/ffprobe executable into system PATH
   ```
2. **Experiment 1: Pedestrian Detection Evaluation**:
   - Ingest 500 annotated surveillance frames from MOT17/COCO.
   - Run `visionsense/detector.py` and compute Precision, Recall, and mAP@0.5.
3. **Experiment 2: ByteTrack Tracking Evaluation**:
   - Run `visionsense/bytetrack.py` on MOT17-02 and MOT17-04 video sequences.
   - Compute MOTA, IDF1, and ID Switches using `py-motmetrics`.
4. **Experiment 3: Anomaly Detection ROC-AUC & EER**:
   - Run the primary Python pipeline on all 12 test clips of UCSD Ped2.
   - Compare frame-level anomaly scores $S_{\text{unusual}}$ against ground-truth frame labels and compute ROC-AUC and EER.
5. **Experiment 4: Empirical Runtime Profiling**:
   - Process a 60-second $1920 \times 1080$ and $1280 \times 720$ surveillance video at strides 4, 8, and 12 FPS on the host CPU.
   - Record exact wall-clock detector latency ($t_{\text{det}}$), pipeline latency ($t_{\text{pipe}}$), and sustained throughput (FPS).
