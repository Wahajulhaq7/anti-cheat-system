from fastapi import FastAPI, Depends, HTTPException, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
import cv2
import numpy as np
import logging
from contextlib import asynccontextmanager
import os

from backend.database import get_db, init_db
from backend.auth import router as auth_router
from backend.exam import router as exam_router
from backend import logs, detection, monitor
from backend.models import Movement

# ---------------- Logging ----------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)

# ---------------- Lifespan ----------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 Starting up the Anti-Cheat Detection API...")
    init_db()
    logger.info("✅ Database initialized")
    yield
    logger.info("🛑 Shutting down the Anti-Cheat Detection API...")

# ---------------- App Init ----------------
app = FastAPI(
    title="Anti-Cheat Detection API",
    version="1.0.0",
    description="API for real-time exam proctoring and anti-cheat detection",
    lifespan=lifespan
)

# ---------------- CORS ----------------
origins = [
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8000",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------- Routers ----------------
app.include_router(auth_router, prefix="/auth", tags=["Auth"])
app.include_router(exam_router, prefix="/exam", tags=["Exam"])
app.include_router(logs.router)
app.include_router(monitor.router, prefix="/monitor", tags=["Monitor"])

# ---------------- Static Frontend ----------------
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")
if os.path.isdir(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
    logger.info(f"📂 Serving static frontend from {FRONTEND_DIR}")
else:
    logger.warning("⚠️ Frontend folder not found; static files not being served.")

# ---------------- Video Feed Endpoint ----------------
@app.post("/video")
@app.post("/video/")
@app.post("/video/feed")  # optional alias
async def video_feed(
    user_id: int,
    exam_id: int,
    frame: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    try:
        if not frame.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="Invalid file type. Only images allowed.")

        contents = await frame.read()
        np_arr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

        if img is None:
            raise HTTPException(status_code=400, detail="Invalid image data")

        # Run detection (saves cropped images)
        _, logs_list = detection.detect_faces_and_movements(img, user_id, exam_id)

        movement_type_map = {
            "no_person_detected": 0,
            "person_detected": 1,
            "multiple_people_detected": 2,
            "suspicious_movement": 3,
            "mobile_phone_detected": 4
        }

        DB_SCHEMA = "Scorecards"  # or "dbo"
        table_fqn = f"{DB_SCHEMA}.Movements"

        if logs_list:
            rows = [
                {
                    "scorecard_id": exam_id,
                    "type": movement_type_map.get(log["movement_type"], 0),
                    "timestamp": log["timestamp"],
                    "frame_graph_path": log["frame_image_path"],
                }
                for log in logs_list
            ]

            from sqlalchemy import text
            insert_sql = text(f"""
                INSERT INTO {table_fqn} (scorecard_id, type, timestamp, frame_graph_path)
                VALUES (:scorecard_id, :type, :timestamp, :frame_graph_path)
            """)
            db.execute(insert_sql, rows)
            db.commit()
            logger.info(f"📝 Logged {len(rows)} movement(s) for user {user_id}, exam {exam_id}")

        return {"status": "processed", "count": len(logs_list)}

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"❌ Failed to process frame for user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to process video frame")

# ---------------- Health Check ----------------
@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "message": "Anti-Cheat API is running",
        "service": "video-proctoring"
    }

# ---------------- Root ----------------
@app.get("/")
def root():
    return {
        "message": "Welcome to the Anti-Cheat Detection API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health",
        "endpoints": {
            "login": "/auth/login",
            "users": "/auth/users",
            "exam_create": "/exam/create",
            "video_feed": ["/video", "/video/", "/video/feed"]
        }
    }
