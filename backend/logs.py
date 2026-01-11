# backend/logs.py
from fastapi import APIRouter, Depends, HTTPException, Response, UploadFile, File, Form
from sqlalchemy import text
from sqlalchemy.orm import Session
from backend.database import engine, get_db
from pydantic import BaseModel
from datetime import datetime
from backend.auth import get_current_user
from reportlab.lib.pagesizes import letter, A4
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer,
    Table, TableStyle, Image
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from io import BytesIO
import os
import shutil

router = APIRouter(prefix="/log", tags=["Logs"])


# =========================
# MODELS
# =========================
class ScreenLog(BaseModel):
    user_id: int
    exam_id: int
    app_name: str
    tab_title: str


class CustomPDFRequest(BaseModel):
    student_id: int
    exam_id: int
    selected_images: list[str]


# =========================
# ROUTES
# =========================
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
            STUFF((
                SELECT DISTINCT ', ' + m2.movement_type
                FROM Movements m2 
                WHERE m2.exam_id = :exam_id
                FOR XML PATH('')
            ), 1, 2, '') as movements,
            MAX(m.timestamp) as last_event
        FROM Movements m WHERE m.exam_id = :exam_id
    """)
    with engine.connect() as conn:
        result = conn.execute(query, {"exam_id": exam_id}).fetchone()

        score = result.suspicious_count * 10 if result.suspicious_count else 0

        insert = text("""
            INSERT INTO Reports (user_id, exam_id, summary, cheating_score)
            VALUES ((SELECT TOP 1 user_id FROM Movements WHERE exam_id = :exam_id), :exam_id, :summary, :score)
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
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    role = current_user.get("role")
    if role == "student" and current_user.get("id") != user_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    query = text("""
        SELECT 
            e.id AS exam_id,
            e.title AS exam_title,
            -- Total questions in this exam
            (SELECT COUNT(*) FROM MCQs WHERE exam_id = e.id) AS total_answered,
            -- Correct answers by student
            (SELECT COUNT(*) 
             FROM StudentAnswers sa
             JOIN MCQs m ON sa.question_id = m.id
             WHERE sa.user_id = :uid AND sa.exam_id = e.id AND sa.selected_option = m.correct_option
            ) AS correct_count,
            -- Movements during this exam
            (SELECT COUNT(*) 
             FROM Movements mv 
             WHERE mv.user_id = :uid AND mv.exam_id = e.id
            ) AS movement_count
        FROM Exams e
        WHERE e.id IN (
            SELECT DISTINCT exam_id FROM StudentAnswers WHERE user_id = :uid
        )
        ORDER BY e.id DESC
    """)
    rows = db.execute(query, {"uid": user_id}).fetchall()
    return [dict(row._mapping) for row in rows]


