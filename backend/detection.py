# backend/detection.py
from ultralytics import YOLO
import cv2
import numpy as np
from config import FRAME_SAVE_PATH
import os
from datetime import datetime
import torch
from ultralytics import YOLO

# Load model with safe globals
model = YOLO("yolov8n.pt")  # Load YOLOv8 nano

def detect_faces_and_movements(frame, user_id, exam_id):
    results = model.track(frame, persist=True, classes=[0])  # Track persons only
    movement_log = []

    if results[0].boxes is not None:
        boxes = results[0].boxes.xyxy.cpu().numpy()
        track_ids = results[0].boxes.id.int().cpu().numpy() if results[0].boxes.id else []

        for i, box in enumerate(boxes):
            x1, y1, x2, y2 = map(int, box)
            center = ((x1 + x2) // 2, (y1 + y2) // 2)
            track_id = track_ids[i] if len(track_ids) > i else -1

            # Save frame if face/person detected
            ts = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
            img_path = os.path.join(FRAME_SAVE_PATH, f"{user_id}_{exam_id}_{ts}.jpg")
            cv2.imwrite(img_path, frame[y1:y2, x1:x2])

            movement_log.append({
                "user_id": user_id,
                "exam_id": exam_id,
                "movement_type": "detected",
                "timestamp": datetime.now(),
                "frame_image_path": img_path
            })

            # Draw bounding box
            cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
            cv2.putText(frame, f'Person {track_id}', (x1, y1 - 10),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)

    else:
        movement_log.append({
            "user_id": user_id,
            "exam_id": exam_id,
            "movement_type": "no_face",
            "timestamp": datetime.now(),
            "frame_image_path": None
        })

    return frame, movement_log