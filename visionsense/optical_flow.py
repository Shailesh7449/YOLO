"""
VisionSense Dense Optical Flow (Python)
"""
from visionsense.types import FlowMetrics

class DenseOpticalFlow:
    def __init__(self, grid_w: int = 48, grid_h: int = 27):
        self.grid_w = grid_w
        self.grid_h = grid_h
        self.prev_gray = None

    def calculate_flow(self, current_frame_bgr_or_rgb) -> FlowMetrics:
        try:
            import cv2
            import numpy as np

            if len(current_frame_bgr_or_rgb.shape) == 3:
                curr_gray = cv2.cvtColor(current_frame_bgr_or_rgb, cv2.COLOR_BGR2GRAY)
            else:
                curr_gray = current_frame_bgr_or_rgb

            small_gray = cv2.resize(curr_gray, (self.grid_w, self.grid_h), interpolation=cv2.INTER_AREA)

            if self.prev_gray is None or self.prev_gray.shape != small_gray.shape:
                self.prev_gray = small_gray
                return FlowMetrics(0.0, 0.0, 0.0, 0.0, 0.0, 0)

            flow = cv2.calcOpticalFlowFarneback(
                self.prev_gray, small_gray, None, 0.5, 3, 15, 3, 5, 1.2, 0
            )
            self.prev_gray = small_gray

            fx, fy = flow[..., 0], flow[..., 1]
            magnitude, angle = cv2.cartToPolar(fx, fy)

            motion_mask = magnitude > 0.4
            active_count = int(np.sum(motion_mask))
            total_pixels = self.grid_w * self.grid_h

            if active_count == 0:
                return FlowMetrics(0.0, 0.0, 0.0, 0.0, 0.0, 0)

            mean_mag = float(np.mean(magnitude[motion_mask]))
            mean_fx = float(np.mean(fx[motion_mask]))
            mean_fy = float(np.mean(fy[motion_mask]))
            angles = angle[motion_mask]
            dispersion = float(np.std(angles)) if len(angles) > 1 else 0.0

            density_factor = active_count / total_pixels
            motion_score = min(1.0, (mean_mag / 5.0) * 0.7 + density_factor * 0.3)

            return FlowMetrics(
                motion_score=round(motion_score, 3),
                avg_velocity_x=round(mean_fx, 2),
                avg_velocity_y=round(mean_fy, 2),
                motion_magnitude=round(mean_mag, 2),
                directional_dispersion=round(dispersion, 3),
                active_motion_pixels=active_count
            )
        except Exception:
            return FlowMetrics(0.0, 0.0, 0.0, 0.0, 0.0, 0)