@router.get("/reports/all")
def get_all_cheating_reports(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    role = current_user.get("role")
    if role not in ["admin", "invigilator"]:
        raise HTTPException(status_code=403, detail="Admin/Invigilator access required")

    query = text("""
        SELECT DISTINCT
            u.id AS student_id,
            u.username AS student_name,
            e.id AS exam_id,
            e.title AS exam_title,
            e.start_time AS exam_date,
            COUNT(m.id) AS suspicious_events,
            MAX(m.timestamp) AS last_suspicious_activity,
            CASE 
                WHEN COUNT(m.id) = 0 THEN 0
                WHEN COUNT(m.id) <= 2 THEN 20
                WHEN COUNT(m.id) <= 5 THEN 50
                WHEN COUNT(m.id) <= 10 THEN 75
                ELSE 100
            END AS cheating_score
        FROM Users u
        CROSS JOIN Exams e
        LEFT JOIN Movements m ON m.user_id = u.id AND m.exam_id = e.id
        LEFT JOIN StudentAnswers sa ON sa.user_id = u.id AND sa.exam_id = e.id
        WHERE u.role = 'student' 
        AND sa.id IS NOT NULL
        GROUP BY u.id, u.username, e.id, e.title, e.start_time
        ORDER BY e.start_time DESC, cheating_score DESC, u.username
    """)
    rows = db.execute(query).fetchall()
    return [dict(row._mapping) for row in rows]


@router.get("/report/detailed/{student_id}/{exam_id}")
def get_detailed_report(
    student_id: int,
    exam_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    role = current_user.get("role")
    if role not in ["admin", "invigilator"]:
        raise HTTPException(status_code=403, detail="Admin/Invigilator access required")

    basic_query = text("""
        SELECT 
            u.username AS student_name,
            e.title AS exam_title,
            e.start_time AS exam_date,
            COUNT(DISTINCT sa.id) AS total_answered,
            COUNT(DISTINCT m.id) AS suspicious_events
        FROM Users u
        JOIN Exams e ON e.id = :exam_id
        LEFT JOIN StudentAnswers sa ON sa.user_id = u.id AND sa.exam_id = e.id
        LEFT JOIN Movements m ON m.user_id = u.id AND m.exam_id = e.id
        WHERE u.id = :student_id
        GROUP BY u.username, e.title, e.start_time
    """)
    basic_info = db.execute(
        basic_query,
        {"student_id": student_id, "exam_id": exam_id}
    ).fetchone()

    movements_query = text("""
        SELECT movement_type, timestamp, frame_image_path
        FROM Movements 
        WHERE user_id = :student_id AND exam_id = :exam_id
        ORDER BY timestamp DESC
    """)
    movements = db.execute(
        movements_query,
        {"student_id": student_id, "exam_id": exam_id}
    ).fetchall()

    if not basic_info:
        raise HTTPException(status_code=404, detail="Report data not found")

    suspicious_count = basic_info.suspicious_events
    cheating_score = 0 if suspicious_count == 0 else 20 if suspicious_count <= 2 else 50 if suspicious_count <= 5 else 75 if suspicious_count <= 10 else 100

    return {
        "student_name": basic_info.student_name,
        "exam_title": basic_info.exam_title,
        "exam_date": basic_info.exam_date,
        "total_answered": basic_info.total_answered,
        "suspicious_events": basic_info.suspicious_events,
        "cheating_score": cheating_score,
        "movements": [dict(row._mapping) for row in movements]
    }


# =========================
# FIXED POST PDF ENDPOINT (WITH FOOTER)
# =========================
@router.post("/report/pdf/custom")
def generate_custom_pdf(
    data: CustomPDFRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    role = current_user.get("role")
    if role not in ["admin", "invigilator"]:
        raise HTTPException(status_code=403, detail="Admin/Invigilator access required")

    # 1. Gather Data
    report_data = get_detailed_report(data.student_id, data.exam_id, db, current_user)
    
    # 2. Setup PDF Document
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4)
    styles = getSampleStyleSheet()
    story = []

    # --- STYLES ---
    title_style = ParagraphStyle(
        'MainTitle', 
        parent=styles['Heading1'], 
        alignment=TA_CENTER, 
        textColor=colors.darkblue,
        fontSize=18,
        spaceAfter=20
    )
    
    header_style = ParagraphStyle(
        'SectionHeader',
        parent=styles['Heading2'],
        textColor=colors.darkgreen,
        fontSize=12,
        spaceBefore=15,
        spaceAfter=10
    )

    normal_style = styles['Normal']

    # --- TITLE & METADATA ---
    story.append(Paragraph("Anti-Cheat System - Detailed Report", title_style))
    story.append(Spacer(1, 10))

    # Metadata Block
    meta_text = f"""
    <b>Student:</b> {report_data['student_name']}<br/>
    <b>Exam:</b> {report_data['exam_title']}<br/>
    <b>Date:</b> {report_data['exam_date']}<br/>
    <b>Report Generated:</b> {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
    """
    story.append(Paragraph(meta_text, normal_style))
    story.append(Spacer(1, 20))


    # --- SECTION 1: SUMMARY TABLE ---
    story.append(Paragraph("■ SUMMARY", header_style))

    # Determine Risk Level & Colors
    score = report_data['cheating_score']
    if score >= 75:
        risk_text = "High Risk"
        risk_color = colors.red
        risk_bg = colors.mistyrose
    elif score >= 50:
        risk_text = "Medium Risk"
        risk_color = colors.orange
        risk_bg = colors.lightyellow
    else:
        risk_text = "Low Risk"
        risk_color = colors.green
        risk_bg = colors.lightgreen

    summary_data = [
        ['Metric', 'Value'],
        ['Total Questions Answered', str(report_data['total_answered'])],
        ['Suspicious Events', str(report_data['suspicious_events'])],
        ['Cheating Score', f"{score}%"],
        ['Risk Level', risk_text]
    ]

    summary_table = Table(summary_data, colWidths=[3*inch, 3*inch], hAlign='LEFT')
    
    summary_style = TableStyle([
        ('BACKGROUND', (0, 0), (1, 0), colors.gray),      # Header BG
        ('TEXTCOLOR', (0, 0), (1, 0), colors.white),      # Header Text
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        
        # Risk Level Coloring (Last Row, Last Col)
        ('TEXTCOLOR', (1, 4), (1, 4), risk_color),
        ('FONTNAME', (1, 4), (1, 4), 'Helvetica-Bold'),
    ])
    summary_table.setStyle(summary_style)
    story.append(summary_table)
    story.append(Spacer(1, 20))


    # --- SECTION 2: SUSPICIOUS ACTIVITIES TABLE ---
    story.append(Paragraph("■ SUSPICIOUS ACTIVITIES", header_style))

    # Table Header
    activities_data = [['#', 'Activity Type', 'Timestamp']]
    
    # Table Rows (Limit to first 10 for layout cleanliness, or show all)
    idx = 1
    for move in report_data['movements']:
        # Format Timestamp
        ts = move['timestamp']
        ts_str = ts.strftime("%Y-%m-%d %H:%M:%S") if isinstance(ts, datetime) else str(ts)
        
        activities_data.append([str(idx), move['movement_type'], ts_str])
        idx += 1

    # If no activities
    if len(activities_data) == 1:
        activities_data.append(['-', 'No suspicious activity recorded', '-'])

    act_table = Table(activities_data, colWidths=[0.5*inch, 3*inch, 2.5*inch], hAlign='LEFT')
    
    act_style = TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.darkred),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.whitesmoke, colors.white]),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
    ])
    act_table.setStyle(act_style)
    story.append(act_table)
    story.append(Spacer(1, 20))


    # --- SECTION 3: EVIDENCE IMAGES ---
    story.append(Paragraph("■ CAPTURED EVIDENCE FRAMES", header_style))
    story.append(Spacer(1, 10))

    img_query = text("""
        SELECT frame_image_path
        FROM Movements
        WHERE user_id = :uid AND exam_id = :eid
        AND frame_image_path IS NOT NULL
        ORDER BY timestamp DESC
    """)
    
    rows = db.execute(img_query, {
        "uid": data.student_id,
        "eid": data.exam_id
    }).fetchall()

    image_found = False
    selected_set = set(img.replace("\\", "/") for img in data.selected_images)

    for row in rows:
        path = row.frame_image_path.replace("\\", "/")

        if path not in selected_set:
            continue

        if path.startswith("uploads/"):
            real_path = path
        else:
            real_path = os.path.join("uploads", path)

        if os.path.exists(real_path):
            image_found = True
            # Add image with a thin border or spacing
            story.append(Image(real_path, width=4*inch, height=3*inch))
            story.append(Spacer(1, 15))

    if not image_found:
        story.append(Paragraph("No evidence images selected.", normal_style))


    # --- DEFINE FOOTER FUNCTION ---
    def add_footer(canvas, doc):
        canvas.saveState()
        
        # Footer Text Settings
        canvas.setFont('Helvetica', 9)
        canvas.setFillColor(colors.grey)
        
        w, h = A4
        
        # Draw Center Aligned Footer Text
        canvas.drawCentredString(w / 2, 0.75 * inch, "Generated by Anti-Cheat Detection System")
        canvas.drawCentredString(w / 2, 0.60 * inch, "This report is confidential and should be handled according to institutional policies.")
        
        # Draw Page Number
        page_num = canvas.getPageNumber()
        text = f"Page {page_num}"
        canvas.setFont('Helvetica-Bold', 10)
        canvas.setFillColor(colors.black)
        canvas.drawCentredString(w / 2, 0.40 * inch, text)
        
        canvas.restoreState()


    # Build PDF with Footer
    doc.build(story, onFirstPage=add_footer, onLaterPages=add_footer)
    buffer.seek(0)

    return Response(
        content=buffer.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": "inline; filename=cheating_evidence_report.pdf"}
    )


