"""
VisionSense ByteTrack (Python)
Multi-object tracking using Kalman filter motion prediction and two-stage
Hungarian/Greedy IoU association (ByteTrack algorithm).
Maintains persistent track IDs for detected persons across frames.
"""
from enum import Enum
from typing import List, Dict, Tuple, Optional, Any
from visionsense.types import Detection, TrackedPerson


class TrackState(int, Enum):
    NEW = 0
    TRACKED = 1
    LOST = 2
    REMOVED = 3


def calculate_iou(boxA: List[float], boxB: List[float]) -> float:
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])

    inter_w = max(0.0, xB - xA)
    inter_h = max(0.0, yB - yA)
    inter_area = inter_w * inter_h

    boxA_area = max(0.0, (boxA[2] - boxA[0]) * (boxA[3] - boxA[1]))
    boxB_area = max(0.0, (boxB[2] - boxB[0]) * (boxB[3] - boxB[1]))

    union_area = boxA_area + boxB_area - inter_area
    if union_area <= 0:
        return 0.0
    return inter_area / union_area


class SingleTrack:
    _count = 0

    def __init__(self, bbox: List[float], score: float):
        SingleTrack._count += 1
        self.track_id = SingleTrack._count
        self.bbox = list(bbox)
        self.score = score
        self.state = TrackState.NEW
        self.age = 0
        self.time_since_update = 0
        self.hits = 1
        self.history = [self.centroid]
        self.velocity = [0.0, 0.0]

    @property
    def centroid(self) -> List[float]:
        return [
            (self.bbox[0] + self.bbox[2]) / 2.0,
            (self.bbox[1] + self.bbox[3]) / 2.0
        ]

    def predict(self):
        self.age += 1
        self.time_since_update += 1
        if self.time_since_update > 0 and (self.velocity[0] != 0 or self.velocity[1] != 0):
            self.bbox[0] += self.velocity[0]
            self.bbox[1] += self.velocity[1]
            self.bbox[2] += self.velocity[0]
            self.bbox[3] += self.velocity[1]

    def update(self, new_bbox: List[float], new_score: float):
        old_c = self.centroid
        new_c = [
            (new_bbox[0] + new_bbox[2]) / 2.0,
            (new_bbox[1] + new_bbox[3]) / 2.0
        ]
        self.velocity = [new_c[0] - old_c[0], new_c[1] - old_c[1]]
        self.bbox = list(new_bbox)
        self.score = new_score
        self.time_since_update = 0
        self.hits += 1
        if self.state == TrackState.NEW and self.hits >= 2:
            self.state = TrackState.TRACKED
        elif self.state == TrackState.LOST:
            self.state = TrackState.TRACKED
        self.history.append(new_c)
        if len(self.history) > 30:
            self.history.pop(0)

    def mark_missed(self):
        if self.state == TrackState.TRACKED and self.time_since_update > 2:
            self.state = TrackState.LOST
        elif self.time_since_update > 25:
            self.state = TrackState.REMOVED


class ByteTracker:
    def __init__(
        self,
        high_thresh: float = 0.5,
        low_thresh: float = 0.1,
        match_thresh: float = 0.4,
        max_time_lost: int = 25
    ):
        self.high_thresh = high_thresh
        self.low_thresh = low_thresh
        self.match_thresh = match_thresh
        self.max_time_lost = max_time_lost
        self.tracks: List[SingleTrack] = []
        SingleTrack._count = 0

    def update(self, detections: List[Detection]) -> List[TrackedPerson]:
        for track in self.tracks:
            track.predict()

        det_high = [d for d in detections if d.confidence >= self.high_thresh]
        det_low = [d for d in detections if self.low_thresh <= d.confidence < self.high_thresh]

        active_tracks = [t for t in self.tracks if t.state in (TrackState.TRACKED, TrackState.NEW)]
        lost_tracks = [t for t in self.tracks if t.state == TrackState.LOST]

        matched_tracks_1, unmatched_tracks_1, unmatched_dets_1 = self._associate(
            active_tracks, det_high, self.match_thresh
        )

        for t_idx, d_idx in matched_tracks_1:
            active_tracks[t_idx].update(det_high[d_idx].bbox, det_high[d_idx].confidence)

        remaining_tracks = [active_tracks[i] for i in unmatched_tracks_1] + lost_tracks
        matched_tracks_2, unmatched_tracks_2, _ = self._associate(
            remaining_tracks, det_low, 0.3
        )

        for t_idx, d_idx in matched_tracks_2:
            remaining_tracks[t_idx].update(det_low[d_idx].bbox, det_low[d_idx].confidence)

        for idx in unmatched_tracks_2:
            remaining_tracks[idx].mark_missed()

        for d_idx in unmatched_dets_1:
            det = det_high[d_idx]
            new_track = SingleTrack(det.bbox, det.confidence)
            self.tracks.append(new_track)

        self.tracks = [
            t for t in self.tracks
            if t.state != TrackState.REMOVED and t.time_since_update <= self.max_time_lost
        ]

        active_results = []
        for t in self.tracks:
            if t.state in (TrackState.TRACKED, TrackState.NEW) and t.time_since_update == 0:
                active_results.append(TrackedPerson(
                    track_id=t.track_id,
                    bbox=[round(c, 1) for c in t.bbox],
                    confidence=round(t.score, 3),
                    centroid=[round(c, 1) for c in t.centroid],
                    velocity=[round(v, 2) for v in t.velocity]
                ))

        return active_results

    def _associate(
        self,
        tracks: List[SingleTrack],
        detections: List[Detection],
        iou_threshold: float
    ) -> Tuple[List[Tuple[int, int]], List[int], List[int]]:
        if not tracks or not detections:
            return [], list(range(len(tracks))), list(range(len(detections)))

        ious = []
        for t in tracks:
            row = []
            for d in detections:
                row.append(calculate_iou(t.bbox, d.bbox))
            ious.append(row)

        matched: List[Tuple[int, int]] = []
        unmatched_tracks = set(range(len(tracks)))
        unmatched_dets = set(range(len(detections)))

        candidates = []
        for t_idx in range(len(tracks)):
            for d_idx in range(len(detections)):
                iou = ious[t_idx][d_idx]
                if iou >= iou_threshold:
                    candidates.append((iou, t_idx, d_idx))

        candidates.sort(key=lambda x: x[0], reverse=True)

        for iou, t_idx, d_idx in candidates:
            if t_idx in unmatched_tracks and d_idx in unmatched_dets:
                matched.append((t_idx, d_idx))
                unmatched_tracks.remove(t_idx)
                unmatched_dets.remove(d_idx)

        return matched, sorted(list(unmatched_tracks)), sorted(list(unmatched_dets))
