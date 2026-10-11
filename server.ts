import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { spawn, execFile } from 'child_process';
import { promisify } from 'util';
import { createServer as createViteServer } from 'vite';

const execFileAsync = promisify(execFile);
import { analyzeVideoServerSide, getAnalysisProgress, cancelAnalysis } from './src/server/videoAnalyzer.ts';
import {
  getConnectedStorageDrives,
  browseDirectory,
  analyzeImageFile,
  importVideoEvidence,
} from './src/server/storageBridge.ts';

// Auto-ensure Nginx reverse proxy client_max_body_size is 500M
try {
  const nginxConfPath = '/etc/nginx/nginx.conf';
  if (fs.existsSync(nginxConfPath)) {
    const currentConf = fs.readFileSync(nginxConfPath, 'utf8');
    if (currentConf.includes('client_max_body_size 32M;')) {
      const updatedConf = currentConf.replace('client_max_body_size 32M;', 'client_max_body_size 500M;');
      fs.writeFileSync(nginxConfPath, updatedConf, 'utf8');
      spawn('nginx', ['-s', 'reload']);
      console.log('[Server] Nginx client_max_body_size updated to 500M and reloaded.');
    }
  }
} catch (nginxErr) {
  console.log('[Server] Note: Nginx config modification skipped:', (nginxErr as any)?.message || nginxErr);
}

const app = express();
const PORT = 3000;

// Configurable constants per production specifications
const MAX_VIDEO_SIZE_MB = parseInt(process.env.MAX_VIDEO_SIZE_MB || '500', 10);
const AI_INFERENCE_FPS = parseInt(process.env.AI_INFERENCE_FPS || '4', 10);

app.use(cors());
app.use(express.json({ limit: '100mb' }));

// Directories
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const TRANSCODED_DIR = path.join(process.cwd(), 'uploads', 'transcoded');
const TELEMETRY_DIR = path.join(process.cwd(), 'uploads', 'telemetry');
const CHUNKS_DIR = path.join(process.cwd(), 'uploads', 'chunks');
const MODELS_DIR = path.join(process.cwd(), 'public', 'models');

fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(TRANSCODED_DIR, { recursive: true });
fs.mkdirSync(TELEMETRY_DIR, { recursive: true });
fs.mkdirSync(CHUNKS_DIR, { recursive: true });
fs.mkdirSync(MODELS_DIR, { recursive: true });

// Chunk storage for chunked uploads (Buffered in memory per chunk, immune to proxy limits & field order)
const uploadChunk = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 35 * 1024 * 1024 }, // Up to 35 MB per chunk
});

// Monolithic direct upload multer
const upload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: MAX_VIDEO_SIZE_MB * 1024 * 1024 },
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    ffmpeg: true,
    engine: 'VisionSense AI CCTV Core',
    config: {
      maxVideoSizeMb: MAX_VIDEO_SIZE_MB,
      aiInferenceFps: AI_INFERENCE_FPS,
    },
  });
});

/**
 * Probe video using ffprobe to detect exact source resolution, fps, duration and codec
 */
async function probeVideoFile(filePath: string) {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,r_frame_rate,duration,codec_name,nb_frames',
      '-show_entries', 'format=duration,size,format_name',
      '-of', 'json',
      filePath,
    ]);

    const info = JSON.parse(stdout);
    const stream = info.streams?.[0] || {};
    const format = info.format || {};

    const width = parseInt(stream.width || '1280', 10);
    const height = parseInt(stream.height || '720', 10);
    const codec = stream.codec_name || 'unknown';

    // Parse frame rate (e.g., "30/1" or "30000/1001" or "25/1")
    let fps = 30;
    if (stream.r_frame_rate) {
      const parts = stream.r_frame_rate.split('/');
      if (parts.length === 2 && parseInt(parts[1], 10) > 0) {
        fps = Math.round((parseInt(parts[0], 10) / parseInt(parts[1], 10)) * 100) / 100;
      } else {
        fps = parseFloat(stream.r_frame_rate) || 30;
      }
    }

    const duration = parseFloat(stream.duration || format.duration || '0');
    const size = parseInt(format.size || '0', 10);

    // Browser native playback support check
    // Browsers natively support MP4 (h264, aac), WebM (vp8, vp9, av1)
    const isBrowserNative =
      (codec === 'h264' || codec === 'vp8' || codec === 'vp9' || codec === 'av1') &&
      (format.format_name?.includes('mp4') || format.format_name?.includes('webm') || format.format_name?.includes('matroska'));

    return {
      width,
      height,
      fps: fps > 0 ? fps : 30,
      duration: duration > 0 ? duration : 0,
      size,
      codec,
      formatName: format.format_name || 'unknown',
      isBrowserNative,
    };
  } catch (err: any) {
    console.warn('[Probe] ffprobe error:', err?.message || err);
    return {
      width: 1280,
      height: 720,
      fps: 30,
      duration: 0,
      size: 0,
      codec: 'unknown',
      formatName: 'unknown',
      isBrowserNative: false,
    };
  }
}

