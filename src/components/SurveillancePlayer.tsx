import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  StepBack,
  StepForward,
  RotateCcw,
  UploadCloud,
  FileVideo,
  AlertTriangle,
  Clock,
  Crosshair,
  ShieldAlert,
  Zap,
} from 'lucide-react';
import {
  VideoMetadata,
  TrackedObject,
  OpticalFlowResult,
  VisualConfig,
  PlaybackState,
  AnalysisStatus,
  VisionSenseAlert,
} from '../types';
import { TelemetryStore } from '../analytics/telemetryStore';
import { detectorManager } from '../tracking/detectorManager';
import { ByteTracker, RawDetection } from '../tracking/bytetrack';
import { notificationService } from '../services/notificationService';

interface SurveillancePlayerProps {
  videoUrl: string | null;
  videoMetadata: VideoMetadata | null;
  hasVideo: boolean;
  activeTracks?: TrackedObject[];
  opticalFlow?: OpticalFlowResult | null;
  visualConfig: VisualConfig;
  onUploadClick: () => void;
  onResetVideo?: () => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  seekToTimestamp?: number | null;
  onSeekHandled?: () => void;
  videoRef: React.RefObject<HTMLVideoElement>;
  telemetryStore: TelemetryStore;
  playbackState?: PlaybackState;
  analysisStatus?: AnalysisStatus;
  analysisProgress?: number;
  activeAlertBanner?: VisionSenseAlert | null;
  onDismissAlert?: () => void;
  onSelectAlertTime?: (timestamp: number) => void;
  recentAlerts?: VisionSenseAlert[];
  availableFeeds?: Array<{
    id: string;
    fileName: string;
    url: string;
    label: string;
    cameraCode: string;
    hasTelemetry: boolean;
  }>;
  activeFeedName?: string;
  onSelectFeed?: (feed: { fileName: string; url: string; label: string }) => void;
  crowdThreshold?: number;
  onLiveTracksDetected?: (tracks: TrackedObject[], count: number) => void;
}

