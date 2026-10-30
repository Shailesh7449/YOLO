# VisionSense AI Crowd Anomaly Detection System
## Multi-Dataset Model Training, Fine-Tuning & Integration Pipeline

This guide outlines the exact, reproducible Windows PowerShell commands to audit hardware, prepare datasets, fine-tune YOLO detectors, train temporal crowd anomaly sequence models, export to ONNX, run unit tests, and start the inference backend.

---

## 1. Environment & Hardware Audit
The pipeline uses Python 3.12 with PyTorch 2.6.0+cu124 on CUDA 12.4 for NVIDIA GeForce GTX 1650 (4 GB GDDR6).

```powershell
# Activate the virtual environment
.\.venv\Scripts\Activate.ps1

# Install local GPU training dependencies (CUDA 12.4 PyTorch)
pip install -r requirements-training.txt

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

## 6. Phase 6: Spatio-Temporal Violence Recognition Fine-Tuning & Evaluation Pipeline
Provides end-to-end, reproducible surveillance action recognition training and validation:

### Step 1: Automated Dataset Ingestion & Quality Screening
Validates 30 high-definition authentic surveillance clips (15 Violence, 15 Non-Violence challenge cases) with OpenCV integrity checks, framerate/resolution/duration metrics, and automatic thumbnail generation:
```powershell
python training\scripts\dataset_ingestion.py
```
Outputs:
- Manifest: `public/datasets/manifest.json` (v2.0.0, 30 clips)
- Thumbnails: `public/datasets/thumbnails/*.jpg`

### Step 2: Multi-Camera Event-Level Dataset Splitting (Zero Leakage)
Partitions 128 multi-camera surveillance video events (AIRTLab + surveillance archives) at the event level (not frame level) across Train (93), Validation (18), and Held-Out Test (17):
```powershell
python training\scripts\prepare_training_dataset.py
```
Output: `datasets/manifests/violence_training_manifest.json`

### Step 3: Fast 3D Tensor Preprocessing
Pre-extracts 16-frame 224x224 RGB tensors (`.npz`) to eliminate video decode bottlenecks during PyTorch training loops:
```powershell
python training\scripts\preprocess_features.py
```
Output: `datasets/manifests/violence_preprocessed_manifest.json`

### Step 4: Spatio-Temporal Model Fine-Tuning on GTX 1650 (4 GB VRAM)
Fine-tunes the R(2+1)D-18 spatio-temporal video backbone using Automatic Mixed Precision (AMP fp16), gradient accumulation, CosineAnnealingLR, and automated rollback checkpointing:
```powershell
python training\scripts\train_violence_model.py --epochs 6 --batch-size 4 --lr 0.0001
```
Checkpoints:
- Fine-Tuned Best: `training/checkpoints/violence_r2plus1d_finetuned.pt`
- Rollback Backup: `training/checkpoints/violence_r2plus1d_finetuned_backup.pt`
- Baseline: `training/checkpoints/violence_r2plus1d_best.pt`

### Step 5: Independent Held-Out Benchmark & Baseline Comparison
Evaluates both Baseline and Fine-Tuned Candidate models on the held-out test split, reporting Confusion Matrix, Accuracy, Precision, Recall, F1, FPR, FNR, Latency, FPS throughput, VRAM consumption, and camera-angle breakdowns:
```powershell
python training\scripts\eval_violence_model.py
```
Output: `training/evaluation/violence_model_comparison_report.json`

### Step 6: ONNX Export & Numeric Parity Verification
Exports PyTorch weights to ONNX format (opset 14) and verifies maximum absolute difference against PyTorch:
```powershell
python training\scripts\export_violence_onnx.py --ckpt training/checkpoints/violence_r2plus1d_finetuned.pt --output training/checkpoints/violence_r2plus1d_finetuned.onnx
```

### Rollback / Recovery Plan
If the candidate checkpoint fails validation or exhibits unexpected behavior, revert to the baseline immediately:
```powershell
# Restore baseline model
Copy-Item training\checkpoints\violence_r2plus1d_finetuned_backup.pt training\checkpoints\violence_r2plus1d_finetuned.pt -Force
```

---

## 7. Phase 7: Automated Test Suite Execution
Executes the comprehensive automated test suite covering all requirements:

```powershell
# Python backend and pipeline test suite
pytest -v tests\test_pipeline.py
pytest -v tests\test_violence_detection.py

# Frontend TypeScript logic and storage library test suite
npm test
```
Expected output: **All tests passing (19 pipeline + 9 violence + 34 frontend = 62 passed)**.

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
