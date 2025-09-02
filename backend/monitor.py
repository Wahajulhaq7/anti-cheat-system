# backend/logs.py

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime

from backend.database import get_db
from backend.auth import get_current_user
from backend.models import Movement  # ✅ ORM model
from sqlalchemy import func

router = APIRouter(prefix="/log", tags=["Logs"])


# ---------------- Pydantic Schemas ----------------
class ScreenLog(BaseModel):
    user_id: int
    exam_id: int
    app_name: str
    tab_title: str


# ---------------- Screen Logging ----------------
@router.post("/screen")
def log_screen(data: ScreenLog, db: Session = Depends(get_db)):
    """
    Log a screen/tab change event.
    """
    # If you have a ScreenLogs ORM model, use it here.
    # For now, using raw SQLAlchemy Core insert via ORM session.execute
    db.execute(
        """
        INSERT INTO ScreenLogs (user_id, exam_id, app_name, tab_title)
        VALUES (:user_id, :exam_id, :app_name, :tab_title)
        """,
        data.dict()
    )
    db.commit()
    return {"status": "logged"}


# ---------------- Generate Report ----------------
@router.get("/report/{exam_id}")
def generate_report(exam_id: int, db: Session = Depends(get_db)):
    """
    Generate a cheating report for a given exam.
    """
    # Aggregate suspicious movements
    result = db.query(
        func.count(Movement.id).label("suspicious_count"),
        func.string_agg(Movement.movement_type, ', ').label("movements"),
        func.max(Movement.timestamp).label("last_event")
    ).filter(Movement.exam_id == exam_id).first()

    suspicious_count = result.suspicious_count or 0
    movements_str = result.movements or ""
    score = suspicious_count * 10

    # Insert into Reports table (assuming it exists)
    db.execute(
        """
        INSERT INTO Reports (user_id, exam_id, summary, cheating_score)
        VALUES (
            (SELECT TOP 1 user_id FROM Movements WHERE exam_id = :exam_id),
            :exam_id,
            :summary,
            :score
        )
        """,
        {
            "exam_id": exam_id,
            "summary": f"{suspicious_count} events: {movements_str}",
            "score": score
        }
    )
    db.commit()

    return {
        "cheating_score": score,
        "details": {
            "suspicious_count": suspicious_count,
            "movements": movements_str,
            "last_event": result.last_event
        }
    }


# ---------------- Student Results ----------------
@router.get("/report/user/{user_id}")
def get_student_results(
    user_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """
    Get exam results for a specific student.
    Only the student themselves or an admin/invigilator can view.
    """
    role = current_user.get("role")
    if role == "student" and current_user.get("id") != user_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    query = """
        SELECT 
            e.id AS exam_id,
            e.title AS exam_title,
            COUNT(sa.id) AS total_answered,
            SUM(CASE WHEN sa.selected_option = m.correct_option THEN 1 ELSE 0 END) AS correct_count,
            COUNT(DISTINCT mv.id) AS movement_count
        FROM Exams e
        LEFT JOIN StudentAnswers sa 
            ON sa.exam_id = e.id AND sa.user_id = :uid
        LEFT JOIN MCQs m 
            ON sa.question_id = m.id
        LEFT JOIN Movements mv 
            ON mv.exam_id = e.id AND mv.user_id = :uid
        WHERE e.id IN (
            SELECT DISTINCT exam_id FROM StudentAnswers WHERE user_id = :uid
        )
        GROUP BY e.id, e.title
        ORDER BY e.id DESC
    """
    rows = db.execute(query, {"uid": user_id}).fetchall()
    return [dict(row._mapping) for row in rows]
