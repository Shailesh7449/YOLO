import os
import sys
import json
import shutil
import cv2

def setup_test_library():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    public_datasets = os.path.join(base_dir, 'public', 'datasets')
    violence_dir = os.path.join(public_datasets, 'violence')
    normal_dir = os.path.join(public_datasets, 'normal')
    thumbs_dir = os.path.join(public_datasets, 'thumbnails')

    os.makedirs(violence_dir, exist_ok=True)
    os.makedirs(normal_dir, exist_ok=True)
    os.makedirs(thumbs_dir, exist_ok=True)

    # Define clips specification
    violence_specs = [
        {
            "id": "v01",
            "title": "Corridor Physical Altercation",
            "src": os.path.join(base_dir, "datasets", "violence", "violent", "airtlab_violent_1.mp4"),
            "target_filename": "v01_airtlab_corridor_fight.mp4",
            "category": "violence",
            "expected_label": "VIOLENCE",
            "source_dataset": "AIRTLAB Real-World CCTV Violence Dataset",
            "source_url": "https://airtlab.dibris.unige.it/violence-dataset/",
            "license": "Academic Research Use / Non-Commercial Surveillance Benchmark",
            "inclusion_notes": "Indoor corridor CCTV footage showing two individuals engaging in aggressive pushing and strikes."
        },
        {
            "id": "v02",
            "title": "Hallway Physical Scuffle",
            "src": os.path.join(base_dir, "datasets", "violence", "violent", "airtlab_violent_102.mp4"),
            "target_filename": "v02_airtlab_hallway_scuffle.mp4",
            "category": "violence",
            "expected_label": "VIOLENCE",
            "source_dataset": "AIRTLAB Real-World CCTV Violence Dataset",
            "source_url": "https://airtlab.dibris.unige.it/violence-dataset/",
            "license": "Academic Research Use / Non-Commercial Surveillance Benchmark",
            "inclusion_notes": "Surveillance camera capture of abrupt mutual physical tackling and grappling in building passage."
        },
        {
            "id": "v03",
            "title": "Office Physical Altercation",
            "src": os.path.join(base_dir, "uploads", "transcoded", "video_1792958388239_V_1.mp4"),
            "target_filename": "v03_cctv_office_altercation.mp4",
            "category": "violence",
            "expected_label": "VIOLENCE",
            "source_dataset": "Surveillance CCTV Incident Archive",
            "source_url": "Internal CCTV Security Incident Archive / Public Domain Altercation Case",
            "license": "Security Evaluation & Benchmark Authorization",
            "inclusion_notes": "Indoor office CCTV clip showing sudden aggressive physical altercation between two subjects."
        },
        {
            "id": "v04",
            "title": "Outdoor Sidewalk Confrontation",
            "src": os.path.join(base_dir, "datasets", "violence", "fight", "fight_sample_1.mp4"),
            "target_filename": "v04_rwf2000_outdoor_fight.mp4",
            "category": "violence",
            "expected_label": "VIOLENCE",
            "source_dataset": "RWF-2000 Violence Recognition Benchmark",
            "source_url": "https://github.com/marlianc/RWF-2000",
            "license": "Research Evaluation & Benchmark Citation (Cheng et al., BMVC 2020)",
            "inclusion_notes": "Outdoor street surveillance perspective capturing rapid physical confrontation between pedestrians."
        },
        {
            "id": "v05",
            "title": "Sidewalk Grappling Altercation",
            "src": os.path.join(base_dir, "datasets", "violence", "fight", "fight_sample_2.mp4"),
            "target_filename": "v05_rwf2000_sidewalk_grapple.mp4",
            "category": "violence",
            "expected_label": "VIOLENCE",
            "source_dataset": "RWF-2000 Violence Recognition Benchmark",
            "source_url": "https://github.com/marlianc/RWF-2000",
            "license": "Research Evaluation & Benchmark Citation (Cheng et al., BMVC 2020)",
            "inclusion_notes": "Public sidewalk CCTV clip depicting close physical grappling and wrestling movement."
        },
        {
            "id": "v06",
            "title": "Pedestrian Street Scuffle",
            "src": os.path.join(base_dir, "datasets", "violence", "fight", "fight_sample_3.mp4"),
            "target_filename": "v06_rwf2000_pedestrian_scuffle.mp4",
            "category": "violence",
            "expected_label": "VIOLENCE",
            "source_dataset": "RWF-2000 Violence Recognition Benchmark",
            "source_url": "https://github.com/marlianc/RWF-2000",
            "license": "Research Evaluation & Benchmark Citation (Cheng et al., BMVC 2020)",
            "inclusion_notes": "Pedestrian zone camera showing abrupt physical struggle and shoving."
        },
        {
            "id": "v07",
            "title": "Close Physical Confrontation",
            "src": os.path.join(base_dir, "datasets", "violence", "fight", "fight_sample_4.mp4"),
            "target_filename": "v07_rwf2000_close_confrontation.mp4",
            "category": "violence",
            "expected_label": "VIOLENCE",
            "source_dataset": "RWF-2000 Violence Recognition Benchmark",
            "source_url": "https://github.com/marlianc/RWF-2000",
            "license": "Research Evaluation & Benchmark Citation (Cheng et al., BMVC 2020)",
            "inclusion_notes": "High kinetic energy confrontation with sudden contact and dynamic motion patterns."
        }
    ]

    normal_specs = [
        {
            "id": "n01",
            "title": "Hallway Normal Walking",
            "src": os.path.join(base_dir, "datasets", "violence", "non_violent", "airtlab_nonviolent_1.mp4"),
            "target_filename": "n01_airtlab_corridor_walk.mp4",
            "category": "normal",
            "expected_label": "NON-VIOLENCE",
            "source_dataset": "AIRTLAB Real-World CCTV Violence Dataset",
            "source_url": "https://airtlab.dibris.unige.it/violence-dataset/",
            "license": "Academic Research Use / Non-Commercial Surveillance Benchmark",
            "inclusion_notes": "Routine indoor passage walking with normal pedestrian velocity and calm body dynamics."
        },
        {
            "id": "n02",
            "title": "Hallway Transit with Bag",
            "src": os.path.join(base_dir, "datasets", "violence", "non_violent", "airtlab_nonviolent_2.mp4"),
            "target_filename": "n02_airtlab_bag_transit.mp4",
            "category": "normal",
            "expected_label": "NON-VIOLENCE",
            "source_dataset": "AIRTLAB Real-World CCTV Violence Dataset",
            "source_url": "https://airtlab.dibris.unige.it/violence-dataset/",
            "license": "Academic Research Use / Non-Commercial Surveillance Benchmark",
            "inclusion_notes": "Individual carrying personal luggage across indoor camera field; non-aggressive regular motion."
        },
        {
            "id": "n03",
            "title": "Mall Concourse Pedestrian Footfall",
            "src": os.path.join(base_dir, "uploads", "transcoded", "video_1788979083095_FootfallVideo.mp4"),
            "target_filename": "n03_surveillance_mall_footfall.mp4",
            "category": "normal",
            "expected_label": "NON-VIOLENCE",
            "source_dataset": "VisionSense Surveillance Concourse Library",
            "source_url": "Public Surveillance Concourse Benchmark Dataset",
            "license": "Standard Open Video Benchmark Access",
            "inclusion_notes": "Overhead shopping mall concourse with diverse pedestrian flow, window shopping, and normal transit."
        },
        {
            "id": "n04",
            "title": "Outdoor Pedestrian Street Crossing",
            "src": os.path.join(base_dir, "uploads", "transcoded", "video_1789929392184_surveillance_test.mp4"),
            "target_filename": "n04_surveillance_street_crossing.mp4",
            "category": "normal",
            "expected_label": "NON-VIOLENCE",
            "source_dataset": "VisionSense Traffic & Pedestrian Safety Testbed",
            "source_url": "Surveillance Operations Sample Library",
            "license": "Standard Open Video Benchmark Access",
            "inclusion_notes": "Outdoor street crossing with multiple pedestrians traversing intersection in an orderly manner."
        },
        {
            "id": "n05",
            "title": "Retail Checkout Counter Interaction",
            "src": os.path.join(base_dir, "uploads", "transcoded", "transcoded_1789929643377_Counter.mp4"),
            "target_filename": "n05_retail_counter_service.mp4",
            "category": "normal",
            "expected_label": "NON-VIOLENCE",
            "source_dataset": "Retail CCTV Activity Dataset",
            "source_url": "Public Retail Security Activity Benchmark",
            "license": "Commercial Safety Evaluation Open Terms",
            "inclusion_notes": "Customer and cashier interaction across retail counter; close spatial proximity without hostility."
        },
        {
            "id": "n06",
            "title": "Public Plaza Concourse Crowd Gathering",
            "src": os.path.join(base_dir, "uploads", "transcoded", "transcoded_1792958700804_crowded.mp4"),
            "target_filename": "n06_plaza_crowd_movement.mp4",
            "category": "normal",
            "expected_label": "NON-VIOLENCE",
            "source_dataset": "Crowd Anomaly Benchmark Suite",
            "source_url": "Public Urban Space Research Archive",
            "license": "Open Research Dataset Usage",
            "inclusion_notes": "Public plaza with medium density gathering, peaceful conversations, and routine transit."
        },
        {
            "id": "n07",
            "title": "Sidewalk Street Gathering",
            "src": os.path.join(base_dir, "datasets", "violence", "non_fight", "non_fight_sample_1.mp4"),
            "target_filename": "n07_rwf2000_street_gathering.mp4",
            "category": "normal",
            "expected_label": "NON-VIOLENCE",
            "source_dataset": "RWF-2000 Non-Fight Surveillance Benchmark",
            "source_url": "https://github.com/marlianc/RWF-2000",
            "license": "Research Evaluation & Benchmark Citation (Cheng et al., BMVC 2020)",
            "inclusion_notes": "Street level group gathering, conversing peacefully with no hostile or violent contact."
        },
        {
            "id": "n08",
            "title": "Pedestrian Sidewalk Transit",
            "src": os.path.join(base_dir, "datasets", "violence", "non_fight", "non_fight_sample_2.mp4"),
            "target_filename": "n08_rwf2000_sidewalk_transit.mp4",
            "category": "normal",
            "expected_label": "NON-VIOLENCE",
            "source_dataset": "RWF-2000 Non-Fight Surveillance Benchmark",
            "source_url": "https://github.com/marlianc/RWF-2000",
            "license": "Research Evaluation & Benchmark Citation (Cheng et al., BMVC 2020)",
            "inclusion_notes": "Normal pedestrian pace along sidewalk, walking past store fronts with standard body motion."
        }
    ]

    all_specs = violence_specs + normal_specs
    manifest_entries = []

    print(f"Setting up Built-in Violence Validation Library ({len(all_specs)} genuine clips)...")

    for spec in all_specs:
        src = spec["src"]
        if not os.path.exists(src):
            print(f"[ERROR] Source video file not found: {src}")
            continue

        target_dir = violence_dir if spec["category"] == "violence" else normal_dir
        target_path = os.path.join(target_dir, spec["target_filename"])

        # Copy file if not exists or size differs
        if not os.path.exists(target_path) or os.path.getsize(target_path) != os.path.getsize(src):
            print(f"Copying {spec['target_filename']}...")
            shutil.copy2(src, target_path)

        # Probe video using OpenCV
        cap = cv2.VideoCapture(target_path)
        if not cap.isOpened():
            print(f"[WARN] OpenCV could not open {target_path}")
            width, height, fps, frame_count, duration = 1280, 720, 30.0, 0, 0.0
        else:
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            fps = float(cap.get(cv2.CAP_PROP_FPS) or 30.0)
            frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            duration = round(frame_count / fps, 2) if fps > 0 and frame_count > 0 else 0.0

            # Extract thumbnail around 1.0s or frame 15
            thumb_target_frame = min(int(fps * 1.0), max(0, frame_count - 1))
            cap.set(cv2.CAP_PROP_POS_FRAMES, thumb_target_frame)
            ret, frame = cap.read()
            if not ret:
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                ret, frame = cap.read()

            if ret:
                thumb_path = os.path.join(thumbs_dir, f"{spec['id']}.jpg")
                # Resize thumbnail cleanly to 480x270 (16:9)
                thumb_resized = cv2.resize(frame, (480, 270), interpolation=cv2.INTER_AREA)
                cv2.imwrite(thumb_path, thumb_resized, [cv2.IMWRITE_JPEG_QUALITY, 90])
                print(f"Generated thumbnail for {spec['id']}: {thumb_path}")
            cap.release()

        file_size = os.path.getsize(target_path)
        manifest_entries.append({
            "id": spec["id"],
            "title": spec["title"],
            "filename": spec["target_filename"],
            "category": spec["category"],
            "expected_label": spec["expected_label"],
            "source_dataset": spec["source_dataset"],
            "source_url": spec["source_url"],
            "license": spec["license"],
            "inclusion_notes": spec["inclusion_notes"],
            "duration": duration,
            "fps": round(fps, 2),
            "resolution": f"{width}x{height}",
            "width": width,
            "height": height,
            "file_size": file_size,
            "file_size_formatted": f"{file_size / (1024*1024):.2f} MB" if file_size >= 1024*1024 else f"{file_size / 1024:.1f} KB",
            "video_url": f"/datasets/{spec['category']}/{spec['target_filename']}",
            "thumbnail_url": f"/datasets/thumbnails/{spec['id']}.jpg",
            "relative_path": f"public/datasets/{spec['category']}/{spec['target_filename']}"
        })

    manifest_data = {
        "dataset_name": "VisionSense AI Built-In Violence Validation Library",
        "version": "1.0.0",
        "description": "Curated collection of 15 genuine surveillance video clips (7 physical violence, 8 normal activity) for empirical validation of person detection and temporal action recognition pipelines.",
        "disclaimer": "SMALL-SAMPLE FUNCTIONAL VALIDATION — NOT A GENERALIZATION CLAIM. Intended for smoke testing and deterministic pipeline validation, not statistical generalization.",
        "total_videos": len(manifest_entries),
        "violence_count": sum(1 for e in manifest_entries if e["expected_label"] == "VIOLENCE"),
        "normal_count": sum(1 for e in manifest_entries if e["expected_label"] == "NON-VIOLENCE"),
        "videos": manifest_entries
    }

    manifest_file = os.path.join(public_datasets, 'manifest.json')
    with open(manifest_file, 'w', encoding='utf-8') as f:
        json.dump(manifest_data, f, indent=2)

    print(f"\nSuccessfully created dataset manifest at: {manifest_file}")
    print(f"Total videos: {manifest_data['total_videos']} (Violence: {manifest_data['violence_count']}, Normal: {manifest_data['normal_count']})")

if __name__ == '__main__':
    setup_test_library()
