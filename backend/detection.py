# backend/detection.py

from fastapi import APIRouter, File, HTTPException, UploadFile, Form, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from backend.database import get_db
import cv2
import numpy as np
from datetime import datetime
import os
import logging
from ultralytics import YOLO
import uuid
import time

logger = logging.getLogger(__name__)

# ==============================================================================
# PATHS
# ==============================================================================
BASE_DIR = os.path.dirname(os.path.dirname(__file__))
FRAME_SAVE_PATH = os.path.join(BASE_DIR, "uploads", "frames")
os.makedirs(FRAME_SAVE_PATH, exist_ok=True)

# ==============================================================================
# 🧠 FYP CONTRIBUTION: WEIGHTED THREAT SCORING CONFIG
# ==============================================================================
# Scores assigned to specific detections per frame
THREAT_WEIGHTS = {
    "cell_phone": 50,       # High Priority
    "multiple_persons": 40, # Medium-High Priority
    "person_absent": 10     # Low Priority (needs persistence)
}

# Threshold to trigger a database log
THREAT_THRESHOLD = 80 

# Time window to keep scores (in seconds)
SLIDING_WINDOW_SECONDS = 30.0 

# Prevent spamming DB with same alert (in seconds)
ALERT_COOLDOWN = 5.0 

# ==============================================================================
# GLOBAL STATE (In-Memory Storage)
# Stores history of scores: { "user_id_exam_id": [ (timestamp, score), ... ] }
# ==============================================================================
SESSION_SCORES = {}
LAST_DB_LOG_TIME = {}

# ==============================================================================
# MODEL LOADING
# ==============================================================================
model = None

def load_model():
    global model
    if model is None:
        try:
            model_path = "yolov8n.pt"
            if os.path.exists(model_path):
                model = YOLO(model_path)
                logger.info("✅ Weighted Scoring Model (YOLO) Loaded")
            else:
                logger.warning("⚠️ Local model not found, downloading YOLOv8n...")
                model = YOLO("yolov8n.pt")
        except Exception as e:
            logger.error(f"❌ Failed to load YOLO: {e}")
            raise e
    return model

# ==============================================================================
# CORE LOGIC: UPDATE SCORES & CHECK THRESHOLD
# ==============================================================================
def update_threat_score(user_id, exam_id, frame_score):
    """
    Adds current score to history, prunes old scores, and checks threshold.
    Returns: (is_alert_triggered, current_total_score)
    """
    key = f"{user_id}_{exam_id}"
    now = time.time()

    # 1. Initialize session if new
    if key not in SESSION_SCORES:
        SESSION_SCORES[key] = []

    # 2. Add current frame's score (if any)
    if frame_score > 0:
        SESSION_SCORES[key].append((now, frame_score))

    # 3. Sliding Window: Remove scores older than window limit
    # Keep only events where timestamp > (now - 30s)
    SESSION_SCORES[key] = [
        event for event in SESSION_SCORES[key] 
        if event[0] > (now - SLIDING_WINDOW_SECONDS)
    ]

    # 4. Calculate Total Accumulated Score
    total_score = sum(score for _, score in SESSION_SCORES[key])

    # 5. Check Threshold & Cooldown
    is_alert = False
    
    if total_score >= THREAT_THRESHOLD:
        last_log = LAST_DB_LOG_TIME.get(key, 0)
        if (now - last_log) > ALERT_COOLDOWN:
            is_alert = True
            LAST_DB_LOG_TIME[key] = now
            
            # Optional: Reduce score after alert to prevent immediate re-trigger?
            # We remove the oldest half of events to "reset" slightly
            cut_idx = len(SESSION_SCORES[key]) // 2
            SESSION_SCORES[key] = SESSION_SCORES[key][cut_idx:]

    return is_alert, total_score

# ==============================================================================
# DETECTION PIPELINE
# ==============================================================================
def detect_faces_and_movements(img, user_id, exam_id):
    yolo = load_model()
    
    # Run Inference
    results = yolo(img, verbose=False)[0]
    boxes = results.boxes

    # Frame Analysis
    person_count = 0
    phone_detected = False
    
    # Analyze detections
    if boxes:
        for box in boxes:
            cls_id = int(box.cls[0])
            conf = float(box.conf[0])

            # Class 0 = Person
            if cls_id == 0 and conf > 0.5:
                person_count += 1
            
            # Class 67 = Cell Phone
            if cls_id == 67 and conf > 0.4:
                phone_detected = True

    # Calculate Score for THIS specific frame
    current_frame_score = 0
    primary_reason = "normal"

    if person_count == 0:
        current_frame_score += THREAT_WEIGHTS["person_absent"]
        primary_reason = "person_absent"
    elif person_count > 1:
        current_frame_score += THREAT_WEIGHTS["multiple_persons"]
        primary_reason = "multiple_persons"
    
    if phone_detected:
        current_frame_score += THREAT_WEIGHTS["cell_phone"]
        primary_reason = "cell_phone_detected" # Higher priority

    # Update Sliding Window & Check Threshold
    alert_triggered, total_score = update_threat_score(user_id, exam_id, current_frame_score)

    logs = []
    
    # ✅ SAVE TO DB ONLY IF THRESHOLD CROSSED
    if alert_triggered:
        ts = datetime.now()
        filename = f"{user_id}_{exam_id}_{ts.strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}.jpg"
        path = os.path.join(FRAME_SAVE_PATH, filename)
        
        # Draw Score on Image for Evidence
        cv2.putText(img, f"Threat Score: {total_score}/{THREAT_THRESHOLD}", (20, 50), 
                    cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
        cv2.putText(img, f"Reason: {primary_reason}", (20, 90), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)
        
        cv2.imwrite(path, img)

        logs.append({
            "user_id": user_id,
            "exam_id": exam_id,
            "movement_type": primary_reason,
            "timestamp": ts,
            "frame_image_path": f"frames/{filename}",
            "confidence": total_score,   # Using confidence field to store Threat Score
            "person_count": person_count
        })
        
        logger.warning(f"🚨 ALERT | User: {user_id} | Score: {total_score} | Reason: {primary_reason}")

    return img, logs

# ==============================================================================
# API ROUTER
# ==============================================================================
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
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            raise HTTPException(status_code=400, detail="Invalid image")

        _, logs = detect_faces_and_movements(img, user_id, exam_id)

        # Save Alerts to DB
        for log in logs:
            db.execute(text("""
                INSERT INTO dbo.Movements
                (user_id, exam_id, movement_type, timestamp, frame_image_path)
                VALUES (:u, :e, :t, :ts, :p)
            """), {
                "u": log["user_id"],
                "e": log["exam_id"],
                "t": log["movement_type"],
                "ts": log["timestamp"],
                "p": log["frame_image_path"]
            })
        db.commit()

        return {
            "status": "success",
            "processed": True,
            "alert_generated": len(logs) > 0,
            "logs": logs
        }

    except Exception as e:
        db.rollback()
        logger.error(f"❌ Processing failed: {e}")
        return {"status": "error", "message": str(e)}

@router.get("/health")
async def video_health():
    try:
        load_model()
        return {"status": "healthy", "mode": "weighted_scoring_yolo_only"}
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}