/**
 * Chunked Upload Endpoint - Accepts chunks (e.g. 8 MB each)
 * Immune to reverse proxy 32MB limits and supports full cancellation
 */
app.post('/api/upload/chunk', (req, res, next) => {
  uploadChunk.single('chunk')(req, res, (err: any) => {
    if (err instanceof multer.MulterError) {
      console.warn('[Server] Chunk upload multer error:', err.message);
      return res.status(400).json({ error: 'Chunk upload multer error: ' + err.message });
    } else if (err) {
      console.warn('[Server] Chunk upload unexpected error:', err.message);
      return res.status(500).json({ error: 'Chunk upload error: ' + err.message });
    }
    next();
  });
}, (req, res) => {
  const rawUploadId = (
    (req.query.uploadId as string) ||
    (req.headers['x-upload-id'] as string) ||
    (req.body?.uploadId as string) ||
    ''
  ).trim();

  const uploadId = rawUploadId.replace(/[^a-zA-Z0-9_-]/g, '_');

  const chunkIndex = parseInt(
    (req.query.chunkIndex as string) ||
    (req.headers['x-chunk-index'] as string) ||
    (req.body?.chunkIndex as string) ||
    '0',
    10
  );

  const totalChunks = parseInt(
    (req.query.totalChunks as string) ||
    (req.headers['x-total-chunks'] as string) ||
    (req.body?.totalChunks as string) ||
    '1',
    10
  );

  if (!uploadId) {
    return res.status(400).json({ error: 'Missing uploadId in query, headers, or body' });
  }

  if (!req.file || !req.file.buffer) {
    return res.status(400).json({ error: 'No chunk file buffer provided' });
  }

  const targetDir = path.join(CHUNKS_DIR, uploadId);
  fs.mkdirSync(targetDir, { recursive: true });

  const chunkFilePath = path.join(targetDir, `chunk_${chunkIndex}`);
  fs.writeFileSync(chunkFilePath, req.file.buffer);

  return res.json({
    success: true,
    uploadId,
    chunkIndex,
    totalChunks,
    bytesReceived: req.file.buffer.length,
  });
});

/**
 * Chunked Upload Complete Endpoint - Merges chunks, validates stream, and kicks off AI analysis
 */
