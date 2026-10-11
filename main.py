"""
VisionSense Python Entry Point
Usage:
  python3 main.py --mode server --port 5050
  python3 main.py --mode analyze-image --image bus.jpg --threshold 20
  python3 main.py --mode analyze-video --video path/to/cctv.mp4 --threshold 20
  python3 main.py --mode drives
  python3 main.py --mode browse --path uploads/evidence
"""
import sys
import argparse
import json
from visionsense.storage_bridge import get_connected_drives, browse_directory
from visionsense.pipeline import analyze_image_file, analyze_video_file
from visionsense.server import run_server

def main():
    parser = argparse.ArgumentParser(description="VisionSense Python Surveillance & Evidence Engine")
    parser.add_argument(
        "--mode",
        choices=["server", "analyze-image", "analyze-video", "drives", "browse"],
        default="server",
        help="Execution mode (default: server)"
    )
    parser.add_argument("--port", type=int, default=5050, help="Port for server mode")
    parser.add_argument("--image", type=str, help="Path to image file for spatial analysis")
    parser.add_argument("--video", type=str, help="Path to video file for temporal/tracking analysis")
    parser.add_argument("--path", type=str, help="Directory path to browse")
    parser.add_argument("--threshold", type=int, default=20, help="Crowd safety warning threshold (default: 20)")
    parser.add_argument("--ai-fps", type=float, default=8.0, help="AI inference FPS stride (default: 8.0)")

    args = parser.parse_args()

    if args.mode == "server":
        run_server(args.port)

    elif args.mode == "drives":
        drives = get_connected_drives()
        print(json.dumps(drives, indent=2))

    elif args.mode == "browse":
        result = browse_directory(args.path)
        print(json.dumps(result, indent=2))

    elif args.mode == "analyze-image":
        if not args.image:
            print("Error: --image argument is required for analyze-image mode", file=sys.stderr)
            sys.exit(1)
        result = analyze_image_file(args.image, crowd_threshold=args.threshold)
        print(json.dumps(result, indent=2))

    elif args.mode == "analyze-video":
        if not args.video:
            print("Error: --video argument is required for analyze-video mode", file=sys.stderr)
            sys.exit(1)
        result = analyze_video_file(args.video, crowd_threshold=args.threshold, target_ai_fps=args.ai_fps)
        print(json.dumps({
            "status": result["status"],
            "video_duration_seconds": result["video_duration_seconds"],
            "last_processed_timestamp": result["last_processed_timestamp"],
            "completion_percentage": result["completion_percentage"],
            "total_frames_sampled": result["total_frames_sampled"],
            "total_alerts": result["total_alerts"],
            "telemetry_frames_count": result["telemetry_frames_count"]
        }, indent=2))

if __name__ == "__main__":
    main()
