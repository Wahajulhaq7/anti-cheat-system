from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from .database import get_db
from .auth import get_current_user

router = APIRouter()

# ✅ CREATE EXAM
@router.post("/create")
async def create_exam(
    exam_data: dict,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    print("Creating exam with data:", exam_data)  # Debug log

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
        print(f"✅ Exam created successfully with ID: {exam_id}")
        return {"status": "success", "message": "Exam created successfully", "exam_id": exam_id}

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"❌ Error creating exam: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ✅ GET ALL EXAMS CREATED BY CURRENT INVIGILATOR (for stats card)
@router.get("/my")
async def get_my_exams(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
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
    return [dict(row._mapping) for row in rows]  # Array → JS .length works


# ✅ COUNT‑ONLY VERSION
@router.get("/my/count")
async def get_my_exam_count(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
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
    current_user = Depends(get_current_user)
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


# ✅ DELETE EXAM (with ownership check)
@router.delete("/{exam_id}")
async def delete_exam(
    exam_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    created_by = (
        current_user.get("id")
        if isinstance(current_user, dict)
        else getattr(current_user, "id", None)
    )
    if created_by is None:
        raise HTTPException(status_code=401, detail="User ID not found in current_user")

    # Ensure exam exists and belongs to current user
    exam_check = db.execute(
        text("SELECT id FROM dbo.Exams WHERE id = :eid AND created_by = :uid"),
        {"eid": exam_id, "uid": created_by}
    ).fetchone()
    if not exam_check:
        raise HTTPException(status_code=404, detail="Exam not found or not owned by you")

    # Delete child MCQs first to maintain FK integrity
    db.execute(text("DELETE FROM dbo.MCQs WHERE exam_id = :eid"), {"eid": exam_id})
    db.execute(text("DELETE FROM dbo.Exams WHERE id = :eid"), {"eid": exam_id})
    db.commit()

    return {"status": "success", "message": f"Exam {exam_id} deleted"}

@router.get("/available")
async def get_available_exams(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    # Only students should hit this, but you can allow others for testing
    if current_user["role"] != "student":
        raise HTTPException(status_code=403, detail="Only students can view available exams")

    query = text("""
        SELECT id, title, description, start_time, end_time
        FROM dbo.Exams
        WHERE GETDATE() BETWEEN start_time AND end_time
        ORDER BY start_time ASC
    """)
    rows = db.execute(query).fetchall()
    return [dict(row._mapping) for row in rows]
