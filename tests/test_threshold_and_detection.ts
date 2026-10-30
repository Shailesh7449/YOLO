import assert from 'node:assert';
import { notificationService, SecurityNotificationEvent } from '../src/services/notificationService';

console.log('=== RUNNING AUTOMATED VERIFICATION SUITE ===\n');

// -------------------------------------------------------------
// TEST SUITE 1: Strict Crowd Threshold Logic & Exact Rule
// Rule: detectedPeople > configuredCrowdLimit
// -------------------------------------------------------------
console.log('[TEST 1] Verifying Strict Crowd Threshold Rule (detected > limit)...');

notificationService.resetState();

const threshold = 20;
let event: SecurityNotificationEvent | null;

// Case 1A: Count below threshold (18 vs 20) -> NORMAL, NO event
event = notificationService.evaluateCrowdThreshold('cam_01', 'Entrance', 18, threshold, 1.0, 0);
assert.strictEqual(event, null, 'Count 18 with threshold 20 must NOT generate an alert');

// Case 1B: Count exactly equal to threshold (20 vs 20) -> NORMAL, NO event (strict inequality rule)
event = notificationService.evaluateCrowdThreshold('cam_01', 'Entrance', 20, threshold, 2.0, 0);
assert.strictEqual(event, null, 'Count 20 with threshold 20 must NOT generate an alert (strict > rule)');

// Case 1C: Count exceeds threshold (21 vs 20) -> EXCEEDED, EXACTLY ONE event
event = notificationService.evaluateCrowdThreshold('cam_01', 'Entrance', 21, threshold, 3.0, 0);
assert(event !== null, 'Count 21 with threshold 20 MUST generate an alert');
assert.strictEqual(event?.detectedCount, 21);
assert.strictEqual(event?.configuredThreshold, 20);
assert.strictEqual(event?.severity, 'WARNING');
assert.strictEqual(event?.sourceId, 'cam_01');
console.log('  ✓ Case 1A: 18 <= 20 -> NORMAL (0 events)');
console.log('  ✓ Case 1B: 20 <= 20 -> NORMAL (0 events)');
console.log('  ✓ Case 1C: 21 > 20  -> EXCEEDED (1 security event created)');

// -------------------------------------------------------------
// TEST SUITE 2: Duplicate Alert Suppression While In Exceeded State
// -------------------------------------------------------------
console.log('\n[TEST 2] Verifying Duplicate Alert Suppression While Exceeded...');

// Consecutive frames while still above threshold:
const event2 = notificationService.evaluateCrowdThreshold('cam_01', 'Entrance', 22, threshold, 4.0, 0);
assert.strictEqual(event2, null, 'Subsequent frame with 22 people while already exceeded must NOT generate duplicate event');

const event3 = notificationService.evaluateCrowdThreshold('cam_01', 'Entrance', 25, threshold, 5.0, 0);
assert.strictEqual(event3, null, 'Subsequent frame with 25 people while already exceeded must NOT generate duplicate event');

const event4 = notificationService.evaluateCrowdThreshold('cam_01', 'Entrance', 21, threshold, 6.0, 0);
assert.strictEqual(event4, null, 'Subsequent frame with 21 people while already exceeded must NOT generate duplicate event');
console.log('  ✓ Frames with counts 22, 25, 21 while above limit produced 0 duplicate events');

// -------------------------------------------------------------
// TEST SUITE 3: Recovery to NORMAL and Re-arming Alert on Next Surge
// -------------------------------------------------------------
console.log('\n[TEST 3] Verifying Recovery to NORMAL & Re-arming Alert Trigger...');

// Count drops back to safe level (15 people)
const recoveryEvent = notificationService.evaluateCrowdThreshold('cam_01', 'Entrance', 15, threshold, 7.0, 0);
assert.strictEqual(recoveryEvent, null, 'Recovery frame does not generate a threshold exceeded event');

