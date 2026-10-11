# VisionSense Complete Codebase Audit

## 1. Frontend Structure
**WORKING** - Modern React + Vite setup. Clean component separation (`src/components/`). UI is responsive and styled using TailwindCSS.

## 2. Backend/API Structure
**WORKING (with caveats)** - `server.ts` uses Express to provide video transcoding and range streaming endpoints.
**NEEDS FIXING** - The backend explicitly hardcodes `/usr/bin/ffmpeg` in `spawn()`. Since you are on Windows, this will throw an `ENOENT` error and fail when attempting to transcode videos. We must fix it to just use `'ffmpeg'` or the correct path.

## 3. YOLO Implementation
**WORKING (REAL)** - Completely real implementation using `@tensorflow-models/coco-ssd` (mobilenet_v2) running in the browser. It accurately filters for the "person" class (`classId: 0`) and generates real bounding boxes. 

## 4. ByteTrack Implementation
**WORKING (REAL)** - Custom TypeScript implementation in `src/tracking/bytetrack.ts`. It executes proper SORT/ByteTrack algorithms utilizing spatial IoU and linear assignment to maintain stable identities across frames.

## 5. Video Loading and Playback
**BROKEN / NEEDS FIXING** - Video handling is prone to silent failures. When a video fails to play (e.g., an unsupported codec like H.265 in Chrome), it skips loading.

## 6. Video Processing Pipeline
**WORKING** - `processFrame` handles a robust pipeline (Detection -> Tracking -> Optical Flow -> Line Crossing -> Heatmap -> Telemetry).

## 7. Bounding-Box Rendering
**WORKING (REAL)** - Boxes are dynamically drawn on a canvas layer matching exactly the outputs of the YOLO + ByteTrack algorithms.

## 8. Track-ID Rendering
**WORKING (REAL)** - Text labels displaying "Person ID: X" and confidence % are dynamically rendered onto the canvas.

## 9. People Counting
**WORKING (REAL)** - Utilizes `LineCounter` to track bidirectional crossing events using object centroids and trajectories.

## 10. Dense Optical Flow
**WORKING (REAL)** - Custom CPU-based Lucas-Kanade optical flow implementation (`src/cv/denseOpticalFlow.ts`). It computes motion vectors using a 48x27 downscaled grayscale grid and extracts motion intensity properly.

## 11. Temporal Movement Analysis
**WORKING** - Real logic parsing crowd statistics and flow intensity to categorize movement behavior.

## 12. Crowd Safety Logic
**WORKING** - Simple but effective thresholding (`people_count > 20` triggers a WARNING status).

## 13. Alert Generation
**WORKING** - Event-based alerts push into an array rendered by the UI.

## 14. Analytics
**WORKING** - Real heatmap generator using accumulated coordinate tracking, plus a `TelemetryStore` populating dashboards.

## 15. Report/Export Functionality
**WORKING** - `ExportModal.tsx` provides functionality to dump generated analytics.

## 16. Video Encoding/Output
**WORKING** - Frontend uses `MediaRecorder` to record the annotated canvas and POSTs it back to `server.ts` to be repackaged by FFmpeg. (Subject to the `/usr/bin/ffmpeg` bug mentioned above).

## 17. package.json and Dependencies
**WORKING** - Dependencies align with the Vite stack and `@tensorflow/tfjs` integration.

## 18. Any mock/fake/random data
**FAKE/MOCK INCLUDED** - The system has mock feeds under `src/simulation/scenes.ts` (`cctv_normal`, `cctv_surge`, `synthetic`, `bus_demo`). 

## 19. Current Runtime Errors
**NEEDS FIXING** - The silent fallback bug you mentioned:
When `crowded.mp4` is loaded into the HTML5 video element, if it uses a codec that Chrome rejects (like H.265), the video `readyState` never reaches `2` (HAVE_CURRENT_DATA). 
Because `App.tsx` requires `videoElement.readyState >= 2` to process real frames, it silently falls into the `else` block which defaults to:
`const activeScene = scenesRef.current[currentSceneId] || scenesRef.current.cctv_normal;`
This silently overwrites the background and detections with the fake `cctv_normal` concourse scene!

## 20. Browser Console Errors
**NEEDS FIXING** - If the YOLO model fails to fetch from the internet, the `YoloPersonDetector` fails gracefully but never recovers. 

---

### Conclusion on your specific requests:
1. **The Silent Fallback:** It is exactly as you described. The `if (readyState >= 2)` block in `App.tsx` rejects the unplayable video and silently uses the fallback simulation `cctv_normal`. This makes it *look* like it's analyzing a CCTV feed, but it's completely fake.
2. **YOLO + ByteTrack:** These are **100% REAL**. If we feed a playable video (or successfully transcode one), the boxes, IDs, flow vectors, and counts come from actual computer vision math and neural networks.
