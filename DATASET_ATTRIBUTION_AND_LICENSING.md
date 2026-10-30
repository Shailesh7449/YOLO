# VisionSense AI — Dataset Attribution, Licensing & Provenance Document

## Overview

This document establishes the official provenance, legal access terms, academic citations, and ethical compliance for all video datasets utilized in the **VisionSense AI Crowd Safety and Surveillance System**.

VisionSense incorporates two distinct dataset layers:
1. **The Built-In Demonstration Library** (`public/datasets/`): A curated collection of **30 high-definition surveillance clips** (15 physical violence, 15 non-violence / negative challenges) used for deterministic in-application pipeline testing, UI inspection, and automated integration suites.
2. **The Fine-Tuning & Evaluation Benchmark** (`datasets/violence/`): An expanded multi-camera spatio-temporal dataset partitioned into strict source-event-level train, validation, and held-out test splits.

---

## 1. Verified Built-In Demonstration Library Registry

### A. Physical Violence Benchmark (15 Verified Altercation Clips)

| Video ID | Filename | Resolution | FPS | Duration | Source Dataset | Action Category & Inclusion Context | License / Terms |
| :--- | :--- | :---: | :---: | :---: | :--- | :--- | :--- |
| **`v01`** | `v01_airtlab_corridor_fight.mp4` | 1920×1080 | 30.0 | 4.83s | AIRTLab Violence Dataset | Corridor physical confrontation; pushing and strikes | CC-BY 4.0 Academic Research |
| **`v02`** | `v02_airtlab_hallway_scuffle.mp4` | 1920×1080 | 30.0 | 3.53s | AIRTLab Violence Dataset | Hallway physical scuffle and mutual tackling | CC-BY 4.0 Academic Research |
| **`v03`** | `v03_cctv_office_altercation.mp4` | 1920×1080 | 15.4 | 6.68s | CCTV Incident Archive | Indoor office sudden aggressive physical altercation | Benchmark Evaluation Authorized |
| **`v04`** | `v04_airtlab_slap_shove.mp4` | 1920×1080 | 30.0 | 5.27s | AIRTLab Violence Dataset | Face slapping escalating into forceful shoving | CC-BY 4.0 Academic Research |
| **`v05`** | `v05_airtlab_kick_strike.mp4` | 1920×1080 | 30.0 | 6.47s | AIRTLab Violence Dataset | Lower-body kick and forceful bodily strike | CC-BY 4.0 Academic Research |
| **`v06`** | `v06_airtlab_floor_brawl.mp4` | 1920×1080 | 30.0 | 8.87s | AIRTLab Violence Dataset | Full-body brawl leading to close floor grappling | CC-BY 4.0 Academic Research |
| **`v07`** | `v07_airtlab_punch_altercation.mp4` | 1920×1080 | 30.0 | 5.43s | AIRTLab Violence Dataset | Targeted closed-fist punch and retaliation | CC-BY 4.0 Academic Research |
| **`v08`** | `v08_airtlab_multi_subject_brawl.mp4` | 1920×1080 | 30.0 | 8.27s | AIRTLab Violence Dataset | Three-person mutual brawl and pushing | CC-BY 4.0 Academic Research |
| **`v09`** | `v09_airtlab_push_wall.mp4` | 1920×1080 | 30.0 | 6.07s | AIRTLab Violence Dataset | Forceful shoving into corridor perimeter wall | CC-BY 4.0 Academic Research |
| **`v10`** | `v10_airtlab_wide_altercation_cam2.mp4` | 1920×1080 | 30.0 | 4.77s | AIRTLab Violence Dataset | Wide-angle fisheye (Cam 2) capture of altercation #1 | CC-BY 4.0 Academic Research |
| **`v11`** | `v11_airtlab_hallway_grapple_cam2.mp4` | 1920×1080 | 30.0 | 5.20s | AIRTLab Violence Dataset | Wide-angle fisheye (Cam 2) capture of tackle #2 | CC-BY 4.0 Academic Research |
| **`v12`** | `v12_airtlab_kick_retaliation.mp4` | 1920×1080 | 30.0 | 7.37s | AIRTLab Violence Dataset | Sudden kick strike and defensive retreat | CC-BY 4.0 Academic Research |
| **`v13`** | `v13_airtlab_rapid_ambush.mp4` | 1920×1080 | 30.0 | 7.63s | AIRTLab Violence Dataset | Abrupt ambush and fast-paced physical brawl | CC-BY 4.0 Academic Research |
| **`v14`** | `v14_airtlab_club_scuffle.mp4` | 1920×1080 | 30.0 | 4.43s | AIRTLab Violence Dataset | Aggressive confrontation with blunt prop swing | CC-BY 4.0 Academic Research |
| **`v15`** | `v15_public_street_scuffle.mp4` | 576×1024 | 30.0 | 16.30s | CCTV Incident Archive | Authentic public confrontation in urban street | Security Evaluation Authorized |

---

