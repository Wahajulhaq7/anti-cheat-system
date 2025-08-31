# backend/logs.py
from fastapi import APIRouter
from sqlalchemy import text
from backend.database import engine, get_db
from pydantic import BaseModel
from datetime import datetime
from fastapi import Depends, HTTPException
from backend.auth import get_current_user


router = APIRouter(prefix="/log",tags=["Logs"])

class ScreenLog(BaseModel):
    user_id: int
    exam_id: int
    app_name: str
    tab_title: str

@router.post("/screen")
def log_screen(data: ScreenLog):
    query = text("""
        INSERT INTO ScreenLogs (user_id, exam_id, app_name, tab_title)
        VALUES (:user_id, :exam_id, :app_name, :tab_title)
    """)
    with engine.connect() as conn:
        conn.execute(query, data.dict())
        conn.commit()
    return {"status": "logged"}

@router.get("/report/{exam_id}")
def generate_report(exam_id: int):
    query = text("""
        SELECT 
            COUNT(*) as suspicious_count,
            STRING_AGG(m.movement_type, ', ') as movements,
            MAX(m.timestamp) as last_event
        FROM Movements m WHERE m.exam_id = :exam_id
    """)
    with engine.connect() as conn:
        result = conn.execute(query, {"exam_id": exam_id}).fetchone()

    score = result.suspicious_count * 10 if result.suspicious_count else 0

    insert = text("""
        INSERT INTO Reports (user_id, exam_id, summary, cheating_score)
        VALUES ((SELECT user_id FROM Movements WHERE exam_id = :exam_id), :exam_id, :summary, :score)
    """)
    conn.execute(insert, {
        "exam_id": exam_id,
        "summary": f"{result.suspicious_count} events: {result.movements}",
        "score": score
    })
    conn.commit()

    return {"cheating_score": score, "details": result._mapping}


@router.get("/report/user/{user_id}")
def get_student_results(
    user_id: int,
    db=Depends(get_db),
    current_user=Depends(get_current_user)
):
    # ✅ Only allow the student themselves or an admin/invigilator
    role = current_user.get("role")
    if role == "student" and current_user.get("id") != user_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    query = text("""
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
    """)
    rows = db.execute(query, {"uid": user_id}).fetchall()
    return [dict(row._mapping) for row in rows]
