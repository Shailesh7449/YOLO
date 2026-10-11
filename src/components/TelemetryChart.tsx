import React from 'react';

interface TelemetryChartProps {
  data: number[];
  color: string;
  height?: number;
  label?: string;
  currentValue?: string | number;
}

export const TelemetryChart: React.FC<TelemetryChartProps> = ({ data, color, height = 50, label, currentValue }) => {
  if (data.length < 2) {
    return (
      <div className="w-full bg-slate-950/50 rounded-lg border border-slate-800/80 p-3" style={{ height: height + 40 }}>
        <div className="flex justify-between text-[10px] font-mono text-slate-500 mb-2">
          <span className="uppercase">{label}</span>
          <span>Awaiting Data...</span>
        </div>
      </div>
    );
  }

  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;

  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = 100 - ((d - min) / range) * 100;
    return `${x},${y}`;
  }).join(' ');

  // Create area fill path
  const areaPoints = `0,100 ${points} 100,100`;

  return (
    <div className="w-full bg-slate-950/50 rounded-lg border border-slate-800/80 p-3 relative overflow-hidden group">
      <div className="flex justify-between items-end mb-2 relative z-10">
        <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">{label}</span>
        <span className="text-sm font-bold font-mono" style={{ color }}>{currentValue}</span>
      </div>
      
      <div className="relative w-full" style={{ height }}>
        <svg className="absolute inset-0 w-full h-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <linearGradient id={`grad-${label?.replace(/\s+/g, '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.3" />
              <stop offset="100%" stopColor={color} stopOpacity="0.0" />
            </linearGradient>
          </defs>
          <polygon
            fill={`url(#grad-${label?.replace(/\s+/g, '')})`}
            points={areaPoints}
          />
          <polyline
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={points}
            vectorEffect="non-scaling-stroke"
            className="drop-shadow-md"
          />
        </svg>
      </div>
    </div>
  );
};