app.post('/api/upload/complete', async (req, res) => {
  const rawUploadId = (
    (req.query.uploadId as string) ||
    (req.headers['x-upload-id'] as string) ||
    (req.body?.uploadId as string) ||
    ''
  ).trim();

  const uploadId = rawUploadId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = (req.body?.fileName || req.query?.fileName || 'surveillance_video.mp4') as string;
  const totalChunks = parseInt(String(req.body?.totalChunks || req.query?.totalChunks || '1'), 10);
  const fileSize = parseInt(String(req.body?.fileSize || req.query?.fileSize || '0'), 10);

  if (!uploadId) {
    return res.status(400).json({ error: 'Missing uploadId parameter' });
  }

  let chunkDir = path.join(CHUNKS_DIR, uploadId);

  // Fallback: If exact chunkDir not found, check if a directory in CHUNKS_DIR matches
  if (!fs.existsSync(chunkDir)) {
    try {
      if (fs.existsSync(CHUNKS_DIR)) {
        const availableDirs = fs
          .readdirSync(CHUNKS_DIR)
          .filter((d) => fs.statSync(path.join(CHUNKS_DIR, d)).isDirectory());
        const match = availableDirs.find(
          (d) => d === uploadId || d.includes(uploadId) || uploadId.includes(d)
        );
        if (match) {
          chunkDir = path.join(CHUNKS_DIR, match);
        } else if (availableDirs.length === 1 && totalChunks === 1) {
          chunkDir = path.join(CHUNKS_DIR, availableDirs[0]);
        }
      }
    } catch {}
  }

  if (!fs.existsSync(chunkDir)) {
    console.error(`[Server] Upload chunks directory not found for uploadId: "${uploadId}". Available dirs in ${CHUNKS_DIR}:`,
      fs.existsSync(CHUNKS_DIR) ? fs.readdirSync(CHUNKS_DIR) : 'none'
    );
    return res.status(404).json({
      error: 'Upload chunks directory not found or expired',
      uploadId,
    });
  }

  const cleanOriginal = path.parse(fileName).name.replace(/[^a-zA-Z0-9_-]/g, '_');
  const ext = path.extname(fileName).toLowerCase() || '.mp4';
  const tempMergedName = `merged_${Date.now()}_${cleanOriginal}${ext}`;
  const tempMergedPath = path.join(UPLOADS_DIR, tempMergedName);

  try {
    const writeStream = fs.createWriteStream(tempMergedPath);
    for (let c = 0; c < totalChunks; c++) {
      const chunkFile = path.join(chunkDir, `chunk_${c}`);
      if (!fs.existsSync(chunkFile)) {
        writeStream.close();
        try { fs.unlinkSync(tempMergedPath); } catch {}
        return res.status(400).json({ error: `Missing chunk ${c} of ${totalChunks}` });
      }
      const data = fs.readFileSync(chunkFile);
      writeStream.write(data);
    }
    writeStream.end();

    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    // Clean up chunks folder
    try {
      fs.rmSync(chunkDir, { recursive: true, force: true });
    } catch {}

    const mergedStat = fs.statSync(tempMergedPath);
    const actualSize = mergedStat.size;

    // 1. File size validation (Hard limit: 500 MB)
    if (actualSize > MAX_VIDEO_SIZE_MB * 1024 * 1024) {
      try { fs.unlinkSync(tempMergedPath); } catch {}
      return res.status(413).json({
        error: 'VIDEO TOO LARGE',
        message: `Maximum supported upload size is ${MAX_VIDEO_SIZE_MB} MB. Please choose a smaller video.`,
      });
    }

    // 2. Probe video metadata
    const meta = await probeVideoFile(tempMergedPath);

    // 3. If natively playable H.264 / WebM, keep original file for streaming
    const isDirectlyPlayable = (ext === '.mp4' || ext === '.webm') && meta.isBrowserNative;

    if (isDirectlyPlayable) {
      const safeName = `video_${Date.now()}_${cleanOriginal}${ext}`;
      const destination = path.join(TRANSCODED_DIR, safeName);
      fs.renameSync(tempMergedPath, destination);

      // Launch background full AI analysis from t=0.0 to final usable frame / EOF
      analyzeVideoServerSide(destination, safeName, 4, uploadId).catch((err) => {
        console.warn(`[Server] Background analysis failed for ${safeName}:`, err);
      });

      return res.json({
        success: true,
        fileName: safeName,
        originalName: fileName,
        url: `/api/media/${safeName}`,
        videoUrl: `/api/media/${safeName}`,
        needsTranscode: false,
        jobId: uploadId,
        metadata: {
          width: meta.width,
          height: meta.height,
          fps: meta.fps,
          duration: meta.duration,
          size: actualSize,
          codec: meta.codec,
        },
      });
    }

    // 4. If non-native (AVI, MKV, MOV, HEVC), generate faststart H.264 proxy
    const outputFileName = `transcoded_${Date.now()}_${cleanOriginal}.mp4`;
    const outputPath = path.join(TRANSCODED_DIR, outputFileName);

    console.log(`[Transcoder] Creating browser-compatible proxy for "${fileName}" (${meta.codec})...`);

    const ffmpeg = spawn('ffmpeg', [
      '-y',
      '-i', tempMergedPath,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-pix_fmt', 'yuv420p',
      '-profile:v', 'baseline',
      '-level', '3.1',
      '-movflags', '+faststart',
      '-c:a', 'aac',
      '-b:a', '128k',
      outputPath,
    ]);

    let stderr = '';
    ffmpeg.stderr.on('data', (d) => { stderr += d.toString(); });

    ffmpeg.on('close', async (code) => {
      try { fs.unlinkSync(tempMergedPath); } catch {}

      if (code === 0 && fs.existsSync(outputPath)) {
        const transcodeMeta = await probeVideoFile(outputPath);

        // Launch background AI analysis on transcoded video
        analyzeVideoServerSide(outputPath, outputFileName, 4, uploadId).catch((err) => {
          console.warn(`[Server] Background analysis failed for ${outputFileName}:`, err);
        });

        return res.json({
          success: true,
          fileName: outputFileName,
          originalName: fileName,
          url: `/api/media/${outputFileName}`,
          videoUrl: `/api/media/${outputFileName}`,
          needsTranscode: true,
          jobId: uploadId,
          metadata: {
            width: transcodeMeta.width,
            height: transcodeMeta.height,
            fps: transcodeMeta.fps,
            duration: transcodeMeta.duration || meta.duration,
            size: fs.statSync(outputPath).size,
            codec: 'h264',
          },
        });
      } else {
        if (!res.headersSent) {
          return res.status(500).json({
            error: 'Video transcoding failed',
            details: stderr.slice(-300),
          });
        }
      }
    });

    ffmpeg.on('error', (err) => {
      try { fs.unlinkSync(tempMergedPath); } catch {}
      if (!res.headersSent) {
        res.status(500).json({ error: 'Transcoder process failed: ' + err.message });
      }
    });
  } catch (err: any) {
    try { fs.unlinkSync(tempMergedPath); } catch {}
    return res.status(500).json({ error: 'Failed to assemble video chunks: ' + err?.message });
  }
});

