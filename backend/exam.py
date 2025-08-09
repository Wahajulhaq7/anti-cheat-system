# backend/exam.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models import ExamCreate
from sqlalchemy import text

router = APIRouter(prefix="/exam", tags=["Exams"])

@router.post("/create")
def create_exam(exam: ExamCreate, db: Session = Depends(get_db)):
    query = text("""
        INSERT INTO Exams (title, description, start_time, end_time, duration_minutes, created_by)
        VALUES (:title, :description, :start_time, :end_time, :duration_minutes, :created_by)
    """)
    
    try:
        result = db.execute(query, {
            "title": exam.title,
            "description": exam.description,
            "start_time": exam.start_time,
            "end_time": exam.end_time,
            "duration_minutes": exam.duration_minutes,
            "created_by": exam.created_by
        })
        db.commit()
        return {"msg": "Exam created"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))