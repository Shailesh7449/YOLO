import React, { useState, useEffect, useRef } from 'react';
import {
  HardDrive,
  Usb,
  Folder,
  FolderOpen,
  Film,
  Image as ImageIcon,
  ArrowLeft,
  CornerLeftUp,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  Play,
  Eye,
  Scan,
  X,
  Upload,
  ChevronRight,
  ShieldAlert,
  Cpu,
  Maximize2,
  Download,
  Info,
} from 'lucide-react';
import { VideoMetadata } from '../types';

export interface StorageDrive {
  id: string;
  letter: string;
  label: string;
  type: 'local' | 'removable' | 'network' | 'shortcut';
  typeName: string;
  totalBytes: number;
  freeBytes: number;
  totalFormatted: string;
  freeFormatted: string;
  usedPercent: number;
  isRemovable: boolean;
  rootPath: string;
}

export interface StorageFileItem {
  name: string;
  path: string;
  type: 'video' | 'image';
  extension: string;
  sizeBytes: number;
  sizeFormatted: string;
  mtime: number;
  mtimeFormatted: string;
  isTooLarge?: boolean;
  errorMessage?: string;
  dimensions?: { width: number; height: number };
}

export interface StorageFolderItem {
  name: string;
  path: string;
  itemCount?: number;
}

export interface BreadcrumbSegment {
  name: string;
  path: string;
}

export interface ImageDetectionBox {
  id: number;
  label: string;
  confidence: number;
  bbox: [number, number, number, number]; // [x1, y1, x2, y2]
  class_id: number;
  class_name: 'person';
}

export interface ImageAnalysisData {
  success: boolean;
  fileName: string;
  filePath: string;
  mediaUrl: string;
  width: number;
  height: number;
  peopleCount: number;
  crowdStatus: 'NORMAL' | 'WARNING';
  threshold: number;
  detections: ImageDetectionBox[];
  inferenceTimeMs: number;
  model: string;
  isSpatialOnly: boolean;
  message: string;
}

interface StorageEvidenceViewProps {
  onAnalyzeVideo: (url: string, filename: string, metadata: VideoMetadata) => void;
  crowdThreshold?: number;
}