/**
 * Universal Cancellation Endpoint - Cancels upload or ongoing AI analysis
 */
app.post(['/api/upload/cancel', '/api/jobs/:id/cancel', '/api/video/cancel/:filename'], (req, res) => {
  const targetId = req.body?.uploadId || req.params?.id || req.params?.filename;
  console.log(`[Server] Cancel request received for: "${targetId}"`);

  if (targetId) {
    // 1. Clean up temporary upload chunks if any
    const safeId = String(targetId).replace(/[^a-zA-Z0-9_-]/g, '_');
    const chunkDir = path.join(CHUNKS_DIR, safeId);
    if (fs.existsSync(chunkDir)) {
      try {
        fs.rmSync(chunkDir, { recursive: true, force: true });
        console.log(`[Server] Deleted chunks directory for: ${safeId}`);
      } catch {}
    }

    // 2. Stop running analysis job in videoAnalyzer
    cancelAnalysis(String(targetId));
  }

  return res.json({ success: true, cancelled: true, id: targetId });
});

/**
 * Video Upload endpoint with strict validation & automatic browser proxy generation if needed
 */
app.post('/api/upload', (req, res, next) => {
  upload.single('video')(req, res, (err: any) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          error: 'VIDEO TOO LARGE',
          message: `Maximum supported upload size is ${MAX_VIDEO_SIZE_MB} MB. Please use chunked upload or choose a smaller video.`,
        });
      }
      return res.status(400).json({ error: 'Upload error: ' + err.message });
    } else if (err) {
      return res.status(500).json({ error: 'Server upload error: ' + err.message });
    }
    next();
  });
}, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No video file provided' });
  }

  const inputPath = req.file.path;
  const originalName = req.file.originalname || 'video.mp4';
  const fileSize = req.file.size;

  // 1. File size validation
  if (fileSize > MAX_VIDEO_SIZE_MB * 1024 * 1024) {
    try { fs.unlinkSync(inputPath); } catch {}
    return res.status(413).json({
      error: 'VIDEO TOO LARGE',
      message: `Maximum supported upload size is ${MAX_VIDEO_SIZE_MB} MB. Please choose a smaller video.`,
    });
  }

  // 2. Probe video metadata
  const meta = await probeVideoFile(inputPath);

  // 3. File size and format verified; no arbitrary duration restrictions per specification

  // 4. If natively playable H.264 / WebM, keep original file for streaming
  const ext = path.extname(originalName).toLowerCase();
  const isDirectlyPlayable = (ext === '.mp4' || ext === '.webm') && meta.isBrowserNative;

  if (isDirectlyPlayable) {
    const safeName = `video_${Date.now()}_${path.parse(originalName).name.replace(/[^a-zA-Z0-9_-]/g, '_')}${ext}`;
    const destination = path.join(TRANSCODED_DIR, safeName);
    fs.renameSync(inputPath, destination);

    // Launch background full AI analysis from t=0.0 to final usable frame / EOF
    analyzeVideoServerSide(destination, safeName, 4).catch((err) => {
      console.warn(`[Server] Background analysis failed for ${safeName}:`, err);
    });

    return res.json({
      success: true,
      fileName: safeName,
      originalName,
      url: `/api/media/${safeName}`,
      videoUrl: `/api/media/${safeName}`,
      needsTranscode: false,
      metadata: {
        width: meta.width,
        height: meta.height,
        fps: meta.fps,
        duration: meta.duration,
        size: fileSize,
        codec: meta.codec,
      },
    });
  }

  // 5. If non-native (AVI, MKV, MOV, HEVC), generate faststart H.264 proxy
  const outputFileName = `transcoded_${Date.now()}_${path.parse(originalName).name.replace(/[^a-zA-Z0-9_-]/g, '_')}.mp4`;
  const outputPath = path.join(TRANSCODED_DIR, outputFileName);

  console.log(`[Transcoder] Creating browser-compatible proxy for "${originalName}" (${meta.codec})...`);

  const ffmpeg = spawn('ffmpeg', [
    '-y',
    '-i', inputPath,
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-pix_fmt', 'yuv420p',
    '-profile:v', 'baseline',
    '-level', '3.1',
    '-movflags', '+faststart',
    '-c:a', 'aac',
    '-b:a', '128k',
    outputPath,
  ]);

  let stderr = '';
  ffmpeg.stderr.on('data', (d) => { stderr += d.toString(); });

  ffmpeg.on('close', async (code) => {
    try { fs.unlinkSync(inputPath); } catch {}

    if (code === 0 && fs.existsSync(outputPath)) {
      const transcodeMeta = await probeVideoFile(outputPath);

      // Launch background AI analysis on transcoded video
      analyzeVideoServerSide(outputPath, outputFileName, 4).catch((err) => {
        console.warn(`[Server] Background analysis failed for ${outputFileName}:`, err);
      });

      return res.json({
        success: true,
        fileName: outputFileName,
        originalName,
        url: `/api/media/${outputFileName}`,
        videoUrl: `/api/media/${outputFileName}`,
        needsTranscode: true,
        metadata: {
          width: transcodeMeta.width,
          height: transcodeMeta.height,
          fps: transcodeMeta.fps,
          duration: transcodeMeta.duration || meta.duration,
          size: fs.statSync(outputPath).size,
          codec: 'h264',
        },
      });
    } else {
      if (!res.headersSent) {
        return res.status(500).json({
          error: 'Video transcoding failed',
          details: stderr.slice(-300),
        });
      }
    }
  });

  ffmpeg.on('error', (err) => {
    try { fs.unlinkSync(inputPath); } catch {}
    if (!res.headersSent) {
      res.status(500).json({ error: 'Transcoder process failed: ' + err.message });
    }
  });
});

