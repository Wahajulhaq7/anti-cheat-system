from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from .database import get_db

router = APIRouter()

@router.get("/active-students")
def get_active_students(db: Session = Depends(get_db)):
    """
    Returns students who have submitted answers for an exam
    that is currently in progress.
    """
    rows = db.execute(text("""
        SELECT DISTINCT u.id AS user_id, u.username, sa.exam_id
        FROM StudentAnswers sa
        JOIN Users u ON sa.user_id = u.id
        JOIN Exams e ON sa.exam_id = e.id
        WHERE CURRENT_TIMESTAMP BETWEEN e.start_time AND e.end_time
    """)).fetchall()
    return [dict(r._mapping) for r in rows]


@router.get("/unusual-detections")
def get_unusual_detections(db: Session = Depends(get_db)):
    """
    Returns all suspicious movements except normal 'person_detected'.
    """
    rows = db.execute(text("""
        SELECT m.user_id, u.username, m.exam_id, m.movement_type, m.timestamp
        FROM Movements m
        JOIN Users u ON m.user_id = u.id
        WHERE m.movement_type != 'person_detected'
        ORDER BY m.timestamp DESC
    """)).fetchall()
    return [dict(r._mapping) for r in rows]


@router.get("/unusual-images")
def get_unusual_images(user_id: int, exam_id: int, db: Session = Depends(get_db)):
    """
    Returns image frames of unusual movements for a given user & exam.
    """
    rows = db.execute(text("""
        SELECT frame_image_path, movement_type, timestamp
        FROM Movements
        WHERE user_id = :uid
        AND exam_id = :eid
        AND movement_type != 'person_detected'
        AND frame_image_path IS NOT NULL
        ORDER BY timestamp DESC
    """), {"uid": user_id, "eid": exam_id}).fetchall()
    return [dict(r._mapping) for r in rows]


@router.get("/latest-frame")
def get_latest_frame(user_id: int, exam_id: int, db: Session = Depends(get_db)):
    """
    Returns the most recent frame for a given student & exam,
    even if it's not suspicious.
    """
    row = db.execute(text("""
        SELECT frame_image_path, movement_type, timestamp
        FROM Movements
        WHERE user_id = :uid
        AND exam_id = :eid
        AND frame_image_path IS NOT NULL
        ORDER BY timestamp DESC
        LIMIT 1
    """), {"uid": user_id, "eid": exam_id}).fetchone()

    if row:
        return dict(row._mapping)
    return {"frame_image_path": None, "movement_type": None, "timestamp": None}
