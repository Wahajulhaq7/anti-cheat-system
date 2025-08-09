# backend/logs.py
from fastapi import APIRouter
from sqlalchemy import text
from backend.database import engine
from pydantic import BaseModel
from datetime import datetime

router = APIRouter(prefix="/log", tags=["Logs"])

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