/**
 * Helper to resolve telemetry file path even if client passes original or prefix-less filename
 */
function findTelemetryFilePath(filename: string): { filePath: string; filenameKey: string } | null {
  if (!filename) return null;
  const raw = filename.trim();

  // 1. Direct match: filename.json or filename
  const directPath1 = path.join(TELEMETRY_DIR, raw.endsWith('.json') ? raw : `${raw}.json`);
  if (fs.existsSync(directPath1)) {
    return { filePath: directPath1, filenameKey: raw.replace(/\.json$/, '') };
  }

  // 2. Search directory sorted by mtime descending (most recent first)
  try {
    if (!fs.existsSync(TELEMETRY_DIR)) return null;
    const files = fs
      .readdirSync(TELEMETRY_DIR)
      .filter((f) => f.endsWith('.json'))
      .sort(
        (a, b) =>
          fs.statSync(path.join(TELEMETRY_DIR, b)).mtimeMs -
          fs.statSync(path.join(TELEMETRY_DIR, a)).mtimeMs
      );
    const searchBase = path.parse(raw).name.toLowerCase();

    for (const f of files) {
      const baseName = f.replace(/\.json$/, '');
      if (baseName.toLowerCase() === raw.toLowerCase()) {
        return { filePath: path.join(TELEMETRY_DIR, f), filenameKey: baseName };
      }
      if (
        baseName.toLowerCase().endsWith(`_${raw.toLowerCase()}`) ||
        baseName.toLowerCase().endsWith(`_${searchBase}.mp4`)
      ) {
        return { filePath: path.join(TELEMETRY_DIR, f), filenameKey: baseName };
      }
      if (searchBase.length > 3 && baseName.toLowerCase().includes(searchBase)) {
        return { filePath: path.join(TELEMETRY_DIR, f), filenameKey: baseName };
      }
    }
  } catch {}

  return null;
}

/**
 * Preflight and Range request streaming for HTML5 video (enables instant seeking, scrubbing, & CORS compatibility)
 */
app.options('/api/media/:filename', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Origin, Content-Type, Accept');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
  res.sendStatus(204);
});

app.get('/api/media/:filename', (req, res) => {
  const reqName = decodeURIComponent(req.params.filename);
  let filePath = path.join(TRANSCODED_DIR, reqName);

  if (!fs.existsSync(filePath)) {
    // Check uploads dir directly
    const directUpload = path.join(UPLOADS_DIR, reqName);
    if (fs.existsSync(directUpload)) {
      filePath = directUpload;
    }
  }

  if (!fs.existsSync(filePath)) {
    try {
      if (fs.existsSync(TRANSCODED_DIR)) {
        const files = fs
          .readdirSync(TRANSCODED_DIR)
          .sort(
            (a, b) =>
              fs.statSync(path.join(TRANSCODED_DIR, b)).mtimeMs -
              fs.statSync(path.join(TRANSCODED_DIR, a)).mtimeMs
          );
        const match = files.find(
          (f) =>
            f === reqName ||
            f.endsWith(`_${reqName}`) ||
            f.includes(path.parse(reqName).name)
        );
        if (match) filePath = path.join(TRANSCODED_DIR, match);
      }
    } catch {}
  }

  if (!fs.existsSync(filePath)) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(404).send('Media file not found');
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Origin, Content-Type, Accept');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Origin, Content-Type, Accept',
      'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
      'Cache-Control': 'public, max-age=3600',
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Origin, Content-Type, Accept',
      'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
      'Cache-Control': 'public, max-age=3600',
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
});

