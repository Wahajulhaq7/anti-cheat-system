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
import face_recognition

logger = logging.getLogger(__name__)

# ==============================================================================
# PATHS & SETUP
# ==============================================================================
BASE_DIR = os.path.dirname(os.path.dirname(__file__))
FRAME_SAVE_PATH = os.path.join(BASE_DIR, "uploads", "frames")
PROFILE_PICS_PATH = os.path.join(BASE_DIR, "uploads", "profiles")
os.makedirs(FRAME_SAVE_PATH, exist_ok=True)

# ==============================================================================
# 🧠 INSTANT TRIGGER CONFIGURATION
# ==============================================================================
THREAT_WEIGHTS = {
    "Mobile Phone Detected": 50,
    "Book Detected": 40,
    "Impersonation Detected": 100, # CRITICAL
    "Multiple Persons": 40,
    "Face Not Visible": 20,        # NEW: If body present but face hidden
    "Looking Away": 15,
    "Person Absent": 10
}

# ⚠️ ALERT: INSTANT LOGGING ENABLED (NO COOLDOWN)
# Be careful: This will log every violation frame immediately.

KNOWN_FACE_CACHE = {} 
model = None

def load_model():
    global model
    if model is None:
        model = YOLO("yolov8n.pt")
    return model

# ==============================================================================
# 1. IDENTITY VERIFICATION (With Debugging)
# ==============================================================================
def verify_identity(rgb_frame, user_id):
    """
    Returns: 
        True  -> Identity Verified (It matches)
        False -> Impersonation (Face found, but doesn't match)
        None  -> No Face Found (Cannot verify)
    """
    # 1. Load Reference Image (Lazy Loading)
    if user_id not in KNOWN_FACE_CACHE:
        profile_path = os.path.join(PROFILE_PICS_PATH, f"{user_id}.jpg")
        
        if not os.path.exists(profile_path):
            print(f"❌ [DEBUG] Profile picture not found for User {user_id}")
            return None 
            
        try:
            known_image = face_recognition.load_image_file(profile_path)
            encodings = face_recognition.face_encodings(known_image)
            
            if len(encodings) > 0:
                KNOWN_FACE_CACHE[user_id] = encodings[0]
                print(f"✅ [DEBUG] Loaded profile encoding for User {user_id}")
            else:
                print(f"⚠️ [DEBUG] No face found in profile picture for User {user_id}")
                return None
        except Exception as e:
            print(f"❌ [DEBUG] Error loading profile pic: {e}")
            return None

    known_encoding = KNOWN_FACE_CACHE.get(user_id)
    if known_encoding is None:
        return None
    
    # 2. Get Live Face
    # Uses HOG model. If this returns empty, lighting or angle is bad.
    face_locations = face_recognition.face_locations(rgb_frame)
    if not face_locations:
        # print("⚠️ [DEBUG] No face detected in live frame") 
        return None

    face_encodings = face_recognition.face_encodings(rgb_frame, face_locations)

    # 3. Compare
    for face_encoding in face_encodings:
        # tolerance=0.50 (Strict) -> Lower means stricter matching
        # matches returns [True] or [False]
        matches = face_recognition.compare_faces([known_encoding], face_encoding, tolerance=0.5)
        
        # Calculate distance (for debugging precision)
        face_dist = face_recognition.face_distance([known_encoding], face_encoding)[0]

        if True in matches:
            # print(f"✅ [DEBUG] Match Confirmed (Dist: {round(face_dist, 2)})")
            return True 
        else:
            print(f"🚨 [DEBUG] IMPERSONATION! Match Failed (Dist: {round(face_dist, 2)})")

    return False # Face Detected, but NOT the student

# ==============================================================================
# 2. GAZE DETECTION
# ==============================================================================
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

        if dist_to_right == 0: dist_to_right = 0.001
        if dist_to_left == 0: dist_to_left = 0.001

        ratio = dist_to_left / dist_to_right

        if ratio > 2.5 or ratio < 0.4:
            return True 
    except Exception:
        pass
    return False

# ==============================================================================
# 3. INSTANT TRIGGER LOGIC
# ==============================================================================
def check_instant_trigger(frame_score):
    return frame_score > 0

# ==============================================================================
# MAIN PIPELINE
# ==============================================================================
def detect_faces_and_movements(img, user_id, exam_id):
    yolo = load_model()
    
    # 1. YOLO Object Detection
    results = yolo(img, verbose=False)[0]
    
    person_count = 0
    phone_detected = False
    book_detected = False

    if results.boxes:
        for box in results.boxes:
            cls_id = int(box.cls[0])
            conf = float(box.conf[0])
            
            if conf > 0.5:
                if cls_id == 0: person_count += 1
                elif cls_id == 67: phone_detected = True
                elif cls_id == 73: book_detected = True

    # 2. Score Calculation
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

    # 3. Biometric Checks
    if person_count == 1:
        # ✅ FIXED: INCREASED SIZE FOR BETTER ACCURACY
        # Changed from 0.25 (too small) to 0.5 (better).
        # If still failing, change to 1.0 (Full Size, Slower).
        small_frame = cv2.resize(img, (0, 0), fx=0.50, fy=0.50)
        rgb_small_frame = cv2.cvtColor(small_frame, cv2.COLOR_BGR2RGB)

        # A. Identity Verification
        is_authenticated = verify_identity(rgb_small_frame, user_id)
        
        if is_authenticated is False:
            current_frame_score += THREAT_WEIGHTS["Impersonation Detected"]
            reasons.append("Impersonation Detected")
        
        elif is_authenticated is None:
            # Face library failed to find face, even though YOLO found a body
            # This usually means face is hidden, mask, or bad angle
            # We treat this as a minor warning, NOT valid authentication
            current_frame_score += THREAT_WEIGHTS["Face Not Visible"]
            reasons.append("Face Not Visible")

        elif is_authenticated is True:
            # Only check gaze if it IS the correct student
            is_looking_away = detect_suspicious_gaze(rgb_small_frame)
            if is_looking_away:
                current_frame_score += THREAT_WEIGHTS["Looking Away"]
                reasons.append("Looking Away")

    # 4. Instant Trigger
    alert_triggered = check_instant_trigger(current_frame_score)

    logs = []
    
    if alert_triggered:
        ts = datetime.now()
        filename = f"{user_id}_{exam_id}_{ts.strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}.jpg"
        path = os.path.join(FRAME_SAVE_PATH, filename)
        
        primary_reason = reasons[0] if reasons else "Suspicious Behavior"
        if "Impersonation Detected" in reasons: primary_reason = "Impersonation Detected"
        elif "Mobile Phone Detected" in reasons: primary_reason = "Mobile Phone Detected"
        elif "Book Detected" in reasons: primary_reason = "Book Detected"

        # Annotate
        cv2.putText(img, f"Threat: {primary_reason}", (20, 40), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
        
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
        
        logger.warning(f"🚨 ALERT | User: {user_id} | Reason: {reasons}")

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
        return {"status": "healthy", "mode": "impersonation_fixed"}
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}