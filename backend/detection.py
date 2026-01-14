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
import face_recognition

logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
FRAME_SAVE_PATH = os.path.join(BASE_DIR, "uploads", "frames")
PROFILE_PICS_PATH = os.path.join(BASE_DIR, "uploads", "profiles")
os.makedirs(FRAME_SAVE_PATH, exist_ok=True)

THREAT_WEIGHTS = {
    "Mobile Phone Detected": 50,
    "Book Detected": 40,
    "Impersonation Detected": 100,
    "Multiple Persons": 40,
    "Face Not Visible": 20,
    "Looking Away": 15,
    "Person Absent": 10
}

KNOWN_FACE_CACHE = {}
model = None

def load_model():
    global model
    if model is None:
        model = YOLO("yolov8n.pt")
    return model

def verify_identity(rgb_frame, user_id):
    if user_id not in KNOWN_FACE_CACHE:
        profile_path = os.path.join(PROFILE_PICS_PATH, f"{user_id}.jpg")
        if not os.path.exists(profile_path):
            return None
        try:
            known_image = face_recognition.load_image_file(profile_path)
            encodings = face_recognition.face_encodings(known_image)
            if len(encodings) > 0:
                KNOWN_FACE_CACHE[user_id] = encodings[0]
            else:
                return None
        except Exception:
            return None

    known_encoding = KNOWN_FACE_CACHE.get(user_id)
    if known_encoding is None:
        return None

    face_locations = face_recognition.face_locations(rgb_frame)
    if not face_locations:
        return None

    face_encodings = face_recognition.face_encodings(rgb_frame, face_locations)
    for face_encoding in face_encodings:
        matches = face_recognition.compare_faces([known_encoding], face_encoding, tolerance=0.5)
        face_dist = face_recognition.face_distance([known_encoding], face_encoding)[0]
        if True in matches:
            return True
        else:
            return False
    return False

def detect_suspicious_gaze(rgb_frame):
    landmarks_list = face_recognition.face_landmarks(rgb_frame)
    if not landmarks_list:
        return False
    try:
        landmarks = landmarks_list[0]
        left_jaw = landmarks['chin'][0]
        right_jaw = landmarks['chin'][16]
        nose_tip = landmarks['nose_tip'][0]
        dist_to_left = abs(nose_tip[0] - left_jaw[0])
        dist_to_right = abs(nose_tip[0] - right_jaw[0])
        if dist_to_right == 0:
            dist_to_right = 0.001
        if dist_to_left == 0:
            dist_to_left = 0.001
        ratio = dist_to_left / dist_to_right
        if ratio > 2.5 or ratio < 0.4:
            return True
    except Exception:
        pass
    return False

def check_instant_trigger(frame_score):
    return frame_score > 0

def detect_faces_and_movements(img, user_id, exam_id):
    yolo = load_model()
    results = yolo(img, verbose=False)[0]
    person_count = 0
    phone_detected = False
    book_detected = False
    if results.boxes:
        for box in results.boxes:
            cls_id = int(box.cls[0])
            conf = float(box.conf[0])
            if conf > 0.5:
                if cls_id == 0:
                    person_count += 1
                elif cls_id == 67:
                    phone_detected = True
                elif cls_id == 73:
                    book_detected = True
    current_frame_score = 0
    reasons = []
    if person_count == 0:
        current_frame_score += THREAT_WEIGHTS["Person Absent"]
        reasons.append("Person Absent")
    elif person_count > 1:
        current_frame_score += THREAT_WEIGHTS["Multiple Persons"]
        reasons.append("Multiple Persons")
    if phone_detected:
        current_frame_score += THREAT_WEIGHTS["Mobile Phone Detected"]
        reasons.append("Mobile Phone Detected")
    if book_detected:
        current_frame_score += THREAT_WEIGHTS["Book Detected"]
        reasons.append("Book Detected")
    if person_count == 1:
        small_frame = cv2.resize(img, (0, 0), fx=0.50, fy=0.50)
        rgb_small_frame = cv2.cvtColor(small_frame, cv2.COLOR_BGR2RGB)
        is_authenticated = verify_identity(rgb_small_frame, user_id)
        if is_authenticated is False:
            current_frame_score += THREAT_WEIGHTS["Impersonation Detected"]
            reasons.append("Impersonation Detected")
        elif is_authenticated is None:
            current_frame_score += THREAT_WEIGHTS["Face Not Visible"]
            reasons.append("Face Not Visible")
        elif is_authenticated is True:
            is_looking_away = detect_suspicious_gaze(rgb_small_frame)
            if is_looking_away:
                current_frame_score += THREAT_WEIGHTS["Looking Away"]
                reasons.append("Looking Away")
    alert_triggered = check_instant_trigger(current_frame_score)
    logs = []
    if alert_triggered:
        ts = datetime.now()
        filename = f"{user_id}_{exam_id}_{ts.strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}.jpg"
        path = os.path.join(FRAME_SAVE_PATH, filename)
        primary_reason = reasons[0] if reasons else "Suspicious Behavior"
        if "Impersonation Detected" in reasons:
            primary_reason = "Impersonation Detected"
        elif "Mobile Phone Detected" in reasons:
            primary_reason = "Mobile Phone Detected"
        elif "Book Detected" in reasons:
            primary_reason = "Book Detected"
        cv2.putText(img, f"Threat: {primary_reason}", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
        cv2.imwrite(path, img)
        logs.append({
            "user_id": user_id,
            "exam_id": exam_id,
            "movement_type": primary_reason,
            "timestamp": ts,
            "frame_image_path": f"frames/{filename}",
            "confidence": current_frame_score,
            "person_count": person_count
        })
        logger.warning(f"ALERT | User: {user_id} | Reason: {reasons}")
    return img, logs

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
        logger.error(f"Processing failed: {e}")
        return {"status": "error", "message": str(e)}

@router.get("/health")
async def video_health():
    try:
        load_model()
        return {"status": "healthy", "mode": "impersonation_fixed"}
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}
