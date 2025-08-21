from fastapi import FastAPI, Depends, HTTPException, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy import text
import cv2
import numpy as np
import logging
from contextlib import asynccontextmanager
import os

from backend.database import get_db, init_db
from backend.auth import router as auth_router
from backend.exam import router as exam_router
from backend import logs, detection

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- Lifespan manager ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 Starting up the Anti-Cheat Detection API...")
    init_db()
    logger.info("✅ Database initialized")
    yield
    logger.info("🛑 Shutting down the Anti-Cheat Detection API...")

app = FastAPI(
    title="Anti-Cheat Detection API",
    version="1.0.0",
    description="API for real-time exam proctoring and anti-cheat detection",
    lifespan=lifespan
)

# --- CORS ---
origins = [
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8000",  # if serving static HTML from same port
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Mount routers ---
app.include_router(auth_router, prefix="/auth", tags=["Auth"])
app.include_router(exam_router, prefix="/exam", tags=["Exam"])
app.include_router(logs.router, prefix="/logs", tags=["Logs"])

# --- Serve static frontend ---
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")
if os.path.isdir(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
    logger.info(f"📂 Serving static frontend from {FRONTEND_DIR}")
else:
    logger.warning("⚠️ Frontend folder not found; static files not being served.")

# --- Video feed endpoint ---
active_streams = {}

@app.post("/video/feed")
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

        _, logs_list = detection.detect_faces_and_movements(img, user_id, exam_id)

        if logs_list:
            insert_query = text("""
                INSERT INTO Movements (user_id, exam_id, movement_type, timestamp, frame_image_path)
                VALUES (:user_id, :exam_id, :movement_type, :timestamp, :frame_image_path)
            """)
            for log in logs_list:
                db.execute(insert_query, log)
            db.commit()
            logger.info(f"📝 Logged {len(logs_list)} movement(s) for user {user_id}, exam {exam_id}")

        return {"status": "processed", "count": len(logs_list)}

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"❌ Failed to process frame for user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to process video frame")

# --- Health check ---
@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "message": "Anti-Cheat API is running",
        "service": "video-proctoring"
    }

# --- Root info ---
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
            "video_feed": "/video/feed"
        }
    }
