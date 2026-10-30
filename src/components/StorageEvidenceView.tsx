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
  Square,
  RotateCcw,
  Eye,
  Scan,
  X,
  Upload,
  ChevronRight,
  ShieldAlert,
  ShieldCheck,
  Cpu,
  Activity,
  Clock,
  Layers,
  FileVideo,
  ExternalLink,
  Info,
  Maximize2,
  Check,
} from 'lucide-react';
import {
  VideoMetadata,
  ManifestVideoEntry,
  ValidationMetrics,
  BatchTestStatus,
  ClassificationOutcome,
} from '../types';

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
  bbox: [number, number, number, number];
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
  // Navigation: Primary Validation Library vs Secondary Drive Explorer
  const [activeSubTab, setActiveSubTab] = useState<'library' | 'explorer'>('library');

  // ==========================================
  // 1. TEST LIBRARY STATE
  // ==========================================
  const [manifestVideos, setManifestVideos] = useState<ManifestVideoEntry[]>([]);
  const [metrics, setMetrics] = useState<ValidationMetrics | null>(null);
  const [batchStatus, setBatchStatus] = useState<BatchTestStatus | null>(null);
  const [isLoadingManifest, setIsLoadingManifest] = useState<boolean>(true);
  const [analyzingVideoId, setAnalyzingVideoId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'normal' | 'violence'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'tested' | 'pending' | 'tp' | 'tn' | 'fp' | 'fn'>('all');
  const [librarySearch, setLibrarySearch] = useState<string>('');
  const [selectedDetailVideo, setSelectedDetailVideo] = useState<ManifestVideoEntry | null>(null);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState<boolean>(false);

  // ==========================================
  // 2. EXPLORER (LEGACY DRIVE BROWSER) STATE
  // ==========================================
  const [drives, setDrives] = useState<StorageDrive[]>([]);
  const [shortcuts, setShortcuts] = useState<StorageDrive[]>([]);
  const [isLoadingDrives, setIsLoadingDrives] = useState<boolean>(false);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbSegment[]>([]);
  const [folders, setFolders] = useState<StorageFolderItem[]>([]);
  const [videos, setVideos] = useState<StorageFileItem[]>([]);
  const [images, setImages] = useState<StorageFileItem[]>([]);
  const [isLoadingFolder, setIsLoadingFolder] = useState<boolean>(false);
  const [explorerSearch, setExplorerSearch] = useState<string>('');
  const [explorerFilter, setExplorerFilter] = useState<'all' | 'videos' | 'images'>('all');
  const [explorerError, setExplorerError] = useState<string | null>(null);
  const [importingVideoPath, setImportingVideoPath] = useState<string | null>(null);
  const [previewVideo, setPreviewVideo] = useState<StorageFileItem | null>(null);
  const [analyzingImage, setAnalyzingImage] = useState<StorageFileItem | null>(null);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState<boolean>(false);
  const [imageAnalysisResult, setImageAnalysisResult] = useState<ImageAnalysisData | null>(null);
  const [selectedDetectionId, setSelectedDetectionId] = useState<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ==========================================
  // FETCH TEST LIBRARY MANIFEST & METRICS
  // ==========================================
  const fetchManifest = async () => {
    try {
      const res = await fetch('/api/test-library/manifest');
      if (!res.ok) throw new Error('Failed to load validation library manifest');
      const data = await res.json();
      setManifestVideos(data.videos || []);
      setMetrics(data.metrics || null);
      if (data.batchStatus) {
        setBatchStatus(data.batchStatus);
      }
    } catch (err: any) {
      console.error('[TestLibrary] Manifest error:', err);
      setLibraryError(err?.message || 'Error loading validation library');
    } finally {
      setIsLoadingManifest(false);
    }
  };

  useEffect(() => {
    fetchManifest();
  }, []);

  // Poll batch status when running
  useEffect(() => {
    if (batchStatus?.isRunning) {
      pollTimerRef.current = setInterval(async () => {
        try {
          const res = await fetch('/api/test-library/batch/status');
          if (res.ok) {
            const data: BatchTestStatus = await res.json();
            setBatchStatus(data);
            if (data.metrics) setMetrics(data.metrics);
            if (!data.isRunning) {
              fetchManifest();
            }
          }
        } catch {}
      }, 1500);
    } else {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    }

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [batchStatus?.isRunning]);

  // ==========================================
  // TEST CONTROLS (ANALYZE, BATCH, RESET)
  // ==========================================
  const handleAnalyzeSingleVideo = async (videoId: string) => {
    if (analyzingVideoId || batchStatus?.isRunning) return;
    setAnalyzingVideoId(videoId);
    setLibraryError(null);
    try {
      const res = await fetch(`/api/test-library/analyze/${encodeURIComponent(videoId)}`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Analysis failed');
      await fetchManifest();
    } catch (err: any) {
      setLibraryError(err?.message || `Failed to analyze video ${videoId}`);
    } finally {
      setAnalyzingVideoId(null);
    }
  };

  const handleStartBatch = async () => {
    if (batchStatus?.isRunning || analyzingVideoId) return;
    setLibraryError(null);
    try {
      const res = await fetch('/api/test-library/batch/start', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to start batch analysis');
      if (data.status) setBatchStatus(data.status);
    } catch (err: any) {
      setLibraryError(err?.message || 'Failed to start batch test');
    }
  };

  const handleStopBatch = async () => {
    try {
      await fetch('/api/test-library/batch/stop', { method: 'POST' });
      setBatchStatus((prev) => (prev ? { ...prev, isRunning: false } : null));
      await fetchManifest();
    } catch (err: any) {
      console.warn('Stop batch warning:', err);
    }
  };

  const handleResetResults = async () => {
    if (batchStatus?.isRunning) return;
    if (!window.confirm('Reset all test results? Video datasets and clips will remain intact.')) return;
    setIsResetting(true);
    try {
      const res = await fetch('/api/test-library/reset-results', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to reset results');
      await fetchManifest();
    } catch (err: any) {
      setLibraryError(err?.message || 'Failed to reset test results');
    } finally {
      setIsResetting(false);
    }
  };

  // Launch video in main dashboard SOC player
  const handlePlayInSOC = (video: ManifestVideoEntry) => {
    const meta: VideoMetadata = {
      width: video.width || 1280,
      height: video.height || 720,
      fps: video.fps || 30,
      duration: video.duration,
      size: video.file_size,
      codec: 'h264',
    };
    onAnalyzeVideo(video.video_url, video.filename, meta);
  };

  // ==========================================
  // EXPLORER (LEGACY DRIVE BROWSER) ACTIONS
  // ==========================================
  const fetchDrives = async () => {
    setIsLoadingDrives(true);
    setExplorerError(null);
    try {
      const res = await fetch('/api/storage/drives');
      if (!res.ok) throw new Error('Failed to load storage drives');
      const data = await res.json();
      setDrives(data.drives || []);
      setShortcuts(data.shortcuts || []);

      if (!currentPath) {
        if (data.shortcuts && data.shortcuts.length > 0) {
          browseToPath(data.shortcuts[0].rootPath);
        } else if (data.drives && data.drives.length > 0) {
          browseToPath(data.drives[0].rootPath);
        }
      }
    } catch (err: any) {
      setExplorerError(err.message || 'Error querying storage drives');
    } finally {
      setIsLoadingDrives(false);
    }
  };

  const browseToPath = async (targetPath: string) => {
    setIsLoadingFolder(true);
    setExplorerError(null);
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
      setExplorerError(err.message || 'Error browsing folder');
    } finally {
      setIsLoadingFolder(false);
    }
  };

  const handleImportVideo = async (fileItem: StorageFileItem) => {
    setImportingVideoPath(fileItem.path);
    setExplorerError(null);
    try {
      const res = await fetch('/api/storage/import-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: fileItem.path }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to import video');
      onAnalyzeVideo(data.url, data.fileName, data.metadata);
    } catch (err: any) {
      setExplorerError(err.message || 'Video import error');
    } finally {
      setImportingVideoPath(null);
    }
  };

  const handleAnalyzeImage = async (fileItem: StorageFileItem) => {
    setAnalyzingImage(fileItem);
    setIsAnalyzingImage(true);
    setImageAnalysisResult(null);
    try {
      const res = await fetch('/api/storage/analyze-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: fileItem.path, threshold: crowdThreshold }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to analyze image');
      setImageAnalysisResult(data);
    } catch (err: any) {
      setExplorerError(err.message || 'Image analysis failed');
      setAnalyzingImage(null);
    } finally {
      setIsAnalyzingImage(false);
    }
  };

  const handleLocalFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const isVid = ['mp4', 'avi', 'mov', 'mkv', 'webm'].includes(ext);
    if (isVid) {
      const blobUrl = URL.createObjectURL(file);
      onAnalyzeVideo(blobUrl, file.name, {
        width: 1280,
        height: 720,
        fps: 30,
        duration: 10,
        size: file.size,
        codec: 'browser-native',
      });
    }
  };

  // ==========================================
  // FILTERING LOGIC FOR TEST LIBRARY
  // ==========================================
  const filteredVideos = manifestVideos.filter((v) => {
    if (categoryFilter !== 'all' && v.category !== categoryFilter) return false;

    if (statusFilter === 'tested') {
      if (!v.testResult || v.testResult.status !== 'COMPLETED') return false;
    } else if (statusFilter === 'pending') {
      if (v.testResult && v.testResult.status === 'COMPLETED') return false;
    } else if (statusFilter === 'tp') {
      if (v.testResult?.classification !== 'TRUE_POSITIVE') return false;
    } else if (statusFilter === 'tn') {
      if (v.testResult?.classification !== 'TRUE_NEGATIVE') return false;
    } else if (statusFilter === 'fp') {
      if (v.testResult?.classification !== 'FALSE_POSITIVE') return false;
    } else if (statusFilter === 'fn') {
      if (v.testResult?.classification !== 'FALSE_NEGATIVE') return false;
    }

    if (librarySearch.trim()) {
      const q = librarySearch.toLowerCase();
      const matchTitle = v.title.toLowerCase().includes(q);
      const matchFile = v.filename.toLowerCase().includes(q);
      const matchSource = v.source_dataset.toLowerCase().includes(q);
      const matchId = v.id.toLowerCase().includes(q);
      if (!matchTitle && !matchFile && !matchSource && !matchId) return false;
    }

    return true;
  });

  const normalVideos = filteredVideos.filter((v) => v.category === 'normal');
  const violenceVideos = filteredVideos.filter((v) => v.category === 'violence');

  // Classification Pill Renderer
  const renderOutcomeBadge = (outcome?: ClassificationOutcome | null, isRunning?: boolean) => {
    if (isRunning) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-mono font-bold bg-cyan-950/80 text-cyan-300 border border-cyan-500/60 animate-pulse">
          <RefreshCw className="w-3 h-3 animate-spin" />
          ANALYZING INFERENCE...
        </span>
      );
    }

    switch (outcome) {
      case 'TRUE_POSITIVE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-mono font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-500/70 shadow-sm shadow-emerald-950">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            TRUE POSITIVE (VIOLENCE DETECTED)
          </span>
        );
      case 'TRUE_NEGATIVE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-mono font-bold bg-cyan-950/80 text-cyan-300 border border-cyan-500/70 shadow-sm shadow-cyan-950">
            <ShieldCheck className="w-3 h-3 text-cyan-400" />
            TRUE NEGATIVE (NORMAL CONFIRMED)
          </span>
        );
      case 'FALSE_POSITIVE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-mono font-bold bg-amber-950/80 text-amber-300 border border-amber-500/80 shadow-sm shadow-amber-950">
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            FALSE POSITIVE (FALSE ALARM)
          </span>
        );
      case 'FALSE_NEGATIVE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-mono font-bold bg-rose-950/80 text-rose-300 border border-rose-500/80 shadow-sm shadow-rose-950">
            <ShieldAlert className="w-3 h-3 text-rose-400" />
            FALSE NEGATIVE (MISSED VIOLENCE)
          </span>
        );
      case 'ERROR':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-mono font-bold bg-red-950/80 text-red-300 border border-red-700">
            <X className="w-3 h-3 text-red-400" />
            PROCESSING ERROR
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-mono font-bold bg-slate-900 text-slate-400 border border-slate-700/60">
            <Clock className="w-3 h-3 text-slate-500" />
            PENDING VALIDATION
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 max-w-[1600px] mx-auto min-h-screen text-slate-100 font-sans">
      {/* ========================================== */}
      {/* TOP HEADER & MODULE TAB SWITCHER           */}
      {/* ========================================== */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-lg shadow-cyan-950/50">
              <ShieldAlert className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white font-mono">
                  VIOLENCE VALIDATION LIBRARY
                </h1>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-950 border border-cyan-800 text-cyan-400">
                  v1.0 BUILT-IN
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Real-world benchmark suite for validating YOLO26n person detection, ByteTrack tracking, and R(2+1)D-18 violence recognition
              </p>
            </div>
          </div>
        </div>

        {/* Primary Tab Switcher */}
        <div className="flex items-center gap-2 bg-[#080d1a] p-1 rounded-xl border border-slate-800/80 self-start md:self-auto">
          <button
            onClick={() => setActiveSubTab('library')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
              activeSubTab === 'library'
                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-900/60'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>TEST LIBRARY ({manifestVideos.length})</span>
          </button>

          <button
            onClick={() => {
              setActiveSubTab('explorer');
              if (drives.length === 0) fetchDrives();
            }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
              activeSubTab === 'explorer'
                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-900/60'
            }`}
          >
            <HardDrive className="w-4 h-4" />
            <span>LOCAL DRIVES & CCTV</span>
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {libraryError && (
        <div className="p-3.5 rounded-xl bg-rose-950/80 border border-rose-600/80 text-rose-200 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{libraryError}</span>
          </div>
          <button onClick={() => setLibraryError(null)} className="text-rose-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ========================================== */}
      {/* SUBTAB 1: BUILT-IN VALIDATION LIBRARY      */}
      {/* ========================================== */}
      {activeSubTab === 'library' && (
        <div className="flex flex-col gap-6">
          {/* SECTION A: DATASET OVERVIEW CARDS */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
            <div className="p-3.5 rounded-xl bg-[#0b1120] border border-slate-800 flex flex-col gap-1">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Total Test Clips</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-mono font-bold text-white">{manifestVideos.length}</span>
                <span className="text-[10px] font-mono text-cyan-400">100% genuine</span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#0b1120] border border-slate-800 flex flex-col gap-1">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Normal (Ground Truth)</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-mono font-bold text-emerald-400">
                  {manifestVideos.filter((v) => v.expected_label === 'NON-VIOLENCE').length}
                </span>
                <span className="text-[10px] font-mono text-slate-400">clips</span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#0b1120] border border-slate-800 flex flex-col gap-1">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Violence (Ground Truth)</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-mono font-bold text-rose-400">
                  {manifestVideos.filter((v) => v.expected_label === 'VIOLENCE').length}
                </span>
                <span className="text-[10px] font-mono text-slate-400">clips</span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#0b1120] border border-slate-800 flex flex-col gap-1">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Successfully Tested</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-mono font-bold text-cyan-300">{metrics?.testedCount || 0}</span>
                <span className="text-[10px] font-mono text-slate-400">/ {manifestVideos.length}</span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#0b1120] border border-slate-800 flex flex-col gap-1">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Pending Tests</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-mono font-bold text-amber-400">{metrics?.pendingCount || 0}</span>
                <span className="text-[10px] font-mono text-slate-400">remaining</span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#0b1120] border border-slate-800 flex flex-col gap-1">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Failed / Errors</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-mono font-bold text-slate-300">{metrics?.failedCount || 0}</span>
                <span className="text-[10px] font-mono text-slate-500">errors</span>
              </div>
            </div>
          </div>

          {/* CONFUSION MATRIX & EMPIRICAL METRICS CARD */}
          <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-b from-[#0c1424] to-[#080d1a] border border-cyan-900/40 shadow-xl flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-mono font-bold text-slate-200 tracking-wider">
                  VALIDATION CONFUSION MATRIX & PIPELINE PERFORMANCE
                </span>
              </div>

              {/* MANDATORY DISCLAIMER BADGE */}
              <div className="px-3 py-1 rounded-md bg-amber-950/70 border border-amber-600/70 text-amber-300 text-[10px] font-mono font-bold tracking-wider">
                ⚠️ SMALL-SAMPLE FUNCTIONAL VALIDATION — NOT A GENERALIZATION CLAIM
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
              {/* 2x2 Matrix */}
              <div className="lg:col-span-6 grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/40 flex flex-col gap-1">
                  <div className="flex items-center justify-between text-[11px] font-mono text-emerald-300 font-bold">
                    <span>TRUE POSITIVE (TP)</span>
                    <span className="text-lg font-bold text-white">{metrics?.truePositives || 0}</span>
                  </div>
                  <p className="text-[10px] text-slate-400">Actual Violence correctly detected by model</p>
                </div>

                <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/40 flex flex-col gap-1">
                  <div className="flex items-center justify-between text-[11px] font-mono text-amber-300 font-bold">
                    <span>FALSE POSITIVE (FP)</span>
                    <span className="text-lg font-bold text-white">{metrics?.falsePositives || 0}</span>
                  </div>
                  <p className="text-[10px] text-slate-400">Normal Activity falsely flagged as Violence</p>
                </div>

                <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-500/40 flex flex-col gap-1">
                  <div className="flex items-center justify-between text-[11px] font-mono text-rose-300 font-bold">
                    <span>FALSE NEGATIVE (FN)</span>
                    <span className="text-lg font-bold text-white">{metrics?.falseNegatives || 0}</span>
                  </div>
                  <p className="text-[10px] text-slate-400">Actual Violence missed or labeled Normal</p>
                </div>

                <div className="p-3 rounded-xl bg-cyan-950/30 border border-cyan-500/40 flex flex-col gap-1">
                  <div className="flex items-center justify-between text-[11px] font-mono text-cyan-300 font-bold">
                    <span>TRUE NEGATIVE (TN)</span>
                    <span className="text-lg font-bold text-white">{metrics?.trueNegatives || 0}</span>
                  </div>
                  <p className="text-[10px] text-slate-400">Normal Activity confirmed with 0 false alarms</p>
                </div>
              </div>

              {/* Computed Statistical Scores */}
              <div className="lg:col-span-6 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 flex flex-col">
                  <span className="text-[10px] font-mono text-slate-400">ACCURACY</span>
                  <span className="text-base font-mono font-bold text-cyan-300">
                    {metrics?.accuracy !== null && metrics?.accuracy !== undefined
                      ? `${(metrics.accuracy * 100).toFixed(1)}%`
                      : 'N/A'}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 flex flex-col">
                  <span className="text-[10px] font-mono text-slate-400">PRECISION</span>
                  <span className="text-base font-mono font-bold text-cyan-300">
                    {metrics?.precision !== null && metrics?.precision !== undefined
                      ? `${(metrics.precision * 100).toFixed(1)}%`
                      : 'N/A'}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 flex flex-col">
                  <span className="text-[10px] font-mono text-slate-400">RECALL</span>
                  <span className="text-base font-mono font-bold text-cyan-300">
                    {metrics?.recall !== null && metrics?.recall !== undefined
                      ? `${(metrics.recall * 100).toFixed(1)}%`
                      : 'N/A'}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 flex flex-col">
                  <span className="text-[10px] font-mono text-slate-400">F1 SCORE</span>
                  <span className="text-base font-mono font-bold text-cyan-300">
                    {metrics?.f1Score !== null && metrics?.f1Score !== undefined
                      ? `${(metrics.f1Score * 100).toFixed(1)}%`
                      : 'N/A'}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 flex flex-col">
                  <span className="text-[10px] font-mono text-slate-400">FALSE POS RATE</span>
                  <span className="text-base font-mono font-bold text-amber-300">
                    {metrics?.falsePositiveRate !== null && metrics?.falsePositiveRate !== undefined
                      ? `${(metrics.falsePositiveRate * 100).toFixed(1)}%`
                      : 'N/A'}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 flex flex-col">
                  <span className="text-[10px] font-mono text-slate-400">FALSE NEG RATE</span>
                  <span className="text-base font-mono font-bold text-rose-300">
                    {metrics?.falseNegativeRate !== null && metrics?.falseNegativeRate !== undefined
                      ? `${(metrics.falseNegativeRate * 100).toFixed(1)}%`
                      : 'N/A'}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 flex flex-col">
                  <span className="text-[10px] font-mono text-slate-400">AVG LATENCY</span>
                  <span className="text-base font-mono font-bold text-slate-200">
                    {metrics?.avgProcessingTimeSec ? `${metrics.avgProcessingTimeSec}s` : 'N/A'}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 flex flex-col">
                  <span className="text-[10px] font-mono text-slate-400">THROUGHPUT</span>
                  <span className="text-base font-mono font-bold text-slate-200">
                    {metrics?.avgThroughputFps ? `${metrics.avgThroughputFps} FPS` : 'N/A'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION B: BATCH CONTROLS & FILTER TOOLBAR */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl bg-[#090e1c] border border-slate-800">
            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-2.5">
              {!batchStatus?.isRunning ? (
                <button
                  onClick={handleStartBatch}
                  disabled={analyzingVideoId !== null}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-mono font-bold text-xs shadow-lg shadow-emerald-950/60 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>RUN ALL SEQUENTIAL TESTS</span>
                </button>
              ) : (
                <button
                  onClick={handleStopBatch}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-mono font-bold text-xs shadow-lg shadow-rose-950/60 transition-all cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>STOP CURRENT BATCH</span>
                </button>
              )}

              <button
                onClick={handleResetResults}
                disabled={isResetting || batchStatus?.isRunning}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-mono text-xs transition-all cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${isResetting ? 'animate-spin' : ''}`} />
                <span>RESET TEST RECORDS</span>
              </button>

              <button
                onClick={fetchManifest}
                disabled={isLoadingManifest}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-mono text-xs transition-all cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingManifest ? 'animate-spin' : ''}`} />
                <span>REFRESH</span>
              </button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Search */}
              <div className="relative min-w-[200px]">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter clips by name..."
                  value={librarySearch}
                  onChange={(e) => setLibrarySearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500"
                />
              </div>

              {/* Category Filter */}
              <div className="flex items-center rounded-lg bg-slate-950 border border-slate-800 p-0.5 text-xs font-mono">
                <button
                  onClick={() => setCategoryFilter('all')}
                  className={`px-2.5 py-1 rounded ${categoryFilter === 'all' ? 'bg-cyan-950 text-cyan-300 font-bold border border-cyan-800' : 'text-slate-400 hover:text-white'}`}
                >
                  ALL ({manifestVideos.length})
                </button>
                <button
                  onClick={() => setCategoryFilter('normal')}
                  className={`px-2.5 py-1 rounded ${categoryFilter === 'normal' ? 'bg-cyan-950 text-cyan-300 font-bold border border-cyan-800' : 'text-slate-400 hover:text-white'}`}
                >
                  NORMAL (8)
                </button>
                <button
                  onClick={() => setCategoryFilter('violence')}
                  className={`px-2.5 py-1 rounded ${categoryFilter === 'violence' ? 'bg-cyan-950 text-cyan-300 font-bold border border-cyan-800' : 'text-slate-400 hover:text-white'}`}
                >
                  VIOLENCE (7)
                </button>
              </div>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300 focus:outline-none focus:border-cyan-500"
              >
                <option value="all">Status: All Statuses</option>
                <option value="tested">Status: Tested Only</option>
                <option value="pending">Status: Pending Only</option>
                <option value="tp">Outcome: True Positive (TP)</option>
                <option value="tn">Outcome: True Negative (TN)</option>
                <option value="fp">Outcome: False Positive (FP)</option>
                <option value="fn">Outcome: False Negative (FN)</option>
              </select>
            </div>
          </div>

          {/* ACTIVE BATCH PROGRESS BANNER */}
          {batchStatus?.isRunning && (
            <div className="p-4 rounded-xl bg-cyan-950/40 border border-cyan-500/50 shadow-lg shadow-cyan-950/50 flex flex-col gap-2.5 animate-pulse">
              <div className="flex items-center justify-between text-xs font-mono">
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin" />
                  <span className="font-bold text-cyan-300">
                    BATCH ANALYSIS IN PROGRESS — Clip {batchStatus.currentIndex + 1} of {batchStatus.totalVideos}: {batchStatus.currentVideoTitle || batchStatus.currentVideoId}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-slate-300">
                  <span>Elapsed: {batchStatus.elapsedSec}s</span>
                  <span className="font-bold text-cyan-400">{batchStatus.percent}%</span>
                </div>
              </div>
              <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-cyan-900">
                <div
                  className="bg-gradient-to-r from-cyan-500 to-emerald-500 h-full rounded-full transition-all duration-300"
                  style={{ width: `${batchStatus.percent}%` }}
                />
              </div>
            </div>
          )}

          {/* ========================================== */}
          {/* SECTION C: TWO VIDEO CATEGORIES            */}
          {/* ========================================== */}

          {/* 1. NORMAL / NON-VIOLENCE CLIPS */}
          {(categoryFilter === 'all' || categoryFilter === 'normal') && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2.5">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  <h2 className="text-sm font-mono font-bold tracking-wider text-emerald-300 uppercase">
                    1. NORMAL / NON-VIOLENCE BENCHMARK ({normalVideos.length} CLIPS)
                  </h2>
                </div>
                <span className="text-[11px] font-mono text-slate-400">
                  Ground Truth: Genuine Routine Human Activity & Crowd Flow
                </span>
              </div>

              {normalVideos.length === 0 ? (
                <div className="p-8 text-center rounded-xl border border-dashed border-slate-800 text-slate-500 font-mono text-xs">
                  No normal activity clips matching current filter.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  {normalVideos.map((video) => (
                    <VideoBenchmarkCard
                      key={video.id}
                      video={video}
                      isAnalyzing={analyzingVideoId === video.id || Boolean(batchStatus?.isRunning && batchStatus?.currentVideoId === video.id)}
                      onAnalyze={() => handleAnalyzeSingleVideo(video.id)}
                      onPlayInSOC={() => handlePlayInSOC(video)}
                      onOpenDetails={() => setSelectedDetailVideo(video)}
                      renderOutcomeBadge={renderOutcomeBadge}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 2. VIOLENCE CLIPS */}
          {(categoryFilter === 'all' || categoryFilter === 'violence') && (
            <div className="flex flex-col gap-3 mt-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2.5">
                  <ShieldAlert className="w-5 h-5 text-rose-400" />
                  <h2 className="text-sm font-mono font-bold tracking-wider text-rose-300 uppercase">
                    2. PHYSICAL VIOLENCE BENCHMARK ({violenceVideos.length} CLIPS)
                  </h2>
                </div>
                <span className="text-[11px] font-mono text-slate-400">
                  Ground Truth: Genuine Physical Altercations, Pushing, Strikes, and Grappling
                </span>
              </div>

              {violenceVideos.length === 0 ? (
                <div className="p-8 text-center rounded-xl border border-dashed border-slate-800 text-slate-500 font-mono text-xs">
                  No violence clips matching current filter.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  {violenceVideos.map((video) => (
                    <VideoBenchmarkCard
                      key={video.id}
                      video={video}
                      isAnalyzing={analyzingVideoId === video.id || Boolean(batchStatus?.isRunning && batchStatus?.currentVideoId === video.id)}
                      onAnalyze={() => handleAnalyzeSingleVideo(video.id)}
                      onPlayInSOC={() => handlePlayInSOC(video)}
                      onOpenDetails={() => setSelectedDetailVideo(video)}
                      renderOutcomeBadge={renderOutcomeBadge}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================== */}
      {/* SUBTAB 2: LOCAL DRIVES & CCTV ARCHIVE      */}
      {/* ========================================== */}
      {activeSubTab === 'explorer' && (
        <div className="flex flex-col gap-6">
          {/* Header Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-[#090e1c] border border-slate-800">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-mono font-bold text-slate-200">
                LOCAL COMPUTER DRIVES, USB PEN DRIVES, AND EVIDENCE ARCHIVES
              </span>
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

          {explorerError && (
            <div className="p-3.5 rounded-xl bg-rose-950/80 border border-rose-600/80 text-rose-200 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{explorerError}</span>
              </div>
              <button onClick={() => setExplorerError(null)} className="text-rose-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Drive & Folder Explorer Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Drives List (4 cols) */}
            <div className="lg:col-span-4 flex flex-col gap-4">
              {/* Local Drives */}
              <div className="bg-[#0b101d] border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <span className="text-xs font-mono font-bold text-slate-300 flex items-center gap-2">
                    💻 THIS PC — FIXED DRIVES
                  </span>
                  <span className="text-[10px] font-mono text-cyan-400 font-bold">
                    {drives.filter((d) => !d.isRemovable).length} DETECTED
                  </span>
                </div>

                <div className="flex flex-col gap-2.5">
                  {drives
                    .filter((d) => !d.isRemovable)
                    .map((d) => (
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

              {/* Removable Storage (USB) */}
              <div className="bg-[#0b101d] border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <span className="text-xs font-mono font-bold text-amber-300 flex items-center gap-2">
                    🔌 REMOVABLE STORAGE (USB / PEN DRIVE)
                  </span>
                  <span className="text-[10px] font-mono text-amber-400 font-bold">
                    {drives.filter((d) => d.isRemovable).length} ATTACHED
                  </span>
                </div>

                {drives.filter((d) => d.isRemovable).length === 0 ? (
                  <div className="p-4 rounded-xl border border-dashed border-slate-800 text-center text-slate-500 text-xs font-mono">
                    No removable USB drives currently attached. Plug in a USB pen drive to view evidence.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {drives
                      .filter((d) => d.isRemovable)
                      .map((d) => (
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
                        </button>
                      ))}
                  </div>
                )}
              </div>
            </div>

            {/* Folder & Files View (8 cols) */}
            <div className="lg:col-span-8 flex flex-col gap-4">
              {/* Path Breadcrumbs */}
              <div className="p-3 rounded-xl bg-[#0b101d] border border-slate-800 flex items-center gap-2 overflow-x-auto text-xs font-mono">
                {parentPath && (
                  <button
                    onClick={() => browseToPath(parentPath)}
                    className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                  >
                    <CornerLeftUp className="w-4 h-4" />
                  </button>
                )}
                {breadcrumbs.map((b, i) => (
                  <React.Fragment key={b.path}>
                    {i > 0 && <span className="text-slate-600">/</span>}
                    <button
                      onClick={() => browseToPath(b.path)}
                      className={`hover:underline cursor-pointer ${
                        i === breadcrumbs.length - 1 ? 'text-cyan-400 font-bold' : 'text-slate-400'
                      }`}
                    >
                      {b.name}
                    </button>
                  </React.Fragment>
                ))}
              </div>

              {/* Folders & Media Grid */}
              <div className="p-4 rounded-xl bg-[#0b101d] border border-slate-800 flex flex-col gap-4 min-h-[400px]">
                {isLoadingFolder ? (
                  <div className="flex flex-col items-center justify-center py-20 text-slate-500 font-mono gap-2">
                    <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
                    <span>Loading directory contents...</span>
                  </div>
                ) : (
                  <>
                    {/* Folders */}
                    {folders.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <span className="text-[11px] font-mono text-slate-400">FOLDERS ({folders.length})</span>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                          {folders.map((f) => (
                            <button
                              key={f.path}
                              onClick={() => browseToPath(f.path)}
                              className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-left text-xs font-mono text-slate-200 transition-all cursor-pointer"
                            >
                              <Folder className="w-4 h-4 text-cyan-400 shrink-0" />
                              <span className="truncate">{f.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Videos */}
                    {videos.length > 0 && (
                      <div className="flex flex-col gap-2 mt-2">
                        <span className="text-[11px] font-mono text-slate-400">CCTV VIDEOS ({videos.length})</span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {videos.map((v) => (
                            <div
                              key={v.path}
                              className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 flex flex-col gap-2"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 truncate">
                                  <Film className="w-4 h-4 text-cyan-400 shrink-0" />
                                  <span className="text-xs font-mono text-white font-bold truncate">{v.name}</span>
                                </div>
                                <span className="text-[10px] font-mono text-slate-400 shrink-0">
                                  {v.sizeFormatted}
                                </span>
                              </div>
                              <div className="flex items-center justify-end gap-2 mt-1">
                                <button
                                  onClick={() => setPreviewVideo(v)}
                                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-mono text-slate-300 flex items-center gap-1 cursor-pointer"
                                >
                                  <Eye className="w-3 h-3" /> Preview
                                </button>
                                <button
                                  onClick={() => handleImportVideo(v)}
                                  disabled={importingVideoPath === v.path}
                                  className="px-2.5 py-1 rounded bg-cyan-950 hover:bg-cyan-900 border border-cyan-700 text-[10px] font-mono text-cyan-300 font-bold flex items-center gap-1 cursor-pointer"
                                >
                                  {importingVideoPath === v.path ? (
                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Play className="w-3 h-3" />
                                  )}
                                  Import to SOC
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Images */}
                    {images.length > 0 && (
                      <div className="flex flex-col gap-2 mt-2">
                        <span className="text-[11px] font-mono text-slate-400">STATIC EVIDENCE IMAGES ({images.length})</span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {images.map((img) => (
                            <div
                              key={img.path}
                              className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 flex flex-col gap-2"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 truncate">
                                  <ImageIcon className="w-4 h-4 text-purple-400 shrink-0" />
                                  <span className="text-xs font-mono text-white font-bold truncate">{img.name}</span>
                                </div>
                                <span className="text-[10px] font-mono text-slate-400 shrink-0">
                                  {img.sizeFormatted}
                                </span>
                              </div>
                              <div className="flex items-center justify-end gap-2 mt-1">
                                <button
                                  onClick={() => handleAnalyzeImage(img)}
                                  className="px-2.5 py-1 rounded bg-purple-950 hover:bg-purple-900 border border-purple-700 text-[10px] font-mono text-purple-300 font-bold flex items-center gap-1 cursor-pointer"
                                >
                                  <Scan className="w-3 h-3" /> Run YOLO Inference
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {folders.length === 0 && videos.length === 0 && images.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-20 text-slate-500 font-mono text-xs">
                        No supported video (.mp4, .avi, .mov) or image evidence found in this folder.
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL: VIDEO BENCHMARK DETAIL VIEW         */}
      {/* ========================================== */}
      {selectedDetailVideo && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          <div className="bg-[#0b101f] border border-cyan-800/80 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-800 bg-[#080d19]">
              <div className="flex items-center gap-3">
                <span className="px-2.5 py-1 rounded font-mono font-bold text-xs bg-cyan-950 border border-cyan-700 text-cyan-300">
                  {selectedDetailVideo.id.toUpperCase()}
                </span>
                <div>
                  <h3 className="text-base font-bold text-white font-mono">{selectedDetailVideo.title}</h3>
                  <span className="text-[11px] font-mono text-slate-400">{selectedDetailVideo.filename}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedDetailVideo(null)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 overflow-y-auto flex flex-col gap-5">
              {/* Video Player */}
              <div className="relative aspect-video rounded-xl overflow-hidden bg-black border border-slate-800">
                <video
                  src={selectedDetailVideo.video_url}
                  controls
                  className="w-full h-full object-contain"
                />
              </div>

              {/* Side-by-side Classification Card */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col gap-2">
                  <span className="text-[11px] font-mono text-slate-400">EXPECTED GROUND TRUTH</span>
                  <div className="flex items-center gap-2">
                    {selectedDetailVideo.expected_label === 'VIOLENCE' ? (
                      <span className="px-3 py-1.5 rounded-lg text-xs font-mono font-bold bg-rose-950 text-rose-300 border border-rose-600">
                        VIOLENCE (PHYSICAL ALTERCATION)
                      </span>
                    ) : (
                      <span className="px-3 py-1.5 rounded-lg text-xs font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-600">
                        NON-VIOLENCE (ROUTINE ACTIVITY)
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed mt-1">
                    {selectedDetailVideo.inclusion_notes}
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col gap-2">
                  <span className="text-[11px] font-mono text-slate-400">MODEL PREDICTION & OUTCOME</span>
                  <div>
                    {renderOutcomeBadge(selectedDetailVideo.testResult?.classification)}
                  </div>
                  {selectedDetailVideo.testResult ? (
                    <div className="flex flex-col gap-1 text-[11px] font-mono text-slate-300 mt-2">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Predicted Class:</span>
                        <span className="font-bold text-white">{selectedDetailVideo.testResult.predictedLabel}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Confidence Score:</span>
                        <span className="font-bold text-cyan-400">
                          {(selectedDetailVideo.testResult.confidence * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Frames Analyzed:</span>
                        <span>{selectedDetailVideo.testResult.framesAnalyzed}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Peak People Detected:</span>
                        <span>{selectedDetailVideo.testResult.peakPeople} persons</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Processing Time / Speed:</span>
                        <span>
                          {(selectedDetailVideo.testResult.processingTimeMs / 1000).toFixed(2)}s ({selectedDetailVideo.testResult.processingFps} FPS)
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Last Validated:</span>
                        <span>{new Date(selectedDetailVideo.testResult.testedAt).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs font-mono text-slate-500 mt-2">
                      Clip has not been analyzed yet. Click "Analyze Video" to test against the model.
                    </div>
                  )}
                </div>
              </div>

              {/* Attribution and Provenance */}
              <div className="p-4 rounded-xl bg-[#080d19] border border-slate-800/80 flex flex-col gap-2 text-xs font-mono">
                <span className="text-slate-400 font-bold flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-cyan-400" />
                  DATASET PROVENANCE & ACCESS TERMS
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-300">
                  <div>
                    <span className="text-slate-500">Original Dataset: </span>
                    {selectedDetailVideo.source_dataset}
                  </div>
                  <div>
                    <span className="text-slate-500">License Terms: </span>
                    {selectedDetailVideo.license}
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-slate-500">Source Identifier: </span>
                    <span className="text-cyan-400 underline">{selectedDetailVideo.source_url}</span>
                  </div>
                </div>
              </div>

              {/* Red/Blue Participant Validation Note */}
              <div className="p-3.5 rounded-xl bg-cyan-950/30 border border-cyan-800/40 text-xs font-mono text-cyan-300 flex items-start gap-2.5">
                <Cpu className="w-4 h-4 shrink-0 text-cyan-400 mt-0.5" />
                <div className="flex flex-col gap-1">
                  <span className="font-bold">PARTICIPANT COLOR VALIDATION (RED / BLUE)</span>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    When played in the SOC Dashboard, normally tracked people display <strong>BLUE</strong> bounding boxes (#00f0ff). Upon confirmed violence, verified altercation participants dynamically transition to <strong>RED</strong> (#ef4444) and return to <strong>BLUE</strong> when the event clears.
                  </p>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between p-4 border-t border-slate-800 bg-[#080d19]">
              <button
                onClick={() => handlePlayInSOC(selectedDetailVideo)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-mono font-bold text-xs transition-all cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>LOAD & PLAY IN LIVE SOC</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    handleAnalyzeSingleVideo(selectedDetailVideo.id);
                  }}
                  disabled={analyzingVideoId === selectedDetailVideo.id}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-mono font-bold text-xs transition-all cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${analyzingVideoId === selectedDetailVideo.id ? 'animate-spin' : ''}`} />
                  <span>RE-ANALYZE VIDEO</span>
                </button>
                <button
                  onClick={() => setSelectedDetailVideo(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs cursor-pointer"
                >
                  CLOSE
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EXPLORER VIDEO PREVIEW */}
      {previewVideo && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0b101d] border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-800">
              <span className="font-mono text-xs font-bold text-white truncate">{previewVideo.name}</span>
              <button onClick={() => setPreviewVideo(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="aspect-video bg-black">
              <video
                src={`/api/storage/media?path=${encodeURIComponent(previewVideo.path)}`}
                controls
                autoPlay
                className="w-full h-full object-contain"
              />
            </div>
            <div className="p-3 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => {
                  handleImportVideo(previewVideo);
                  setPreviewVideo(null);
                }}
                className="px-4 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-mono font-bold text-xs"
              >
                Import to SOC
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: IMAGE YOLO ANALYSIS */}
      {analyzingImage && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0b101d] border border-slate-800 rounded-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Scan className="w-4 h-4 text-purple-400" />
                <span className="font-mono text-xs font-bold text-white truncate">{analyzingImage.name}</span>
              </div>
              <button onClick={() => setAnalyzingImage(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex flex-col gap-4">
              {isAnalyzingImage ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400 font-mono gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-purple-400" />
                  <span>Running YOLO26n person inference on evidence frame...</span>
                </div>
              ) : imageAnalysisResult ? (
                <>
                  <div className="relative aspect-video rounded-xl overflow-hidden bg-black border border-slate-800">
                    <img
                      src={imageAnalysisResult.mediaUrl}
                      alt={analyzingImage.name}
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex flex-col">
                      <span className="text-slate-400 text-[10px]">PEOPLE DETECTED</span>
                      <span className="text-lg font-bold text-cyan-400">{imageAnalysisResult.peopleCount}</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex flex-col">
                      <span className="text-slate-400 text-[10px]">CROWD STATUS</span>
                      <span className={`text-lg font-bold ${imageAnalysisResult.crowdStatus === 'WARNING' ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {imageAnalysisResult.crowdStatus}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex flex-col">
                      <span className="text-slate-400 text-[10px]">INFERENCE TIME</span>
                      <span className="text-lg font-bold text-slate-200">{imageAnalysisResult.inferenceTimeMs}ms</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex flex-col">
                      <span className="text-slate-400 text-[10px]">MODEL</span>
                      <span className="text-lg font-bold text-purple-400">{imageAnalysisResult.model}</span>
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ==========================================
// VIDEO BENCHMARK CARD SUBCOMPONENT
// ==========================================
interface VideoBenchmarkCardProps {
  video: ManifestVideoEntry;
  isAnalyzing: boolean;
  onAnalyze: () => void;
  onPlayInSOC: () => void;
  onOpenDetails: () => void;
  renderOutcomeBadge: (outcome?: ClassificationOutcome | null, isRunning?: boolean) => React.ReactNode;
}

const VideoBenchmarkCard: React.FC<VideoBenchmarkCardProps> = ({
  video,
  isAnalyzing,
  onAnalyze,
  onPlayInSOC,
  onOpenDetails,
  renderOutcomeBadge,
}) => {
  return (
    <div className="p-3.5 rounded-xl bg-[#0a0f1d] border border-slate-800 hover:border-slate-700 flex flex-col gap-3 transition-all hover:shadow-xl hover:shadow-cyan-950/20 group">
      {/* Thumbnail + Video Duration Pill */}
      <div className="relative aspect-video rounded-lg overflow-hidden bg-slate-950 border border-slate-800/80">
        <img
          src={video.thumbnail_url}
          alt={video.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          onError={(e) => {
            (e.target as any).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270" viewBox="0 0 480 270"><rect width="480" height="270" fill="%230f172a"/><text x="240" y="135" fill="%2364748b" font-family="monospace" font-size="14" text-anchor="middle" dominant-baseline="middle">THUMBNAIL PREVIEW</text></svg>';
          }}
        />

        {/* Video ID pill */}
        <div className="absolute top-2 left-2 px-2 py-0.5 rounded font-mono font-bold text-[10px] bg-slate-950/90 border border-slate-700 text-cyan-300">
          {video.id.toUpperCase()}
        </div>

        {/* Duration & FPS pill */}
        <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded font-mono font-bold text-[10px] bg-slate-950/90 border border-slate-800 text-slate-300">
          {video.duration}s • {video.fps} FPS
        </div>

        {/* Play Icon Overlay on Hover */}
        <button
          onClick={onPlayInSOC}
          className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer"
        >
          <div className="w-10 h-10 rounded-full bg-cyan-500/90 text-slate-950 flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform">
            <Play className="w-5 h-5 fill-current ml-0.5" />
          </div>
        </button>
      </div>

      {/* Title & Metadata */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-1.5">
          <h3 className="font-mono font-bold text-xs text-white leading-snug line-clamp-1 group-hover:text-cyan-300 transition-colors">
            {video.title}
          </h3>
          <span className="text-[10px] font-mono text-slate-400 shrink-0">{video.file_size_formatted}</span>
        </div>

        {/* Ground Truth Label Badge */}
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-mono text-slate-500">GROUND TRUTH:</span>
          {video.expected_label === 'VIOLENCE' ? (
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-950/80 text-rose-300 border border-rose-700/60">
              VIOLENCE
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-700/60">
              NON-VIOLENCE
            </span>
          )}
        </div>

        {/* Prediction Outcome Badge */}
        <div className="mt-1">
          {renderOutcomeBadge(video.testResult?.classification, isAnalyzing)}
        </div>

        {/* Details Row */}
        {video.testResult && (
          <div className="grid grid-cols-2 gap-1 text-[10px] font-mono text-slate-400 mt-1 pt-1 border-t border-slate-800/80">
            <span>Conf: {(video.testResult.confidence * 100).toFixed(0)}%</span>
            <span className="text-right">Speed: {video.testResult.processingFps} FPS</span>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-1.5 pt-2 border-t border-slate-800/80 mt-auto">
        <button
          onClick={onPlayInSOC}
          className="flex-1 py-1.5 px-2 rounded-lg bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-800 text-[10px] font-mono font-bold text-cyan-300 flex items-center justify-center gap-1 transition-all cursor-pointer"
        >
          <Play className="w-3 h-3 fill-current" />
          <span>Play in SOC</span>
        </button>

        <button
          onClick={onAnalyze}
          disabled={isAnalyzing}
          className="py-1.5 px-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[10px] font-mono font-bold text-slate-200 flex items-center justify-center gap-1 transition-all cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${isAnalyzing ? 'animate-spin text-cyan-400' : ''}`} />
          <span>{video.testResult ? 'Re-test' : 'Analyze'}</span>
        </button>

        <button
          onClick={onOpenDetails}
          className="py-1.5 px-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[10px] font-mono text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
        >
          <Info className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
