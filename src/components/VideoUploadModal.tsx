import React, { useState, useRef } from 'react';
import { UploadCloud, X, FileVideo, AlertCircle, CheckCircle2, Loader2, Ban } from 'lucide-react';
import { VideoMetadata, UploadState } from '../types';

interface VideoUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: (url: string, filename: string, metadata: VideoMetadata) => void;
}

const CHUNK_SIZE = 8 * 1024 * 1024; // 8 MB chunks - safe across any proxy limit

export const VideoUploadModal: React.FC<VideoUploadModalProps> = ({
  isOpen,
  onClose,
  onUploadSuccess,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeUploadIdRef = useRef<string | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>('IDLE');
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [statusDetail, setStatusDetail] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  if (!isOpen) return null;

  const resetAllState = () => {
    setSelectedFile(null);
    setUploadState('IDLE');
    setUploadProgress(0);
    setStatusDetail('');
    setErrorMessage(null);
    activeUploadIdRef.current = null;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileChange = (file: File) => {
    setErrorMessage(null);
    const MAX_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB

    if (file.size > MAX_SIZE_BYTES) {
      setErrorMessage(`Selected video exceeds 500 MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB). Please choose a smaller surveillance file.`);
      setSelectedFile(null);
      return;
    }

    const validExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v', '.ts', '.mpg', '.mpeg', '.flv'];
    const dotIndex = file.name.lastIndexOf('.');
    const ext = dotIndex !== -1 ? file.name.substring(dotIndex).toLowerCase() : '';
    const isVideoMime = file.type ? file.type.startsWith('video/') : false;

    if (!validExtensions.includes(ext) && !isVideoMime) {
      setErrorMessage(`Unsupported format "${ext || file.name}". Please upload an MP4, WebM, MOV, AVI, or MKV video.`);
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
    setUploadState('SELECTED');
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  // Immediate universal cancellation
  const handleCancel = async () => {
    if (uploadState === 'UPLOADING' || uploadState === 'PROCESSING') {
      setUploadState('CANCEL_REQUESTED');
      setStatusDetail('Cancelling upload and cleaning up server buffers...');

      // Abort active fetch request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Notify server to clean up partial chunks & cancel analysis
      if (activeUploadIdRef.current) {
        try {
          await fetch('/api/upload/cancel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uploadId: activeUploadIdRef.current }),
          });
        } catch {}
      }

      setUploadState('CANCELLED');
      setStatusDetail('Upload cancelled.');
      setTimeout(() => {
        resetAllState();
        onClose();
      }, 700);
    } else {
      resetAllState();
      onClose();
    }
  };

  const handleUploadSubmit = async () => {
    if (!selectedFile) return;

    setErrorMessage(null);
    setUploadState('UPLOADING');
    setUploadProgress(0);

    const uploadId = `up_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    activeUploadIdRef.current = uploadId;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const totalChunks = Math.ceil(selectedFile.size / CHUNK_SIZE);
    setStatusDetail(`Uploading 0 of ${totalChunks} chunks...`);

    try {
      // 1. Upload chunks sequentially (each <= 8 MB, safe across any proxy)
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        if (controller.signal.aborted) return;

        const start = chunkIndex * CHUNK_SIZE;
        const end = Math.min(selectedFile.size, start + CHUNK_SIZE);
        const chunkBlob = selectedFile.slice(start, end);

        const formData = new FormData();
        formData.append('uploadId', uploadId);
        formData.append('chunkIndex', String(chunkIndex));
        formData.append('totalChunks', String(totalChunks));
        formData.append('chunk', chunkBlob, `chunk_${chunkIndex}`);

        setStatusDetail(`Uploading chunk ${chunkIndex + 1} of ${totalChunks} (${Math.round((chunkIndex / totalChunks) * 85)}%)...`);

        const chunkRes = await fetch(
          `/api/upload/chunk?uploadId=${encodeURIComponent(uploadId)}&chunkIndex=${chunkIndex}&totalChunks=${totalChunks}`,
          {
            method: 'POST',
            headers: {
              'X-Upload-Id': uploadId,
              'X-Chunk-Index': String(chunkIndex),
              'X-Total-Chunks': String(totalChunks),
            },
            body: formData,
            signal: controller.signal,
          }
        );

        if (!chunkRes.ok) {
          const errJson = await chunkRes.json().catch(() => ({}));
          throw new Error(errJson.error || `Upload error on chunk ${chunkIndex + 1} (${chunkRes.status} ${chunkRes.statusText})`);
        }

        const currentPct = Math.round(((chunkIndex + 1) / totalChunks) * 85);
        setUploadProgress(currentPct);
      }

      // 2. Complete assembly and verify stream
      setUploadState('PROCESSING');
      setUploadProgress(90);
      setStatusDetail('Assembling stream & verifying video codecs...');

      const completeRes = await fetch(
        `/api/upload/complete?uploadId=${encodeURIComponent(uploadId)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Upload-Id': uploadId,
          },
          body: JSON.stringify({
            uploadId,
            fileName: selectedFile.name,
            totalChunks,
            fileSize: selectedFile.size,
          }),
          signal: controller.signal,
        }
      );

      if (!completeRes.ok) {
        const errorData = await completeRes.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || `Processing failed with status ${completeRes.status}`);
      }

      const completeData = await completeRes.json();
      setUploadProgress(100);
      setUploadState('COMPLETED');
      setStatusDetail('Upload complete! Launching AI analysis pipeline...');

      const resolvedUrl =
        completeData.videoUrl ||
        completeData.url ||
        (completeData.fileName ? `/api/media/${completeData.fileName}` : '');
      const resolvedFilename = completeData.fileName || completeData.originalName || selectedFile.name;

      setTimeout(() => {
        onUploadSuccess(
          resolvedUrl,
          resolvedFilename,
          completeData.metadata || {
            duration: 0,
            width: 1280,
            height: 720,
            fps: 30,
            frameCount: 0,
          }
        );
        resetAllState();
        onClose();
      }, 600);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Upload aborted by user');
        return;
      }
      console.error('Upload failed:', err);
      setErrorMessage(err.message || 'Failed to complete video upload.');
      setUploadState('FAILED');
    }
  };

  const isBusy = uploadState === 'UPLOADING' || uploadState === 'PROCESSING' || uploadState === 'CANCEL_REQUESTED';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-[#070b14] border-2 border-cyan-500/40 rounded-2xl shadow-2xl comic-panel-cyan p-6 flex flex-col gap-4 text-slate-100 font-mono overflow-hidden">
        {/* Subtle Halftone in corners */}
        <div className="absolute inset-0 comic-halftone opacity-20 pointer-events-none" />

        {/* Framing Reticles */}
        <div className="absolute top-3 left-3 text-cyan-500/40 text-[9px] pointer-events-none">
          ┌ INGESTION MATRIX
        </div>
        <div className="absolute top-3 right-3 text-cyan-500/40 text-[9px] pointer-events-none">
          SEC-01 ┐
        </div>

        {/* Modal Header */}
        <div className="relative z-10 flex items-center justify-between border-b-2 border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-950/80 border border-cyan-500/50 text-cyan-400">
              <FileVideo className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white uppercase tracking-wider">
                SURVEILLANCE INGESTION
              </h3>
              <p className="text-[11px] text-cyan-400/80 uppercase tracking-widest font-semibold">
                UPLOAD VIDEO FOR AI ANALYSIS
              </p>
            </div>
          </div>
          <button
            onClick={handleCancel}
            disabled={uploadState === 'CANCEL_REQUESTED'}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 cursor-pointer font-bold text-sm"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drop Zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !isBusy && fileInputRef.current?.click()}
          className={`relative z-10 border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
            isDragging
              ? 'border-cyan-400 bg-cyan-950/40 scale-[1.01]'
              : selectedFile
              ? 'border-emerald-500/80 bg-emerald-950/20 comic-panel'
              : 'border-slate-700 hover:border-cyan-500/60 bg-[#0a0f1d] comic-panel'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,.mp4,.webm,.mov,.avi,.mkv,.m4v,.ts,.mpg,.mpeg,.flv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFileChange(e.target.files[0])}
          />

          {selectedFile ? (
            <div className="flex flex-col items-center gap-2 text-emerald-400">
              <CheckCircle2 className="w-10 h-10 animate-comic-pop" />
              <span className="font-bold text-sm text-white">{selectedFile.name}</span>
              <span className="text-xs text-slate-400 font-mono">
                {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • {Math.ceil(selectedFile.size / CHUNK_SIZE)} Chunks
              </span>
              {!isBusy && (
                <span className="text-[11px] text-cyan-400 mt-1 font-bold">
                  Click or drag to change file
                </span>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2.5">
              <div className="w-12 h-12 rounded-xl bg-cyan-950/60 border border-cyan-500/40 flex items-center justify-center text-cyan-400 mb-1">
                <UploadCloud className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-slate-200">
                DRAG & DROP SURVEILLANCE VIDEO, OR <span className="text-cyan-400 underline">BROWSE</span>
              </p>
              <p className="text-xs text-slate-400">
                MP4 • WEBM • MOV • AVI • MKV (Chunked Upload up to 500 MB)
              </p>
            </div>
          )}
        </div>

        {/* Error Message */}
        {errorMessage && (
          <div className="relative z-10 p-3 rounded-xl bg-rose-950/80 border border-rose-600 text-rose-200 text-xs flex items-center gap-2 comic-panel">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span className="flex-1 font-sans">{errorMessage}</span>
          </div>
        )}

        {/* Upload / Processing Progress */}
        {uploadState !== 'IDLE' && uploadState !== 'SELECTED' && (
          <div className="relative z-10 flex flex-col gap-1.5 p-3.5 rounded-xl bg-[#0a0f1d] border border-slate-800 comic-panel">
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span className="flex items-center gap-2">
                {uploadState === 'UPLOADING' || uploadState === 'PROCESSING' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                ) : uploadState === 'CANCEL_REQUESTED' || uploadState === 'CANCELLED' ? (
                  <Ban className="w-3.5 h-3.5 text-amber-400" />
                ) : uploadState === 'COMPLETED' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                )}
                <span className="text-[11px] font-semibold">{statusDetail || 'Processing...'}</span>
              </span>
              <span className="font-bold text-cyan-400">{uploadProgress}%</span>
            </div>
            <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
              <div
                className={`h-full transition-all duration-300 ${
                  uploadState === 'CANCEL_REQUESTED' || uploadState === 'CANCELLED'
                    ? 'bg-amber-500'
                    : uploadState === 'FAILED'
                    ? 'bg-rose-500'
                    : 'bg-gradient-to-r from-cyan-500 to-blue-500'
                }`}
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="relative z-10 flex items-center justify-between pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={handleCancel}
            className={`px-4 py-2 rounded-xl text-xs font-bold comic-panel transition-all active:scale-95 cursor-pointer ${
              isBusy
                ? 'bg-rose-950/70 hover:bg-rose-900 border border-rose-600 text-rose-300 hover:text-white'
                : 'bg-[#0a0f1d] hover:bg-slate-800 text-slate-300 border border-slate-700'
            }`}
          >
            {uploadState === 'CANCEL_REQUESTED' ? 'CANCELLING...' : isBusy ? 'CANCEL UPLOAD' : 'CLOSE'}
          </button>

          <button
            type="button"
            onClick={handleUploadSubmit}
            disabled={!selectedFile || isBusy}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-black font-extrabold text-xs shadow-md shadow-cyan-500/25 comic-panel transition-all transform hover:scale-[1.02] active:scale-95 cursor-pointer"
          >
            {uploadState === 'UPLOADING' ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
                <span>UPLOADING CHUNKS...</span>
              </>
            ) : uploadState === 'PROCESSING' ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
                <span>ASSEMBLING STREAM...</span>
              </>
            ) : (
              <>
                <UploadCloud className="w-4 h-4 text-black" />
                <span>START SURVEILLANCE ANALYSIS</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
