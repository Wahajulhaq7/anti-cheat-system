# backend/exam.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from .database import get_db
from .auth import get_current_user

router = APIRouter()

@router.post("/exams/create")
async def create_exam(exam_data: dict, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    print("Creating exam with data:", exam_data) # Debug log
    
    try:
        # Insert exam record
        exam_query = text("""
        INSERT INTO dbo.Exams (title, description, start_time, end_time, duration_minutes, created_by, created_at)
        OUTPUT INSERTED.id
        VALUES (
            :title, 
            :description, 
            GETDATE(), 
            DATEADD(HOUR, 2, GETDATE()), 
            120,
            :created_by,
            GETDATE()
        )
        """)

        exam_result = db.execute(
            exam_query,
            {
                "title": exam_data["title"],
                "description": f"Exam: {exam_data['title']}",
                "created_by": current_user["id"]
            }
        )
        exam_id = exam_result.scalar()

        # Insert each question
        for idx, q in enumerate(exam_data["questions"], 1):
            options = q["options"]
            # Pad options array to ensure 4 options
            while len(options) < 4:
                options.append("")

            question_query = text("""
            INSERT INTO dbo.Questions 
            (exam_id, question_text, option_a, option_b, option_c, option_d, correct_option)
            VALUES 
            (:exam_id, :q_text, :opt_a, :opt_b, :opt_c, :opt_d, :correct)
            """)

            db.execute(
                question_query,
                {
                    "exam_id": exam_id,
                    "q_text": q["questionText"],
                    "opt_a": options[0],
                    "opt_b": options[1],
                    "opt_c": options[2],
                    "opt_d": options[3],
                    "correct": q["correctAnswer"]
                }
            )

        db.commit()
        print(f"Exam created successfully with ID: {exam_id}") # Debug log
        return {"status": "success", "message": "Exam created successfully", "exam_id": exam_id}

    except Exception as e:
        db.rollback()
        print(f"Error creating exam: {str(e)}") # Debug log
        raise HTTPException(status_code=500, detail=str(e))