/**
 * VisionSense Node/ONNX Bridge for Python
 * Runs local yolo26n.onnx with exact coordinates
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

async function run() {
  const imagePath = process.argv[2];
  const confThreshold = parseFloat(process.argv[3] || '0.28');

  if (!imagePath || !fs.existsSync(imagePath)) {
    console.log(JSON.stringify({ error: 'Image not found', detections: [] }));
    process.exit(1);
  }

  let ort;
  try {
    ort = require('onnxruntime-web');
  } catch (e) {
    try {
      ort = require('onnxruntime-node');
    } catch (e2) {
      console.log(JSON.stringify({ error: 'No ONNX runtime', detections: [] }));
      process.exit(1);
    }
  }

  let width = 1280;
  let height = 720;
  try {
    const probe = execFileSync('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height',
      '-of', 'json',
      imagePath
    ], { encoding: 'utf8' });
    const parsed = JSON.parse(probe);
    const stream = parsed.streams?.[0];
    if (stream && stream.width && stream.height) {
      width = parseInt(stream.width, 10);
      height = parseInt(stream.height, 10);
    }
  } catch (e) {}

  const tempPpm = path.join('/tmp', `yolo_bridge_${Date.now()}.ppm`);
  const scale = Math.min(640 / width, 640 / height);
  const scaledW = Math.round(width * scale);
  const scaledH = Math.round(height * scale);
  const padX = (640 - scaledW) / 2;
  const padY = (640 - scaledH) / 2;

  try {
    execFileSync('ffmpeg', [
      '-y',
      '-i', imagePath,
      '-vf', `scale=640:640:force_original_aspect_ratio=decrease,pad=640:640:(ow-iw)/2:(oh-ih)/2:color=black`,
      '-f', 'image2',
      tempPpm
    ], { stdio: 'ignore' });

    const fileBuf = fs.readFileSync(tempPpm);
    const rawRgb = fileBuf.subarray(fileBuf.length - 1228800);
    try { fs.unlinkSync(tempPpm); } catch (e) {}

    const float32Data = new Float32Array(3 * 640 * 640);
    const stride = 640 * 640;
    for (let p = 0; p < stride; p++) {
      float32Data[p] = rawRgb[p * 3] / 255.0;
      float32Data[stride + p] = rawRgb[p * 3 + 1] / 255.0;
      float32Data[stride * 2 + p] = rawRgb[p * 3 + 2] / 255.0;
    }

    const modelPath = path.resolve('public/models/yolo26n.onnx');
    const session = await ort.InferenceSession.create(modelPath);
    const tensor = new ort.Tensor('float32', float32Data, [1, 3, 640, 640]);
    const res = await session.run({ pixel_values: tensor });

    const logits = (res.logits || res.pred_logits)?.data;
    const boxes = (res.pred_boxes || res.boxes)?.data;

    const detections = [];
    const numQueries = logits.length / 80;

    let personIndex = 1;
    for (let q = 0; q < numQueries; q++) {
      const logit = logits[q * 80 + 0];
      const conf = 1 / (1 + Math.exp(-logit));
      if (conf >= confThreshold) {
        const cx_640 = boxes[q * 4] * 640;
        const cy_640 = boxes[q * 4 + 1] * 640;
        const bw_640 = boxes[q * 4 + 2] * 640;
        const bh_640 = boxes[q * 4 + 3] * 640;

        const orig_cx = (cx_640 - padX) / scale;
        const orig_cy = (cy_640 - padY) / scale;
        const orig_w = bw_640 / scale;
        const orig_h = bh_640 / scale;

        const x1 = Math.max(0, Math.min(width, Math.round(orig_cx - orig_w / 2)));
        const y1 = Math.max(0, Math.min(height, Math.round(orig_cy - orig_h / 2)));
        const x2 = Math.max(0, Math.min(width, Math.round(orig_cx + orig_w / 2)));
        const y2 = Math.max(0, Math.min(height, Math.round(orig_cy + orig_h / 2)));

        if (x2 > x1 + 5 && y2 > y1 + 5) {
          detections.push({
            bbox: [x1, y1, x2, y2],
            confidence: Math.round(conf * 100) / 100,
            class_id: 0,
            class_name: 'person'
          });
        }
      }
    }

    console.log(JSON.stringify({
      success: true,
      width,
      height,
      people_count: detections.length,
      detections
    }));
  } catch (err) {
    console.error(err);
    console.log(JSON.stringify({ error: err.message, detections: [] }));
  }
}

run();
