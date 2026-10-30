"""
VisionSense Video & Image Processing Pipeline (Python)
End-to-end execution:
Video -> Frame Extraction -> YOLO Person Detection -> ByteTrack ->
People Counting -> Dense Optical Flow -> Temporal Movement Analysis ->
Safety Engine -> Real-Time Telemetry & Alerts.
Processes every video completely until actual EOF (100%).
"""
import os
import time
import json
from typing import Dict, List, Optional, Any, Callable
from visionsense.types import (
    Detection, TrackedPerson, FlowMetrics, TemporalAnalysisResult,
    Alert, TelemetryFrame, CrowdStatus
)
from visionsense.detector import YOLOPersonDetector
from visionsense.bytetrack import ByteTracker
from visionsense.optical_flow import DenseOpticalFlow
from visionsense.temporal_analysis import TemporalMovementAnalysis
from visionsense.safety_engine import SafetyEngine


def analyze_image_file(
    image_path: str,
    crowd_threshold: int = 20,
    conf_threshold: float = 0.28
) -> Dict[str, Any]:
    start_time = time.time()
    detector = YOLOPersonDetector(conf_threshold=conf_threshold)
    det_meta = detector.get_metadata()

    img_w, img_h = 1280, 720
    try:
        import cv2
        if os.path.exists(image_path):
            mat = cv2.imread(image_path)
            if mat is not None:
                img_h, img_w = mat.shape[:2]
                detections = detector.detect(mat)
            else:
                detections = detector.detect(image_path)
        else:
            detections = detector.detect(image_path)
    except Exception:
        detections = detector.detect(image_path)

    people_count = len(detections)
    inference_ms = round((time.time() - start_time) * 1000, 1)

    # EXACT CROWD SAFETY RULE: people_count <= 20 -> NORMAL; people_count > 20 -> WARNING
    crowd_status = "WARNING" if people_count > crowd_threshold else "NORMAL"

    alerts = []
    if people_count > crowd_threshold:
        alerts.append({
            "id": f"img-alert-{int(time.time())}",
            "timestamp": 0.0,
            "time_formatted": "00:00.00",
            "severity": "WARNING",
            "title": "Crowd threshold exceeded",
            "message": f"High density detected: {people_count} individuals present (Threshold: {crowd_threshold})",
            "people_count": people_count
        })

    return {
        "success": True,
        "filename": os.path.basename(image_path),
        "dimensions": {"width": img_w, "height": img_h},
        "people_count": people_count,
        "crowd_status": crowd_status,
        "crowd_threshold": crowd_threshold,
        "inference_time_ms": inference_ms,
        "model_used": det_meta["name"],
        "model_info": det_meta,
        "detections": [d.to_dict() for d in detections],
        "alerts": alerts,
        "analysis_type": "spatial_only",
        "note": "Static image: spatial density and bounding boxes evaluated without temporal tracking."
    }