export const SurveillancePlayer: React.FC<SurveillancePlayerProps> = ({
  videoUrl,
  videoMetadata,
  hasVideo,
  activeTracks: fallbackTracks = [],
  opticalFlow: fallbackFlow = null,
  visualConfig,
  onUploadClick,
  onResetVideo,
  onTimeUpdate,
  seekToTimestamp,
  onSeekHandled,
  videoRef,
  telemetryStore,
  playbackState = 'PAUSED',
  analysisStatus = 'QUEUED',
  analysisProgress = 0,
  activeAlertBanner = null,
  onDismissAlert,
  onSelectAlertTime,
  recentAlerts = [],
  availableFeeds = [],
  activeFeedName,
  onSelectFeed,
  crowdThreshold = 20,
  onLiveTracksDetected,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [volume, setVolume] = useState<number>(1.0);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);

  // Video Streaming State
  const [videoError, setVideoError] = useState<string | null>(null);
  const [isVideoLoading, setIsVideoLoading] = useState<boolean>(false);
  const [showFeedMenu, setShowFeedMenu] = useState<boolean>(false);

  // Status message when AI is behind or seeking to unanalyzed frame
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  const [syncPeopleCount, setSyncPeopleCount] = useState<number>(0);
  const [syncCrowdStatus, setSyncCrowdStatus] = useState<'NORMAL' | 'WARNING'>('NORMAL');

  // Local ByteTracker and tracks for on-the-fly client inference fallback
  const localTrackerRef = useRef<ByteTracker>(new ByteTracker(0.20, 0.35, 0.30, 30, 1));
  const [clientDetectedTracks, setClientDetectedTracks] = useState<TrackedObject[]>([]);
  const isClientInferringRef = useRef<boolean>(false);

  // Track ID initial appearance timestamps for kinetic pop animation (scale 0.85 -> 1.05 -> 1.0)
  const trackSeenTimesRef = useRef<Map<number, number>>(new Map());

  // Auto-load & auto-play surveillance video when videoUrl arrives
  useEffect(() => {
    const video = videoRef.current;
    if (video && videoUrl) {
      setVideoError(null);
      setIsVideoLoading(true);
      video.load();

      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsPlaying(true);
            setIsVideoLoading(false);
          })
          .catch((err) => {
            // Browsers block autoplay if unmuted or without gesture: graceful standby
            console.log('[SurveillancePlayer] Autoplay standby (awaiting operator gesture):', err?.message);
            setIsPlaying(false);
            setIsVideoLoading(false);
          });
      }
    }
  }, [videoUrl, videoRef]);

  // Handle seeking when requested externally (e.g. clicking an alert in the timeline)
  useEffect(() => {
    if (seekToTimestamp !== null && seekToTimestamp !== undefined && videoRef.current) {
      const target = seekToTimestamp;
      videoRef.current.currentTime = target;
      setCurrentTime(target);
      if (onTimeUpdate) {
        onTimeUpdate(target, videoRef.current.duration || 0);
      }
      if (onSeekHandled) onSeekHandled();
    }
  }, [seekToTimestamp, onSeekHandled, videoRef, onTimeUpdate]);

  // Comprehensive Video playback event listeners (ensures 100% time sync on play, pause, seek, scrub)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const syncCurrentPosition = () => {
      const cur = video.currentTime;
      const dur = video.duration || 0;
      if (!isScrubbing) {
        setCurrentTime(cur);
      }
      if (onTimeUpdate) {
        onTimeUpdate(cur, dur);
      }
    };

    const handleLoadedMetadata = () => {
      setDuration(video.duration || 0);
      syncCurrentPosition();
      setIsVideoLoading(false);
      setVideoError(null);
    };

    const handlePlay = () => {
      setIsPlaying(true);
      setIsVideoLoading(false);
      syncCurrentPosition();
    };

    const handlePlaying = () => {
      setIsVideoLoading(false);
      setIsPlaying(true);
    };

    const handlePause = () => {
      setIsPlaying(false);
      syncCurrentPosition();
    };

    const handleWaiting = () => {
      setIsVideoLoading(true);
    };

    const handleCanPlay = () => {
      setIsVideoLoading(false);
      setVideoError(null);
    };

    const handleError = () => {
      const err = video.error;
      let msg = 'Failed to load surveillance stream.';
      if (err) {
        if (err.code === 1) msg = 'Playback aborted by client.';
        else if (err.code === 2) msg = 'Network error downloading stream.';
        else if (err.code === 3) msg = 'Video decoding failed.';
        else if (err.code === 4) msg = 'Surveillance stream format or URL not supported.';
      }
      console.warn('[SurveillancePlayer] Media element error:', err);
      setVideoError(msg);
      setIsVideoLoading(false);
    };

    video.addEventListener('timeupdate', syncCurrentPosition);
    video.addEventListener('seeked', syncCurrentPosition);
    video.addEventListener('seeking', syncCurrentPosition);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('loadeddata', syncCurrentPosition);
    video.addEventListener('play', handlePlay);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('pause', handlePause);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('timeupdate', syncCurrentPosition);
      video.removeEventListener('seeked', syncCurrentPosition);
      video.removeEventListener('seeking', syncCurrentPosition);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('loadeddata', syncCurrentPosition);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('error', handleError);
    };
  }, [videoRef, isScrubbing, onTimeUpdate]);

  // Real-time client inference fallback when playing and server telemetry is not yet loaded/synced
  useEffect(() => {
    if (!hasVideo || !isPlaying) return;
    let isCancelled = false;

    const interval = setInterval(async () => {
      const video = videoRef.current;
      if (!video || video.paused || video.ended || isClientInferringRef.current) return;
      if (!video.videoWidth || !video.videoHeight) return;

      const curTime = video.currentTime;
      const sync = telemetryStore.getSynchronizedTelemetry(curTime, 0.4);

      // If server telemetry has finished or has synchronized frame at this timestamp, no client inference needed
      if (sync.status === 'SYNCHRONIZED' && sync.tracks.length > 0) {
        return;
      }

      isClientInferringRef.current = true;
      try {
        const detections = await detectorManager.detect(video, video.videoWidth, video.videoHeight);
        if (isCancelled) return;

        const rawDets: RawDetection[] = detections.map((d) => [
          d.bbox[0],
          d.bbox[1],
          d.bbox[2],
          d.bbox[3],
          d.confidence,
          d.class_id,
        ]);

        const tracks = localTrackerRef.current.update(rawDets, 15);
        if (!isCancelled) {
          setClientDetectedTracks(tracks);
          if (onLiveTracksDetected) {
            onLiveTracksDetected(tracks, tracks.length);
          }
        }
      } catch (err) {
        // Fallback gracefully
      } finally {
        isClientInferringRef.current = false;
      }
    }, 220); // ~4.5 FPS client-side inference

    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [hasVideo, isPlaying, telemetryStore, onLiveTracksDetected, videoRef]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(console.warn);
    } else {
      video.pause();
    }
  };

  const stepFrame = (deltaSeconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    const nextTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + deltaSeconds));
    video.currentTime = nextTime;
    setCurrentTime(nextTime);
    if (onTimeUpdate) {
      onTimeUpdate(nextTime, video.duration || 0);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVol = parseFloat(e.target.value);
    setVolume(newVol);
    if (videoRef.current) {
      videoRef.current.volume = newVol;
      if (newVol > 0 && isMuted) {
        videoRef.current.muted = false;
        setIsMuted(false);
      } else if (newVol === 0 && !isMuted) {
        videoRef.current.muted = true;
        setIsMuted(true);
      }
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  const handleRateChange = (rate: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = rate;
    setPlaybackRate(rate);
  };

  const handleTimelineScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const target = parseFloat(e.target.value);
    setCurrentTime(target);
    const video = videoRef.current;
    if (video) {
      video.currentTime = target;
      if (onTimeUpdate) {
        onTimeUpdate(target, video.duration || 0);
      }
    }
  };

  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;
    if (!document.fullscreenElement) {
      container.requestFullscreen().then(() => setIsFullscreen(true)).catch(console.warn);
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(console.warn);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 10);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms}`;
  };

  // High-performance Canvas Rendering Loop strictly synchronized with video.currentTime
  useEffect(() => {
    if (!hasVideo) return;
    let animId: number;

    const render = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && canvas && video.videoWidth && video.videoHeight) {
        const clientW = video.clientWidth;
        const clientH = video.clientHeight;

        if (canvas.width !== clientW || canvas.height !== clientH) {
          canvas.width = clientW;
          canvas.height = clientH;
        }

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, clientW, clientH);

          // Calculate aspect-ratio fit (pillarbox/letterbox compensation)
          const videoAspect = video.videoWidth / video.videoHeight;
          const containerAspect = clientW / clientH;

          let renderW = clientW;
          let renderH = clientH;
          let offsetX = 0;
          let offsetY = 0;

          if (containerAspect > videoAspect) {
            renderW = clientH * videoAspect;
            offsetX = (clientW - renderW) / 2;
          } else {
            renderH = clientW / videoAspect;
            offsetY = (clientH - renderH) / 2;
          }

          const scaleX = renderW / video.videoWidth;
          const scaleY = renderH / video.videoHeight;

          // CRITICAL: Query TelemetryStore strictly using source video.currentTime!
          const currentVideoTime = video.currentTime;
          const syncResult = telemetryStore.getSynchronizedTelemetry(currentVideoTime, 0.4);

          // Handle synchronization state
          if (syncResult.status === 'BEHIND_PLAYBACK') {
            setSyncWarning(syncResult.message || 'AI ANALYSIS BEHIND PLAYBACK');
          } else if (syncResult.status === 'NOT_YET_AVAILABLE') {
            setSyncWarning(syncResult.message || 'AI ANALYSIS NOT YET AVAILABLE FOR THIS TIMESTAMP');
          } else {
            setSyncWarning(null);
          }

          // 1. Draw Optical Flow Vectors if synchronized
          const flow = syncResult.telemetry?.optical_flow || fallbackFlow;
          if (visualConfig.show_flow_vectors && flow && flow.gridVectors && flow.gridVectors.length > 0) {
            ctx.save();
            ctx.strokeStyle = 'rgba(6, 182, 212, 0.45)';
            ctx.lineWidth = 1.2;
            for (const vec of flow.gridVectors) {
              const startX = offsetX + (vec.x / 320) * renderW;
              const startY = offsetY + (vec.y / 180) * renderH;
              const endX = startX + vec.u * 2.5;
              const endY = startY + vec.v * 2.5;

              ctx.beginPath();
              ctx.moveTo(startX, startY);
              ctx.lineTo(endX, endY);
              ctx.stroke();

              ctx.fillStyle = 'rgba(56, 189, 248, 0.7)';
              ctx.fillRect(endX - 1.5, endY - 1.5, 3, 3);
            }
            ctx.restore();
          }

          // 2. Draw Synchronized ByteTrack Tracks (Server Telemetry OR Real-time Client Fallback)
          const tracksToRender =
            syncResult.status === 'SYNCHRONIZED' && syncResult.tracks.length > 0
              ? syncResult.tracks
              : clientDetectedTracks.length > 0
              ? clientDetectedTracks
              : syncResult.status === 'SYNCHRONIZED'
              ? syncResult.tracks
              : fallbackTracks;

          const effectiveCount =
            syncResult.status === 'SYNCHRONIZED'
              ? syncResult.people_count
              : tracksToRender.length;

          setSyncPeopleCount(effectiveCount);
          const limit = crowdThreshold || 20;
          setSyncCrowdStatus(effectiveCount > limit ? 'WARNING' : 'NORMAL');

          // Evaluate exact crowd threshold rule and trigger deduplicated security events
          notificationService.evaluateCrowdThreshold(
            activeFeedName || 'cctv_feed',
            activeFeedName ? `Camera Feed (${activeFeedName.slice(0, 24)})` : 'Surveillance Feed',
            effectiveCount,
            limit,
            currentVideoTime
          );

          const now = performance.now();

          for (const track of tracksToRender) {
            const [x1, y1, x2, y2] = track.bbox;
            const drawX1 = offsetX + x1 * scaleX;
            const drawY1 = offsetY + y1 * scaleY;
            const drawW = (x2 - x1) * scaleX;
            const drawH = (y2 - y1) * scaleY;

            // Track ID entrance kinetic pop calculation (scale 0.85 -> 1.05 -> 1.0 in 300ms)
            if (!trackSeenTimesRef.current.has(track.track_id)) {
              trackSeenTimesRef.current.set(track.track_id, now);
            }
            const firstSeen = trackSeenTimesRef.current.get(track.track_id) || now;
            const ageMs = now - firstSeen;
            let popScale = 1.0;
            let popOpacity = 1.0;
            if (ageMs < 300) {
              const p = ageMs / 300;
              popScale = 0.85 + 0.25 * Math.sin(p * Math.PI);
              popOpacity = Math.min(1.0, p * 1.5);
            }

            // Motion trails: subtle fading trail based ONLY on actual historical track coordinates
            if (visualConfig.show_trails && track.history && track.history.length > 1) {
              ctx.save();
              ctx.beginPath();
              ctx.lineWidth = 2.5;
              ctx.lineCap = 'round';
              ctx.lineJoin = 'round';

              for (let i = 0; i < track.history.length; i++) {
                const ptX = offsetX + track.history[i][0] * scaleX;
                const ptY = offsetY + track.history[i][1] * scaleY;
                if (i === 0) {
                  ctx.moveTo(ptX, ptY);
                } else {
                  ctx.lineTo(ptX, ptY);
                }
              }
              // Electric cyan with fade
              ctx.strokeStyle = 'rgba(0, 240, 255, 0.45)';
              ctx.stroke();

              // Highlight points along the trail
              for (let i = 0; i < track.history.length; i += 2) {
                const ptX = offsetX + track.history[i][0] * scaleX;
                const ptY = offsetY + track.history[i][1] * scaleY;
                const alpha = 0.2 + (i / track.history.length) * 0.6;
                ctx.fillStyle = `rgba(6, 182, 212, ${alpha})`;
                ctx.beginPath();
                ctx.arc(ptX, ptY, 2.5, 0, Math.PI * 2);
                ctx.fill();
              }
              ctx.restore();
            }

            // Kinetic Comic YOLO Bounding Box with Corner Accents
            if (visualConfig.show_boxes) {
              ctx.save();

              // Subtle shadow for comic depth
              ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
              ctx.shadowBlur = 4;
              ctx.shadowOffsetX = 2;
              ctx.shadowOffsetY = 2;

              // Automatic Red/Blue Person Tracking:
              // Blue (#00f0ff) for normal tracked persons; Red (#ef4444) for confirmed violence participants
              const isParticipant = Boolean(track.is_violence_participant);
              const boxColor = isParticipant ? '#ef4444' : '#00f0ff';
              const cornerColor = isParticipant ? '#f87171' : '#38bdf8';
              ctx.strokeStyle = boxColor;
              ctx.lineWidth = visualConfig.box_thickness || 1.8;

              // Semi-transparent tactical fill
              ctx.fillStyle = isParticipant ? 'rgba(239, 68, 68, 0.16)' : 'rgba(0, 240, 255, 0.07)';
              ctx.fillRect(drawX1, drawY1, drawW, drawH);

              // Main rectangle
              ctx.strokeRect(drawX1, drawY1, drawW, drawH);

              // Military / Comic Corner Brackets
              const cornerLen = Math.min(14, drawW / 3, drawH / 3);
              ctx.lineWidth = (visualConfig.box_thickness || 1.8) + 1.6;
              ctx.strokeStyle = cornerColor;

              // Top-Left Corner
              ctx.beginPath();
              ctx.moveTo(drawX1, drawY1 + cornerLen);
              ctx.lineTo(drawX1, drawY1);
              ctx.lineTo(drawX1 + cornerLen, drawY1);
              ctx.stroke();

              // Top-Right Corner
              ctx.beginPath();
              ctx.moveTo(drawX1 + drawW - cornerLen, drawY1);
              ctx.lineTo(drawX1 + drawW, drawY1);
              ctx.lineTo(drawX1 + drawW, drawY1 + cornerLen);
              ctx.stroke();

              // Bottom-Left Corner
              ctx.beginPath();
              ctx.moveTo(drawX1, drawY1 + drawH - cornerLen);
              ctx.lineTo(drawX1, drawY1 + drawH);
              ctx.lineTo(drawX1 + cornerLen, drawY1 + drawH);
              ctx.stroke();

              // Bottom-Right Corner
              ctx.beginPath();
              ctx.moveTo(drawX1 + drawW - cornerLen, drawY1 + drawH);
              ctx.lineTo(drawX1 + drawW, drawY1 + drawH);
              ctx.lineTo(drawX1 + drawW, drawY1 + drawH - cornerLen);
              ctx.stroke();

              // Centroid Reticle Crosshair
              if (track.centroid) {
                const cx = offsetX + track.centroid[0] * scaleX;
                const cy = offsetY + track.centroid[1] * scaleY;
                ctx.strokeStyle = isParticipant ? 'rgba(239, 68, 68, 0.8)' : 'rgba(217, 70, 239, 0.6)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(cx - 5, cy);
                ctx.lineTo(cx + 5, cy);
                ctx.moveTo(cx, cy - 5);
                ctx.lineTo(cx, cy + 5);
                ctx.stroke();
              }

              // Track ID & Confidence Comic Pill (Applies popScale on first appearance)
              if (visualConfig.show_ids || visualConfig.show_confidence) {
                ctx.save();
                ctx.globalAlpha = popOpacity;

                const label = isParticipant
                  ? `VIOLENCE PARTICIPANT #${track.track_id}${visualConfig.show_confidence ? ` ${(track.confidence * 100).toFixed(0)}%` : ''}`
                  : `PERSON #${track.track_id}${visualConfig.show_confidence ? ` ${(track.confidence * 100).toFixed(0)}%` : ''}`;
                ctx.font = '700 10px "JetBrains Mono", monospace';
                const textMetrics = ctx.measureText(label);
                const badgeW = textMetrics.width + 12;
                const badgeH = 18;
                const badgeX = drawX1;
                const badgeY = Math.max(0, drawY1 - badgeH - 3);

                // Offset comic shadow for badge
                ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
                ctx.fillRect(badgeX + 2, badgeY + 2, badgeW * popScale, badgeH * popScale);

                // Badge Background (Deep Midnight with Electric Border)
                ctx.fillStyle = isParticipant ? '#2b0707' : '#080c16';
                ctx.fillRect(badgeX, badgeY, badgeW * popScale, badgeH * popScale);

                ctx.strokeStyle = isParticipant ? '#ef4444' : '#00f0ff';
                ctx.lineWidth = 1.2;
                ctx.strokeRect(badgeX, badgeY, badgeW * popScale, badgeH * popScale);

                // Target status dot inside pill
                ctx.fillStyle = isParticipant ? '#ef4444' : '#00f0ff';
                ctx.beginPath();
                ctx.arc(badgeX + 6, badgeY + badgeH / 2, 2.5, 0, Math.PI * 2);
                ctx.fill();

                // Text
                ctx.fillStyle = isParticipant ? '#fca5a5' : '#f8fafc';
                ctx.fillText(label, badgeX + 12, badgeY + 12);

                ctx.restore();
              }

              ctx.restore();
            }
          }
        }
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [hasVideo, fallbackTracks, fallbackFlow, visualConfig, videoRef, telemetryStore]);

  // Clean empty state when no video uploaded (Section 27 requirement)
  if (!hasVideo || !videoUrl) {
    return (
      <div
        ref={containerRef}
        className="relative w-full aspect-video bg-[#070b14] rounded-2xl border-2 border-cyan-500/30 comic-panel-cyan flex flex-col items-center justify-center p-6 text-center overflow-hidden"
      >
        {/* Subtle Halftone Background */}
        <div className="absolute inset-0 comic-halftone opacity-30 pointer-events-none" />

        {/* Framing HUD Corner Reticles */}
        <div className="absolute top-4 left-4 text-cyan-500/60 font-mono text-[10px] tracking-widest pointer-events-none">
          ┌ SEC-01 // STANDBY
        </div>
        <div className="absolute top-4 right-4 text-cyan-500/60 font-mono text-[10px] tracking-widest pointer-events-none">
          TARGET ACQUISITION: READY ┐
        </div>
        <div className="absolute bottom-4 left-4 text-cyan-500/60 font-mono text-[10px] tracking-widest pointer-events-none">
          └ SENSOR ARRAY ACTIVE
        </div>
        <div className="absolute bottom-4 right-4 text-cyan-500/60 font-mono text-[10px] tracking-widest pointer-events-none">
          VISION SENSE v26.0 ┘
        </div>

        <div className="relative z-10 max-w-lg flex flex-col items-center">
          <div className="relative mb-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-cyan-950/80 to-[#080c16] border-2 border-cyan-400/40 flex items-center justify-center shadow-lg shadow-cyan-500/20 comic-panel-cyan">
              <FileVideo className="w-8 h-8 text-cyan-400" />
            </div>
            <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-4 w-4 bg-cyan-500 border border-black" />
            </span>
          </div>

          <h2 className="text-xl font-bold tracking-wider text-white uppercase font-mono">
            VISION SENSE SURVEILLANCE HUB
          </h2>
          <p className="text-xs text-cyan-400/80 font-mono tracking-widest uppercase mt-0.5 mb-3">
            SELECT A LIVE CCTV CAMERA FEED OR UPLOAD CUSTOM FOOTAGE
          </p>

          {/* Quick Launch Preset CCTV Feeds */}
          {availableFeeds && availableFeeds.length > 0 && (
            <div className="w-full mb-4 flex flex-col gap-2 bg-[#050811]/90 p-3 rounded-xl border border-slate-800">
              <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider font-semibold text-left">
                Available CCTV Feeds:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {availableFeeds.slice(0, 4).map((feed) => (
                  <button
                    key={feed.fileName}
                    onClick={() => onSelectFeed && onSelectFeed(feed)}
                    className="flex items-center gap-2 p-2 rounded-lg bg-[#0b101e] hover:bg-cyan-950/60 border border-slate-700 hover:border-cyan-500 text-left transition-all text-xs font-mono group cursor-pointer"
                  >
                    <span className="px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 font-bold border border-cyan-700/60 text-[10px]">
                      {feed.cameraCode || 'CAM'}
                    </span>
                    <span className="text-slate-200 group-hover:text-cyan-200 truncate flex-1 font-medium">
                      {feed.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={onUploadClick}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-bold text-xs tracking-wide shadow-lg shadow-cyan-500/25 comic-panel transition-all transform hover:scale-[1.02] active:scale-95 cursor-pointer"
            >
              <UploadCloud className="w-4 h-4 text-black" />
              <span>UPLOAD CUSTOM CCTV VIDEO</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Active Surveillance Video Display
  const effectivePlaybackState: PlaybackState =
    duration > 0 && currentTime >= duration - 0.2
      ? 'COMPLETED'
      : isPlaying
      ? 'PLAYING'
      : 'PAUSED';

  const currentFeedObj = availableFeeds.find((f) => f.fileName === activeFeedName || f.url === videoUrl);
  const currentCameraCode = currentFeedObj?.cameraCode || 'CAM-01';

  return (
    <div
      ref={containerRef}
      className="relative w-full aspect-video bg-[#050811] rounded-2xl border-2 border-cyan-500/30 comic-panel-cyan overflow-hidden flex flex-col justify-between select-none group"
    >
      {/* Background Halftone in corners */}
      <div className="absolute inset-0 comic-halftone opacity-20 pointer-events-none z-10" />

      {/* HTML5 Native Video Element */}
      <video
        ref={videoRef}
        src={videoUrl || undefined}
        preload="auto"
        playsInline
        muted={isMuted}
        loop
        className="absolute inset-0 w-full h-full object-contain z-0"
      />

      {/* Transparent AI Overlay Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none z-15" />

      {/* Stylized Framing Reticles (Corner Brackets) */}
      <div className="absolute top-2 left-2 pointer-events-none z-20 text-cyan-400/50 text-xs font-mono">
        ┌ {currentCameraCode} // {videoMetadata?.width || 1280}×{videoMetadata?.height || 720}
      </div>
      <div className="absolute top-2 right-2 pointer-events-none z-20 text-cyan-400/50 text-xs font-mono">
        TRACKING: ACTIVE ┐
      </div>
      <div className="absolute bottom-16 left-2 pointer-events-none z-20 text-cyan-400/40 text-xs font-mono">
        └ OCR/SURVEILLANCE
      </div>
      <div className="absolute bottom-16 right-2 pointer-events-none z-20 text-cyan-400/40 text-xs font-mono">
        BYTETRACK v26 ┘
      </div>

      {/* Center Interactive Overlays (Loading, Paused, or Error) */}
      {isVideoLoading && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#070b14]/70 backdrop-blur-xs pointer-events-none">
          <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-[#080c16]/95 border-2 border-cyan-400 comic-panel-cyan text-cyan-300 font-mono text-sm font-bold animate-pulse">
            <span className="w-3 h-3 rounded-full bg-cyan-400 animate-ping" />
            <span>CONNECTING TO CCTV STREAM...</span>
          </div>
        </div>
      )}

      {videoError && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#070b14]/85 backdrop-blur-sm p-4">
          <div className="max-w-md w-full p-4 rounded-2xl bg-[#080c16] border-2 border-rose-500 comic-panel-rose flex flex-col items-center text-center gap-3">
            <div className="p-3 rounded-full bg-rose-950/80 border border-rose-600 text-rose-400">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-white font-mono font-bold text-base uppercase">FEED CONNECTION INTERRUPTED</h3>
              <p className="text-rose-300/90 font-mono text-xs mt-1">{videoError}</p>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => {
                  setVideoError(null);
                  if (videoRef.current) {
                    videoRef.current.load();
                    videoRef.current.play().catch(console.warn);
                  }
                }}
                className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-mono font-bold text-xs comic-panel cursor-pointer"
              >
                RECONNECT FEED
              </button>
              {availableFeeds && availableFeeds.length > 0 && (
                <button
                  onClick={() => onSelectFeed && onSelectFeed(availableFeeds[0])}
                  className="px-4 py-2 rounded-xl bg-[#0d1424] hover:bg-slate-800 border border-slate-700 text-white font-mono text-xs comic-panel cursor-pointer"
                >
                  LOAD CAM-01
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Paused State Center Play Overlay */}
      {!isPlaying && !isVideoLoading && !videoError && (
        <div
          onClick={togglePlay}
          className="absolute inset-0 z-18 flex flex-col items-center justify-center bg-black/35 hover:bg-black/25 transition-all cursor-pointer group/overlay"
        >
          <div className="flex flex-col items-center gap-2 transform transition-all group-hover/overlay:scale-105">
            <div className="w-16 h-16 rounded-full bg-cyan-500/95 text-black border-2 border-white flex items-center justify-center shadow-2xl shadow-cyan-500/50 comic-panel animate-bounce">
              <Play className="w-8 h-8 fill-black text-black ml-1" />
            </div>
            <span className="px-3 py-1 rounded-full bg-[#080c16]/90 border border-cyan-400 text-cyan-300 font-mono text-xs font-bold uppercase tracking-wider shadow-lg">
              CLICK TO ENGAGE LIVE FEED
            </span>
          </div>
        </div>
      )}

      {/* Top HUD Overlay (CCTV Status Bar & Camera Switcher) */}
      {visualConfig.show_hud && (
        <div className="relative z-25 flex flex-col gap-1 p-3.5 bg-gradient-to-b from-[#070b14]/95 via-[#070b14]/60 to-transparent pointer-events-none text-xs font-mono">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 pointer-events-auto">
              {/* Interactive Camera Selector Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowFeedMenu(!showFeedMenu)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-rose-950/90 border border-rose-600/80 text-rose-300 font-bold text-[10px] comic-panel shadow-sm hover:bg-rose-900 cursor-pointer transition-colors"
                  title="Switch Camera Feed"
                >
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                  <span>{currentCameraCode}</span>
                  <span className="text-[8px] opacity-75">▼</span>
                </button>

                {showFeedMenu && availableFeeds && availableFeeds.length > 0 && (
                  <div className="absolute left-0 top-full mt-1.5 w-64 rounded-xl bg-[#080c16] border-2 border-slate-700 shadow-2xl p-1 z-50 flex flex-col gap-1 comic-panel font-mono text-xs">
                    <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                      Switch Surveillance Camera:
                    </div>
                    {availableFeeds.map((feed) => (
                      <button
                        key={feed.fileName}
                        onClick={() => {
                          setShowFeedMenu(false);
                          if (onSelectFeed) onSelectFeed(feed);
                        }}
                        className={`flex items-center justify-between p-2 rounded-lg text-left transition-colors cursor-pointer ${
                          feed.fileName === (activeFeedName || videoUrl?.split('/').pop())
                            ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-700'
                            : 'hover:bg-slate-800 text-slate-300'
                        }`}
                      >
                        <span className="font-bold text-[11px] truncate">{feed.label}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-black/60 text-slate-400">
                          {feed.cameraCode}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Video Playback State */}
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-semibold border bg-[#080c16]/90 text-slate-300 border-slate-700 comic-panel">
                <span className="text-slate-400 font-normal">VIDEO:</span>
                <span
                  className={
                    effectivePlaybackState === 'PLAYING'
                      ? 'text-emerald-400 font-bold'
                      : effectivePlaybackState === 'COMPLETED'
                      ? 'text-cyan-400 font-bold'
                      : 'text-amber-400 font-bold'
                  }
                >
                  {effectivePlaybackState}
                </span>
              </span>

              {/* AI Analysis State */}
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-semibold border bg-[#080c16]/90 text-slate-300 border-slate-700 comic-panel">
                <span className="text-slate-400 font-normal">AI PIPELINE:</span>
                <span
                  className={
                    analysisStatus === 'COMPLETED'
                      ? 'text-emerald-400 font-bold'
                      : analysisStatus === 'PROCESSING'
                      ? 'text-cyan-400 animate-pulse font-bold'
                      : 'text-slate-400'
                  }
                >
                  {analysisStatus === 'COMPLETED'
                    ? 'COMPLETED 100%'
                    : analysisStatus === 'PROCESSING'
                    ? `PROCESSING ${analysisProgress}%`
                    : analysisStatus}
                </span>
              </span>
            </div>

            {/* Crowd Safety Status Pill */}
            <div className="flex items-center gap-2 text-[11px]">
              <span
                className={`px-3 py-1 rounded-md border text-[11px] font-bold comic-panel ${
                  syncCrowdStatus === 'WARNING'
                    ? 'bg-amber-950/95 border-amber-500 text-amber-300 animate-pulse comic-hazard-stripe'
                    : 'bg-emerald-950/90 border-emerald-600 text-emerald-300'
                }`}
              >
                CROWD: {syncCrowdStatus} ({syncPeopleCount} PERS)
              </span>

              <span className="text-slate-400 hidden sm:inline px-2 py-1 rounded bg-black/50 border border-slate-800">
                {videoMetadata?.width || 1280}×{videoMetadata?.height || 720} • {videoMetadata?.fps || 30} FPS
              </span>
            </div>
          </div>

          {/* Sync Warning Banner if AI is behind or seeking ahead */}
          {syncWarning && (
            <div className="self-start mt-1 flex items-center gap-1.5 px-3 py-1 rounded-md bg-amber-950/95 border border-amber-500 text-amber-300 text-[11px] font-sans font-medium shadow-lg pointer-events-auto">
              <Clock className="w-3.5 h-3.5 text-amber-400 animate-spin" />
              <span>{syncWarning}</span>
            </div>
          )}
        </div>
      )}

      {/* Pop-up Alert Notification Box (Kinetic Comic Style) */}
      {activeAlertBanner && (
        <div className="absolute top-14 right-4 z-30 max-w-sm w-full p-3.5 rounded-xl bg-[#080c16]/95 border-2 border-amber-500 shadow-2xl comic-panel-amber backdrop-blur-md flex items-start justify-between gap-3 text-xs animate-comic-pop">
          <div className="flex items-start gap-2.5">
            <div className="p-2 rounded-lg bg-amber-950/90 text-amber-400 border border-amber-500/80 mt-0.5 shadow-sm">
              <AlertTriangle className="w-4 h-4 animate-pulse" />
            </div>
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span className="font-bold text-amber-400 uppercase tracking-wider font-mono">
                  {activeAlertBanner.type.replace(/_/g, ' ')}
                </span>
                <span className="px-1.5 py-0.2 rounded bg-amber-900/60 text-amber-300 text-[10px] font-mono font-bold border border-amber-700">
                  {activeAlertBanner.severity}
                </span>
              </div>
              <p className="text-slate-200 text-[11px] leading-snug mt-0.5">{activeAlertBanner.message}</p>
              <div className="flex items-center gap-2 mt-1.5 text-[10px] font-mono text-slate-400">
                <span>TIME: {formatTime(activeAlertBanner.timestamp)}</span>
                <span>•</span>
                <span>PEOPLE: {activeAlertBanner.peopleCount}</span>
                <button
                  onClick={() => onSelectAlertTime && onSelectAlertTime(activeAlertBanner.timestamp)}
                  className="text-cyan-400 hover:text-cyan-300 hover:underline ml-1 cursor-pointer font-bold"
                >
                  SEEK TO EVENT ↗
                </button>
              </div>
            </div>
          </div>
          {onDismissAlert && (
            <button
              onClick={onDismissAlert}
              className="text-slate-500 hover:text-white p-1 cursor-pointer font-mono font-bold text-sm"
              title="Dismiss"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {/* Surveillance Controls & Timeline Scrubber Bar (VLC Inspired) */}
      <div className="relative z-25 mt-auto bg-gradient-to-t from-[#050811] via-[#070b14]/95 to-transparent pt-6 pb-3 px-4 flex flex-col gap-2.5">
        {/* Seekable Timeline Progress Bar with Event Markers */}
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-mono font-bold text-cyan-300 min-w-[52px] text-right">
            {formatTime(currentTime)}
          </span>

          <div className="relative flex-1 flex items-center h-5 group">
            {/* Background track */}
            <div className="absolute inset-x-0 h-2 bg-slate-900 rounded-full border border-slate-800 pointer-events-none" />

            {/* AI Analyzed Progress Indicator */}
            <div
              className="absolute left-0 h-2 bg-cyan-950/90 border-r-2 border-cyan-400 rounded-l-full pointer-events-none transition-all duration-300"
              style={{ width: `${Math.min(100, analysisProgress)}%` }}
              title={`AI Analyzed: ${analysisProgress}%`}
            />

            {/* Current Playback Fill Bar */}
            <div
              className="absolute left-0 h-2 bg-gradient-to-r from-cyan-600 to-cyan-400 rounded-l-full pointer-events-none"
              style={{
                width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
              }}
            />

            {/* Clickable Event Markers on the timeline */}
            {duration > 0 &&
              recentAlerts.map((alert) => {
                const leftPercent = Math.min(100, Math.max(0, (alert.timestamp / duration) * 100));
                const isWarning = alert.severity === 'WARNING';
                return (
                  <button
                    key={alert.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onSelectAlertTime) onSelectAlertTime(alert.timestamp);
                    }}
                    style={{ left: `${leftPercent}%` }}
                    className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full cursor-pointer z-15 transition-transform hover:scale-150 border ${
                      isWarning
                        ? 'bg-amber-400 border-amber-200 shadow-md shadow-amber-500/50'
                        : 'bg-rose-500 border-rose-200 shadow-md shadow-rose-500/50'
                    }`}
                    title={`[${formatTime(alert.timestamp)}] ${alert.type.replace(/_/g, ' ')} (${alert.peopleCount} people) - Click to seek`}
                  />
                );
              })}

            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.05}
              value={currentTime}
              onChange={handleTimelineScrub}
              onMouseDown={() => setIsScrubbing(true)}
              onMouseUp={() => setIsScrubbing(false)}
              className="relative w-full h-2 bg-transparent appearance-none cursor-pointer accent-cyan-400 focus:outline-none z-20"
            />
          </div>

          <span className="text-[11px] font-mono text-slate-400 min-w-[52px]">
            {formatTime(duration)}
          </span>
        </div>

        {/* Toolbar Action Buttons */}
        <div className="flex items-center justify-between flex-wrap gap-2 text-xs font-mono">
          <div className="flex items-center gap-2">
            {/* Play / Pause */}
            <button
              onClick={togglePlay}
              className="p-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold shadow-md shadow-cyan-500/30 comic-panel transition-all active:scale-95 cursor-pointer"
              title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            >
              {isPlaying ? <Pause className="w-4 h-4 text-black fill-black" /> : <Play className="w-4 h-4 text-black fill-black" />}
            </button>

            {/* Frame Step Backward (-1 frame) */}
            <button
              onClick={() => stepFrame(-0.033)}
              className="p-2 rounded-xl bg-[#0b101d] hover:bg-[#12192d] text-slate-300 hover:text-white border border-slate-700 comic-panel transition-all active:scale-95 cursor-pointer"
              title="Step Backward 1 Frame"
            >
              <StepBack className="w-4 h-4" />
            </button>

            {/* Frame Step Forward (+1 frame) */}
            <button
              onClick={() => stepFrame(0.033)}
              className="p-2 rounded-xl bg-[#0b101d] hover:bg-[#12192d] text-slate-300 hover:text-white border border-slate-700 comic-panel transition-all active:scale-95 cursor-pointer"
              title="Step Forward 1 Frame"
            >
              <StepForward className="w-4 h-4" />
            </button>

            {/* Volume Control (Desktop / Tablet) */}
            <div className="hidden sm:flex items-center gap-1.5 ml-1 bg-[#0b101d] p-1.5 rounded-xl border border-slate-800 comic-panel">
              <button
                onClick={toggleMute}
                className="text-slate-400 hover:text-cyan-400 transition-colors cursor-pointer"
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-16 h-1.5 bg-slate-800 rounded appearance-none cursor-pointer accent-cyan-400"
                title={`Volume: ${Math.round((isMuted ? 0 : volume) * 100)}%`}
              />
            </div>

            {/* Playback Speed Selector (Desktop / Tablet) */}
            <div className="hidden sm:flex items-center gap-1 ml-1 bg-[#0b101d] p-1 rounded-xl border border-slate-800 comic-panel">
              {[0.5, 1.0, 1.5, 2.0].map((rate) => (
                <button
                  key={rate}
                  onClick={() => handleRateChange(rate)}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                    playbackRate === rate
                      ? 'bg-cyan-500 text-black shadow-sm'
                      : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {rate}x
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Reset / Clear Feed */}
            {onResetVideo && (
              <button
                onClick={onResetVideo}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0b101d] hover:bg-rose-950/80 hover:border-rose-600 border border-slate-700 text-slate-400 hover:text-rose-300 text-xs font-semibold comic-panel transition-all active:scale-95 cursor-pointer"
                title="Reset Surveillance Feed & Cancel Analysis"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">RESET</span>
              </button>
            )}

            {/* Change Video Shortcut */}
            <button
              onClick={onUploadClick}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold comic-panel transition-all active:scale-95 cursor-pointer"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">UPLOAD VIDEO</span>
            </button>

            {/* Fullscreen Toggle */}
            <button
              onClick={toggleFullscreen}
              className="p-2 rounded-xl bg-[#0b101d] hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 comic-panel transition-all active:scale-95 cursor-pointer"
              title="Toggle Fullscreen"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
