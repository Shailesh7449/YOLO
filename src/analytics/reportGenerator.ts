import { TrajectoryExportRecord, StatsSnapshot, COCO_CLASSES } from '../types';

export class ReportGenerator {
  static generateCSV(rows: TrajectoryExportRecord[]): string {
    if (rows.length === 0) {
      return 'track_id,class_id,class_name,frame_first,frame_last,duration_frames,duration_s,start_cx,start_cy,end_cx,end_cy,avg_speed_ps\n';
    }

    const headers = [
      'track_id',
      'class_id',
      'class_name',
      'frame_first',
      'frame_last',
      'duration_frames',
      'duration_s',
      'start_cx',
      'start_cy',
      'end_cx',
      'end_cy',
      'avg_speed_ps',
    ];

    const lines = [headers.join(',')];
    for (const r of rows) {
      lines.push(
        [
          r.track_id,
          r.class_id,
          `"${r.class_name}"`,
          r.frame_first,
          r.frame_last,
          r.duration_frames,
          r.duration_s,
          r.start_cx,
          r.start_cy,
          r.end_cx,
          r.end_cy,
          r.avg_speed_ps,
        ].join(',')
      );
    }

    return lines.join('\n');
  }

  static generateJSON(trajectoryList: TrajectoryExportRecord[]): string {
    return JSON.stringify(trajectoryList, null, 2);
  }

  static generateSummaryJSON(
    statsSummary: StatsSnapshot & { class_density?: Record<number, number> },
    counterTotals: Record<string, { count_in: number; count_out: number; total: number }>,
    videoName: string = 'video_stream'
  ): string {
    const payload = {
      generated_at: new Date().toISOString(),
      video: videoName,
      stats: statsSummary,
      line_counts: counterTotals,
    };
    return JSON.stringify(payload, null, 2);
  }

  static generateSummaryTXT(
    statsSummary: StatsSnapshot,
    counterTotals: Record<string, { count_in: number; count_out: number; total: number }>,
    flatRows: TrajectoryExportRecord[],
    videoName: string = 'video_stream',
    videoFps: number = 30
  ): string {
    const lines: string[] = [];
    const header = (title: string) => {
      lines.push(`\n${'─'.repeat(50)}`);
      lines.push(title);
      lines.push(`${'─'.repeat(50)}`);
    };

    lines.push('Video Tracking Analytics — Report');
    lines.push(`Video   : ${videoName}`);
    lines.push(`Created : ${new Date().toLocaleString()}`);

    header('PERFORMANCE');
    lines.push(`  Frames processed : ${statsSummary.frame_count}`);
    lines.push(`  Avg FPS          : ${statsSummary.fps}`);
    lines.push(`  Peak active      : ${statsSummary.peak_active} objects`);

    header('OBJECT COUNTS');
    lines.push(`  Total unique tracks : ${statsSummary.total_unique}`);
    for (const [cid, cnt] of Object.entries(statsSummary.active_by_class)) {
      const name = COCO_CLASSES[Number(cid)] ?? `class_${cid}`;
      lines.push(`  ${name.padEnd(15)} : ${cnt} active in last frame`);
    }

    header('LINE CROSSING COUNTS');
    const lineEntries = Object.entries(counterTotals);
    if (lineEntries.length > 0) {
      for (const [name, counts] of lineEntries) {
        lines.push(`  ${name}: IN=${counts.count_in}  OUT=${counts.count_out}  TOTAL=${counts.total}`);
      }
    } else {
      lines.push('  (no counting lines configured)');
    }

    header('SPEED (px/s)');
    for (const [cid, spd] of Object.entries(statsSummary.avg_speed_by_class)) {
      const name = COCO_CLASSES[Number(cid)] ?? `class_${cid}`;
      lines.push(`  ${name.padEnd(15)} : ${spd} px/s avg`);
    }

    header('TRACKS SUMMARY');
    if (flatRows.length > 0) {
      const durations = flatRows.map(r => r.duration_frames);
      const avgDur = durations.reduce((a, b) => a + b, 0) / durations.length;
      const maxDur = Math.max(...durations);
      lines.push(`  Total tracks    : ${flatRows.length}`);
      lines.push(`  Avg duration    : ${avgDur.toFixed(1)} frames (${(avgDur / videoFps).toFixed(2)}s)`);
      lines.push(`  Max duration    : ${maxDur} frames`);
    } else {
      lines.push('  No tracks recorded yet');
    }

    return lines.join('\n');
  }

  static downloadFile(filename: string, content: string, mimeType: string = 'text/plain') {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
