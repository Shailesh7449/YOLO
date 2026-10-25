import fs from 'fs';
import path from 'path';
import {
  loadManifest,
  classifyResult,
  computeValidationMetrics,
  DatasetManifest,
  VideoTestResult,
} from '../src/server/testLibrary.ts';

function runAssertions() {
  console.log('================================================================');
  console.log('🧪 VISION SENSE AI — BUILT-IN VIOLENCE VALIDATION LIBRARY TESTS');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
      failed++;
    }
  }

  // -------------------------------------------------------------
  // TEST SUITE 1: MANIFEST VALIDATION & ASSET INTEGRITY
  // -------------------------------------------------------------
  console.log('📁 SUITE 1: Manifest Schema & Video Asset Integrity');
  try {
    const manifest = loadManifest();
    assert(Boolean(manifest), 'Manifest loads successfully from disk');
    assert(manifest.total_videos === 15, `Manifest contains 15 total videos (found: ${manifest.total_videos})`);
    assert(manifest.violence_count === 7, `Manifest contains 7 violence videos (found: ${manifest.violence_count})`);
    assert(manifest.normal_count === 8, `Manifest contains 8 normal videos (found: ${manifest.normal_count})`);

    let allFilesExist = true;
    let allThumbsExist = true;
    let allLabelsValid = true;

    for (const v of manifest.videos) {
      const videoPath = path.join(process.cwd(), v.relative_path);
      if (!fs.existsSync(videoPath)) {
        allFilesExist = false;
        console.error(`Missing video file on disk: ${videoPath}`);
      }

      const thumbPath = path.join(process.cwd(), 'public', 'datasets', 'thumbnails', `${v.id}.jpg`);
      if (!fs.existsSync(thumbPath)) {
        allThumbsExist = false;
        console.error(`Missing thumbnail file on disk: ${thumbPath}`);
      }

      if (v.expected_label !== 'VIOLENCE' && v.expected_label !== 'NON-VIOLENCE') {
        allLabelsValid = false;
      }
    }

    assert(allFilesExist, 'All 15 genuine video assets exist on filesystem');
    assert(allThumbsExist, 'All 15 corresponding thumbnail images exist in public/datasets/thumbnails');
    assert(allLabelsValid, 'All ground-truth labels are strictly VIOLENCE or NON-VIOLENCE');
  } catch (err: any) {
    assert(false, 'Manifest Loading & Integrity Test', err.message);
  }

  // -------------------------------------------------------------
  // TEST SUITE 2: GROUND TRUTH VS PREDICTED LABEL SEPARATION
  // -------------------------------------------------------------
  console.log('\n⚖️ SUITE 2: Expected Label vs Predicted Label Separation');
  {
    const tp = classifyResult('VIOLENCE', 'VIOLENCE');
    assert(tp === 'TRUE_POSITIVE', 'Expected VIOLENCE + Predicted VIOLENCE -> TRUE_POSITIVE');

    const tn = classifyResult('NON-VIOLENCE', 'NON-VIOLENCE');
    assert(tn === 'TRUE_NEGATIVE', 'Expected NON-VIOLENCE + Predicted NON-VIOLENCE -> TRUE_NEGATIVE');

    const fp = classifyResult('NON-VIOLENCE', 'VIOLENCE');
    assert(fp === 'FALSE_POSITIVE', 'Expected NON-VIOLENCE + Predicted VIOLENCE -> FALSE_POSITIVE');

    const fn = classifyResult('VIOLENCE', 'NON-VIOLENCE');
    assert(fn === 'FALSE_NEGATIVE', 'Expected VIOLENCE + Predicted NON-VIOLENCE -> FALSE_NEGATIVE');
  }

  // -------------------------------------------------------------
  // TEST SUITE 3: CONFUSION MATRIX & EMPIRICAL METRICS FORMULAS
  // -------------------------------------------------------------
  console.log('\n📊 SUITE 3: Confusion Matrix & Zero-Division Metric Calculation');
  {
    const mockManifest: DatasetManifest = {
      dataset_name: 'Test',
      version: '1.0',
      description: 'Test',
      disclaimer: 'TEST',
      total_videos: 4,
      violence_count: 2,
      normal_count: 2,
      videos: [
        { id: 'v1', expected_label: 'VIOLENCE' } as any,
        { id: 'v2', expected_label: 'VIOLENCE' } as any,
        { id: 'n1', expected_label: 'NON-VIOLENCE' } as any,
        { id: 'n2', expected_label: 'NON-VIOLENCE' } as any,
      ],
    };

    // Scenario A: 1 TP, 1 TN, 1 FP, 1 FN
    const resultsA: Record<string, VideoTestResult> = {
      v1: { classification: 'TRUE_POSITIVE', status: 'COMPLETED', processingTimeMs: 1000, framesAnalyzed: 20 } as any,
      v2: { classification: 'FALSE_NEGATIVE', status: 'COMPLETED', processingTimeMs: 1000, framesAnalyzed: 20 } as any,
      n1: { classification: 'TRUE_NEGATIVE', status: 'COMPLETED', processingTimeMs: 1000, framesAnalyzed: 20 } as any,
      n2: { classification: 'FALSE_POSITIVE', status: 'COMPLETED', processingTimeMs: 1000, framesAnalyzed: 20 } as any,
    };

    const metricsA = computeValidationMetrics(mockManifest, resultsA);
    assert(metricsA.truePositives === 1, 'True Positives count is 1');
    assert(metricsA.trueNegatives === 1, 'True Negatives count is 1');
    assert(metricsA.falsePositives === 1, 'False Positives count is 1');
    assert(metricsA.falseNegatives === 1, 'False Negatives count is 1');
    assert(metricsA.accuracy === 0.5, `Accuracy is 50% (found: ${metricsA.accuracy})`);
    assert(metricsA.precision === 0.5, `Precision is 50% (found: ${metricsA.precision})`);
    assert(metricsA.recall === 0.5, `Recall is 50% (found: ${metricsA.recall})`);
    assert(metricsA.f1Score === 0.5, `F1 Score is 50% (found: ${metricsA.f1Score})`);
    assert(metricsA.falsePositiveRate === 0.5, `FPR is 50% (found: ${metricsA.falsePositiveRate})`);
    assert(metricsA.falseNegativeRate === 0.5, `FNR is 50% (found: ${metricsA.falseNegativeRate})`);

    // Scenario B: Zero completed tests (tests zero-division safety)
    const metricsEmpty = computeValidationMetrics(mockManifest, {});
    assert(metricsEmpty.accuracy === null, 'Empty results produce null Accuracy (no division by zero)');
    assert(metricsEmpty.precision === null, 'Empty results produce null Precision');
    assert(metricsEmpty.recall === null, 'Empty results produce null Recall');
    assert(metricsEmpty.f1Score === null, 'Empty results produce null F1 Score');
    assert(
      metricsEmpty.disclaimer.includes('NOT A GENERALIZATION CLAIM'),
      'Metrics includes mandatory disclaimer text'
    );
  }

  // -------------------------------------------------------------
  // TEST SUITE 4: RED/BLUE PARTICIPANT STATE MACHINE
  // -------------------------------------------------------------
  console.log('\n🔴🔵 SUITE 4: Red/Blue Participant State Transitions');
  {
    // Bystander track during normal activity: BLUE (is_violence_participant = false)
    const bystanderTrack = {
      track_id: 1,
      is_violence_participant: false,
      participant_role: 'BYSTANDER',
    };
    assert(
      bystanderTrack.is_violence_participant === false,
      'Normal/Bystander track displays BLUE (is_violence_participant = false)'
    );

    // Active participant during confirmed violence event: RED (is_violence_participant = true)
    const violentParticipantTrack = {
      track_id: 2,
      is_violence_participant: true,
      participant_role: 'POTENTIAL VIOLENCE PARTICIPANT',
    };
    assert(
      violentParticipantTrack.is_violence_participant === true,
      'Active altercation subject displays RED (is_violence_participant = true)'
    );

    // Cleared event resets participant back to BLUE
    const clearedTrack = {
      ...violentParticipantTrack,
      is_violence_participant: false,
      participant_role: 'BYSTANDER',
    };
    assert(
      clearedTrack.is_violence_participant === false,
      'Post-event resolution returns participant to BLUE (is_violence_participant = false)'
    );
  }

  // -------------------------------------------------------------
  // TEST SUITE 5: API ENDPOINTS AVAILABILITY (LIVE SERVER TEST)
  // -------------------------------------------------------------
  console.log('\n🌐 SUITE 5: Live API Endpoints Verification');
  return fetch('http://127.0.0.1:3000/api/test-library/manifest')
    .then(async (res) => {
      assert(res.ok, 'GET /api/test-library/manifest returns HTTP 200');
      const data = await res.json();
      assert(data.total_videos === 15, 'API manifest returns 15 registered clips');
      assert(Array.isArray(data.videos), 'API returns enriched videos array');
      assert(Boolean(data.metrics), 'API returns live computed validation metrics');
      assert(Boolean(data.batchStatus), 'API returns batch status');
    })
    .catch((err) => {
      assert(false, 'Live API Manifest Test', err.message);
    })
    .finally(() => {
      console.log('\n================================================================');
      console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
      console.log('================================================================');
      if (failed > 0) {
        process.exit(1);
      } else {
        process.exit(0);
      }
    });
}

runAssertions();
