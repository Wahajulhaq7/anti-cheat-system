# backend/logs.py
from fastapi import APIRouter
from sqlalchemy import text
from backend.database import engine, get_db
from pydantic import BaseModel
from datetime import datetime
from fastapi import Depends, HTTPException, Response
from backend.auth import get_current_user
from reportlab.lib.pagesizes import letter, A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from io import BytesIO


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


@router.get("/reports/all")
def get_all_cheating_reports(
    db=Depends(get_db),
    current_user=Depends(get_current_user)
):
    # ✅ Only allow admin/invigilator access
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
            STUFF((
                SELECT DISTINCT ', ' + m2.movement_type
                FROM Movements m2 
                WHERE m2.user_id = u.id AND m2.exam_id = e.id
                FOR XML PATH('')
            ), 1, 2, '') AS movement_types,
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
        AND sa.id IS NOT NULL  -- Only include students who actually took the exam
        GROUP BY u.id, u.username, e.id, e.title, e.start_time
        ORDER BY e.start_time DESC, cheating_score DESC, u.username
    """)
    
    rows = db.execute(query).fetchall()
    return [dict(row._mapping) for row in rows]


@router.get("/report/detailed/{student_id}/{exam_id}")
def get_detailed_report(
    student_id: int,
    exam_id: int,
    db=Depends(get_db),
    current_user=Depends(get_current_user)
):
    # ✅ Only allow admin/invigilator access
    role = current_user.get("role")
    if role not in ["admin", "invigilator"]:
        raise HTTPException(status_code=403, detail="Admin/Invigilator access required")

    # Get basic info
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
    
    basic_info = db.execute(basic_query, {"student_id": student_id, "exam_id": exam_id}).fetchone()
    
    # Get detailed movements
    movements_query = text("""
        SELECT 
            movement_type,
            timestamp,
            frame_image_path
        FROM Movements 
        WHERE user_id = :student_id AND exam_id = :exam_id
        ORDER BY timestamp DESC
    """)
    
    movements = db.execute(movements_query, {"student_id": student_id, "exam_id": exam_id}).fetchall()
    
    if not basic_info:
        raise HTTPException(status_code=404, detail="Report not found")
    
    # Calculate cheating score
    suspicious_count = basic_info.suspicious_events
    cheating_score = 0
    if suspicious_count == 0:
        cheating_score = 0
    elif suspicious_count <= 2:
        cheating_score = 20
    elif suspicious_count <= 5:
        cheating_score = 50
    elif suspicious_count <= 10:
        cheating_score = 75
    else:
        cheating_score = 100
    
    return {
        "student_name": basic_info.student_name,
        "exam_title": basic_info.exam_title,
        "exam_date": basic_info.exam_date,
        "total_answered": basic_info.total_answered,
        "suspicious_events": basic_info.suspicious_events,
        "cheating_score": cheating_score,
        "movements": [dict(row._mapping) for row in movements]
    }


@router.get("/report/pdf/{student_id}/{exam_id}")
def generate_pdf_report(
    student_id: int,
    exam_id: int,
    db=Depends(get_db),
    current_user=Depends(get_current_user)
):
    # ✅ Only allow admin/invigilator access
    role = current_user.get("role")
    if role not in ["admin", "invigilator"]:
        raise HTTPException(status_code=403, detail="Admin/Invigilator access required")

    # Get the detailed report data
    try:
        report_data = get_detailed_report(student_id, exam_id, db, current_user)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get report data: {str(e)}")

    # Create PDF
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4)
    styles = getSampleStyleSheet()
    story = []

    # Title
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=18,
        spaceAfter=30,
        alignment=1,  # Center alignment
        textColor=colors.darkblue
    )
    story.append(Paragraph("Anti-Cheat System - Detailed Report", title_style))
    story.append(Spacer(1, 20))

    # Student and Exam Information
    info_style = ParagraphStyle(
        'InfoStyle',
        parent=styles['Normal'],
        fontSize=12,
        spaceAfter=10
    )
    
    exam_date = report_data['exam_date'].strftime('%Y-%m-%d %H:%M:%S') if report_data['exam_date'] else 'N/A'
    
    story.append(Paragraph(f"<b>Student:</b> {report_data['student_name']}", info_style))
    story.append(Paragraph(f"<b>Exam:</b> {report_data['exam_title']}", info_style))
    story.append(Paragraph(f"<b>Date:</b> {exam_date}", info_style))
    story.append(Paragraph(f"<b>Report Generated:</b> {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", info_style))
    story.append(Spacer(1, 20))

    # Summary Section
    summary_style = ParagraphStyle(
        'SummaryStyle',
        parent=styles['Heading2'],
        fontSize=14,
        spaceAfter=15,
        textColor=colors.darkgreen
    )
    story.append(Paragraph("📊 SUMMARY", summary_style))
    
    # Determine risk level and color
    cheating_score = report_data['cheating_score']
    if cheating_score == 0:
        risk_level = "✅ No Risk"
        risk_color = colors.green
    elif cheating_score <= 20:
        risk_level = "🟢 Low Risk"
        risk_color = colors.green
    elif cheating_score <= 50:
        risk_level = "🟡 Medium Risk"
        risk_color = colors.orange
    elif cheating_score <= 75:
        risk_level = "🟠 High Risk"
        risk_color = colors.red
    else:
        risk_level = "🔴 Very High Risk"
        risk_color = colors.darkred

    # Summary table
    summary_data = [
        ['Metric', 'Value'],
        ['Total Questions Answered', str(report_data['total_answered'])],
        ['Suspicious Events', str(report_data['suspicious_events'])],
        ['Cheating Score', f"{cheating_score}%"],
        ['Risk Level', risk_level]
    ]
    
    summary_table = Table(summary_data, colWidths=[3*inch, 2*inch])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 12),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('FONTNAME', (0, 4), (1, 4), 'Helvetica-Bold'),
        ('TEXTCOLOR', (1, 4), (1, 4), risk_color),
    ]))
    story.append(summary_table)
    story.append(Spacer(1, 30))

    # Suspicious Activities Section
    activities_style = ParagraphStyle(
        'ActivitiesStyle',
        parent=styles['Heading2'],
        fontSize=14,
        spaceAfter=15,
        textColor=colors.darkred
    )
    story.append(Paragraph("🚨 SUSPICIOUS ACTIVITIES", activities_style))
    
    if report_data['movements'] and len(report_data['movements']) > 0:
        # Activities table
        activities_data = [['#', 'Activity Type', 'Timestamp']]
        for i, movement in enumerate(report_data['movements'], 1):
            timestamp = movement['timestamp'].strftime('%Y-%m-%d %H:%M:%S') if movement['timestamp'] else 'N/A'
            activities_data.append([
                str(i),
                movement['movement_type'],
                timestamp
            ])
        
        activities_table = Table(activities_data, colWidths=[0.5*inch, 2.5*inch, 2*inch])
        activities_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.darkred),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.lightgrey),
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
        ]))
        story.append(activities_table)
    else:
        story.append(Paragraph("No suspicious activities detected during this exam.", info_style))

    story.append(Spacer(1, 30))

    # Footer
    footer_style = ParagraphStyle(
        'FooterStyle',
        parent=styles['Normal'],
        fontSize=10,
        alignment=1,  # Center alignment
        textColor=colors.grey
    )
    story.append(Paragraph("Generated by Anti-Cheat Detection System", footer_style))
    story.append(Paragraph("This report is confidential and should be handled according to institutional policies.", footer_style))

    # Build PDF
    doc.build(story)
    buffer.seek(0)
    
    # Return PDF as response
    filename = f"cheating_report_{report_data['student_name']}_{exam_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
    
    return Response(
        content=buffer.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={filename}"}
    )
