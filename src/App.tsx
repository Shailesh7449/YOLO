import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ActiveNavTab,
  CrowdSafetyStatus,
  MovementSafetyStatus,
  OpticalFlowResult,
  TrackedObject,
  VideoMetadata,
  VisionSenseAlert,
  VisualConfig,
  PlaybackState,
  AIAnalysisStatus,
} from './types';
import { detectorManager } from './tracking/detectorManager';
import { DetectorStatus } from './tracking/detectorInterface';
import { ByteTracker } from './tracking/bytetrack';
import { DenseOpticalFlow } from './cv/denseOpticalFlow';
import { TemporalMovementAnalysis } from './analytics/temporalMovementAnalysis';
import { TelemetryStore } from './analytics/telemetryStore';
import { NavigationHeader } from './components/NavigationHeader';
import { SurveillancePlayer } from './components/SurveillancePlayer';
import { LiveAnalysisPanel } from './components/LiveAnalysisPanel';
import { EventTimeline } from './components/EventTimeline';
import { VideoUploadModal } from './components/VideoUploadModal';
import { AlertsView } from './components/AlertsView';
import { AnalyticsView } from './components/AnalyticsView';
import { ReportsView } from './components/ReportsView';
import { SettingsView } from './components/SettingsView';
import { StorageEvidenceView } from './components/StorageEvidenceView';
import { LiveCameraView } from './components/LiveCameraView';
import { notificationService } from './services/notificationService';