def analyze_video_file(
    video_path: str,
    crowd_threshold: int = 20,
    target_ai_fps: float = 8.0,
    enable_violence: bool = True,
    violence_detector: Optional[Any] = None,
    on_frame_callback: Optional[Callable[[Dict[str, Any]], None]] = None,
    save_telemetry_file: bool = True
) -> Dict[str, Any]:
    try:
        import cv2
    except ImportError:
        raise RuntimeError("OpenCV (cv2) is required for video analysis pipeline.")

    if not os.path.exists(video_path):
        raise FileNotFoundError(f"Video file not found: {video_path}")

    size_bytes = os.path.getsize(video_path)
    if size_bytes > 500 * 1024 * 1024:
        raise ValueError(f"FILE TOO LARGE. Maximum supported size: 500 MB (File is {size_bytes / (1024*1024):.1f} MB)")

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open video stream: {video_path}")

    native_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    video_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 1280)
    video_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 720)
    video_duration = (total_frames / native_fps) if total_frames > 0 and native_fps > 0 else 0.0

    frame_stride = max(1, int(round(native_fps / target_ai_fps)))

    detector = YOLOPersonDetector()
    tracker = ByteTracker(high_thresh=0.45, low_thresh=0.1)
    optical_flow = DenseOpticalFlow(grid_w=48, grid_h=27)
    temporal_analysis = TemporalMovementAnalysis(window_size=24)
    safety_engine = SafetyEngine(crowd_threshold=crowd_threshold, persistence_frames=3)

    violence_det = None
    if enable_violence:
        try:
            if violence_detector is not None:
                violence_det = violence_detector
            else:
                from visionsense.violence_detector import ViolenceDetector
                violence_det = ViolenceDetector()
        except Exception as e:
            print(f"[Pipeline] ViolenceDetector initialization skipped: {e}")

    if violence_det is not None:
        violence_det.reset()

    telemetry_frames: List[Dict[str, Any]] = []
    frame_idx = 0
    processed_count = 0
    start_wall_time = time.time()
    last_timestamp = 0.0
    is_true_eof = False

    while True:
        ret, frame = cap.read()
        if not ret or frame is None:
            # Reached true End-Of-File (EOF)
            is_true_eof = True
            break

        current_timestamp = frame_idx / native_fps
        last_timestamp = current_timestamp

        if frame_idx % frame_stride == 0:
            detections = detector.detect(frame, video_width, video_height)
            people_count = len(detections)

            tracked_persons = tracker.update(detections)
            flow_metrics = optical_flow.calculate_flow(frame)
            temporal_res = temporal_analysis.update(people_count, flow_metrics)

            crowd_status, new_alerts = safety_engine.evaluate_frame(
                people_count=people_count,
                timestamp=current_timestamp,
                unusual_movement_score=temporal_res.unusual_movement_score,
                anomaly_type=temporal_res.anomaly_type
            )

            # Ingest frame into video-action violence detector
            v_pred = None
            if violence_det is not None:
                track_dicts = [t.to_dict() for t in tracked_persons]
                v_pred, v_trigger = violence_det.ingest_stream_frame(
                    frame,
                    timestamp=current_timestamp,
                    source_id=os.path.basename(video_path),
                    stride_frames=frame_stride,
                    tracks=track_dicts
                )
                # Dynamic Red/Blue Participant Assignment:
                # Active altercation participants marked is_violence_participant = True (RED)
                # Bystanders / normal pedestrians retain is_violence_participant = False (BLUE)
                if v_pred and v_pred.participant_track_ids and v_pred.is_violence:
                    participant_set = set(v_pred.participant_track_ids)
                    for t in tracked_persons:
                        if t.track_id in participant_set:
                            t.is_violence_participant = True
                            t.participant_role = "POTENTIAL VIOLENCE PARTICIPANT"
                            t.violence_association_conf = 0.90
                        else:
                            t.is_violence_participant = False
                            t.participant_role = "BYSTANDER"
                            t.violence_association_conf = 0.10
                else:
                    for t in tracked_persons:
                        t.is_violence_participant = False
                        t.participant_role = "BYSTANDER"
                        t.violence_association_conf = 0.0

                if v_trigger == "VIOLENCE_INCIDENT_STARTED" and v_pred is not None:
                    minutes = int(current_timestamp // 60)
                    seconds = int(current_timestamp % 60)
                    hundredths = int((current_timestamp % 1) * 100)
                    v_alert = Alert(
                        id=f"violence-{int(current_timestamp * 1000)}",
                        timestamp=round(current_timestamp, 3),
                        time_formatted=f"{minutes:02d}:{seconds:02d}.{hundredths:02d}",
                        severity="CRITICAL",
                        title="Physical Violence Detected",
                        message=f"Physical altercation/violence detected (Confidence: {v_pred.confidence * 100:.1f}%, Model: {v_pred.model_name})",
                        people_count=people_count,
                        acknowledged=False
                    )
                    new_alerts.append(v_alert)
                    safety_engine.alerts_history.append(v_alert)

            frame_telemetry = TelemetryFrame(
                frame_index=frame_idx,
                timestamp=round(current_timestamp, 3),
                people_count=people_count,
                crowd_status=crowd_status,
                detections=[d.to_dict() for d in detections],
                tracks=[t.to_dict() for t in tracked_persons],
                motion_metrics=flow_metrics.to_dict(),
                temporal_analysis=temporal_res.to_dict(),
                alerts=[a.to_dict() for a in new_alerts],
                fps=round(native_fps, 1),
                is_eof=False,
                violence_prediction=v_pred.to_dict() if v_pred else None
            ).to_dict()

            telemetry_frames.append(frame_telemetry)
            processed_count += 1

            if on_frame_callback:
                on_frame_callback(frame_telemetry)

        frame_idx += 1

    cap.release()
    total_analysis_time = time.time() - start_wall_time

    if is_true_eof:
        completion_percentage = 100.0
        status_text = "PROCESSING COMPLETE"
    else:
        completion_percentage = round((last_timestamp / video_duration) * 100, 1) if video_duration > 0 else 0.0
        status_text = "PROCESSING INCOMPLETE"

    result = {
        "success": True,
        "filename": os.path.basename(video_path),
        "video_duration_seconds": round(video_duration, 2),
        "last_processed_timestamp": round(last_timestamp, 2),
        "completion_percentage": completion_percentage,
        "status": status_text,
        "total_frames_sampled": processed_count,
        "native_fps": round(native_fps, 2),
        "resolution": {"width": video_width, "height": video_height},
        "crowd_threshold": crowd_threshold,
        "model_info": detector.get_metadata(),
        "temporal_info": temporal_analysis.get_metadata(),
        "violence_info": violence_det.get_status() if violence_det else {"ready": False, "status": "disabled"},
        "total_alerts": len(safety_engine.alerts_history),
        "alerts_history": [a.to_dict() for a in safety_engine.alerts_history],
        "telemetry_frames_count": len(telemetry_frames),
        "telemetry": telemetry_frames
    }

    if save_telemetry_file:
        telemetry_dir = os.path.abspath("uploads/telemetry")
        os.makedirs(telemetry_dir, exist_ok=True)
        out_name = f"{os.path.basename(video_path)}.json"
        out_path = os.path.join(telemetry_dir, out_name)
        with open(out_path, "w") as f:
            json.dump(result, f, indent=2)

    return result
