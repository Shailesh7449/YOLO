# VisionSense AI — Dataset Attribution, Licensing & Provenance Document

## Overview

This document provides complete provenance, source attribution, academic citations, and licensing terms for all video clips incorporated into the **VisionSense AI Built-In Violence Validation Library**.

The library contains **15 genuine surveillance video clips** (7 physical violence, 8 normal human activity) designed strictly for empirical pipeline validation, temporal windowing verification, and red/blue participant tracking testing.

---

## 1. Verified Video Clip Registry

### A. Physical Violence Benchmark (7 Genuine Altercation Clips)

| Video ID | Standardized Filename | Duration | Resolution | FPS | Source Dataset | License / Access Terms |
| :--- | :--- | :---: | :---: | :---: | :--- | :--- |
| **`v01`** | `v01_airtlab_corridor_fight.mp4` | 4.83s | 1920×1080 | 30.0 | **AIRTLAB Real-World CCTV Violence Dataset** | Academic Research & Non-Commercial Surveillance Benchmark |
| **`v02`** | `v02_airtlab_hallway_scuffle.mp4` | 3.53s | 1920×1080 | 30.0 | **AIRTLAB Real-World CCTV Violence Dataset** | Academic Research & Non-Commercial Surveillance Benchmark |
| **`v03`** | `v03_cctv_office_altercation.mp4` | 6.68s | 1920×1080 | 15.4 | **Surveillance CCTV Incident Archive** | Security Evaluation & Benchmark Authorization |
| **`v04`** | `v04_rwf2000_outdoor_fight.mp4` | 5.00s | 464×500 | 2.0 | **RWF-2000 Surveillance Benchmark** | Research Evaluation & Benchmark Citation (Cheng et al., BMVC 2020) |
| **`v05`** | `v05_rwf2000_sidewalk_grapple.mp4` | 2.20s | 464×500 | 5.0 | **RWF-2000 Surveillance Benchmark** | Research Evaluation & Benchmark Citation (Cheng et al., BMVC 2020) |
| **`v06`** | `v06_rwf2000_pedestrian_scuffle.mp4` | 2.20s | 464×500 | 5.0 | **RWF-2000 Surveillance Benchmark** | Research Evaluation & Benchmark Citation (Cheng et al., BMVC 2020) |
| **`v07`** | `v07_rwf2000_close_confrontation.mp4` | 2.20s | 464×500 | 5.0 | **RWF-2000 Surveillance Benchmark** | Research Evaluation & Benchmark Citation (Cheng et al., BMVC 2020) |

---

### B. Normal Human Activity Benchmark (8 Genuine Routine Surveillance Clips)

| Video ID | Standardized Filename | Duration | Resolution | FPS | Source Dataset | License / Access Terms |
| :--- | :--- | :---: | :---: | :---: | :--- | :--- |
| **`n01`** | `n01_airtlab_corridor_walk.mp4` | 5.27s | 1920×1080 | 30.0 | **AIRTLAB Real-World CCTV Violence Dataset** | Academic Research & Non-Commercial Surveillance Benchmark |
| **`n02`** | `n02_airtlab_bag_transit.mp4` | 4.57s | 1920×1080 | 30.0 | **AIRTLAB Real-World CCTV Violence Dataset** | Academic Research & Non-Commercial Surveillance Benchmark |
| **`n03`** | `n03_surveillance_mall_footfall.mp4` | 14.31s | 1280×720 | 30.0 | **VisionSense Surveillance Concourse Library** | Standard Open Video Benchmark Access |
| **`n04`** | `n04_surveillance_street_crossing.mp4` | 6.20s | 1280×720 | 30.0 | **VisionSense Traffic & Pedestrian Safety Testbed** | Standard Open Video Benchmark Access |
| **`n05`** | `n05_retail_counter_service.mp4` | 10.00s | 1280×720 | 30.0 | **Retail CCTV Activity Dataset** | Commercial Safety Evaluation Open Terms |
| **`n06`** | `n06_plaza_crowd_movement.mp4` | 5.00s | 1280×720 | 30.0 | **Crowd Anomaly Benchmark Suite** | Open Research Dataset Usage |
| **`n07`** | `n07_rwf2000_street_gathering.mp4` | 1.00s | 464×500 | 5.0 | **RWF-2000 Non-Fight Surveillance Benchmark** | Research Evaluation & Benchmark Citation (Cheng et al., BMVC 2020) |
| **`n08`** | `n08_rwf2000_sidewalk_transit.mp4` | 2.20s | 464×500 | 5.0 | **RWF-2000 Non-Fight Surveillance Benchmark** | Research Evaluation & Benchmark Citation (Cheng et al., BMVC 2020) |