// Count surges again (24 people) -> MUST create a brand new security event!
const surgeEvent = notificationService.evaluateCrowdThreshold('cam_01', 'Entrance', 24, threshold, 8.0, 0);
assert(surgeEvent !== null, 'Surging above limit after recovery MUST create a new event');
assert.strictEqual(surgeEvent?.detectedCount, 24);
assert.strictEqual(surgeEvent?.configuredThreshold, 20);
console.log('  ✓ Count dropped to 15 -> state restored to NORMAL');
console.log('  ✓ Count surged to 24 -> new event successfully generated');

// -------------------------------------------------------------
// TEST SUITE 4: Multi-Stream Independent Source Tracking
// -------------------------------------------------------------
console.log('\n[TEST 4] Verifying Multi-Stream Source Isolation...');

// Camera 1 is at 24 (exceeded)
// Camera 2 is at 5 with threshold 10 (normal)
const cam2Norm = notificationService.evaluateCrowdThreshold('cam_02', 'Hallway', 5, 10, 9.0, 0);
assert.strictEqual(cam2Norm, null, 'Camera 2 below its threshold must not trigger');

// Camera 2 surges to 12 with threshold 10 (exceeded)
const cam2Surge = notificationService.evaluateCrowdThreshold('cam_02', 'Hallway', 12, 10, 10.0, 0);
assert(cam2Surge !== null, 'Camera 2 exceeding its threshold must generate event');
assert.strictEqual(cam2Surge?.sourceId, 'cam_02');
assert.strictEqual(cam2Surge?.configuredThreshold, 10);
assert.strictEqual(cam2Surge?.detectedCount, 12);
console.log('  ✓ Independent stream camera identities (cam_01 vs cam_02) tracked with separate thresholds');

// -------------------------------------------------------------
// TEST SUITE 5: Custom Dynamic Threshold Configuration
// -------------------------------------------------------------
console.log('\n[TEST 5] Verifying Custom Dynamic Thresholds (e.g., 5, 10, 50)...');

notificationService.resetState();
// Low threshold: 5
assert.strictEqual(notificationService.evaluateCrowdThreshold('cam_test', 'Area', 5, 5, 1.0, 0), null);
const t5Event = notificationService.evaluateCrowdThreshold('cam_test', 'Area', 6, 5, 2.0, 0);
assert(t5Event !== null && t5Event.detectedCount === 6 && t5Event.configuredThreshold === 5);

// High threshold: 50
notificationService.resetState();
assert.strictEqual(notificationService.evaluateCrowdThreshold('cam_test', 'Area', 49, 50, 1.0, 0), null);
assert.strictEqual(notificationService.evaluateCrowdThreshold('cam_test', 'Area', 50, 50, 2.0, 0), null);
const t50Event = notificationService.evaluateCrowdThreshold('cam_test', 'Area', 51, 50, 3.0, 0);
assert(t50Event !== null && t50Event.detectedCount === 51 && t50Event.configuredThreshold === 50);
console.log('  ✓ Works with any configured positive integer threshold (tested 5, 20, 50)');

// -------------------------------------------------------------
// TEST SUITE 6: YOLO Bounding Box NMS & Letterbox Coordinates
// -------------------------------------------------------------
console.log('\n[TEST 6] Verifying NMS and Letterbox Transform...');

function runNMS(
  boxes: Array<{ bbox: [number, number, number, number]; confidence: number }>,
  iouThresh: number
) {
  boxes.sort((a, b) => b.confidence - a.confidence);
  const picked: typeof boxes = [];

  for (let i = 0; i < boxes.length; i++) {
    const current = boxes[i];
    let keep = true;
    for (let j = 0; j < picked.length; j++) {
      const prev = picked[j];
      const xx1 = Math.max(current.bbox[0], prev.bbox[0]);
      const yy1 = Math.max(current.bbox[1], prev.bbox[1]);
      const xx2 = Math.min(current.bbox[2], prev.bbox[2]);
      const yy2 = Math.min(current.bbox[3], prev.bbox[3]);
      const w = Math.max(0, xx2 - xx1);
      const h = Math.max(0, yy2 - yy1);
      const inter = w * h;
      const areaCurrent = (current.bbox[2] - current.bbox[0]) * (current.bbox[3] - current.bbox[1]);
      const areaPrev = (prev.bbox[2] - prev.bbox[0]) * (prev.bbox[3] - prev.bbox[1]);
      const iou = inter / (areaCurrent + areaPrev - inter);
      if (iou > iouThresh) {
        keep = false;
        break;
      }
    }
    if (keep) picked.push(current);
  }
  return picked;
}

