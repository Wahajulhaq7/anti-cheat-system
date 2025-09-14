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

logger = logging.getLogger(__name__)

FRAME_SAVE_PATH = "uploads/frames"
os.makedirs(FRAME_SAVE_PATH, exist_ok=True)

# Initialize YOLO model
model = None

def load_model():
    """Load YOLO model if not already loaded"""
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
    """
    Detect faces and suspicious movements in the image
    Returns: (processed_image, movement_log)
    """
    movement_log = []
    
    try:
        # Load model if not loaded
        yolo_model = load_model()
        
        # Run YOLO detection
        results = yolo_model(img)
        
        # Process results
        for result in results:
            boxes = result.boxes
            if boxes is not None:
                for box in boxes:
                    # Get class name
                    class_id = int(box.cls[0])
                    class_name = yolo_model.names[class_id]
                    confidence = float(box.conf[0])
                    
                    # Only process person detections with high confidence
                    if class_name == 'person' and confidence > 0.5:
                        # Count number of people detected
                        person_count = len([b for b in boxes if yolo_model.names[int(b.cls[0])] == 'person' and float(b.conf[0]) > 0.5])
                        
                        # Generate unique filename for frame
                        timestamp = datetime.now()
                        filename = f"{user_id}_{exam_id}_{timestamp.strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}.jpg"
                        frame_path = os.path.join(FRAME_SAVE_PATH, filename)
                        
                        # Save frame
                        cv2.imwrite(frame_path, img)
                        
                        # Determine movement type based on detection
                        movement_type = "normal_behavior"
                        if person_count == 0:
                            movement_type = "person_absent"
                        elif person_count > 1:
                            movement_type = "multiple_persons"
                        
                        # Add to movement log
                        movement_log.append({
                            "user_id": user_id,
                            "exam_id": exam_id,
                            "movement_type": movement_type,
                            "timestamp": timestamp,
                            "frame_image_path": frame_path,
                            "confidence": confidence,
                            "person_count": person_count
                        })
                        
                        logger.info(f"✅ Detected {person_count} person(s) with confidence {confidence:.2f}")
                        break  # Only log once per frame
                
                # If no person detected at all
                if len(movement_log) == 0:
                    timestamp = datetime.now()
                    filename = f"{user_id}_{exam_id}_{timestamp.strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}.jpg"
                    frame_path = os.path.join(FRAME_SAVE_PATH, filename)
                    cv2.imwrite(frame_path, img)
                    
                    movement_log.append({
                        "user_id": user_id,
                        "exam_id": exam_id,
                        "movement_type": "no_person_detected",
                        "timestamp": timestamp,
                        "frame_image_path": frame_path,
                        "confidence": 0.0,
                        "person_count": 0
                    })
                    
                    logger.warning("⚠️ No person detected in frame")
    
    except Exception as e:
        logger.error(f"❌ Detection error: {e}")
        # Still save the frame and log as error
        timestamp = datetime.now()
        filename = f"{user_id}_{exam_id}_{timestamp.strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}.jpg"
        frame_path = os.path.join(FRAME_SAVE_PATH, filename)
        cv2.imwrite(frame_path, img)
        
        movement_log.append({
            "user_id": user_id,
            "exam_id": exam_id,
            "movement_type": "detection_error",
            "timestamp": timestamp,
            "frame_image_path": frame_path,
            "confidence": 0.0,
            "person_count": 0
        })
    
    return img, movement_log

# Create router without prefix (since main.py adds the prefix)
router = APIRouter(tags=["Video"])

@router.post("/")
async def process_frame(
    frame: UploadFile = File(...),
    user_id: int = Form(...),
    exam_id: int = Form(...),
    db: Session = Depends(get_db)
):
    """
    Process uploaded video frame for anti-cheat detection
    """
    try:
        # Read and decode image
        contents = await frame.read()
        np_arr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

        if img is None:
            raise HTTPException(status_code=400, detail="Invalid image format")

        # Perform detection
        _, movement_log = detect_faces_and_movements(img, user_id, exam_id)

        # Save movements to database
        for log in movement_log:
            db.execute(text("""
                INSERT INTO dbo.Movements (user_id, exam_id, movement_type, timestamp, frame_image_path)
                VALUES (:uid, :eid, :type, :ts, :path)
            """), {
                "uid": log["user_id"],
                "eid": log["exam_id"],
                "type": log["movement_type"],
                "ts": log["timestamp"],
                "path": log["frame_image_path"]
            })

        db.commit()
        logger.info("✅ Committed %d movements to database", len(movement_log))

        return {
            "status": "success", 
            "count": len(movement_log), 
            "movements": movement_log,
            "message": "Frame processed successfully"
        }

    except Exception as e:
        db.rollback()
        logger.error(f"❌ Failed to process frame: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to process video frame: {str(e)}")

@router.get("/health")
async def video_health_check():
    """
    Check if video processing service is healthy
    """
    try:
        # Try to load model
        load_model()
        return {
            "status": "healthy",
            "message": "Video processing service is running",
            "model_loaded": model is not None
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "message": f"Video processing service error: {str(e)}",
            "model_loaded": False
        }
