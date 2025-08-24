# backend/exam.py
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from sqlalchemy import text
from .database import get_db
from .auth import get_current_user

router = APIRouter()

# ✅ NEW: GET AVAILABLE EXAMS FOR STUDENTS
@router.get("/available")
async def get_available_exams(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    # Allow only students
    role = current_user.get("role") if isinstance(current_user, dict) else getattr(current_user, "role", None)
    if role != "student":
        raise HTTPException(status_code=403, detail="Only students can view available exams")

    # Fetch exams that are still active or upcoming
    query = text("""
        SELECT id, title, description, start_time, end_time, duration_minutes
        FROM dbo.Exams
        WHERE GETDATE() <= end_time
        ORDER BY start_time ASC
    """)
    rows = db.execute(query).fetchall()

    return [dict(row._mapping) for row in rows]


# ✅ CREATE EXAM
@router.post("/create")
async def create_exam(
    exam_data: dict,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    try:
        created_by = (
            current_user.get("id")
            if isinstance(current_user, dict)
            else getattr(current_user, "id", None)
        )
        if created_by is None:
            raise HTTPException(status_code=401, detail="User ID not found in current_user")

        # Insert exam
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
                "description": exam_data.get("description") or f"Exam: {exam_data['title']}",
                "created_by": created_by
            }
        )
        exam_id = exam_result.scalar()

        # Insert MCQs
        for q in exam_data["questions"]:
            options = q["options"][:]
            while len(options) < 4:
                options.append("")
            mcq_query = text("""
                INSERT INTO dbo.MCQs
                (exam_id, question, option_a, option_b, option_c, option_d, correct_option)
                VALUES 
                (:exam_id, :question, :opt_a, :opt_b, :opt_c, :opt_d, :correct)
            """)
            db.execute(
                mcq_query,
                {
                    "exam_id": exam_id,
                    "question": q["questionText"],
                    "opt_a": options[0],
                    "opt_b": options[1],
                    "opt_c": options[2],
                    "opt_d": options[3],
                    "correct": q["correctAnswer"]
                }
            )

        db.commit()
        return {"status": "success", "message": "Exam created successfully", "exam_id": exam_id}

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# ✅ GET QUESTIONS FOR AN EXAM
@router.get("/{exam_id}/questions")
async def get_exam_questions(
    exam_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    query = text("""
        SELECT id, question, option_a, option_b, option_c, option_d
        FROM dbo.MCQs
        WHERE exam_id = :eid
        ORDER BY id ASC
    """)
    rows = db.execute(query, {"eid": exam_id}).fetchall()

    if not rows:
        raise HTTPException(status_code=404, detail="No questions found for this exam")

    return [dict(row._mapping) for row in rows]


# ✅ SUBMIT ANSWERS (NEW ENDPOINT)
@router.post("/{exam_id}/submit")
async def submit_exam_answers(
    exam_id: int,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    user_id = (
        current_user.get("id")
        if isinstance(current_user, dict)
        else getattr(current_user, "id", None)
    )
    if user_id is None:
        raise HTTPException(status_code=401, detail="User not found")

    answers = payload.get("answers", [])
    if not answers:
        raise HTTPException(status_code=400, detail="No answers provided")

    try:
        # Optional: prevent multiple submissions
        existing = db.execute(text("""
            SELECT COUNT(*) FROM dbo.StudentAnswers
            WHERE user_id = :uid AND exam_id = :eid
        """), {"uid": user_id, "eid": exam_id}).scalar()

        if existing > 0:
            raise HTTPException(status_code=400, detail="You have already submitted this exam")

        for ans in answers:
            question_number = ans.get("question_number")
            selected_option = ans.get("selected_option")

            # Get question_id from MCQs based on order
            q_row = db.execute(text("""
                SELECT id FROM dbo.MCQs
                WHERE exam_id = :eid
                ORDER BY id ASC
                OFFSET :offset ROWS FETCH NEXT 1 ROWS ONLY
            """), {"eid": exam_id, "offset": question_number - 1}).fetchone()

            if not q_row:
                continue

            db.execute(text("""
                INSERT INTO dbo.StudentAnswers (user_id, exam_id, question_id, selected_option)
                VALUES (:uid, :eid, :qid, :opt)
            """), {
                "uid": user_id,
                "eid": exam_id,
                "qid": q_row.id,
                "opt": selected_option
            })

        db.commit()
        return {"status": "success", "message": "Answers saved"}

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# ✅ GET ALL EXAMS CREATED BY CURRENT INVIGILATOR
@router.get("/my")
async def get_my_exams(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    created_by = (
        current_user.get("id")
        if isinstance(current_user, dict)
        else getattr(current_user, "id", None)
    )
    if created_by is None:
        raise HTTPException(status_code=401, detail="User ID not found in current_user")

    exams_query = text("""
        SELECT id, title, description, start_time, end_time, duration_minutes, created_at
        FROM dbo.Exams
        WHERE created_by = :uid
        ORDER BY created_at DESC
    """)
    rows = db.execute(exams_query, {"uid": created_by}).fetchall()
    return [dict(row._mapping) for row in rows]


# ✅ COUNT‑ONLY VERSION
@router.get("/my/count")
async def get_my_exam_count(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    created_by = (
        current_user.get("id")
        if isinstance(current_user, dict)
        else getattr(current_user, "id", None)
    )
    if created_by is None:
        raise HTTPException(status_code=401, detail="User ID not found in current_user")

    count_query = text("SELECT COUNT(*) FROM dbo.Exams WHERE created_by = :uid")
    total_exams = db.execute(count_query, {"uid": created_by}).scalar() or 0
    return {"total_exams_created": total_exams}


# ✅ FULL LIST OF EXAMS CREATED
@router.get("/list/my")
async def get_my_exam_list(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    created_by = (
        current_user.get("id")
        if isinstance(current_user, dict)
        else getattr(current_user, "id", None)
    )
    if created_by is None:
        raise HTTPException(status_code=401, detail="User ID not found in current_user")

    exams_query = text("""
        SELECT id, title, description, start_time, end_time, duration_minutes, created_at
        FROM dbo.Exams
        WHERE created_by = :uid
        ORDER BY created_at DESC
    """)
    rows = db.execute(exams_query, {"uid": created_by}).fetchall()
    return {"my_exams": [dict(row._mapping) for row in rows]}


# ✅ DELETE EXAM — ONLY INVIGILATOR CAN DELETE THEIR OWN EXAMS (NO ADMIN OVERRIDE)
@router.delete("/{exam_id}")
async def delete_exam(
    exam_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    user_id = current_user.get("id") if isinstance(current_user, dict) else getattr(current_user, "id", None)
    role = current_user.get("role") if isinstance(current_user, dict) else getattr(current_user, "role", None)

    # ✅ Only invigilators can delete — removed admin override
    if role != "invigilator":
        raise HTTPException(status_code=403, detail="Only invigilators can delete exams")

    # ✅ Check if exam exists
    result = db.execute(
        text("SELECT id, created_by FROM dbo.Exams WHERE id = :eid"),
        {"eid": exam_id}
    ).fetchone()

    if not result:
        raise HTTPException(status_code=404, detail="Exam not found")

    # ✅ Must be the creator
    if result.created_by != user_id:
        raise HTTPException(status_code=403, detail="You can only delete your own exams")

    try:
        # ✅ Delete related data in order
        db.execute(text("DELETE FROM dbo.StudentAnswers WHERE exam_id = :eid"), {"eid": exam_id})
        db.execute(text("DELETE FROM dbo.MCQs WHERE exam_id = :eid"), {"eid": exam_id})
        db.execute(text("DELETE FROM dbo.ActiveExams WHERE exam_id = :eid"), {"eid": exam_id})
        db.execute(text("DELETE FROM dbo.Exams WHERE id = :eid"), {"eid": exam_id})
        db.commit()
        return {"message": "Exam deleted successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Delete failed: {str(e)}")


# ✅ START EXAM
@router.post("/{exam_id}/start")
async def start_exam(
    exam_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    user_id = (
        current_user.get("id")
        if isinstance(current_user, dict)
        else getattr(current_user, "id", None)
    )
    role = current_user.get("role") if isinstance(current_user, dict) else getattr(current_user, "role", None)
    if user_id is None:
        raise HTTPException(status_code=401, detail="User not found")
    if role != "student":
        raise HTTPException(status_code=403, detail="Only students can start exams")

    try:
        # Optional: prevent duplicate "start" records
        existing = db.execute(text("""
            SELECT COUNT(*) FROM dbo.ActiveExams
            WHERE user_id = :uid AND exam_id = :eid
        """), {"uid": user_id, "eid": exam_id}).scalar()

        if existing == 0:
            db.execute(text("""
                INSERT INTO dbo.ActiveExams (user_id, exam_id, start_time)
                VALUES (:uid, :eid, GETDATE())
            """), {"uid": user_id, "eid": exam_id})
            db.commit()

        return {"status": "success", "message": "Exam started"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ✅ GET ACTIVE STUDENTS
@router.get("/active-students")
def get_active_students(db: Session = Depends(get_db)):
    rows = db.execute(text("""
        SELECT DISTINCT u.id AS user_id, u.username, ae.exam_id
        FROM ActiveExams ae
        JOIN Users u ON ae.user_id = u.id
        JOIN Exams e ON ae.exam_id = e.id
        WHERE GETDATE() BETWEEN e.start_time AND e.end_time
    """)).fetchall()
    return [dict(r._mapping) for r in rows]


# ✅ GET ALL EXAMS (ADMIN VIEW)
@router.get("/admin/list")
async def get_all_exams(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    role = current_user.get("role") if isinstance(current_user, dict) else getattr(current_user, "role", None)
    if role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can view all exams")

    query = text("""
        SELECT e.id, e.title, u.username, e.created_at, e.start_time, e.end_time, e.duration_minutes
        FROM dbo.Exams e
        JOIN dbo.Users u ON e.created_by = u.id
        ORDER BY e.created_at DESC
    """)
    rows = db.execute(query).fetchall()
    return [dict(row._mapping) for row in rows]