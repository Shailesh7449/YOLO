# VisionSense AI — Violence False Positive Root Cause Analysis

**Date:** 2026-10-26  
**Investigator:** VisionSense Senior Computer Vision & Full-Stack AI Engineer  
**Target Incident:** False violence alert displayed at video timestamp `00:00.0` with `~89.9% confidence` on `video_1792958388239_V_1.mp4`

---

## 1. Incident Overview & Visual Reproduction

When loading the video file `video_1792958388239_V_1.mp4` into the VisionSense Security Operations Center dashboard, the interface immediately displays:
- Active People Count: 2
- Detection: YOLO26n ONNX with ByteTrack ID tracking
- Motion: Lucas-Kanade Dense Optical Flow
- **Critical Alert at `00:00.0`:** `CRITICAL ALERT: Physical Altercation/Violence Detected (89.9% conf, R(2+1)D-18 High-Accuracy (RWF-2000))`

### Visible Reality at Timestamp `00:00.0`
Inspection of the ground truth frame at `00:00.0` (`scratch/v1_frame0.jpg`) reveals:
1. Two adult males in an indoor office/classroom setting with wood-paneled walls.
2. Male 1 (Track 41) is standing calmly in the center, looking down at his mobile phone.
3. Male 2 (Track 42) is casually walking past him in the foreground.
4. Optical flow motion score is `0.03` (negligible motion).
5. **There is zero physical violence, aggression, or altercation at `00:00.0`.**
6. Physical grappling only initiates at approximately `00:02.8` to `00:04.0`.

---

## 2. Technical Code Audit & Fourfold Root Cause

### Root Cause 1: Video-Level Pre-Check Triggering Premature Frame-0 Alert
In [`src/server/videoAnalyzer.ts`](file:///d:/spidy/YOLO/src/server/videoAnalyzer.ts#L296-L314), the server-side analysis pipeline executed a pre-check before iterating through video frames:
```typescript
// videoAnalyzer.ts (Lines 296-314)
const vRes = await fetch('http://127.0.0.1:5050/api/violence/predict', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ videoPath, source_id: filename }),
  signal: AbortSignal.timeout(12000),
});
if (vRes.ok) {
  const vData = await vRes.json();
  clipViolencePrediction = vData?.prediction || null;
}
```
In [`visionsense/server.py`](file:///d:/spidy/YOLO/visionsense/server.py#L290-L320), the endpoint `/api/violence/predict` sampled 32 frames uniformly across the **entire 6.68-second video** (`np.linspace(0, total_frames - 1, 32)`). Because a genuine scuffle occurs between seconds 3.5 and 6.0, the whole-clip classifier returned `is_violence: true` with `0.8994` (89.9%) confidence.

Then, inside the frame extraction loop in [`src/server/videoAnalyzer.ts`](file:///d:/spidy/YOLO/src/server/videoAnalyzer.ts#L624-L638):
```typescript
if (clipViolencePrediction?.is_violence && !violenceAlertTriggered) {
  violenceAlertTriggered = true;
  const vAlert = {
    id: `alert-violence-${frameIndex}`,
    type: 'VIOLENCE_DETECTED' as const,
    severity: 'CRITICAL' as const,
    message: `CRITICAL ALERT: Physical Altercation/Violence Detected (${(clipViolencePrediction.confidence * 100).toFixed(1)}% conf, ${clipViolencePrediction.model_name})`,
    timestamp: targetTime, // targetTime = 0.0s on first iteration (i = 0)
    frame: frameIndex,     // frameIndex = 0
    peopleCount,
    motionScore,
  };
  frameAlerts.push(vAlert);
  allAlerts.push(vAlert);
}
```
Because `violenceAlertTriggered` was initially `false`, the alert was assigned to `frameIndex: 0` and `timestamp: 0.0s`. When the telemetry was loaded into the player, the alert fired at `00:00.0`.

---

### Root Cause 2: Violation of Temporal Window Accumulation
Video action recognition requires spatio-temporal context. At timestamp `00:00.0`, the system has processed exactly **one single video frame**.
- Evaluating human kinetic actions requires observing temporal changes over a 2.5–4.0 second sliding window.
- Declaring a `CRITICAL` alert at $t = 0.0\text{s}$ violates action recognition theory. At $t = 0.0\text{s}$, the system state must strictly be `ANALYZING` or `INSUFFICIENT TEMPORAL EVIDENCE`.

---

### Root Cause 3: 3D CNN Out-of-Distribution Bias on Static Frames
When testing the fine-tuned `R(2+1)D-18` and `X3D-M` models on static or near-stationary frames, we discovered an out-of-distribution artifact:
- Passing 32 identical, repeated frames (zero motion) yielded:
  - `P(Violence) = 92.66%` on `R(2+1)D-18`
  - `P(Violence) = 99.91%` on `X3D-M`
- **Explanation:** 3D CNN spatio-temporal convolutions rely on temporal gradients $\frac{\partial I}{\partial t}$. When consecutive frames have zero motion, temporal feature maps collapse, and the model defaults to background spatial features and bias weights. Action recognition models must be gated with kinetic optical flow verification to ensure physical movement is present before accepting an action classification.

---

### Root Cause 4: Video-Level Classification vs. Person-Level Participant Tracking
The R(2+1)D-18 model outputs a single global video probability $P(\text{Violence})$. It does not predict bounding boxes or track IDs. 
Previously:
- There was no evidence-based association between the video classification and individual ByteTrack tracks.
- All bounding boxes remained uniformly cyan/blue (`#00f0ff`), leaving operators unable to identify who was fighting versus who was a peaceful bystander.

---

## 3. Systematic Corrective Actions

| Defect | Root Cause | Engineering Fix |
| :--- | :--- | :--- |
| **Alert at `00:00.0`** | Whole-clip pre-check attached to frame 0 | Eliminate single clip pre-check for timeline alerts; use rolling temporal windowing matching real timestamps. |
| **Premature Decision** | Instant evaluation without temporal span | Enforce minimum window accumulation (16–32 frames, spanning $\ge 2.5\text{s}$). Display `ANALYZING` until window is full. |
| **Static False Alarms** | 3D CNN bias on zero-motion inputs | Kinetic gating: Require dense optical flow motion score $\ge 0.08$ and consecutive positive temporal windows ($N \ge 2$). |
| **Generic Blue Boxes** | Video-level classifier lacks track association | Implement spatial proximity, bounding box overlap, and velocity perturbation matching to flag participants in RED (`#ef4444`) and bystanders in BLUE. Automatically clear back to BLUE on resolution. |