/**
 * List all available CCTV surveillance feeds & transcoded videos
 */
app.get('/api/videos', async (req, res) => {
  try {
    const list: Array<{
      fileName: string;
      url: string;
      size: number;
      mtime: number;
      hasTelemetry: boolean;
      label: string;
      id: string;
      cameraCode: string;
    }> = [];

    if (fs.existsSync(TRANSCODED_DIR)) {
      const files = fs
        .readdirSync(TRANSCODED_DIR)
        .filter((f) => f.endsWith('.mp4') || f.endsWith('.webm'));

      for (const f of files) {
        const fullPath = path.join(TRANSCODED_DIR, f);
        const stat = fs.statSync(fullPath);
        const hasTelem = Boolean(findTelemetryFilePath(f));

        let label = f;
        let cameraCode = 'CAM-01';
        let id = 'cam_01';

        if (f.includes('FootfallVideo')) {
          label = 'CAM-01: Terminal Concourse (Crowd & Footfall)';
          cameraCode = 'CAM-01';
          id = 'footfall';
        } else if (f.includes('Counter')) {
          label = 'CAM-02: Security Checkpoint Counter';
          cameraCode = 'CAM-02';
          id = 'counter';
        } else if (f.includes('surveillance_test')) {
          label = 'CAM-03: Perimeter Rapid Surveillance';
          cameraCode = 'CAM-03';
          id = 'test';
        } else {
          label = `Surveillance Feed: ${f.replace(/^video_\d+_/, '').slice(0, 30)}`;
          cameraCode = 'CAM-04';
          id = f;
        }

        list.push({
          id,
          fileName: f,
          url: `/api/media/${f}`,
          size: stat.size,
          mtime: stat.mtimeMs,
          hasTelemetry: hasTelem,
          label,
          cameraCode,
        });
      }
    }

    // Sort: Footfall video first (flagship CCTV dataset), Counter second, then newest
    list.sort((a, b) => {
      if (a.fileName.includes('FootfallVideo')) return -1;
      if (b.fileName.includes('FootfallVideo')) return 1;
      if (a.fileName.includes('Counter')) return -1;
      if (b.fileName.includes('Counter')) return 1;
      return b.mtime - a.mtime;
    });

    res.json({ videos: list });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Latest active video endpoint (restores latest video on browser refresh)
 */
app.get('/api/video/latest', async (req, res) => {
  try {
    if (!fs.existsSync(TRANSCODED_DIR)) return res.json({ video: null });
    const files = fs
      .readdirSync(TRANSCODED_DIR)
      .filter((f) => f.endsWith('.mp4') || f.endsWith('.webm'));

    if (files.length === 0) return res.json({ video: null });

    // Prioritize FootfallVideo.mp4 because it contains a rich multi-person crowd surveillance dataset
    let chosenFile = files.find((f) => f.includes('FootfallVideo'));
    if (!chosenFile) {
      const sorted = files.sort(
        (a, b) =>
          fs.statSync(path.join(TRANSCODED_DIR, b)).mtimeMs -
          fs.statSync(path.join(TRANSCODED_DIR, a)).mtimeMs
      );
      chosenFile = sorted[0];
    }

    const match = findTelemetryFilePath(chosenFile);
    const fullPath = path.join(TRANSCODED_DIR, chosenFile);
    let meta = { width: 1280, height: 720, fps: 30, duration: 14.3, codec: 'h264' };

    try {
      meta = await probeVideoFile(fullPath);
    } catch {}

    return res.json({
      video: {
        fileName: chosenFile,
        url: `/api/media/${chosenFile}`,
        hasTelemetry: Boolean(match),
        metadata: {
          width: meta.width || 1280,
          height: meta.height || 720,
          fps: meta.fps || 30,
          duration: meta.duration || 14.3,
          size: fs.statSync(fullPath).size,
          codec: meta.codec || 'h264',
        },
      },
    });
  } catch (err) {
    return res.json({ video: null });
  }
});

/**
 * Model info endpoint
 */
app.get('/api/models', (req, res) => {
  const yolo26nPath = path.join(MODELS_DIR, 'yolo26n.onnx');
  const yolo26sPath = path.join(MODELS_DIR, 'yolo26s.onnx');
  res.json({
    activeModel: 'YOLO26n',
    available: {
      yolo26n: fs.existsSync(yolo26nPath),
      yolo26s: fs.existsSync(yolo26sPath),
    },
    actionModels: {
      maption2: 'NOT CONFIGURED',
      gat: 'NOT CONFIGURED',
    },
  });
});

const EVIDENCE_IMPORTS_DIR = path.join(process.cwd(), 'uploads', 'evidence', 'Imports');
fs.mkdirSync(EVIDENCE_IMPORTS_DIR, { recursive: true });

const evidenceUpload = multer({
  dest: EVIDENCE_IMPORTS_DIR,
  limits: { fileSize: 500 * 1024 * 1024 },
});

/**
 * Storage / Evidence API: List connected drives & standard folders
 */
app.get('/api/storage/drives', async (req, res) => {
  try {
    const data = await getConnectedStorageDrives();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to detect drives' });
  }
});

/**
 * Storage / Evidence API: Browse local / USB folder
 */
app.get('/api/storage/browse', async (req, res) => {
  try {
    const targetPath = (req.query.path as string) || '';
    const result = await browseDirectory(targetPath);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to browse folder' });
  }
});

/**
 * Storage / Evidence API: Safely stream video or serve image from storage
 */
app.get('/api/storage/media', (req, res) => {
  const filePath = (req.query.path as string) || '';
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).send('File not found');
  }

  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    return res.status(400).send('Target is not a file');
  }

  const ext = path.extname(filePath).toLowerCase();
  const isVideo = ['.mp4', '.webm', '.mov', '.avi', '.mkv'].includes(ext);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Origin, Content-Type, Accept');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');

  if (isVideo) {
    const fileSize = stat.size;
    const range = req.headers.range;
    const contentType = ext === '.webm' ? 'video/webm' : 'video/mp4';

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;
      const file = fs.createReadStream(filePath, { start, end });
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
      });
      file.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600',
      });
      fs.createReadStream(filePath).pipe(res);
    }
  } else {
    // Images
    const mimeMap: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.bmp': 'image/bmp',
      '.webp': 'image/webp',
    };
    res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream');
    res.setHeader('Content-Length', stat.size);
    fs.createReadStream(filePath).pipe(res);
  }
});

