# 👁️ VisionSense — Real-Time Crowd Density, Flow Analysis & Evidence System

> **Commercial-Grade AI CCTV Surveillance Operations Center & Evidence Management**  
> Powered by **Python** with real **Ultralytics YOLO26n**, **ByteTrack**, **Dense Optical Flow**, and **Temporal Movement Intelligence**.

---

## 🚀 Python Architecture Overview

VisionSense runs a complete, real Python computer vision and evidence pipeline:

```
                      +------------------------------------+
                      |    VisionSense Python Engine       |
                      +------------------------------------+
                                        |
       +--------------------------------+--------------------------------+
       |                                |                                |
       v                                v                                v
+----------------+              +----------------+              +----------------+
|  Real YOLO26   |              |   ByteTrack    |              |  Dense Optical |
|  Person Detect |              | Persistent IDs |              |      Flow      |
| (Class ID = 0) |              |  & Trajectory  |              | Motion Vectors |
+----------------+              +----------------+              +----------------+
       |                                |                                |
       +--------------------------------+--------------------------------+
                                        |
                                        v
                      +------------------------------------+
                      |     Temporal Movement Analysis     |
                      |  (Velocity Jumps, Dispersion, Jerk)|
                      +------------------------------------+
                                        |
                                        v
                      +------------------------------------+
                      |       Crowd Safety Engine          |
                      |   people_count <= 20 : NORMAL      |
                      |   people_count > 20  : WARNING     |
                      +------------------------------------+
                                        |
                                        v
                      +------------------------------------+
                      |  Real-Time Telemetry & Safe Alerts |
                      |    Processed completely to EOF     |
                      +------------------------------------+
```

---

## 📁 Repository Structure

```
├── visionsense/                    # Core VisionSense Python Package
│   ├── __init__.py                 # Package initializer
│   ├── types.py                    # Data classes, schemas & telemetry models
│   ├── detector.py                 # Real Ultralytics YOLO26n person detector
│   ├── bytetrack.py                # ByteTrack Kalman filter & 2-stage IoU tracker
│   ├── optical_flow.py             # Dense Optical Flow motion field estimation
│   ├── temporal_analysis.py        # Temporal sliding-window anomaly analyzer
│   ├── safety_engine.py            # Exact crowd safety threshold decision engine
│   ├── storage_bridge.py           # Windows/Linux drive detection & folder browser
│   ├── pipeline.py                 # Video processing loop (runs to 100% EOF)
│   ├── server.py                   # Python HTTP microservice & REST endpoints
│   └── node_yolo_bridge.cjs        # High-speed local ONNX YOLO runtime bridge
├── main.py                         # Unified Python CLI & Server runner
├── requirements.txt                # Python dependencies
├── setup.py                        # Python package configuration
├── .gitattributes                  # GitHub Linguist configuration (Prioritizes Python)
├── src/                            # VisionSense UI & Web Dashboard (React + Vite)
├── public/models/yolo26n.onnx      # Real pretrained YOLO26n neural network model
└── uploads/evidence/               # Local drives, CCTV vaults & removable USB evidence
```

---

## 🛠️ Quickstart (Python)

### 1. Requirements
- Python 3.10+
- Windows 10/11, macOS, or Linux

### 2. Installation
```bash
pip install -r requirements.txt
```

### 3. Run Python Microservice
Starts the VisionSense Python backend on port 5050:
```bash
python main.py --mode server --port 5050
```

### 4. Run Single Image Spatial Analysis
Runs real YOLO person detection, bounding box generation, and crowd threshold evaluation on an evidence image:
```bash
python main.py --mode analyze-image --image bus.jpg --threshold 20
```

### 5. Run Video Analysis until EOF (100%)
Processes CCTV footage continuously from frame 0 until actual EOF, generating timestamp-accurate telemetry:
```bash
python main.py --mode analyze-video --video path/to/cctv.mp4 --threshold 20
```

### 6. Detect Connected Storage & Removable USBs
Discovers all physical disks, mounted drives, and removable USB pen drives:
```bash
python main.py --mode drives
```

### 7. Browse Folder Evidence
Safely traverses directories with breadcrumbs, filtering strictly for supported CCTV video and image formats:
```bash
python main.py --mode browse --path uploads/evidence
```

---

## 🛡️ Core Rules & Precision Logic

1. **Exact Crowd Safety Rule**:
   - `people_count <= 20` $\rightarrow$ **NORMAL** (Green)
   - `people_count > 20` $\rightarrow$ **WARNING** (Amber)
   - Configurable in settings (default: 20).

2. **Real YOLO Detection**:
   - Only COCO `person` (`class_id = 0`). Non-person classes (vehicles, chairs, bags) are strictly filtered out.
   - Coordinates are exact pixel measurements matching image/frame aspect ratio. No simulated or randomized bounding boxes.

3. **Dense Optical Flow**:
   - Computes physical motion vector fields, magnitude, and directional dispersion between consecutive frames.

4. **Continuous Video Processing**:
   - Starts at frame 0 and processes continuously until true EOF ($t \approx \text{duration}$, reaching 100%).

5. **500 MB File Limit**:
   - Validates file size prior to ingestion; files exceeding 500 MB return `FILE TOO LARGE`.

6. **Static Image Constraint**:
   - Static images evaluate spatial density, person count, and bounding boxes. No artificial temporal metrics (speed/velocity) are claimed for static images.

---

## 🌐 Full-Stack Operations Center (React + Python)

To run the web interface alongside the Python engine:
```bash
# Terminal 1: Python Engine
python main.py --mode server --port 5050

# Terminal 2: Operations Center Web App
npm run dev
```

Open `http://localhost:3000` to access the full VisionSense dashboard with the **STORAGE / EVIDENCE** navigation module.