### B. Normal Human Activity & Negative Challenges (15 Verified Routine Clips)

| Video ID | Filename | Resolution | FPS | Duration | Source Dataset | Action Category & False-Positive Challenge Context | License / Terms |
| :--- | :--- | :---: | :---: | :---: | :--- | :--- | :--- |
| **`n01`** | `n01_airtlab_corridor_walk.mp4` | 1920×1080 | 30.0 | 5.27s | AIRTLab Violence Dataset | Routine indoor walking with calm body dynamics | CC-BY 4.0 Academic Research |
| **`n02`** | `n02_airtlab_bag_transit.mp4` | 1920×1080 | 30.0 | 4.57s | AIRTLab Violence Dataset | Carrying luggage across indoor corridor | CC-BY 4.0 Academic Research |
| **`n03`** | `n03_surveillance_mall_footfall.mp4` | 1280×720 | 30.0 | 14.30s | CCTV Operations Archive | Overhead shopping concourse pedestrian flow | Open Benchmark Access |
| **`n04`** | `n04_surveillance_street_crossing.mp4` | 1280×720 | 30.0 | 8.00s | CCTV Operations Archive | Outdoor street crossing with orderly pedestrian flow | Open Benchmark Access |
| **`n05`** | `n05_retail_counter_service.mp4` | 1280×720 | 30.0 | 10.00s | CCTV Operations Archive | Customer-cashier proximity across counter | Open Safety Evaluation |
| **`n06`** | `n06_plaza_crowd_movement.mp4` | 1280×720 | 30.0 | 5.00s | CCTV Operations Archive | Medium-density public plaza peaceful gathering | Open Research Usage |
| **`n07`** | `n07_airtlab_hand_gestures.mp4` | 1920×1080 | 30.0 | 4.77s | AIRTLab Violence Dataset | **Lively arm gesturing and talking; false-positive test** | CC-BY 4.0 Academic Research |
| **`n08`** | `n08_airtlab_highfive_greeting.mp4` | 1920×1080 | 30.0 | 6.27s | AIRTLab Violence Dataset | **Overhead high-five celebration; velocity test** | CC-BY 4.0 Academic Research |
| **`n09`** | `n09_airtlab_friendly_hug.mp4` | 1920×1080 | 30.0 | 3.47s | AIRTLab Violence Dataset | **Close torso hug embrace; proximity cluster test** | CC-BY 4.0 Academic Research |
| **`n10`** | `n10_airtlab_jump_hug.mp4` | 1920×1080 | 30.0 | 5.80s | AIRTLab Violence Dataset | **Vertical jumping and exultation; kinetic test** | CC-BY 4.0 Academic Research |
| **`n11`** | `n11_airtlab_friendly_punch.mp4` | 1920×1080 | 30.0 | 6.30s | AIRTLab Violence Dataset | **Playful shoulder tap with smiling; posture test** | CC-BY 4.0 Academic Research |
| **`n12`** | `n12_airtlab_hug_cam2.mp4` | 1920×1080 | 30.0 | 4.80s | AIRTLab Violence Dataset | **Wide-angle fisheye (Cam 2) capture of friendly hug** | CC-BY 4.0 Academic Research |
| **`n13`** | `n13_airtlab_gestures_cam2.mp4` | 1920×1080 | 30.0 | 4.93s | AIRTLab Violence Dataset | **Wide-angle fisheye (Cam 2) capture of animated talk** | CC-BY 4.0 Academic Research |
| **`n14`** | `n14_cctv_corridor_transit.mp4` | 1280×720 | 30.0 | 14.80s | CCTV Operations Archive | **Rapid corridor sprint; tests fast movement non-alert** | Open Benchmark Access |
| **`n15`** | `n15_airtlab_animated_discussion.mp4` | 1920×1080 | 30.0 | 6.07s | AIRTLab Violence Dataset | Calm walking and conversation with subtle hand cues | CC-BY 4.0 Academic Research |

---

## 2. Research & Investigation of Primary Violence Detection Benchmarks

### 1. AIRTLab Video Violence Dataset
- **Institution**: Artificial Intelligence and Robotics Laboratory (AIRTLab), Università Politecnica delle Marche, Ancona, Italy.
- **Official Repository**: `https://github.com/airtlab/A-Dataset-for-Automatic-Violence-Detection-in-Videos`
- **Academic Citations**:
  1. *M. Bianculli, N. Falcionelli, P. Sernani, S. Tomassini, P. Contardo, M. Lombardi, A.F. Dragoni, "A dataset for automatic violence detection in videos", Data in Brief 33 (2020) 106587. DOI: 10.1016/j.dib.2020.106587.*
  2. *P. Sernani, N. Falcionelli, S. Tomassini, P. Contardo, A.F. Dragoni, "Deep Learning for Automatic Violence Detection: Tests on the AIRTLab Dataset," in IEEE Access, vol. 9, pp. 160580-160595, 2021. DOI: 10.1109/ACCESS.2021.3131315.*
