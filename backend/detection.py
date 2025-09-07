# backend/video.py

from fastapi import APIRouter, File, HTTPException, UploadFile, Form, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from backend.database import get_db
from backend.auth import get_current_user
from backend import detection
import cv2
import numpy as np
from datetime import datetime
import os
import logging

logger = logging.getLogger(__name__)

FRAME_SAVE_PATH = "uploads/frames"
os.makedirs(FRAME_SAVE_PATH, exist_ok=True)

router = APIRouter(prefix="/video", tags=["Video"])

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
            raise HTTPException(status_code=400, detail="Invalid image")

        _, movement_log = detection.detect_faces_and_movements(img, user_id, exam_id)

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
        logger.info("✅ Committed %d movements", len(movement_log))

        return {"status": "success", "count": len(movement_log), "movements": movement_log}

    except Exception as e:
        db.rollback()
        logger.error(f"❌ Failed to process frame: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to process video frame")