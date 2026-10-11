import React, { useState } from 'react';
import { X, Plus, Trash2, RotateCcw } from 'lucide-react';
import { CountingLineConfig } from '../types';

interface LineManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  lines: CountingLineConfig[];
  onAddLine: (line: CountingLineConfig) => void;
  onDeleteLine: (lineId: string) => void;
  onResetLineCounts: () => void;
}

export const LineManagerModal: React.FC<LineManagerModalProps> = ({
  isOpen,
  onClose,
  lines,
  onAddLine,
  onDeleteLine,
  onResetLineCounts,
}) => {
  const [newLineName, setNewLineName] = useState('Line C');
  const [presetType, setPresetType] = useState<'vertical' | 'horizontal' | 'diagonal_left' | 'diagonal_right'>('vertical');

  if (!isOpen) return null;

  const handleCreate = () => {
    let points: [[number, number], [number, number]];
    if (presetType === 'vertical') {
      points = [[0.5, 0.1], [0.5, 0.9]];
    } else if (presetType === 'horizontal') {
      points = [[0.1, 0.5], [0.9, 0.5]];
    } else if (presetType === 'diagonal_left') {
      points = [[0.1, 0.1], [0.9, 0.9]];
    } else {
      points = [[0.1, 0.9], [0.9, 0.1]];
    }

    onAddLine({
      id: `line_${Date.now()}`,
      name: newLineName.trim() || `Line ${lines.length + 1}`,
      points,
      direction: 'both',
      count_in: 0,
      count_out: 0,
    });
    setNewLineName(`Line ${String.fromCharCode(65 + lines.length + 1)}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-slate-900 rounded-2xl border border-slate-800 p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <h3 className="text-base font-semibold text-slate-100">Virtual Counting Lines</h3>
            <p className="text-xs text-slate-400">
              Configure cross-product boundary lines for bidirectional object counting.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Existing lines list */}
        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
          {lines.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-500">
              No virtual counting lines configured.
            </div>
          ) : (
            lines.map((l) => (
              <div
                key={l.id}
                className="flex items-center justify-between p-3 rounded-xl bg-slate-950/70 border border-slate-800"
              >
                <div>
                  <div className="font-semibold text-sm text-yellow-400">{l.name}</div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Coords: [({l.points[0][0].toFixed(2)}, {l.points[0][1].toFixed(2)}) → (
                    {l.points[1][0].toFixed(2)}, {l.points[1][1].toFixed(2)})]
                  </div>
                  <div className="text-xs font-mono text-slate-300 mt-1">
                    IN: <span className="text-amber-400 font-bold">{l.count_in}</span> | OUT:{' '}
                    <span className="text-rose-400 font-bold">{l.count_out}</span> | TOTAL:{' '}
                    <span className="text-emerald-400 font-bold">{l.count_in + l.count_out}</span>
                  </div>
                </div>

                <button
                  onClick={() => onDeleteLine(l.id)}
                  className="p-2 text-rose-400 hover:bg-rose-500/10 rounded-lg transition"
                  title="Remove Line"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Add new line */}
        <div className="p-3 bg-slate-950/40 rounded-xl border border-slate-800/80 space-y-3">
          <div className="text-xs font-medium text-slate-300">Add New Counting Line</div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={newLineName}
              onChange={(e) => setNewLineName(e.target.value)}
              placeholder="Line Name (e.g. Southbound)"
              className="bg-slate-800 border border-slate-700 text-xs rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
            <select
              value={presetType}
              onChange={(e) => setPresetType(e.target.value as any)}
              className="bg-slate-800 border border-slate-700 text-xs rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              <option value="vertical">Vertical Center (0.5, 0.1 → 0.5, 0.9)</option>
              <option value="horizontal">Horizontal Center (0.1, 0.5 → 0.9, 0.5)</option>
              <option value="diagonal_left">Diagonal Top-Left to Bottom-Right</option>
              <option value="diagonal_right">Diagonal Bottom-Left to Top-Right</option>
            </select>
          </div>
          <button
            onClick={handleCreate}
            className="w-full flex items-center justify-center gap-1.5 py-2 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition"
          >
            <Plus className="w-4 h-4" />
            <span>Add Virtual Line</span>
          </button>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={onResetLineCounts}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset All Tallies to 0</span>
          </button>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 font-medium"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
