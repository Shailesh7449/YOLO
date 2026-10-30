# VisionSense AI — Person Participant Association: Methodology & Limitations

**Document ID:** VS-TECH-2026-PPA  
**Classification:** Engineering Specification & Known Operational Boundaries

---

## 1. The Core Scientific Challenge

Modern 3D Convolutional Neural Networks for video action recognition (including R(2+1)D-18, X3D-M, and SlowFast) operate at the **clip level**. Given an input tensor $[B, C, T, H, W]$, the network outputs a global vector of class probabilities $[P(\text{Violence}), P(\text{Non-Violence})]$.

The network does **not** generate spatial bounding boxes, action tubes, or person-level attention heatmaps by default. Consequently, asserting that *specific* individuals in a surveillance scene are participants requires a defensible, multi-modal mapping layer.

---

## 2. Evidence-Based Association Methodology

VisionSense implements a multi-cue association algorithm combining spatial geometry, tracking continuity, and kinetic optical flow:

$$\text{Participant Score}(i) = \alpha \cdot \text{Proximity}(i) + \beta \cdot \text{Kinetic}(i) + \gamma \cdot \text{TemporalOverlap}(i)$$

### 1. Spatial Interaction Clustering
- Two people engaged in a physical fight (striking, grappling, pushing) necessarily occupy overlapping or adjacent bounding boxes.
- Let track $i$ have bounding box $B_i = [x_1, y_1, x_2, y_2]$ and centroid $c_i = [\frac{x_1+x_2}{2}, \frac{y_1+y_2}{2}]$.
- For every track pair $(i, j)$, calculate:
  - Bounding Box Intersection: $\text{IoU}(B_i, B_j) > 0$ or margin distance $< 20\text{ px}$.
  - Normalized Centroid Distance: $d(i, j) = \frac{\|c_i - c_j\|_2}{\max(h_i, h_j)}$.
- If $d(i, j) \le 1.25$ or bounding boxes intersect, tracks $i$ and $j$ form an **Interaction Cluster**.

### 2. Kinetic Velocity Perturbation
- Non-violent walking exhibits smooth, directional linear velocity $\vec{v}$.
- Physical fights exhibit sudden, erratic directional changes ($\frac{d\vec{v}}{dt} > \sigma_{\text{fight}}$) and elevated local optical flow.
- Tracks in an Interaction Cluster displaying velocity variance above threshold are flagged as **`VIOLENCE EVENT PARTICIPANTS`** (**RED**).

### 3. Bystander Protection
- Tracked persons outside the interaction cluster ($d > 1.5 \times H$) with normal, linear trajectories are classified as **`BYSTANDERS`** and remain **BLUE**.

---

## 3. Known Edge Cases & Documented Limitations

While this evidence-based mapping significantly outperforms naive whole-frame highlighting, operators and safety auditors must account for the following documented limitations:

### 1. Close-Contact Non-Combatants
- **Scenario:** A peaceful bystander or security personnel stepping in to break up a scuffle, or individuals in tightly packed environments (e.g. crowded elevators, revolving doors).
- **Limitation:** The spatial proximity filter may initially include a mediator or bystander who is physically pressed against a combatant before the cooldown period separates them.

### 2. Severe Tracking Occlusion & ID Swaps
- **Scenario:** During ground grappling or wrestling, two people's bodies overlap substantially for multiple consecutive frames.
- **Limitation:** ByteTrack Kalman filtering may temporarily merge both bounding boxes into a single persistent track, or exchange track IDs upon separation. The participant association preserves red highlighting on the survivor track, but ID continuity may be disrupted.

### 3. Asymmetric Attacks & Solitary Aggressors
- **Scenario:** A sudden strike from behind followed by immediate flight, where one individual falls down and the other flees.
- **Limitation:** If the fleeing aggressor exits the frame within 1–2 seconds, only the remaining fallen individual may be present on screen during the subsequent confirmation window.

### 4. Camera Shake & Structural Vibration
- **Scenario:** High-wind gusts shaking an outdoor CCTV pole or an operator bumping an indoor surveillance mount.
- **Limitation:** Whole-frame camera shake creates uniform high optical flow. While the kinetic gate requires spatial clustering, extreme camera vibration combined with dense pedestrian traffic can increase false-positive suspicion scores.

---

## 4. Future Roadmap: Spatio-Temporal Action Tubes

To move beyond geometric and kinetic clustering, future VisionSense iterations will explore:
1. **Pose-Graph Interaction Networks:** Extracting 2D skeleton keypoints (e.g. YOLO-Pose) to classify limb trajectories, chokeholds, and strike impacts.
2. **ACRN / AVA Spatio-Temporal Action Tubes:** Training an end-to-end actor-centric action detector that outputs person-specific action vectors directly from ROI-aligned 3D convolutional feature maps.
