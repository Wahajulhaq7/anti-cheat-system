# backend/exam.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from .database import get_db
from .models import Exam, Question, ExamCreate, MCQCreate

router = APIRouter(prefix="/exam", tags=["Exam"])

@router.post("/create")
async def create_exam(exam_data: ExamCreate, db: Session = Depends(get_db)):
    try:
        # Create exam
        db_exam = Exam(
            title=exam_data.title,
            description=exam_data.description,
            start_time=exam_data.start_time,
            end_time=exam_data.end_time,
            duration_minutes=exam_data.duration_minutes,
            created_by=exam_data.created_by
        )
        db.add(db_exam)
        db.commit()
        db.refresh(db_exam)

        # Create questions
        for mcq in exam_data.mcqs:
            db_question = Question(
                exam_id=db_exam.id,
                question_text=mcq.question_text,
                options=mcq.options,
                correct_option=mcq.correct_option
            )
            db.add(db_question)
        db.commit()

        return {
            "message": "Exam created successfully",
            "exam_id": db_exam.id,
            "title": db_exam.title,
            "question_count": len(exam_data.mcqs)
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create exam: {str(e)}")