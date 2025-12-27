# backend/detection.py

from fastapi import APIRouter, File, HTTPException, UploadFile, Form, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from backend.database import get_db
from backend.auth import get_current_user
import cv2
import numpy as np
from datetime import datetime
import os
import logging
from ultralytics import YOLO
import uuid
import time  # <--- Added for cooldown

logger = logging.getLogger(__name__)

# Base Paths
BASE_DIR = os.path.dirname(os.path.dirname(__file__))
FRAME_SAVE_PATH = os.path.join(BASE_DIR, "uploads", "frames")
os.makedirs(FRAME_SAVE_PATH, exist_ok=True)

# Initialize YOLO model
model = None

# ✅ GLOBAL COOLDOWN TRACKER
# Prevents saving 30 images per second. 
# Format: { user_id: last_violation_timestamp }
last_alert_time = {}
ALERT_COOLDOWN = 3.0 

# ✅ GLOBAL LIVE MONITORING CACHE
# Stores the latest frame info for every active user.
# Format: { (user_id, exam_id): { ...data... } }
LATEST_FRAME_CACHE = {}

def load_model():
    global model
    if model is None:
        try:
            model_path = "yolov8n.pt"
            if os.path.exists(model_path):
                model = YOLO(model_path)
                logger.info("✅ YOLO model loaded successfully")
            else:
                logger.error("❌ YOLO model file not found")
                raise FileNotFoundError("YOLO model file not found")
        except Exception as e:
            logger.error(f"❌ Failed to load YOLO model: {e}")
            raise e
    return model

def detect_faces_and_movements(img, user_id, exam_id):
    movement_log = []
    current_time = time.time()

    # ✅ 1. COOLDOWN CHECK
    # If we just logged a violation for this user < 3 seconds ago, ignore this frame.
    if user_id in last_alert_time:
        if current_time - last_alert_time[user_id] < ALERT_COOLDOWN:
            return img, [] 

    try:
        yolo_model = load_model()
        results = yolo_model(img)
        
        # We need to determine the state of THIS frame
        person_count = 0
        violation_detected = False
        movement_type = "normal_behavior"
        confidence = 0.0

        # Scan detections
        for result in results:
            boxes = result.boxes
            if boxes is not None:
                # Count people with confidence > 0.5
                people_boxes = [
                    b for b in boxes 
                    if yolo_model.names[int(b.cls[0])] == "person" 
                    and float(b.conf[0]) > 0.5
                ]
                person_count = len(people_boxes)
                
                if len(people_boxes) > 0:
                    confidence = float(people_boxes[0].conf[0])
                
                break # Only process the first result batch

        # ✅ 2. DETERMINE IF VIOLATION
        if person_count == 0:
            movement_type = "person_absent"
            violation_detected = True
        elif person_count > 1:
            movement_type = "multiple_persons"
            violation_detected = True
        else:
            # person_count == 1 means NORMAL. 
            # We explicitly DO NOT set violation_detected = True
            pass 

        # =========================================================
        # ✅ LIVE MONITORING: ALWAYS SAVE LATEST FRAME
        # This runs for EVERY processed frame, regardless of violation
        # =========================================================
        try:
            # Save as a fixed filename (overwrite) to save disk space
            latest_filename = f"latest_{user_id}_{exam_id}.jpg"
            latest_path = os.path.join(FRAME_SAVE_PATH, latest_filename)
            cv2.imwrite(latest_path, img)

            # Update the global cache for the monitor endpoint
            LATEST_FRAME_CACHE[(int(user_id), int(exam_id))] = {
                "user_id": user_id,
                "exam_id": exam_id,
                "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "movement_type": movement_type,
                "frame_image_path": f"uploads/frames/{latest_filename}"
            }
        except Exception as e:
            logger.error(f"❌ Failed to save latest live frame: {e}")
        # =========================================================

        # ✅ 3. SAVE TO DB ONLY IF VIOLATION
        if violation_detected:
            timestamp = datetime.now()
            # Generate unique filename for the violation record
            filename = (
                f"{user_id}_{exam_id}_"
                f"{timestamp.strftime('%Y%m%d_%H%M%S')}_"
                f"{uuid.uuid4().hex[:6]}.jpg"
            )

            frame_path = os.path.join(FRAME_SAVE_PATH, filename)
            cv2.imwrite(frame_path, img)

            movement_log.append({
                "user_id": user_id,
                "exam_id": exam_id,
                "movement_type": movement_type,
                "timestamp": timestamp,
                "frame_image_path": f"frames/{filename}",
                "confidence": confidence,
                "person_count": person_count
            })
            
            # Update cooldown timer
            last_alert_time[user_id] = current_time
            logger.info(f"🚨 Violation Logged: {movement_type}")

    except Exception as e:
        logger.error(f"❌ Detection error: {e}")
        # Only log errors if they are critical, or skip to avoid DB clutter
        pass

    return img, movement_log

router = APIRouter(tags=["Video"])

@router.post("/")
async def process_frame(
    frame: UploadFile = File(...),
    user_id: int = Form(...),
    exam_id: int = Form(...),
    db: Session = Depends(get_db)
):
    try:
        contents = await frame.read()
        np_arr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

        if img is None:
            raise HTTPException(status_code=400, detail="Invalid image format")

        _, movement_log = detect_faces_and_movements(img, user_id, exam_id)

        # Only insert if there is actually a log (meaning a violation occurred)
        for log in movement_log:
            db.execute(text("""
                INSERT INTO dbo.Movements
                (user_id, exam_id, movement_type, timestamp, frame_image_path)
                VALUES (:uid, :eid, :type, :ts, :path)
            """), {
                "uid": log["user_id"],
                "eid": log["exam_id"],
                "type": log["movement_type"],
                "ts": log["timestamp"],
                "path": log["frame_image_path"]
            })

        db.commit()

        return {
            "status": "success",
            "count": len(movement_log),
            "movements": movement_log
        }

    except Exception as e:
        db.rollback()
        logger.error(f"❌ Failed to process frame: {str(e)}")
        # Return error as JSON to prevent frontend crash
        return {"status": "error", "message": str(e)}

@router.get("/health")
async def video_health_check():
    try:
        load_model()
        return {"status": "healthy", "model_loaded": model is not None}
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}