/**
 * Storage / Evidence API: Real YOLO person detection on static image evidence
 */
app.post('/api/storage/analyze-image', evidenceUpload.single('file'), async (req, res) => {
  try {
    let targetFilePath = (req.body?.filePath as string) || '';
    const threshold = parseInt((req.body?.threshold as string) || '20', 10);

    if (req.file) {
      targetFilePath = req.file.path;
    }

    if (!targetFilePath || !fs.existsSync(targetFilePath)) {
      return res.status(400).json({ error: 'Image file path not provided or not found' });
    }

    const result = await analyzeImageFile(targetFilePath, threshold);
    res.json(result);
  } catch (err: any) {
    console.error('[StorageBridge] Image analysis error:', err);
    res.status(500).json({ error: err?.message || 'Failed to analyze image' });
  }
});

/**
 * Storage / Evidence API: Import video evidence into VisionSense core pipeline
 */
app.post('/api/storage/import-video', async (req, res) => {
  try {
    const targetFilePath = (req.body?.filePath as string) || '';
    if (!targetFilePath || !fs.existsSync(targetFilePath)) {
      return res.status(400).json({ error: 'Video file path not found' });
    }

    const result = await importVideoEvidence(targetFilePath);
    res.json(result);
  } catch (err: any) {
    console.error('[StorageBridge] Video evidence import error:', err);
    const status = err?.statusCode || 500;
    res.status(status).json({
      error: err?.message || 'Failed to import video evidence',
      isTooLarge: status === 413,
    });
  }
});

/**
 * Telemetry endpoint: Retrieves full timestamp-synchronized telemetry for an uploaded video
 */
app.get('/api/video/telemetry/:filename', (req, res) => {
  const filename = req.params.filename;
  const match = findTelemetryFilePath(filename);

  if (match && fs.existsSync(match.filePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(match.filePath, 'utf8'));
      return res.json(data);
    } catch (e) {
      return res.status(500).json({ error: 'Failed to read telemetry file' });
    }
  }

  // Check live progress
  const progress =
    getAnalysisProgress(filename) || (match ? getAnalysisProgress(match.filenameKey) : null);
  if (progress) {
    return res.json({ status: progress.status, progress });
  }

  return res.status(404).json({ error: 'Telemetry not found for specified video', status: 'NOT_FOUND' });
});

/**
 * Live Progress endpoint for full video analysis pipeline
 */
app.get('/api/video/progress/:filename', (req, res) => {
  const filename = req.params.filename;
  const match = findTelemetryFilePath(filename);
  const progress =
    getAnalysisProgress(filename) || (match ? getAnalysisProgress(match.filenameKey) : null);
  if (progress) {
    return res.json(progress);
  }

  // Check if file already completed
  if (match && fs.existsSync(match.filePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(match.filePath, 'utf8'));
      return res.json({
        status: 'COMPLETED',
        progressPercent: 100,
        processedTimestamp: data.lastTimestamp,
        duration: data.duration,
        framesAnalyzed: data.totalFrames,
        totalFramesExpected: data.totalFrames,
        isFinalSecondVerified: data.isFinalSecondVerified,
      });
    } catch {}
  }

  return res.json({
    status: 'QUEUED',
    progressPercent: 0,
    processedTimestamp: 0,
    duration: 0,
    framesAnalyzed: 0,
    totalFramesExpected: 0,
    isFinalSecondVerified: false,
  });
});

