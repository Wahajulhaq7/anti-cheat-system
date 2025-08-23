from ultralytics import YOLO
import cv2
import numpy as np
from config import FRAME_SAVE_PATH
import os
from datetime import datetime

# Load YOLOv8 nano model for person detection
model = YOLO("yolov8n.pt")

# Ensure save path exists
os.makedirs(FRAME_SAVE_PATH, exist_ok=True)

# Keep last known positions for movement tracking
_last_positions = {}

def detect_faces_and_movements(frame, user_id, exam_id):
    results = model.track(frame, persist=True, classes=[0])  # 0 = 'person'
    movement_log = []

    # If nothing detected
    if len(results[0].boxes) == 0:
        movement_log.append({
            "user_id": user_id,
            "exam_id": exam_id,
            "movement_type": "no_person_detected",
            "timestamp": datetime.now(),
            "frame_image_path": None
        })
        return frame, movement_log

    boxes = results[0].boxes.xyxy.cpu().numpy()
    track_ids = results[0].boxes.id.int().cpu().numpy() if results[0].boxes.id is not None else []

    # More than 1 person → suspicious
    if len(boxes) > 1:
        movement_type = "multiple_people_detected"
    else:
        movement_type = "person_detected"

    for i, box in enumerate(boxes):
        x1, y1, x2, y2 = map(int, box)
        center = ((x1 + x2) // 2, (y1 + y2) // 2)
        track_id = int(track_ids[i]) if len(track_ids) > i else -1

        # Check for large position changes (possible standing/moving away)
        if track_id in _last_positions:
            last_center = _last_positions[track_id]
            movement_dist = np.linalg.norm(np.array(center) - np.array(last_center))
            if movement_dist > 50:  # pixels threshold
                movement_type = "suspicious_movement"

        _last_positions[track_id] = center

        # Save cropped detection image
        ts = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        img_path = os.path.join(FRAME_SAVE_PATH, f"{user_id}_{exam_id}_{ts}.jpg")
        cv2.imwrite(img_path, frame[y1:y2, x1:x2])

        # Log event
        movement_log.append({
            "user_id": user_id,
            "exam_id": exam_id,
            "movement_type": movement_type,
            "timestamp": datetime.now(),
            "frame_image_path": img_path
        })

        # Draw bounding box & label
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
        cv2.putText(frame, f'{movement_type} ID:{track_id}', (x1, y1 - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)

    return frame, movement_log