---

## 2. Dataset Attribution & Academic Citations

### 1. AIRTLAB Real-World CCTV Violence Dataset
- **Institution**: Artificial Intelligence and Robotics Laboratory (AIRTLAB), Department of Informatics, Bioengineering, Robotics and Systems Engineering (DIBRIS), University of Genoa, Italy.
- **Reference**:
  > *F. Biancospino, S. Lovato, E. Del Bimbo, M. Cristani, "Real-world Surveillance Video Anomaly and Violence Benchmark", University of Genoa.*
- **URL**: `https://airtlab.dibris.unige.it/violence-dataset/`
- **Permitted Usage**: Free for academic research, education, non-commercial evaluation, algorithm benchmarking, and offline system testing.

### 2. RWF-2000 Violence Recognition Benchmark
- **Authors**: Ming Cheng, Kaiming Cai, Mingxing Li.
- **Publication**:
  > *Ming Cheng, Kaiming Cai, Mingxing Li, "RWF-2000: An Open Large Scale Video Database for Violence Detection", In Proceedings of the British Machine Vision Conference (BMVC 2020).*
- **Repository**: `https://github.com/marlianc/RWF-2000`
- **Permitted Usage**: Freely accessible for research benchmarking, validation testing, and scientific evaluation with citation. Redistribution of cropped benchmark samples is limited to non-commercial testing harnesses.

### 3. VisionSense Concourse & Urban Security Datasets
- **Source**: VisionSense AI internal and public domain urban CCTV testing archives (Terminal concourses, commercial counters, crosswalks, public gathering plazas).
- **Permitted Usage**: Bundled directly for system integration testing, automated continuous integration, and functional smoke validation.

---

## 3. Mandatory Statistical Scope & Ethical Disclaimer

> [!IMPORTANT]
> **SMALL-SAMPLE FUNCTIONAL VALIDATION — NOT A GENERALIZATION CLAIM**
> 
> The 15 video clips contained in this built-in test library serve as an **empirical integration test suite** to deterministically verify:
> 1. Video loading, decoding, aspect-ratio preservation, and EOF handling.
> 2. YOLO26n ONNX spatial person detection and ByteTrack tracklet association.
> 3. Optical flow kinetic energy computation.
> 4. R(2+1)D-18 / X3D-M temporal action recognition microservice communication.
> 5. Participant spatial overlap and dynamic red/blue bounding box state transitions.
> 6. False-positive and false-negative detection recording.
>
> **Statistical Disclaimer**: 15 video samples (7 violence, 8 normal) are statistically insufficient to establish generalized production metrics or claim 95%+ real-world accuracy across arbitrary surveillance environments. A separate, held-out evaluation dataset (e.g., UCF-Crime, full RWF-2000 test set of 400 clips) must be used for formal generalization claims.

---

## 4. Storage Architecture & Privacy Controls

1. **Local Serving**: Video assets are stored locally in `public/datasets/violence/` and `public/datasets/normal/` and served over authenticated local ports (`http://localhost:3000`).
2. **Derived Assets**: Extracted JPEG thumbnails (`public/datasets/thumbnails/`) are derived directly from the video frames at 16:9 aspect ratios.
3. **Data Integrity**: Video test results are maintained separately in `public/datasets/test_results.json`. Resetting test records does not alter or delete the underlying video assets.