export const StorageEvidenceView: React.FC<StorageEvidenceViewProps> = ({
  onAnalyzeVideo,
  crowdThreshold = 20,
}) => {
  // Drives and navigation state
  const [drives, setDrives] = useState<StorageDrive[]>([]);
  const [shortcuts, setShortcuts] = useState<StorageDrive[]>([]);
  const [isLoadingDrives, setIsLoadingDrives] = useState<boolean>(true);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbSegment[]>([]);
  const [folders, setFolders] = useState<StorageFolderItem[]>([]);
  const [videos, setVideos] = useState<StorageFileItem[]>([]);
  const [images, setImages] = useState<StorageFileItem[]>([]);
  const [isLoadingFolder, setIsLoadingFolder] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterType, setFilterType] = useState<'all' | 'videos' | 'images'>('all');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Video Import Processing State
  const [importingVideoPath, setImportingVideoPath] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // Video Quick Preview Modal
  const [previewVideo, setPreviewVideo] = useState<StorageFileItem | null>(null);

  // Image YOLO Analysis Modal State
  const [analyzingImage, setAnalyzingImage] = useState<StorageFileItem | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisResult, setAnalysisResult] = useState<ImageAnalysisData | null>(null);
  const [selectedDetectionId, setSelectedDetectionId] = useState<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 1. Fetch Connected Storage Drives on Mount
  const fetchDrives = async () => {
    setIsLoadingDrives(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/storage/drives');
      if (!res.ok) throw new Error('Failed to load storage drives');
      const data = await res.json();
      setDrives(data.drives || []);
      setShortcuts(data.shortcuts || []);

      // If no path is selected, open the primary CCTV archive or first drive
      if (!currentPath) {
        if (data.shortcuts && data.shortcuts.length > 0) {
          browseToPath(data.shortcuts[0].rootPath);
        } else if (data.drives && data.drives.length > 0) {
          browseToPath(data.drives[0].rootPath);
        }
      }
    } catch (err: any) {
      console.error('[StorageView] Error fetching drives:', err);
      setErrorMessage(err.message || 'Error querying storage drives');
    } finally {
      setIsLoadingDrives(false);
    }
  };

  useEffect(() => {
    fetchDrives();
  }, []);

  // 2. Browse Directory Path
  const browseToPath = async (targetPath: string) => {
    setIsLoadingFolder(true);
    setErrorMessage(null);
    setImportError(null);
    try {
      const res = await fetch(`/api/storage/browse?path=${encodeURIComponent(targetPath)}`);
      if (!res.ok) throw new Error(`Could not access folder: ${targetPath}`);
      const data = await res.json();
      setCurrentPath(data.currentPath);
      setParentPath(data.parentPath);
      setBreadcrumbs(data.breadcrumbs || []);
      setFolders(data.folders || []);
      setVideos(data.videos || []);
      setImages(data.images || []);
    } catch (err: any) {
      console.error('[StorageView] Error browsing path:', err);
      setErrorMessage(err.message || 'Error opening folder');
    } finally {
      setIsLoadingFolder(false);
    }
  };

  // 3. Import and send video to VisionSense analysis pipeline
  const handleAnalyzeVideo = async (video: StorageFileItem) => {
    if (video.isTooLarge) {
      setImportError('FILE TOO LARGE: Video exceeds 500 MB limit. Cannot process.');
      return;
    }

    setImportingVideoPath(video.path);
    setImportError(null);
    try {
      const res = await fetch('/api/storage/import-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: video.path }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to import video evidence');
      }

      // Hand off to VisionSense Surveillance Player in App.tsx
      onAnalyzeVideo(data.videoUrl, data.fileName, data.metadata);
    } catch (err: any) {
      console.error('[StorageView] Import error:', err);
      setImportError(err.message || 'Failed to import video into VisionSense');
      setImportingVideoPath(null);
    }
  };

  // 4. Perform Real YOLO Image Inference
  const handleAnalyzeImage = async (image: StorageFileItem) => {
    setAnalyzingImage(image);
    setIsAnalyzing(true);
    setAnalysisResult(null);
    setSelectedDetectionId(null);

    try {
      const res = await fetch('/api/storage/analyze-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: image.path,
          threshold: crowdThreshold,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'YOLO analysis failed');
      setAnalysisResult(data);
    } catch (err: any) {
      console.error('[StorageView] Image YOLO analysis error:', err);
      setErrorMessage(err.message || 'Failed to run YOLO detection');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 5. Draw Real Bounding Boxes on Canvas when image analysis completes
  useEffect(() => {
    if (!analysisResult || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = analysisResult.mediaUrl;

    img.onload = () => {
      canvas.width = analysisResult.width || img.naturalWidth;
      canvas.height = analysisResult.height || img.naturalHeight;

      // Draw original image
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Draw exact bounding boxes for detected persons
      for (const det of analysisResult.detections) {
        const [x1, y1, x2, y2] = det.bbox;
        const w = x2 - x1;
        const h = y2 - y1;
        const isSelected = selectedDetectionId === det.id;

        // Semi-transparent overlay fill
        ctx.fillStyle = isSelected ? 'rgba(6, 182, 212, 0.25)' : 'rgba(6, 182, 212, 0.12)';
        ctx.fillRect(x1, y1, w, h);

        // Box border
        ctx.strokeStyle = isSelected ? '#38bdf8' : '#06b6d4';
        ctx.lineWidth = isSelected ? 4 : 2;
        ctx.strokeRect(x1, y1, w, h);

        // Tactical corner brackets
        const cornerLen = Math.min(16, w / 4, h / 4);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;

        // Top-left
        ctx.beginPath();
        ctx.moveTo(x1, y1 + cornerLen);
        ctx.lineTo(x1, y1);
        ctx.lineTo(x1 + cornerLen, y1);
        ctx.stroke();

        // Top-right
        ctx.beginPath();
        ctx.moveTo(x2 - cornerLen, y1);
        ctx.lineTo(x2, y1);
        ctx.lineTo(x2, y1 + cornerLen);
        ctx.stroke();

        // Bottom-left
        ctx.beginPath();
        ctx.moveTo(x1, y2 - cornerLen);
        ctx.lineTo(x1, y2);
        ctx.lineTo(x1 + cornerLen, y2);
        ctx.stroke();

        // Bottom-right
        ctx.beginPath();
        ctx.moveTo(x2 - cornerLen, y2);
        ctx.lineTo(x2, y2);
        ctx.lineTo(x2, y2 - cornerLen);
        ctx.stroke();

        // Tag label
        const labelText = `${det.label} (${Math.round(det.confidence * 100)}%)`;
        ctx.font = 'bold 13px ui-monospace, SFMono-Regular, monospace';
        const textMetrics = ctx.measureText(labelText);
        const tagHeight = 22;
        const tagWidth = textMetrics.width + 12;

        ctx.fillStyle = isSelected ? '#0284c7' : '#0f766e';
        ctx.fillRect(x1, Math.max(0, y1 - tagHeight), tagWidth, tagHeight);

        ctx.fillStyle = '#ffffff';
        ctx.fillText(labelText, x1 + 6, Math.max(tagHeight - 6, y1 - 6));
      }
    };
  }, [analysisResult, selectedDetectionId]);

  // 6. Handle Direct Computer File Upload / Selection
  const handleLocalFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    const isVid = ['.mp4', '.avi', '.mov', '.mkv', '.webm'].includes(ext);
    const isImg = ['.jpg', '.jpeg', '.png', '.bmp', '.webp'].includes(ext);

    if (!isVid && !isImg) {
      setErrorMessage(`Unsupported format "${ext}". Supported: MP4, AVI, MOV, MKV, WEBM, JPG, PNG, WEBP.`);
      return;
    }

    if (isVid && file.size > 500 * 1024 * 1024) {
      setErrorMessage('FILE TOO LARGE: Maximum supported video size is 500 MB.');
      return;
    }

    // If image, analyze directly
    if (isImg) {
      setIsAnalyzing(true);
      setAnalyzingImage({
        name: file.name,
        path: file.name,
        type: 'image',
        extension: ext.replace('.', ''),
        sizeBytes: file.size,
        sizeFormatted: (file.size / 1024).toFixed(1) + ' KB',
        mtime: Date.now(),
        mtimeFormatted: 'Just now',
      });
      setAnalysisResult(null);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('threshold', String(crowdThreshold));

      try {
        const res = await fetch('/api/storage/analyze-image', {
          method: 'POST',
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to analyze selected image');
        setAnalysisResult(data);
      } catch (err: any) {
        setErrorMessage(err.message || 'Error during image analysis');
      } finally {
        setIsAnalyzing(false);
      }
    } else {
      // If video, prompt user that they can upload via the Upload modal or import
      setErrorMessage('Please use "UPLOAD VIDEO" on top bar or browse local drives to import video files.');
    }
  };

  // Filter items by search query and type
  const filteredVideos = videos.filter((v) => {
    if (filterType === 'images') return false;
    if (!searchQuery) return true;
    return v.name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const filteredImages = images.filter((i) => {
    if (filterType === 'videos') return false;
    if (!searchQuery) return true;
    return i.name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const localDrives = drives.filter((d) => !d.isRemovable);
  const removableDrives = drives.filter((d) => d.isRemovable);

  return (
    <div className="flex-1 flex flex-col p-4 lg:p-6 max-w-[1700px] w-full mx-auto gap-5">
      {/* Top Banner & Bridge Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl lg:text-2xl font-black tracking-wider text-white uppercase font-mono flex items-center gap-2.5">
              <HardDrive className="w-6 h-6 text-cyan-400" />
              STORAGE & CCTV EVIDENCE MANAGER
            </h1>
            <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-md bg-cyan-950/80 border border-cyan-700 text-cyan-300 font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              LOCAL FILESYSTEM BRIDGE CONNECTED
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Browse local computer drives, connected USB/pen drives, and CCTV evidence archives. Run real YOLO26n person inference on images and launch full video analytics.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleLocalFileSelect}
            accept=".mp4,.avi,.mov,.mkv,.webm,.jpg,.jpeg,.png,.bmp,.webp"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-mono font-bold transition-all cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-cyan-400" />
            <span>PICK LOCAL EVIDENCE FILE</span>
          </button>

          <button
            onClick={fetchDrives}
            disabled={isLoadingDrives}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-950/70 hover:bg-cyan-900 border border-cyan-700 text-cyan-300 text-xs font-mono font-bold transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDrives ? 'animate-spin' : ''}`} />
            <span>REFRESH DRIVES</span>
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {(errorMessage || importError) && (
        <div className="p-3.5 rounded-xl bg-rose-950/80 border border-rose-600/80 text-rose-200 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMessage || importError}</span>
          </div>
          <button
            onClick={() => {
              setErrorMessage(null);
              setImportError(null);
            }}
            className="text-rose-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Section 4 & 5: CONNECTED STORAGE DRIVES */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Side: Connected Drives & Shortcuts (~35%) */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          {/* 💻 THIS PC (Local Drives) */}
          <div className="bg-[#0b101d] border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
              <span className="text-xs font-mono font-bold text-slate-300 flex items-center gap-2">
                💻 THIS PC — LOCAL DRIVES
              </span>
              <span className="text-[10px] font-mono text-cyan-400 font-bold">
                {localDrives.length} DETECTED
              </span>
            </div>

            <div className="flex flex-col gap-2.5">
              {localDrives.map((d) => (
                <button
                  key={d.id}
                  onClick={() => browseToPath(d.rootPath)}
                  className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer flex flex-col gap-2 ${
                    currentPath.startsWith(d.rootPath)
                      ? 'bg-cyan-950/40 border-cyan-500 shadow-md shadow-cyan-950/40'
                      : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-850'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-cyan-950/80 border border-cyan-800 flex items-center justify-center text-cyan-400 font-mono font-bold text-xs">
                        {d.letter.slice(0, 2)}
                      </div>
                      <div>
                        <div className="font-mono font-bold text-xs text-white">{d.label}</div>
                        <div className="text-[10px] font-mono text-slate-400">{d.typeName}</div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-500" />
                  </div>

                  {/* Capacity Bar */}
                  <div className="flex flex-col gap-1">
                    <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-800">
                      <div
                        className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full rounded-full transition-all"
                        style={{ width: `${d.usedPercent}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                      <span>{d.freeFormatted} free</span>
                      <span>{d.totalFormatted} total</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 🔌 REMOVABLE STORAGE (USB / Pen Drives) */}
          <div className="bg-[#0b101d] border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
              <span className="text-xs font-mono font-bold text-amber-300 flex items-center gap-2">
                🔌 REMOVABLE STORAGE (USB / PEN DRIVE)
              </span>
              <span className="text-[10px] font-mono text-amber-400 font-bold">
                {removableDrives.length} ATTACHED
              </span>
            </div>

            {removableDrives.length === 0 ? (
              <div className="p-4 rounded-xl border border-dashed border-slate-800 text-center text-slate-500 text-xs font-mono">
                No removable USB drives currently attached. Plug in a USB pen drive to view evidence.
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {removableDrives.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => browseToPath(d.rootPath)}
                    className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer flex flex-col gap-2 ${
                      currentPath.startsWith(d.rootPath)
                        ? 'bg-amber-950/40 border-amber-500 shadow-md shadow-amber-950/40'
                        : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-850'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-amber-950/80 border border-amber-700 flex items-center justify-center text-amber-400 font-mono font-bold text-xs">
                          <Usb className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-mono font-bold text-xs text-white">{d.label}</div>
                          <div className="text-[10px] font-mono text-amber-400/90">{d.typeName}</div>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-500" />
                    </div>

                    <div className="flex flex-col gap-1">
                      <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-800">
                        <div
                          className="bg-gradient-to-r from-amber-500 to-orange-500 h-full rounded-full transition-all"
                          style={{ width: `${d.usedPercent}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                        <span>{d.freeFormatted} free</span>
                        <span>{d.totalFormatted} total</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 📁 QUICK ACCESS SHORTCUTS */}
          <div className="bg-[#0b101d] border border-slate-800 rounded-xl p-4 flex flex-col gap-2.5">
            <span className="text-xs font-mono font-bold text-slate-300 border-b border-slate-800/80 pb-2">
              📁 EVIDENCE SHORTCUTS
            </span>
            <div className="flex flex-col gap-1.5">
              {shortcuts.map((s) => (
                <button
                  key={s.id}
                  onClick={() => browseToPath(s.rootPath)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-mono flex items-center justify-between transition-all cursor-pointer ${
                    currentPath === s.rootPath
                      ? 'bg-cyan-950/60 text-cyan-300 border border-cyan-700 font-bold'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Folder className="w-3.5 h-3.5 text-cyan-400" />
                    {s.label}
                  </span>
                  <span className="text-[10px] text-slate-500 uppercase">{s.typeName}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Side: Folder Navigation & Evidence Files (~65%) */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          {/* Breadcrumb Navigation Bar & Actions */}
          <div className="bg-[#0b101d] border border-slate-800 rounded-xl p-3.5 flex flex-col gap-3">
            {/* Breadcrumb row */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
              <span className="text-slate-500 font-bold mr-1">PATH:</span>
              {breadcrumbs.map((b, idx) => (
                <React.Fragment key={b.path + idx}>
                  <button
                    onClick={() => browseToPath(b.path)}
                    className={`px-2 py-1 rounded hover:bg-slate-800 transition-colors cursor-pointer ${
                      idx === breadcrumbs.length - 1
                        ? 'bg-cyan-950 text-cyan-300 font-bold border border-cyan-800/80'
                        : 'text-slate-300'
                    }`}
                  >
                    {b.name}
                  </button>
                  {idx < breadcrumbs.length - 1 && (
                    <span className="text-slate-600 font-bold">/</span>
                  )}
                </React.Fragment>
              ))}
            </div>

            {/* Folder Actions Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/70">
              <div className="flex items-center gap-2">
                {parentPath && (
                  <button
                    onClick={() => browseToPath(parentPath)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono transition-colors cursor-pointer"
                    title="Go Up"
                  >
                    <CornerLeftUp className="w-3.5 h-3.5" />
                    <span>UP</span>
                  </button>
                )}

                <button
                  onClick={() => browseToPath(currentPath)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono transition-colors cursor-pointer"
                  title="Refresh Folder"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingFolder ? 'animate-spin' : ''}`} />
                  <span>REFRESH</span>
                </button>

                {/* Filter tabs */}
                <div className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-slate-800 text-[11px] font-mono">
                  <button
                    onClick={() => setFilterType('all')}
                    className={`px-2.5 py-0.5 rounded cursor-pointer ${
                      filterType === 'all' ? 'bg-cyan-500 text-black font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    ALL ({videos.length + images.length})
                  </button>
                  <button
                    onClick={() => setFilterType('videos')}
                    className={`px-2.5 py-0.5 rounded cursor-pointer ${
                      filterType === 'videos' ? 'bg-cyan-500 text-black font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    VIDEOS ({videos.length})
                  </button>
                  <button
                    onClick={() => setFilterType('images')}
                    className={`px-2.5 py-0.5 rounded cursor-pointer ${
                      filterType === 'images' ? 'bg-cyan-500 text-black font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    IMAGES ({images.length})
                  </button>
                </div>
              </div>

              {/* Search Bar */}
              <div className="relative min-w-[200px]">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter files..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>
            </div>
          </div>

          {/* Subfolders Grid */}
          {folders.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-mono text-slate-400 font-bold uppercase tracking-wider">
                SUBFOLDERS ({folders.length})
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                {folders.map((folder) => (
                  <button
                    key={folder.path}
                    onClick={() => browseToPath(folder.path)}
                    className="p-3 rounded-xl bg-slate-900/80 hover:bg-slate-800/90 border border-slate-800 hover:border-cyan-600 transition-all text-left flex items-center gap-2.5 cursor-pointer group"
                  >
                    <Folder className="w-5 h-5 text-amber-400 group-hover:text-cyan-400 transition-colors shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-mono font-bold text-slate-200 truncate group-hover:text-white">
                        {folder.name}
                      </div>
                      <div className="text-[10px] font-mono text-slate-500">
                        {folder.itemCount !== undefined ? `${folder.itemCount} items` : 'Folder'}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Section 7: EVIDENCE FILES (VIDEOS & IMAGES SEPARATED) */}
          <div className="flex flex-col gap-5">
            {/* 🎥 VIDEOS SECTION */}
            {(filterType === 'all' || filterType === 'videos') && (
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                  <span className="text-xs font-mono font-bold text-white uppercase flex items-center gap-2">
                    <Film className="w-4 h-4 text-cyan-400" />
                    VIDEO EVIDENCE ({filteredVideos.length})
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    Max size: 500 MB • Supported: MP4, AVI, MOV, MKV, WEBM
                  </span>
                </div>

                {filteredVideos.length === 0 ? (
                  <div className="p-6 rounded-xl bg-slate-950/40 border border-dashed border-slate-800 text-center text-slate-500 text-xs font-mono">
                    No video evidence files found in current directory.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {filteredVideos.map((video) => (
                      <div
                        key={video.path}
                        className={`p-3.5 rounded-xl border flex flex-col justify-between gap-3 transition-all ${
                          video.isTooLarge
                            ? 'bg-rose-950/20 border-rose-800/80'
                            : 'bg-[#0b101d] border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center shrink-0">
                            <Film className="w-5 h-5 text-cyan-400" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-mono font-bold text-white truncate" title={video.name}>
                              {video.name}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 font-bold">
                                {video.extension}
                              </span>
                              <span className="text-[11px] font-mono text-slate-400">
                                {video.sizeFormatted}
                              </span>
                              <span className="text-[10px] font-mono text-slate-500">
                                {video.mtimeFormatted.split(',')[0]}
                              </span>
                            </div>

                            {/* 500 MB File Limit Badge */}
                            {video.isTooLarge && (
                              <div className="mt-2 text-[10px] font-mono font-bold text-rose-400 flex items-center gap-1">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                <span>FILE TOO LARGE (Exceeds 500 MB limit)</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2 pt-2 border-t border-slate-800/60">
                          <button
                            onClick={() => setPreviewVideo(video)}
                            className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono font-bold transition-all cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>PREVIEW</span>
                          </button>

                          <button
                            onClick={() => handleAnalyzeVideo(video)}
                            disabled={video.isTooLarge || importingVideoPath === video.path}
                            className={`flex-[2] flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-extrabold transition-all cursor-pointer ${
                              video.isTooLarge
                                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                : importingVideoPath === video.path
                                ? 'bg-cyan-900 text-cyan-200 cursor-wait'
                                : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black shadow-md shadow-cyan-500/20'
                            }`}
                          >
                            {importingVideoPath === video.path ? (
                              <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                <span>INGESTING...</span>
                              </>
                            ) : (
                              <>
                                <Play className="w-3.5 h-3.5 fill-current" />
                                <span>SEND TO VISIONSENSE</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 🖼 IMAGES SECTION */}
            {(filterType === 'all' || filterType === 'images') && (
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                  <span className="text-xs font-mono font-bold text-white uppercase flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-emerald-400" />
                    IMAGE EVIDENCE ({filteredImages.length})
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    Real YOLO26n Person Detection • Spatial Analysis Only
                  </span>
                </div>

                {filteredImages.length === 0 ? (
                  <div className="p-6 rounded-xl bg-slate-950/40 border border-dashed border-slate-800 text-center text-slate-500 text-xs font-mono">
                    No image evidence files found in current directory.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filteredImages.map((image) => (
                      <div
                        key={image.path}
                        className="p-3 rounded-xl bg-[#0b101d] border border-slate-800 hover:border-slate-700 flex flex-col justify-between gap-3 group transition-all"
                      >
                        {/* Image Preview Thumbnail */}
                        <div className="relative aspect-video rounded-lg overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center">
                          <img
                            src={`/api/storage/media?path=${encodeURIComponent(image.path)}`}
                            alt={image.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                            onError={(e) => {
                              // Fallback on broken load
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                          <span className="absolute top-2 right-2 text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-black/80 text-emerald-300 font-bold border border-emerald-700/60 backdrop-blur-sm">
                            {image.extension}
                          </span>
                        </div>

                        {/* Metadata */}
                        <div>
                          <div className="text-xs font-mono font-bold text-white truncate" title={image.name}>
                            {image.name}
                          </div>
                          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mt-1">
                            <span>{image.sizeFormatted}</span>
                            <span className="text-slate-500">{image.mtimeFormatted.split(',')[0]}</span>
                          </div>
                        </div>

                        {/* Run YOLO Detection Button */}
                        <button
                          onClick={() => handleAnalyzeImage(image)}
                          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-700/80 text-emerald-300 text-xs font-mono font-bold transition-all cursor-pointer shadow-sm hover:shadow-emerald-950/50"
                        >
                          <Scan className="w-3.5 h-3.5" />
                          <span>RUN YOLO DETECTION</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* QUICK VIDEO PREVIEW MODAL */}
      {previewVideo && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0b101d] border border-slate-700 rounded-2xl max-w-3xl w-full p-5 flex flex-col gap-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Film className="w-5 h-5 text-cyan-400" />
                <span className="font-mono font-bold text-sm text-white truncate max-w-md">
                  {previewVideo.name}
                </span>
              </div>
              <button
                onClick={() => setPreviewVideo(null)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="aspect-video bg-black rounded-xl overflow-hidden border border-slate-800">
              <video
                src={`/api/storage/media?path=${encodeURIComponent(previewVideo.path)}`}
                controls
                autoPlay
                className="w-full h-full object-contain"
              />
            </div>

            <div className="flex items-center justify-between text-xs font-mono text-slate-400">
              <span>Size: {previewVideo.sizeFormatted}</span>
              <button
                onClick={() => {
                  const target = previewVideo;
                  setPreviewVideo(null);
                  handleAnalyzeVideo(target);
                }}
                disabled={previewVideo.isTooLarge}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-extrabold cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>SEND TO VISIONSENSE ANALYSIS</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REAL YOLO IMAGE ANALYSIS MODAL (Section 8, 9, 11, 12) */}
      {analyzingImage && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 lg:p-6 overflow-y-auto">
          <div className="bg-[#070b14] border-2 border-cyan-500/60 rounded-2xl max-w-6xl w-full flex flex-col gap-4 p-5 shadow-2xl shadow-cyan-950/80 my-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-cyan-950 border border-cyan-500 flex items-center justify-center text-cyan-400">
                  <Scan className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-mono font-extrabold text-base text-white uppercase tracking-wider flex items-center gap-2">
                    REAL YOLO26n IMAGE DETECTION & CROWD DECISION
                  </h3>
                  <p className="text-[11px] font-mono text-cyan-400/80">
                    Target: {analyzingImage.name} • Spatial Person Analysis Only
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setAnalyzingImage(null);
                  setAnalysisResult(null);
                }}
                className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Analysis In Progress Indicator */}
            {isAnalyzing && (
              <div className="p-12 flex flex-col items-center justify-center gap-3 text-cyan-400">
                <RefreshCw className="w-8 h-8 animate-spin" />
                <span className="font-mono font-bold text-sm tracking-wider uppercase">
                  RUNNING ULTRALYTICS YOLO26n INFERENCE (PERSON CLASS)...
                </span>
                <span className="text-xs font-mono text-slate-400">
                  Letterboxing to 640x640 • Inverse coordinate transformation
                </span>
              </div>
            )}

            {/* Analysis Results Display */}
            {analysisResult && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                {/* Left: Annotated Canvas (7 cols) */}
                <div className="lg:col-span-8 flex flex-col gap-2">
                  <div className="relative rounded-xl overflow-hidden bg-black border border-slate-800 flex items-center justify-center">
                    <canvas
                      ref={canvasRef}
                      className="w-full h-auto max-h-[65vh] object-contain cursor-crosshair"
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 px-1">
                    <span>
                      Original Resolution: {analysisResult.width} x {analysisResult.height} px
                    </span>
                    <span className="text-cyan-400 font-bold">
                      Inference Latency: {analysisResult.inferenceTimeMs} ms
                    </span>
                  </div>
                </div>

                {/* Right: Spatial Telemetry & Crowd Threshold Decision HUD (4 cols) */}
                <div className="lg:col-span-4 flex flex-col gap-3.5">
                  {/* Crowd Count & Decision Card */}
                  <div
                    className={`p-4 rounded-xl border flex flex-col gap-3 ${
                      analysisResult.crowdStatus === 'WARNING'
                        ? 'bg-amber-950/40 border-amber-500 text-amber-200'
                        : 'bg-emerald-950/40 border-emerald-500 text-emerald-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold uppercase tracking-wider">
                        CROWD SAFETY STATUS
                      </span>
                      <span
                        className={`text-xs font-mono font-black px-2.5 py-0.5 rounded uppercase tracking-wider ${
                          analysisResult.crowdStatus === 'WARNING'
                            ? 'bg-amber-500 text-black animate-pulse'
                            : 'bg-emerald-500 text-black'
                        }`}
                      >
                        {analysisResult.crowdStatus}
                      </span>
                    </div>

                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-mono font-black text-white">
                        {analysisResult.peopleCount}
                      </span>
                      <span className="text-xs font-mono text-slate-300">
                        PEOPLE DETECTED (Limit: {analysisResult.threshold})
                      </span>
                    </div>

                    <div className="text-xs font-mono leading-relaxed border-t border-slate-700/60 pt-2 text-slate-300">
                      {analysisResult.peopleCount <= analysisResult.threshold ? (
                        <span className="text-emerald-400 flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                          <span>Within safe limit ({analysisResult.peopleCount} &le; {analysisResult.threshold})</span>
                        </span>
                      ) : (
                        <span className="text-amber-300 flex items-center gap-1.5 font-bold">
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                          <span>Threshold exceeded ({analysisResult.peopleCount} &gt; {analysisResult.threshold})</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Section 9: IMPORTANT IMAGE LIMITATION NOTICE */}
                  <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-[11px] font-mono flex items-start gap-2 text-slate-400">
                    <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-slate-200 block uppercase">
                        Spatial Analysis Strict Boundary
                      </span>
                      Single static image detects people count and spatial coordinates. Motion speed, velocity vectors, and tracking duration require temporal video input and are not simulated.
                    </div>
                  </div>

                  {/* Detected Persons Breakdown Table */}
                  <div className="bg-[#0b101d] border border-slate-800 rounded-xl p-3 flex flex-col gap-2 max-h-[220px] overflow-y-auto">
                    <div className="flex items-center justify-between text-xs font-mono font-bold text-slate-300 pb-1 border-b border-slate-800">
                      <span>VERIFIED DETECTIONS</span>
                      <span className="text-cyan-400">{analysisResult.detections.length} Persons</span>
                    </div>

                    {analysisResult.detections.length === 0 ? (
                      <div className="py-4 text-center text-slate-500 text-xs font-mono">
                        No person class (COCO 0) detected in this image.
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {analysisResult.detections.map((det) => (
                          <button
                            key={det.id}
                            onClick={() => setSelectedDetectionId(det.id === selectedDetectionId ? null : det.id)}
                            className={`p-2 rounded-lg text-left text-xs font-mono flex items-center justify-between transition-all cursor-pointer ${
                              selectedDetectionId === det.id
                                ? 'bg-cyan-950 border border-cyan-500 text-cyan-200'
                                : 'bg-slate-900/60 hover:bg-slate-850 text-slate-300'
                            }`}
                          >
                            <span className="font-bold text-white">{det.label}</span>
                            <span className="text-emerald-400 font-bold">
                              {(det.confidence * 100).toFixed(0)}% conf
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-2">
                    <button
                      onClick={() => handleAnalyzeImage(analyzingImage)}
                      className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>RE-RUN YOLO</span>
                    </button>
                    <button
                      onClick={() => {
                        setAnalyzingImage(null);
                        setAnalysisResult(null);
                      }}
                      className="flex-1 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-mono font-extrabold transition-all cursor-pointer"
                    >
                      DONE
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
