import React from 'react';
import { Clock, AlertTriangle, ShieldCheck, PlayCircle } from 'lucide-react';
import { VisionSenseAlert } from '../types';

interface EventTimelineProps {
  events: VisionSenseAlert[];
  onSelectEvent: (timestamp: number) => void;
  hasVideo: boolean;
}

export const EventTimeline: React.FC<EventTimelineProps> = ({
  events,
  onSelectEvent,
  hasVideo,
}) => {
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 10);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms}`;
  };

  return (
    <div className="bg-[#070b14] border-2 border-cyan-500/30 rounded-2xl p-4 shadow-2xl comic-panel-cyan backdrop-blur-md flex flex-col gap-3 font-mono">
      <div className="flex items-center justify-between border-b-2 border-slate-800/80 pb-2.5">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-cyan-400" />
          <h3 className="font-extrabold text-sm tracking-wider text-white uppercase">
            SECURITY EVENT TIMELINE
          </h3>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-800/80">
            {events.length} INCIDENTS
          </span>
        </div>

        <p className="text-[11px] text-slate-400 hidden sm:block">
          Select any event to seek surveillance playback directly
        </p>
      </div>

      {events.length === 0 ? (
        <div className="py-7 flex flex-col items-center justify-center text-slate-500 text-center">
          <ShieldCheck className="w-8 h-8 text-slate-600 mb-2" />
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">No Security Events Logged</p>
          <p className="text-[11px] text-slate-500 mt-1 max-w-sm">
            {hasVideo
              ? 'Surveillance playback is currently operating safely within nominal crowd parameters.'
              : 'Upload a surveillance video file to initiate automated threat intelligence.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-56 overflow-y-auto pr-1">
          {events.map((event) => (
            <div
              key={event.id}
              onClick={() => onSelectEvent(event.timestamp)}
              className="p-3 rounded-xl bg-[#0a0f1d] hover:bg-[#12192d] border border-slate-800 hover:border-cyan-500 cursor-pointer transition-all flex items-start justify-between gap-3 group comic-panel"
            >
              <div className="flex items-start gap-2.5">
                <div
                  className={`p-1.5 rounded-lg mt-0.5 border ${
                    event.severity === 'WARNING'
                      ? 'bg-amber-950/80 border-amber-500 text-amber-400'
                      : 'bg-rose-950/80 border-rose-500 text-rose-400'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-cyan-400 group-hover:text-cyan-300">
                      [{formatTime(event.timestamp)}]
                    </span>
                    <span className="text-[10px] uppercase px-1.5 py-0.2 rounded bg-[#050811] text-slate-400 border border-slate-800">
                      {event.type.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-slate-200 mt-1 line-clamp-1 group-hover:text-white font-sans">
                    {event.message}
                  </p>
                </div>
              </div>

              <PlayCircle className="w-4 h-4 text-slate-600 group-hover:text-cyan-400 shrink-0 transition-colors mt-1" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