export const App: React.FC = () => {
  // Navigation State
  const [activeTab, setActiveTab] = useState<ActiveNavTab>('dashboard');

  // Video State
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoFilename, setVideoFilename] = useState<string | null>(null);
  const [videoMetadata, setVideoMetadata] = useState<VideoMetadata | null>(null);
  const [hasVideo, setHasVideo] = useState<boolean>(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);
  const [seekToTimestamp, setSeekToTimestamp] = useState<number | null>(null);

  // States per Section 28 Requirements
  const [playbackState, setPlaybackState] = useState<PlaybackState>('PAUSED');
  const [analysisStatus, setAnalysisStatus] = useState<AIAnalysisStatus>('QUEUED');
  const [analysisProgress, setAnalysisProgress] = useState<number>(0);
  const [activeAlertBanner, setActiveAlertBanner] = useState<VisionSenseAlert | null>(null);

  // Configurable Crowd Safety Threshold (Default: 20 per Section 16)
  const [crowdThreshold, setCrowdThreshold] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('visionsense_crowd_threshold');
      return saved ? parseInt(saved, 10) || 20 : 20;
    } catch {
      return 20;
    }
  });

  const handleCrowdThresholdChange = (val: number) => {
    const valid = Math.max(0, Math.floor(val));
    setCrowdThreshold(valid);
    telemetryStoreRef.current.setCrowdThreshold(valid);
    try {
      localStorage.setItem('visionsense_crowd_threshold', String(valid));
    } catch {}
  };

  useEffect(() => {
    telemetryStoreRef.current.setCrowdThreshold(crowdThreshold);
  }, [crowdThreshold]);

  // Subscribe to Security Notification Service
  useEffect(() => {
    const unsubscribe = notificationService.subscribe((event) => {
      const alertItem: VisionSenseAlert = {
        id: event.id,
        type: event.type as any,
        severity: event.severity as any,
        message: event.message,
        timestamp: event.timestamp,
        frame: Math.round(event.timestamp * 30),
        peopleCount: event.detectedCount,
        motionScore: 0.5,
      };
      setActiveAlertBanner(alertItem);
      setRecentAlerts((prev) => {
        const exists = prev.some((a) => a.id === event.id);
        return exists ? prev : [alertItem, ...prev];
      });
    });
    return unsubscribe;
  }, []);

  // AI Pipeline Core Engines
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackerRef = useRef<ByteTracker>(new ByteTracker());
  const opticalFlowRef = useRef<DenseOpticalFlow>(new DenseOpticalFlow());
  const temporalAnalysisRef = useRef<TemporalMovementAnalysis>(new TemporalMovementAnalysis());
  const telemetryStoreRef = useRef<TelemetryStore>(new TelemetryStore());

  // Model & Latency
  const [detectorStatus, setDetectorStatus] = useState<DetectorStatus>('LOADING');
  const [selectedModel, setSelectedModel] = useState<'yolo26n' | 'yolo26s' | 'fallback'>('yolo26n');
  const [activeModelName, setActiveModelName] = useState<string>('YOLO26n ONNX');
  const [latencyMs, setLatencyMs] = useState<number>(0);

  // Synchronized Real-Time Telemetry State
  const [activeTracks, setActiveTracks] = useState<TrackedObject[]>([]);
  const [opticalFlowResult, setOpticalFlowResult] = useState<OpticalFlowResult | null>(null);
  const [peopleCount, setPeopleCount] = useState<number | null>(null);
  const [peakPeopleCount, setPeakPeopleCount] = useState<number | null>(null);
  const [crowdStatus, setCrowdStatus] = useState<CrowdSafetyStatus | null>(null);
  const [movementStatus, setMovementStatus] = useState<MovementSafetyStatus | null>(null);
  const [motionScore, setMotionScore] = useState<number | null>(null);
  const [recentAlerts, setRecentAlerts] = useState<VisionSenseAlert[]>([]);

  // Visual Overlay Configuration
  const [visualConfig, setVisualConfig] = useState<VisualConfig>({
    show_boxes: true,
    show_ids: true,
    show_labels: true,
    show_confidence: true,
    show_trails: true,
    show_hud: true,
    show_lines: false,
    show_flow_vectors: false,
    trail_fade: true,
    box_thickness: 2,
    font_scale: 1,
    max_trail_length: 30,
  });

  const [availableFeeds, setAvailableFeeds] = useState<
    Array<{
      id: string;
      fileName: string;
      url: string;
      label: string;
      cameraCode: string;
      hasTelemetry: boolean;
    }>
  >([]);

  // 1. Initialize Detector Engine on App Mount, Fetch Feeds & Auto-restore active video
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        await detectorManager.init();
        if (isMounted) {
          setDetectorStatus(detectorManager.getStatus());
          setActiveModelName(detectorManager.getActiveDetector().name);
        }
      } catch (err) {
        console.warn('[VisionSense] Detector init error:', err);
        if (isMounted) setDetectorStatus('NOT_READY');
      }
    })();

    // Fetch all available CCTV surveillance feeds
    fetch('/api/videos')
      .then((r) => r.json())
      .then((data) => {
        if (!isMounted) return;
        if (data && Array.isArray(data.videos) && data.videos.length > 0) {
          setAvailableFeeds(data.videos);
        }
      })
      .catch((err) => console.warn('[VisionSense] Failed to fetch feeds:', err));

    // Auto-restore active video from localStorage or server
    let restored = false;
    try {
      const saved = localStorage.getItem('visionsense_active_video');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.url && parsed.filename) {
          setVideoUrl(parsed.url);
          setVideoFilename(parsed.filename);
          if (parsed.metadata) setVideoMetadata(parsed.metadata);
          setHasVideo(true);
          setPlaybackState('PLAYING');
          restored = true;
        }
      }
    } catch {}

    if (!restored) {
      fetch('/api/video/latest')
        .then((r) => r.json())
        .then((data) => {
          if (!isMounted) return;
          if (data && data.video && data.video.url && data.video.fileName) {
            setVideoUrl(data.video.url);
            setVideoFilename(data.video.fileName);
            if (data.video.metadata) setVideoMetadata(data.video.metadata);
            setHasVideo(true);
            setPlaybackState('PLAYING');
          }
        })
        .catch(() => {});
    }

    return () => {
      isMounted = false;
    };
  }, []);

  // Camera Feed Switcher Handler
  const handleSelectFeed = (feed: { fileName: string; url: string; label?: string; metadata?: VideoMetadata }) => {
    trackerRef.current.reset();
    opticalFlowRef.current.reset();
    temporalAnalysisRef.current.reset();
    telemetryStoreRef.current.clear();

    setVideoUrl(feed.url);
    setVideoFilename(feed.fileName);
    if (feed.metadata) setVideoMetadata(feed.metadata);
    setHasVideo(true);
    setPlaybackState('PLAYING');
    setAnalysisStatus('PROCESSING');
    setAnalysisProgress(0);

    setPeopleCount(0);
    setPeakPeopleCount(0);
    setCrowdStatus('NORMAL');
    setMovementStatus('NORMAL');
    setMotionScore(0);
    setActiveTracks([]);
    setRecentAlerts([]);
    setActiveAlertBanner(null);
    setSeekToTimestamp(0);

    try {
      localStorage.setItem(
        'visionsense_active_video',
        JSON.stringify({ url: feed.url, filename: feed.fileName, metadata: feed.metadata })
      );
    } catch {}
  };

  // Handle Model Switch
  const handleModelSelect = async (variant: 'yolo26n' | 'yolo26s' | 'fallback') => {
    setSelectedModel(variant);
    setDetectorStatus('LOADING');
    await detectorManager.setModel(variant);
    setDetectorStatus(detectorManager.getStatus());
    setActiveModelName(detectorManager.getActiveDetector().name);
  };

  // Video Upload Success Handler
  const handleUploadSuccess = (url: string, filename: string, metadata: VideoMetadata) => {
    const actualFilename = filename || (url ? url.split('/').pop() : null) || 'video.mp4';
    const actualUrl = url || (actualFilename ? `/api/media/${actualFilename}` : '');

    try {
      localStorage.setItem(
        'visionsense_active_video',
        JSON.stringify({ url: actualUrl, filename: actualFilename, metadata })
      );
    } catch {}

    // Reset pipeline state
    trackerRef.current.reset();
    opticalFlowRef.current.reset();
    temporalAnalysisRef.current.reset();
    telemetryStoreRef.current.clear();

    setVideoUrl(actualUrl);
    setVideoFilename(actualFilename);
    setVideoMetadata(metadata);
    setHasVideo(true);
    setPlaybackState('PAUSED');
    setAnalysisStatus('PROCESSING');
    setAnalysisProgress(0);

    setPeopleCount(0);
    setPeakPeopleCount(0);
    setCrowdStatus('NORMAL');
    setMovementStatus('NORMAL');
    setMotionScore(0);
    setActiveTracks([]);
    setRecentAlerts([]);
    setActiveAlertBanner(null);
    setSeekToTimestamp(0);
  };

  // Handle video evidence selected directly from Storage / Evidence module
  const handleAnalyzeStorageVideo = (url: string, filename: string, metadata: VideoMetadata) => {
    handleUploadSuccess(url, filename, metadata);
    setActiveTab('dashboard');
  };

  // Reset / Clear Video Handler
  const handleResetVideo = () => {
    if (videoFilename) {
      fetch(`/api/video/cancel/${encodeURIComponent(videoFilename)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).catch(() => {});
    }

    try {
      localStorage.removeItem('visionsense_active_video');
    } catch {}

    setVideoUrl(null);
    setVideoFilename(null);
    setVideoMetadata(null);
    setHasVideo(false);
    setPlaybackState('PAUSED');
    setAnalysisStatus('QUEUED');
    setAnalysisProgress(0);
    setPeopleCount(null);
    setPeakPeopleCount(null);
    setCrowdStatus(null);
    setMovementStatus(null);
    setMotionScore(null);
    setActiveTracks([]);
    setRecentAlerts([]);
    setActiveAlertBanner(null);
    setSeekToTimestamp(null);
    trackerRef.current.reset();
    opticalFlowRef.current.reset();
    temporalAnalysisRef.current.reset();
    telemetryStoreRef.current.clear();
  };

  // Jump to Timestamp from an incident/alert
  const handleSelectEventTime = (timestamp: number) => {
    setSeekToTimestamp(timestamp);
    setActiveTab('dashboard');
  };

  // 2. Poll for Full Video AI Analysis Progress & Telemetry from Server
  useEffect(() => {
    if (!hasVideo || !videoFilename) return;

    let isCancelled = false;
    let pollInterval: NodeJS.Timeout | null = null;

    const fetchTelemetry = async () => {
      try {
        const res = await fetch(`/api/video/telemetry/${encodeURIComponent(videoFilename)}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.telemetry && Array.isArray(data.telemetry)) {
            if (isCancelled) return;

            // Load full telemetry records into TelemetryStore
            telemetryStoreRef.current.loadTelemetryData(data.telemetry, data.duration);
            telemetryStoreRef.current.setComplete(Boolean(data.isComplete));

            setAnalysisStatus(data.isComplete ? 'COMPLETED' : 'PROCESSING');
            setAnalysisProgress(
              data.isComplete
                ? 100
                : Math.round(((data.lastTimestamp || 0) / (data.duration || 1)) * 100)
            );

            if (data.peakPeople !== undefined) {
              setPeakPeopleCount((prev) => Math.max(prev || 0, data.peakPeople));
            }

            // Immediately refresh real-time metrics for current playback position
            const curTime = videoRef.current ? videoRef.current.currentTime : 0;
            const currentSync = telemetryStoreRef.current.getSynchronizedTelemetry(curTime, 0.4);
            if (currentSync.status === 'SYNCHRONIZED') {
              setPeopleCount(currentSync.people_count);
              setCrowdStatus(currentSync.crowd_status);
              setMovementStatus(currentSync.movement_status);
              setMotionScore(currentSync.motion_score);
              setActiveTracks(currentSync.tracks);
            }

            // Collect all unique alerts across all frames
            const collectedAlerts: VisionSenseAlert[] = [];
            const alertKeys = new Set<string>();

            for (const frame of data.telemetry) {
              if (frame.alerts && frame.alerts.length > 0) {
                for (const al of frame.alerts) {
                  const key = `${al.type}_${Math.round(al.timestamp * 2)}`;
                  if (!alertKeys.has(key)) {
                    alertKeys.add(key);
                    collectedAlerts.push(al);
                  }
                }
              }
            }

            if (collectedAlerts.length > 0) {
              setRecentAlerts(collectedAlerts);
            }

            // If analysis is completely finished, stop polling
            if (data.isComplete) {
              if (pollInterval) clearInterval(pollInterval);
              return;
            }
          }
        }

        // If telemetry not yet ready, check progress endpoint
        const progRes = await fetch(`/api/video/progress/${encodeURIComponent(videoFilename)}`);
        if (progRes.ok) {
          const progData = await progRes.json();
          if (isCancelled) return;
          if (progData.status === 'COMPLETED') {
            setAnalysisStatus('COMPLETED');
            setAnalysisProgress(100);
            // Fetch telemetry one more time
            const finalRes = await fetch(`/api/video/telemetry/${encodeURIComponent(videoFilename)}`);
            if (finalRes.ok) {
              const finalData = await finalRes.json();
              if (finalData.telemetry) {
                telemetryStoreRef.current.loadTelemetryData(finalData.telemetry, finalData.duration);
                telemetryStoreRef.current.setComplete(true);
                if (finalData.peakPeople) setPeakPeopleCount(finalData.peakPeople);

                const curTime = videoRef.current ? videoRef.current.currentTime : 0;
                const currentSync = telemetryStoreRef.current.getSynchronizedTelemetry(curTime, 0.4);
                if (currentSync.status === 'SYNCHRONIZED') {
                  setPeopleCount(currentSync.people_count);
                  setCrowdStatus(currentSync.crowd_status);
                  setMovementStatus(currentSync.movement_status);
                  setMotionScore(currentSync.motion_score);
                  setActiveTracks(currentSync.tracks);
                }
              }
            }
            if (pollInterval) clearInterval(pollInterval);
          } else if (progData.status === 'PROCESSING') {
            setAnalysisStatus('PROCESSING');
            setAnalysisProgress(progData.progressPercent || 0);
          }
        }
      } catch (err) {
        console.warn('[VisionSense] Telemetry poll error:', err);
      }
    };

    // Immediate fetch + recurring poll
    fetchTelemetry();
    pollInterval = setInterval(fetchTelemetry, 1500);

    return () => {
      isCancelled = true;
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [hasVideo, videoFilename]);

  // 3. High-Frequency Synchronized Time Update (Binds video.currentTime to AI Telemetry)
  const handleTimeUpdate = useCallback(
    (currentTime: number, duration: number) => {
      // Check playback state
      if (duration > 0 && currentTime >= duration - 0.2) {
        setPlaybackState('COMPLETED');
      } else if (videoRef.current && !videoRef.current.paused) {
        setPlaybackState('PLAYING');
      } else {
        setPlaybackState('PAUSED');
      }

      // Query TelemetryStore strictly at currentTime
      const sync = telemetryStoreRef.current.getSynchronizedTelemetry(currentTime, 0.4);

      if (sync.status === 'SYNCHRONIZED') {
        const activeDetectedCount =
          sync.tracks && sync.tracks.length > 0 ? sync.tracks.length : sync.people_count;
        setPeopleCount(activeDetectedCount);
        setPeakPeopleCount((prev) => Math.max(prev || 0, activeDetectedCount));
        setCrowdStatus(activeDetectedCount > crowdThreshold ? 'WARNING' : 'NORMAL');
        setMovementStatus(sync.movement_status);
        setMotionScore(sync.motion_score);
        setActiveTracks(sync.tracks);

        // Check if an alert was triggered on this frame
        if (sync.telemetry && sync.telemetry.alerts && sync.telemetry.alerts.length > 0) {
          const latestAlert = sync.telemetry.alerts[sync.telemetry.alerts.length - 1];
          setActiveAlertBanner(latestAlert);

          // Append to recent alerts if not already present
          setRecentAlerts((prev) => {
            const exists = prev.some(
              (a) => a.type === latestAlert.type && Math.abs(a.timestamp - latestAlert.timestamp) < 0.5
            );
            return exists ? prev : [latestAlert, ...prev];
          });
        }
      } else if (sync.status === 'BEHIND_PLAYBACK' || sync.status === 'NOT_YET_AVAILABLE') {
        // Do NOT render stale tracks!
        setActiveTracks([]);
      }
    },
    []
  );

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col selection:bg-cyan-500/30 selection:text-cyan-200 w-full max-w-full overflow-x-hidden">
      {/* Top SOC Navigation Header */}
      <NavigationHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        detectorStatus={detectorStatus}
        activeModelName={activeModelName}
        isTrackingReady={hasVideo}
        hasVideo={hasVideo}
        onUploadClick={() => setIsUploadModalOpen(true)}
        onResetClick={handleResetVideo}
      />

      {/* Main View Area */}
      <main className="flex-1 flex flex-col">
        {activeTab === 'dashboard' && (
          <div className="flex-1 p-2 sm:p-4 lg:p-5 max-w-[1700px] w-full mx-auto flex flex-col gap-4 min-w-0">
            {/* Primary Monitoring Grid: Video + Events (Left ~68%) | Live AI Command HUD (Right ~32%) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start w-full min-w-0">
              {/* Left Column: Hero Surveillance Video + Security Event Timeline */}
              <div className="w-full min-w-0 lg:col-span-8 flex flex-col gap-4">
                <SurveillancePlayer
                  videoUrl={videoUrl}
                  videoMetadata={videoMetadata}
                  hasVideo={hasVideo}
                  activeTracks={activeTracks}
                  opticalFlow={opticalFlowResult}
                  visualConfig={visualConfig}
                  onUploadClick={() => setIsUploadModalOpen(true)}
                  onResetVideo={handleResetVideo}
                  seekToTimestamp={seekToTimestamp}
                  onSeekHandled={() => setSeekToTimestamp(null)}
                  videoRef={videoRef}
                  telemetryStore={telemetryStoreRef.current}
                  playbackState={playbackState}
                  analysisStatus={analysisStatus}
                  analysisProgress={analysisProgress}
                  activeAlertBanner={activeAlertBanner}
                  onDismissAlert={() => setActiveAlertBanner(null)}
                  onSelectAlertTime={handleSelectEventTime}
                  onTimeUpdate={handleTimeUpdate}
                  recentAlerts={recentAlerts}
                  availableFeeds={availableFeeds}
                  activeFeedName={videoFilename || undefined}
                  onSelectFeed={handleSelectFeed}
                  crowdThreshold={crowdThreshold}
                  onLiveTracksDetected={(tracks, count) => {
                    setPeopleCount(count);
                    setPeakPeopleCount((prev) => Math.max(prev || 0, count));
                    setActiveTracks(tracks);
                    setCrowdStatus(count > crowdThreshold ? 'WARNING' : 'NORMAL');
                  }}
                />

                {/* Event Timeline positioned directly beneath the CCTV video display */}
                <EventTimeline
                  events={recentAlerts}
                  onSelectEvent={handleSelectEventTime}
                  hasVideo={hasVideo}
                />
              </div>

              {/* Right Column: Live AI Analysis Command Panel */}
              <div className="w-full min-w-0 lg:col-span-4 lg:sticky lg:top-20">
                <LiveAnalysisPanel
                  hasVideo={hasVideo}
                  peopleCount={peopleCount}
                  peakPeopleCount={peakPeopleCount}
                  trackedCount={activeTracks.length}
                  crowdStatus={crowdStatus}
                  movementStatus={movementStatus}
                  motionScore={motionScore}
                  detectorStatus={detectorStatus}
                  activeModelName={activeModelName}
                  selectedVariant={selectedModel}
                  onModelSelect={handleModelSelect}
                  latencyMs={latencyMs}
                  recentAlerts={recentAlerts}
                  visualConfig={visualConfig}
                  onVisualConfigChange={setVisualConfig}
                  onAlertClick={handleSelectEventTime}
                  crowdThreshold={crowdThreshold}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'live' && (
          <div className="flex-1 p-3 lg:p-5 max-w-[1700px] w-full mx-auto">
            <LiveCameraView
              crowdThreshold={crowdThreshold}
              activeModelName={activeModelName}
              onAlertTriggered={(newAlert) => {
                setActiveAlertBanner(newAlert);
                setRecentAlerts((prev) => [newAlert, ...prev]);
              }}
            />
          </div>
        )}

        {activeTab === 'alerts' && (
          <AlertsView alerts={recentAlerts} onSelectAlert={handleSelectEventTime} />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsView
            telemetryHistory={telemetryStoreRef.current.getHistory()}
            peakPeople={peakPeopleCount || 0}
            totalAlerts={recentAlerts.length}
            activeModelName={activeModelName}
          />
        )}

        {activeTab === 'reports' && (
          <ReportsView
            alerts={recentAlerts}
            telemetryHistory={telemetryStoreRef.current.getHistory()}
            videoMetadata={videoMetadata}
            peakPeople={peakPeopleCount || 0}
          />
        )}

        {activeTab === 'storage' && (
          <StorageEvidenceView
            onAnalyzeVideo={handleAnalyzeStorageVideo}
            crowdThreshold={crowdThreshold}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            selectedModel={selectedModel}
            onSelectModel={handleModelSelect}
            visualConfig={visualConfig}
            onVisualConfigChange={setVisualConfig}
            crowdThreshold={crowdThreshold}
            onCrowdThresholdChange={handleCrowdThresholdChange}
          />
        )}
      </main>

      {/* Video Upload Modal */}
      <VideoUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onUploadSuccess={(url, filename, metadata) => {
          setIsUploadModalOpen(false);
          handleUploadSuccess(url, filename, metadata);
        }}
      />
    </div>
  );
};

export default App;
