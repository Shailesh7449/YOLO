"""
VisionSense Data Types and Schemas (Python)
"""
from dataclasses import dataclass, field, asdict
from typing import List, Dict, Optional, Any
from enum import Enum


class CrowdStatus(str, Enum):
    NORMAL = "NORMAL"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"


@dataclass
class Detection:
    bbox: List[float]  # [x1, y1, x2, y2]
    confidence: float
    class_id: int = 0
    class_name: str = "person"

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class TrackedPerson:
    track_id: int
    bbox: List[float]  # [x1, y1, x2, y2]
    confidence: float
    centroid: List[float]  # [cx, cy]
    velocity: List[float] = field(default_factory=lambda: [0.0, 0.0])
    stationary_frames: int = 0
    is_violence_participant: bool = False
    participant_role: str = "BYSTANDER"
    violence_association_conf: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class FlowMetrics:
    motion_score: float
    avg_velocity_x: float
    avg_velocity_y: float
    motion_magnitude: float
    directional_dispersion: float
    active_motion_pixels: int

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class TemporalAnalysisResult:
    anomaly_detected: bool
    unusual_movement_score: float
    anomaly_type: Optional[str]
    confidence: float
    persistence_counter: int
    model_type: str = "heuristic"

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class ViolencePrediction:
    label: str  # "VIOLENCE" | "NON_VIOLENCE"
    is_violence: bool
    confidence: float
    start_timestamp: float
    end_timestamp: float
    source_id: str
    model_name: str
    model_version: str = "v1.0.0"
    status: str = "SUCCESS"
    error_details: Optional[str] = None
    latency_ms: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class Alert:
    id: str
    timestamp: float
    time_formatted: str
    severity: str  # "WARNING", "CRITICAL", "INFO"
    title: str
    message: str
    people_count: int
    acknowledged: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class TelemetryFrame:
    frame_index: int
    timestamp: float
    people_count: int
    crowd_status: CrowdStatus
    detections: List[Dict[str, Any]]
    tracks: List[Dict[str, Any]]
    motion_metrics: Dict[str, Any]
    temporal_analysis: Dict[str, Any]
    alerts: List[Dict[str, Any]]
    fps: float
    is_eof: bool = False
    violence_prediction: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        data = asdict(self)
        data["crowd_status"] = self.crowd_status.value
        return data


@dataclass
class StorageDrive:
    letter: str
    name: str
    type: str  # "Removable", "Local Disk", "Network", "RAM Disk"
    is_removable: bool
    total_gb: float
    free_gb: float
    used_gb: float
    usage_percent: float

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class StorageFileItem:
    name: str
    path: str
    extension: str
    type: str  # "video" | "image"
    size_bytes: int
    size_formatted: str
    modified_time: str
    is_too_large: bool = False
    warning: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class StorageFolderItem:
    name: str
    path: str
    item_count: int

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class BreadcrumbItem:
    label: str
    path: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)