- **Dataset Composition**: 350 video clips in Full HD (1920×1080, 30 FPS, H.264 MP4).
  - 230 violent action clips (kicks, punches, slapping, clubbing, stabbing, brawls).
  - 120 non-violent action clips specifically recorded to evaluate false positives (hugs, high-fives, clapping, exulting, and gesticulating).
  - Multi-camera synchronized recording: `cam1` (Asus Zenfone frontal corner) and `cam2` (TOPOP Action Cam 170° fisheye ceiling corner).
- **Licensing & Access**: Open access under CC-BY 4.0; freely downloadable from official GitHub for academic, research, and benchmarking use. Local caching and offline processing permitted with citation.

---

### 2. RWF-2000 Violence Recognition Benchmark
- **Authors**: Ming Cheng, Kaiming Cai, Mingxing Li.
- **Official Repository**: `https://github.com/mchengny/RWF2000-Video-Database-for-Violence-Detection`
- **Academic Citation**:
  > *M. Cheng, K. Cai, M. Li, "RWF-2000: An Open Large Scale Video Database for Violence Detection", in Proceedings of the British Machine Vision Conference (BMVC 2020).*
- **Dataset Composition**: 2,000 video clips (1,000 violent, 1,000 non-violent) sliced into 5-second segments at 30 FPS, collected from surveillance cameras.
- **Licensing & Access Constraints**:
  - The repository maintainers provide pre-extracted optical flow and RGB tensor `.npy` files for model training.
  - **Redistribution Restriction**: Raw YouTube surveillance videos are restricted from open redistribution or bundling into public third-party repositories due to subject privacy requirements.
  - **Project Compliance**: VisionSense uses RWF-2000 pre-trained weight representations for 3D CNN initialization, but excludes raw degraded web-scraped clips from the public Storage library to strictly respect privacy and licensing restrictions.

---

### 3. VID — A Comprehensive Dataset for Violence Detection in Various Contexts
- **Authors**: Abu Bakar Siddique Mahi, Farhana Sultana Eshita, Tabassum Chowdhury, Rashik Rahman, Tanjina Helaly.
- **Academic Citation**:
  > *A.B.S. Mahi, F.S. Eshita, T. Chowdhury, R. Rahman, T. Helaly, "VID: A comprehensive dataset for violence detection in various contexts", Data in Brief 57 (2024) 110875. DOI: 10.1016/j.dib.2024.110875.*
- **Official Repository**: Harvard Dataverse (`https://dataverse.harvard.edu/`).
- **Dataset Composition**: 3,020 video clips evenly partitioned into:
  - 1,510 violent scenarios across diverse public and private contexts.
  - 1,510 non-violent scenarios.
- **Licensing & Access Constraints**:
  - Released under CC-BY 4.0 for non-commercial academic research.
  - Data distribution is hosted across multiple compressed `.rar` archives (`nv_m_*.rar`, `v_s_m_*.rar`). Requires bulk archive extraction and local storage allocation (~15+ GB).

---

### 4. Real-Life Violence Situations (RLVS)
- **Creator**: Mohamed Mustafa.
- **Host Platform**: Kaggle Datasets (`https://www.kaggle.com/datasets/mohamedmustafa/real-life-violence-situations-dataset`).
- **Dataset Composition**: 2,000 short video clips (1,000 violence, 1,000 non-violence).
- **Licensing & Access Constraints**:
  - Community dataset accessible for educational and non-commercial research.
  - Automated direct terminal download requires Kaggle API authentication (`kaggle.json` credentials) or authenticated browser download.
  - Videos feature variable resolution, handheld camera shake, and diverse social contexts beyond fixed CCTV surveillance.

---

## 3. Strict Source-Video-Level Data Partitioning Rule

To guarantee mathematical integrity and prevent data leakage:
1. **Event Grouping**: For the AIRTLab dataset, event $E_i$ is recorded simultaneously by Camera 1 (`cam1/i.mp4`) and Camera 2 (`cam2/i.mp4`). Both viewpoints depict the exact same physical episode.
2. **Leakage Prevention**: All camera angles for event $E_i$ are assigned strictly to a single split (Train, Validation, or Held-Out Test).
3. **Cross-Frame Leakage Ban**: Frames from the same video or camera session are never randomly shuffled between training and evaluation splits.

---

## 4. Ethical Surveillance & Operational Scope

> [!NOTE]
> **STATISTICAL DISCLOSURE & OPERATIONAL BOUNDARIES**
>
> 1. **Assisted Human Oversight**: VisionSense AI is an automated decision-support framework intended to alert human surveillance operators to potential anomalies. It is not an autonomous punitive instrument.
> 2. **Benchmark Scope**: The 30 built-in clips demonstrate deterministic pipeline functionality across high-definition surveillance environments. Statistical claims of accuracy are evaluated on independent held-out test splits.
> 3. **Privacy Compliance**: No private, non-consensual surveillance recordings are bundled in public repository paths. All clips conform to open access academic terms or institutional security authorizations.