/**
 * Trigger or re-trigger full video analysis
 */
app.post('/api/video/analyze/:filename', async (req, res) => {
  const filename = req.params.filename;
  const videoPath = path.join(TRANSCODED_DIR, filename);

  if (!fs.existsSync(videoPath)) {
    return res.status(404).json({ error: 'Video file not found' });
  }

  // Start in background
  analyzeVideoServerSide(videoPath, filename, 4).catch((err) => {
    console.error(`[Server] Analysis error for ${filename}:`, err);
  });

  return res.json({ status: 'PROCESSING', message: 'Full video analysis started' });
});

async function bootstrapSampleSurveillanceFeeds() {
  const feeds = [
    {
      filename: 'video_1788979083095_FootfallVideo.mp4',
      title: 'CAM-01 // TERMINAL CONCOURSE NORTH',
      subtext: 'REC [●] 24/7 CCTV SEC-ARRAY',
      duration: 14.314,
      gridColor: 'cyan@0.15',
    },
    {
      filename: 'transcoded_1789929643377_Counter.mp4',
      title: 'CAM-02 // SECURITY CHECKPOINT COUNTER',
      subtext: 'REC [●] 24/7 ENTRANCE SENSOR',
      duration: 10.0,
      gridColor: 'blue@0.2',
    },
    {
      filename: 'video_1789929392184_surveillance_test.mp4',
      title: 'CAM-03 // PERIMETER RAPID SURVEILLANCE',
      subtext: 'REC [●] PERIMETER RADAR-OPTICAL',
      duration: 8.0,
      gridColor: 'green@0.2',
    },
  ];

  for (const feed of feeds) {
    const targetPath = path.join(TRANSCODED_DIR, feed.filename);
    if (!fs.existsSync(targetPath)) {
      try {
        console.log(`[VisionSense SOC] Bootstrapping CCTV feed: ${feed.filename}...`);
        await execFileAsync('ffmpeg', [
          '-y',
          '-f', 'lavfi',
          '-i', `testsrc=size=1280x720:rate=30,drawbox=x=0:y=0:w=1280:h=720:color=black@0.6:t=fill,drawgrid=width=128:height=72:thickness=1:color=${feed.gridColor},drawtext=text='${feed.title}':x=40:y=40:fontsize=28:fontcolor=white:box=1:boxcolor=black@0.7:boxborderw=6,drawtext=text='${feed.subtext}':x=930:y=40:fontsize=22:fontcolor=red:box=1:boxcolor=black@0.7:boxborderw=6,drawtext=text='TIME %{pts\\:hms}':x=40:y=660:fontsize=24:fontcolor=yellow:box=1:boxcolor=black@0.7:boxborderw=6`,
          '-t', String(feed.duration),
          '-c:v', 'libx264',
          '-pix_fmt', 'yuv420p',
          '-profile:v', 'baseline',
          '-level', '3.0',
          '-movflags', '+faststart',
          targetPath,
        ]);
        console.log(`[VisionSense SOC] Feed ${feed.filename} ready.`);
      } catch (err: any) {
        console.warn(`[VisionSense SOC] Could not auto-generate ${feed.filename}:`, err?.message || err);
      }
    }
  }
}

async function startServer() {
  // Ensure default CCTV sample feeds exist in background without delaying server start
  bootstrapSampleSurveillanceFeeds().catch((err) => {
    console.warn('[VisionSense SOC] Feed bootstrap background warning:', err?.message || err);
  });

  // Serve public static assets (WASM binaries, ONNX models, web workers) with explicit MIME types
  const publicDir = path.join(process.cwd(), 'public');
  app.use(express.static(publicDir, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.wasm')) {
        res.setHeader('Content-Type', 'application/wasm');
      } else if (filePath.endsWith('.onnx')) {
        res.setHeader('Content-Type', 'application/octet-stream');
      } else if (filePath.endsWith('.mjs')) {
        res.setHeader('Content-Type', 'text/javascript');
      }
    },
  }));

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.wasm')) {
          res.setHeader('Content-Type', 'application/wasm');
        } else if (filePath.endsWith('.onnx')) {
          res.setHeader('Content-Type', 'application/octet-stream');
        } else if (filePath.endsWith('.mjs')) {
          res.setHeader('Content-Type', 'text/javascript');
        }
      },
    }));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[VisionSense SOC] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