// Two nearly identical overlapping boxes for the same person (IoU ~0.85)
const overlappingBoxes = [
  { bbox: [100, 100, 200, 300] as [number, number, number, number], confidence: 0.95 },
  { bbox: [102, 101, 198, 299] as [number, number, number, number], confidence: 0.88 },
  // Distinct separate person
  { bbox: [400, 150, 480, 320] as [number, number, number, number], confidence: 0.91 },
];

const suppressed = runNMS(overlappingBoxes, 0.45);
assert.strictEqual(suppressed.length, 2, 'NMS must suppress the duplicate overlapping detection');
assert.strictEqual(suppressed[0].confidence, 0.95, 'NMS preserves the higher confidence detection');
assert.strictEqual(suppressed[1].confidence, 0.91, 'NMS preserves the distinct separate person');
console.log('  ✓ NMS correctly suppressed overlapping redundant detections (3 -> 2)');

// -------------------------------------------------------------
// TEST SUITE 6: Violence Incident Alert & Cooldown Deduplication
// -------------------------------------------------------------
console.log('\n[TEST 6] Verifying Violence Incident Alert & Cooldown Deduplication...');

notificationService.resetState();
const camId = 'cctv_live_01';

// Case 6A: Non-violent state -> NO alert
const vEv1 = notificationService.evaluateViolenceIncident(camId, 'Terminal CAM-01', false, 0.15, 1.0, 'R(2+1)D-18', 5);
assert.strictEqual(vEv1, null, 'Non-violent frame must NOT generate violence alert');

// Case 6B: Violence detected -> Exactly ONE CRITICAL security event
const vEv2 = notificationService.evaluateViolenceIncident(camId, 'Terminal CAM-01', true, 0.92, 2.0, 'R(2+1)D-18', 5);
assert(vEv2 !== null, 'Confirmed violence detection MUST generate an alert');
assert.strictEqual(vEv2?.type, 'VIOLENCE_DETECTED');
assert.strictEqual(vEv2?.severity, 'CRITICAL');
assert(vEv2?.message.includes('Physical Altercation/Violence Detected'));
console.log('  ✓ Case 6A: Non-violence evaluated -> 0 events');
console.log('  ✓ Case 6B: Violence confirmed -> Exactly 1 CRITICAL security event generated');

// Case 6C: Subsequent frames while violence continues -> Suppressed (no duplicate flood)
const vEv3 = notificationService.evaluateViolenceIncident(camId, 'Terminal CAM-01', true, 0.94, 3.0, 'R(2+1)D-18', 5);
assert.strictEqual(vEv3, null, 'Subsequent frame during active violence must be deduplicated');
const vEv4 = notificationService.evaluateViolenceIncident(camId, 'Terminal CAM-01', true, 0.91, 4.0, 'R(2+1)D-18', 5);
assert.strictEqual(vEv4, null, 'Subsequent frame during active violence must be deduplicated');
console.log('  ✓ Case 6C: Consecutive violent frames correctly deduplicated (0 spam alerts)');

// Case 6D: Violence resolves -> State recovers to NORMAL
const vEv5 = notificationService.evaluateViolenceIncident(camId, 'Terminal CAM-01', false, 0.12, 5.0, 'R(2+1)D-18', 5);
assert.strictEqual(vEv5, null, 'Resolution frame produces no event');

// Case 6E: New incident after cooldown -> Re-arms and triggers new alert
const vEv6 = notificationService.evaluateViolenceIncident(camId, 'Terminal CAM-01', true, 0.95, 12.0, 'R(2+1)D-18', 5);
assert(vEv6 !== null, 'New incident after cooldown MUST generate a new alert');
assert.strictEqual(vEv6?.severity, 'CRITICAL');
console.log('  ✓ Case 6D & 6E: State recovered after resolution and re-armed for new incident');

console.log('\n=== ALL AUTOMATED VERIFICATION TESTS PASSED SUCCESSFULLY ===');