# ---------------------------------------------------------
# ✅ API: GET ALL INVIGILATORS (For Admin Dropdown)
# ---------------------------------------------------------
@router.get("/users/invigilators")
async def get_all_invigilators(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admins only")
        
    # Assuming 'role' column exists in Users table
    query = text("SELECT id, username FROM dbo.Users WHERE role = 'invigilator'")
    rows = db.execute(query).fetchall()
    return [dict(row._mapping) for row in rows]


# ---------------------------------------------------------
# ✅ API: SEND REPORT TO INVIGILATOR
# ---------------------------------------------------------
@router.post("/reports/send")
async def send_report_to_invigilator(
    invigilator_id: int = Form(...),
    student_id: int = Form(...), 
    exam_id: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admins only")

    # 1. Save the file
    upload_dir = "uploaded_reports"
    os.makedirs(upload_dir, exist_ok=True)
    
    # Generate a unique filename using timestamp
    timestamp_str = datetime.now().strftime('%Y%m%d%H%M%S')
    filename = f"{timestamp_str}_{file.filename}"
    file_path = os.path.join(upload_dir, filename)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # 2. Save DB Record
    # ⚠️ FIXED: Added student_id and exam_id to INSERT statement
    query = text("""
        INSERT INTO dbo.SentReports (admin_id, invigilator_id, student_id, exam_id, report_file_path, sent_at)
        VALUES (:aid, :iid, :sid, :eid, :path, GETDATE())
    """)
    db.execute(query, {
        "aid": current_user["id"],
        "iid": invigilator_id,
        "sid": student_id,
        "eid": exam_id,
        "path": filename # Saving only filename for easier URL construction
    })
    db.commit()

    return {"status": "success", "message": "Report sent to invigilator successfully"}

# ---------------------------------------------------------
# ✅ NEW: GET RECEIVED REPORTS (For Invigilator)
# ---------------------------------------------------------
@router.get("/reports/received")
async def get_my_received_reports(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    # Only Invigilators
    if current_user.get("role") != "invigilator":
        raise HTTPException(status_code=403, detail="Invigilators only")

    user_id = current_user["id"]

    query = text("""
        SELECT 
            sr.id, 
            sr.report_file_path, 
            sr.sent_at,
            sr.student_id,
            u.username AS student_name,
            sr.exam_id,
            e.title AS exam_title,
            a.username AS sender_name
        FROM dbo.SentReports sr
        JOIN dbo.Users u ON sr.student_id = u.id
        JOIN dbo.Exams e ON sr.exam_id = e.id
        JOIN dbo.Users a ON sr.admin_id = a.id
        WHERE sr.invigilator_id = :uid
        ORDER BY sr.sent_at DESC
    """)
    rows = db.execute(query, {"uid": user_id}).fetchall()
    return [dict(row._mapping) for row in rows]