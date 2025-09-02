from ultralytics import YOLO
import cv2, os, numpy as np
from datetime import datetime
from config import FRAME_SAVE_PATH

model = YOLO("yolov8n.pt")  # or .to("cuda") if GPU available
os.makedirs(FRAME_SAVE_PATH, exist_ok=True)
_last_positions = {}

def detect_faces_and_movements(frame, user_id, exam_id):
    # Run detection (not tracking) for robustness
    results = model.predict(frame, classes=[0], conf=0.1)  # 0 = person
    movement_log = []

    if not results or len(results[0].boxes) == 0:
        movement_log.append({
            "user_id": user_id,
            "exam_id": exam_id,
            "movement_type": "no_person_detected",
            "timestamp": datetime.now(),
            "frame_image_path": None
        })
        return frame, movement_log

    boxes = results[0].boxes.xyxy.cpu().numpy()

    movement_type = "multiple_people_detected" if len(boxes) > 1 else "person_detected"

    for box in boxes:
        x1, y1, x2, y2 = map(int, box)
        center = ((x1 + x2) // 2, (y1 + y2) // 2)

        # Movement check
        if user_id in _last_positions:
            last_center = _last_positions[user_id]
            if np.linalg.norm(np.array(center) - np.array(last_center)) > 50:
                movement_type = "suspicious_movement"

        _last_positions[user_id] = center

        ts = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        img_path = os.path.join(FRAME_SAVE_PATH, f"{user_id}_{exam_id}_{ts}.jpg")
        cv2.imwrite(img_path, frame[y1:y2, x1:x2])

        movement_log.append({
            "user_id": user_id,
            "exam_id": exam_id,
            "movement_type": movement_type,
            "timestamp": datetime.now(),
            "frame_image_path": img_path
        })

        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
        cv2.putText(frame, movement_type, (x1, y1 - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)

    return frame, movement_log
