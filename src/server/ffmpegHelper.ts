import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

let cachedFFmpegPath: string | null = null;
let cachedFFprobePath: string | null = null;

/**
 * Automatically injects known binary locations (such as WinGet Links) into process.env.PATH
 */
export function ensureBinaryPaths(): void {
  const pathsToAdd: string[] = [];
  const localAppData = process.env.LOCALAPPDATA || '';
  if (localAppData) {
    const wingetLinks = path.join(localAppData, 'Microsoft', 'WinGet', 'Links');
    if (fs.existsSync(wingetLinks)) {
      pathsToAdd.push(wingetLinks);
    }
  }

  const commonLocations = [
    'C:\\ffmpeg\\bin',
    'C:\\Program Files\\ffmpeg\\bin',
  ];
  for (const loc of commonLocations) {
    if (fs.existsSync(loc)) {
      pathsToAdd.push(loc);
    }
  }

  const currentPath = process.env.PATH || '';
  for (const p of pathsToAdd) {
    if (!currentPath.toLowerCase().includes(p.toLowerCase())) {
      process.env.PATH = `${p}${path.delimiter}${process.env.PATH}`;
    }
  }
}

// Run path injection immediately on module load
ensureBinaryPaths();

/**
 * Resolves the absolute or valid executable path for ffmpeg.
 */
export async function getFFmpegPath(): Promise<string> {
  if (cachedFFmpegPath && fs.existsSync(cachedFFmpegPath)) {
    return cachedFFmpegPath;
  }

  // 1. Check explicit environment variable
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    cachedFFmpegPath = process.env.FFMPEG_PATH;
    return cachedFFmpegPath;
  }

  // 2. Check WinGet link directly
  const localAppData = process.env.LOCALAPPDATA || '';
  if (localAppData) {
    const wingetFfmpeg = path.join(localAppData, 'Microsoft', 'WinGet', 'Links', 'ffmpeg.exe');
    if (fs.existsSync(wingetFfmpeg)) {
      cachedFFmpegPath = wingetFfmpeg;
      return cachedFFmpegPath;
    }
  }

  // 3. Check system PATH via execFile
  try {
    const binName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
    await execFileAsync('ffmpeg', ['-version']);
    cachedFFmpegPath = binName;
    return cachedFFmpegPath;
  } catch (err: any) {
    // Check fallback locations
    const fallbackLocations = [
      'C:\\ffmpeg\\bin\\ffmpeg.exe',
      'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
    ];
    for (const fb of fallbackLocations) {
      if (fs.existsSync(fb)) {
        cachedFFmpegPath = fb;
        return cachedFFmpegPath;
      }
    }
    throw new Error(
      'FFmpeg binary not found on the system. Please ensure FFmpeg is installed and added to PATH.'
    );
  }
}

/**
 * Resolves the absolute or valid executable path for ffprobe.
 */
export async function getFFprobePath(): Promise<string> {
  if (cachedFFprobePath && fs.existsSync(cachedFFprobePath)) {
    return cachedFFprobePath;
  }

  // 1. Check explicit environment variable
  if (process.env.FFPROBE_PATH && fs.existsSync(process.env.FFPROBE_PATH)) {
    cachedFFprobePath = process.env.FFPROBE_PATH;
    return cachedFFprobePath;
  }

  // 2. Check WinGet link directly
  const localAppData = process.env.LOCALAPPDATA || '';
  if (localAppData) {
    const wingetFfprobe = path.join(localAppData, 'Microsoft', 'WinGet', 'Links', 'ffprobe.exe');
    if (fs.existsSync(wingetFfprobe)) {
      cachedFFprobePath = wingetFfprobe;
      return cachedFFprobePath;
    }
  }

  // 3. Check system PATH via execFile
  try {
    const binName = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';
    await execFileAsync('ffprobe', ['-version']);
    cachedFFprobePath = binName;
    return cachedFFprobePath;
  } catch (err: any) {
    const fallbackLocations = [
      'C:\\ffmpeg\\bin\\ffprobe.exe',
      'C:\\Program Files\\ffmpeg\\bin\\ffprobe.exe',
    ];
    for (const fb of fallbackLocations) {
      if (fs.existsSync(fb)) {
        cachedFFprobePath = fb;
        return cachedFFprobePath;
      }
    }
    throw new Error(
      'FFprobe binary not found on the system. Please ensure FFprobe is installed and added to PATH.'
    );
  }
}

/**
 * Checks if FFmpeg and FFprobe are ready and callable
 */
export async function checkFFmpegAvailability(): Promise<{ available: boolean; ffmpegPath?: string; ffprobePath?: string; error?: string }> {
  try {
    const ffmpegPath = await getFFmpegPath();
    const ffprobePath = await getFFprobePath();
    return { available: true, ffmpegPath, ffprobePath };
  } catch (err: any) {
    return { available: false, error: err?.message || String(err) };
  }
}

/**
 * Cross-platform temporary directory helper
 */
export function getSafeTempDir(prefix: string): string {
  const dir = path.join(os.tmpdir(), `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
