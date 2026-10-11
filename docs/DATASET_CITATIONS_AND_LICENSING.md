# VisionSense Dataset Citations, Licensing & Compatibility Report

This document records the official access procedures, licensing requirements, and integration status for benchmark surveillance datasets evaluated within VisionSense.

---

## 1. UCF-Crime Dataset
- **Official Portal**: [CRCV UCF Crime Anomaly Detection](https://www.crcv.ucf.edu/research/real-world-anomaly-detection-in-surveillance-videos/)
- **Citation**:
  > Sultani, W., Chen, C., & Shah, M. (2018). *Real-world Anomaly Detection in Surveillance Videos*. IEEE Conference on Computer Vision and Pattern Recognition (CVPR), pp. 6479-6488.
- **Nature of Data**: Long untrimmed surveillance videos (1,900 videos, 128 hours) covering 13 anomaly categories (Abuse, Arrest, Arson, Assault, Burglary, Robbery, Shooting, Stealing, Vandalism, etc.) and normal surveillance.
- **Supervision Level**: Weak supervision (video-level binary labels during training; temporal segment annotations available for evaluation subset).
- **Licensing & Access**: Non-commercial academic research use only. Requires compliance with CRCV terms.
- **VisionSense Compatibility**: Video-level weak supervision is compatible with multiple instance learning (MIL) temporal anomaly extractors.

---

## 2. ShanghaiTech Campus Dataset
- **Official Portal**: [ShanghaiTech Campus Dataset (SVIP Lab)](https://svip-lab.github.io/dataset/campus_dataset.html)
- **Citation**:
  > Luo, W., Liu, W., & Gao, S. (2017). *A Revisit of Sparse Coding Based Anomaly Detection: Investigation and A New Basis*. IEEE International Conference on Computer Vision (ICCV), pp. 341-349.
- **Nature of Data**: 13 camera scenes, 437 campus surveillance video clips (330 training videos, 107 testing videos with 130 anomaly events).
- **Supervision Level**: Semi-supervised (training set contains exclusively normal campus footage; anomalies appear only in test set).
- **Licensing & Access**: Academic research agreement required. Download requires registration through institutional email.
- **VisionSense Compatibility**: Ideal benchmark for evaluating reconstruction-error and temporal trajectory deviation in academic campus environments.

---

## 3. RWF-2000 Video Database
- **Official Repository**: [RWF-2000 GitHub](https://github.com/mchengny/RWF2000-Video-Database-for-Violence-Detection) / [Zenodo Record](https://zenodo.org/records/15687512)
- **Citation**:
  > Cheng, M., Cai, K., & Li, M. (2021). *RWF-2000: An Open Large Scale Video Database for Violence Detection*. IEEE International Conference on Pattern Recognition (ICPR), pp. 2891-2898.
- **Nature of Data**: 2,000 video clips (each 5 seconds at 30 FPS) captured by real-world surveillance cameras, partitioned into 1,600 train and 400 test clips (balanced 50% Fight, 50% Non-Fight).
- **Licensing & Access**: Non-commercial research use. Redistribution of raw YouTube surveillance clips is restricted.
- **VisionSense Integration Status**: **Modularly Decoupled / Experimental**. Violence classification requires optical flow 3D CNNs or spatio-temporal action backbones (e.g., SlowFast, I3D, ViViT). Documented as disabled in the production service to prevent presenting an untrained model as operational.

---

## 4. Surveillance Pedestrian Benchmarks (MOT17 / CrowdHuman / COCO)
- **COCO Consortium**: [Common Objects in Context](https://cocodataset.org/) (Creative Commons Attribution 4.0 License). Class 0 (`person`) extracted for baseline detector.
- **CrowdHuman Benchmark**:
  > Shao, S., et al. (2018). *CrowdHuman: A Benchmark for Detecting Human in a Crowd*. arXiv:1805.00123. High-density pedestrian annotations under heavy occlusion.
- **MOT17 / MOT20 Benchmarks**:
  > Milan, A., et al. (2016). *MOT16: A Benchmark for Multi-Object Tracking*. arXiv:1603.00831. Real stationary surveillance footage for ByteTrack Kalman filter tuning.

---

## 5. Incomplete Experiments & Future Roadmap
1. **Full RWF-2000 Action Recognition Pipeline**: Blocked by compute budget (requires 3D CNN or video transformer backbone with > 12 GB VRAM for distributed clip training).
2. **End-to-End ShanghaiTech Re-evaluation on Edge Hardware**: Planned for Jetson Orin Nano deployment.
3. **Multi-Camera Re-Identification (ReID)**: Preserved as separate modular research goal outside single-view CCTV tracking.
