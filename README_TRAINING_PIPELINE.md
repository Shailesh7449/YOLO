# VisionSense AI Crowd Anomaly Detection System
## Multi-Dataset Model Training, Fine-Tuning & Integration Pipeline

This guide outlines the exact, reproducible Windows PowerShell commands to audit hardware, prepare datasets, fine-tune YOLO detectors, train temporal crowd anomaly sequence models, export to ONNX, run unit tests, and start the inference backend.

---

## 1. Environment & Hardware Audit
The pipeline uses Python 3.12 with PyTorch 2.6.0+cu124 on CUDA 12.4 for NVIDIA GeForce GTX 1650 (4 GB GDDR6).

```powershell
# Activate the virtual environment
.\.venv\Scripts\Activate.ps1

# Verify GPU, CUDA, and library detection
python -c "import torch, ultralytics, onnxruntime; print('PyTorch:', torch.__version__, 'CUDA Available:', torch.cuda.is_available(), 'GPU:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU')"
```

---

## 2. Phase 2: Baseline Detector Profiling
Measures real latency, throughput, memory, and detection counts for the existing baseline ONNX model (`public/models/yolo26n.onnx`):

```powershell
python training\scripts\baseline_eval.py
```
Outputs saved to: `training/evaluation/baseline_detector_report.json`.

---

## 3. Phase 3: Dataset Preparation & Leakage Verification
Generates reproducible surveillance pedestrian and temporal anomaly benchmarks with zero frame/camera leakage:

```powershell
# 1. Prepare datasets, manifests, and compute SHA-256 hashes
python training\scripts\dataset_manager.py

# 2. Run automated leak-free audit and label boundary verification
python training\scripts\verify_splits.py
```
Manifests saved in `datasets/manifests/` and audit in `training/evaluation/data_leakage_audit.json`.

---

## 4. Phase 4: Person Detector Fine-Tuning & ONNX Export
Runs real YOLO person fine-tuning on GPU, validates mAP, exports best checkpoint to ONNX, and benchmarks baseline vs fine-tuned:

```powershell
# 1. Run YOLO fine-tuning (5 epochs, batch 8, mixed precision amp=True)
python training\scripts\train_yolo.py

# 2. Compare baseline ONNX vs fine-tuned PyTorch (.pt) vs exported ONNX
python training\scripts\compare_detectors.py
```
Checkpoints saved to:
- PyTorch: `training/checkpoints/best_person_detector.pt` (6.25 MB)
- Exported ONNX: `training/checkpoints/yolo_person_finetuned.onnx` (12.18 MB)
- Report: `training/evaluation/yolo_finetune_report.json`

---

## 5. Phase 5: Temporal Crowd Anomaly Model Training
Trains the Bi-directional GRU with Learned Temporal Attention Pooling (`TemporalCrowdAnomalyNet`):

```powershell
python training\scripts\train_temporal_model.py
```
Checkpoints saved to:
- PyTorch: `training/checkpoints/temporal_anomaly_model.pt`
- Exported ONNX: `training/checkpoints/temporal_anomaly_model.onnx`
- Report: `training/evaluation/temporal_anomaly_report.json`

---

## 6. Phase 8: Automated Test Suite Execution
Executes the comprehensive automated test suite covering all 16 requirements:

```powershell
pytest -v tests\test_pipeline.py
```
Expected output: **13 passed**.

---

## 7. Starting the Integrated VisionSense Python Backend
Launches the microservice providing health, model metadata, evaluation reports, and live image/video inference:

```powershell
python -m visionsense.server
```
Endpoints exposed:
- `GET http://localhost:5050/api/health` — Service readiness & GPU status
- `GET http://localhost:5050/api/models/metadata` — Architecture & active checkpoint specifications
- `GET http://localhost:5050/api/models/evaluations` — Measured empirical metrics
- `POST http://localhost:5050/api/analyze-image` — Real-time person detection & crowd status
- `POST http://localhost:5050/api/analyze-video` — Full temporal tracking, optical flow, and anomaly detection
