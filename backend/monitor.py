# backend/monitor.py

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime
from backend.database import get_db
from backend.auth import get_current_user
from backend.models import Movement  # Assuming you have this ORM model
from sqlalchemy import text

router = APIRouter(tags=["Monitor"])


# ---------------- Pydantic Schema ----------------
class ViolationReport(BaseModel):
    user_id: int
    exam_id: int
    violation_type: str  # e.g., "tab_switch", "window_blur", "incognito_mode"
    timestamp: str  # ISO format string


# ---------------- Report Violation ----------------
@router.post("/violation")
async def report_violation(
    data: ViolationReport,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """
    Log a violation event during an exam (e.g., tab switch, window blur).
    Accessible to students during exam or invigilators.
    """
    try:
        # Optional: Validate that user is taking the exam or is invigilator
        role = current_user.get("role") if isinstance(current_user, dict) else getattr(current_user, "role", None)
        user_id = current_user.get("id") if isinstance(current_user, dict) else getattr(current_user, "id", None)

        if role == "student" and user_id != data.user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Students can only report their own violations."
            )

        # Insert into Movements table (or create Violations table if preferred)
        db.execute(
            text("""
                INSERT INTO dbo.Movements (user_id, exam_id, movement_type, timestamp)
                VALUES (:user_id, :exam_id, :movement_type, :timestamp)
            """),
            {
                "user_id": data.user_id,
                "exam_id": data.exam_id,
                "movement_type": data.violation_type,
                "timestamp": data.timestamp
            }
        )
        db.commit()

        return {
            "status": "success",
            "message": f"Violation '{data.violation_type}' recorded for user {data.user_id}"
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to record violation: {str(e)}"
        )


# ---------------- Get Active Violations (for Invigilator Dashboard) ----------------
@router.get("/active-violations")
async def get_active_violations(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """
    Get recent violations for currently active exams.
    Only accessible to invigilators or admins.
    """
    role = current_user.get("role") if isinstance(current_user, dict) else getattr(current_user, "role", None)
    if role not in ["invigilator", "admin"]:
        raise HTTPException(status_code=403, detail="Only invigilators or admins can view active violations")

    query = text("""
        SELECT 
            m.id,
            u.username,
            e.title AS exam_title,
            m.movement_type,
            m.timestamp
        FROM dbo.Movements m
        JOIN dbo.Users u ON m.user_id = u.id
        JOIN dbo.Exams e ON m.exam_id = e.id
        WHERE e.start_time <= GETDATE() AND e.end_time >= GETDATE()
        ORDER BY m.timestamp DESC
        OFFSET 0 ROWS FETCH NEXT 20 ROWS ONLY
    """)

    rows = db.execute(query).fetchall()
    return [dict(row._mapping) for row in rows]


# ---------------- Get Violations for Specific Exam ----------------
@router.get("/violations/exam/{exam_id}")
async def get_violations_for_exam(
    exam_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """
    Get all violations for a specific exam.
    Accessible to invigilators, admins, or the student themselves.
    """
    role = current_user.get("role") if isinstance(current_user, dict) else getattr(current_user, "role", None)
    user_id = current_user.get("id") if isinstance(current_user, dict) else getattr(current_user, "id", None)

    # Allow student to view their own exam violations
    if role == "student":
        # Check if student has taken this exam
        taken = db.execute(
            text("SELECT 1 FROM dbo.StudentAnswers WHERE user_id = :uid AND exam_id = :eid"),
            {"uid": user_id, "eid": exam_id}
        ).fetchone()
        if not taken:
            raise HTTPException(status_code=403, detail="You did not take this exam")

    elif role not in ["invigilator", "admin"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    query = text("""
        SELECT 
            m.id,
            u.username,
            m.movement_type,
            m.timestamp,
            m.frame_image_path
        FROM dbo.Movements m
        JOIN dbo.Users u ON m.user_id = u.id
        WHERE m.exam_id = :exam_id
        ORDER BY m.timestamp DESC
    """)
    rows = db.execute(query, {"exam_id": exam_id}).fetchall()
    return [dict(row._mapping) for row in rows]

# ---------------- Get Unusual Detections (for Invigilator Dashboard) ----------------
@router.get("/unusual-detections")
async def get_unusual_detections(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """
    Get recent unusual detections (e.g., tab switch, window blur, incognito mode).
    Only accessible to invigilators or admins.
    """
    role = current_user.get("role") if isinstance(current_user, dict) else getattr(current_user, "role", None)
    if role not in ["invigilator", "admin"]:
        raise HTTPException(status_code=403, detail="Only invigilators or admins can view unusual detections")

    query = text("""
        SELECT 
            u.username,
            m.movement_type,
            m.timestamp,
            m.frame_image_path
        FROM dbo.Movements m
        JOIN dbo.Users u ON m.user_id = u.id
        WHERE m.movement_type IN ('tab_switch', 'window_blur', 'incognito_mode', 'suspicious_movement')
        ORDER BY m.timestamp DESC
        OFFSET 0 ROWS FETCH NEXT 20 ROWS ONLY
    """)

    rows = db.execute(query).fetchall()
    return [dict(row._mapping) for row in rows]

# ---------------- Get Active Students ----------------
@router.get("/active-students")
async def get_active_students(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """
    Get list of students currently taking active exams.
    Only accessible to invigilators or admins.
    """
    role = current_user.get("role") if isinstance(current_user, dict) else getattr(current_user, "role", None)
    if role not in ["invigilator", "admin"]:
        raise HTTPException(status_code=403, detail="Only invigilators or admins can view active students")

    query = text("""
        SELECT DISTINCT
            u.id AS user_id,
            u.username,
            e.id AS exam_id,
            e.title AS exam_title
        FROM dbo.ActiveExams ae
        JOIN dbo.Users u ON ae.user_id = u.id
        JOIN dbo.Exams e ON ae.exam_id = e.id
        WHERE GETDATE() BETWEEN e.start_time AND e.end_time
        ORDER BY u.username ASC
    """)

    rows = db.execute(query).fetchall()
    return [dict(row._mapping) for row in rows]

# ---------------- Get YOLO-based Unusual Movements (captured frames) ----------------
@router.get("/unusual-movements")
async def get_unusual_movements(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """
    Return unusual movement records joined with username.
    Only admin/invigilator allowed.
    These records are generated from YOLO detections (frames saved in uploads/frames).
    """
    role = current_user.get("role") if isinstance(current_user, dict) else getattr(current_user, "role", None)
    if role not in ["admin", "invigilator"]:
        raise HTTPException(status_code=403, detail="Admin/Invigilator access required")

    query = text("""
        SELECT 
            m.id,
            m.user_id,
            u.username,
            m.exam_id,
            m.movement_type,
            m.timestamp,
            m.frame_image_path
        FROM dbo.Movements m
        JOIN dbo.Users u ON m.user_id = u.id
        WHERE m.movement_type IN ('multiple_persons', 'person_absent', 'no_person_detected', 'detection_error')
        ORDER BY m.timestamp DESC
    """)
    
    rows = db.execute(query).fetchall()
    return [dict(r._mapping) for r in rows]
