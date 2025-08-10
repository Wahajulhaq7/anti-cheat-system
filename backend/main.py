# backend/main.py
from fastapi import FastAPI, Depends, HTTPException, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text
import cv2
import numpy as np
import logging

from backend.database import get_db, init_db
from backend.auth import router as auth_router
from backend import exam, logs, detection

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Lifespan event to initialize database on startup
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 Starting up the Anti-Cheat Detection API...")
    init_db()
    logger.info("✅ Database initialized")
    yield
    logger.info("🛑 Shutting down the Anti-Cheat Detection API...")

# Create FastAPI app
app = FastAPI(
    title="Anti-Cheat Detection API",
    version="1.0.0",
    description="API for real-time exam proctoring and anti-cheat detection",
    lifespan=lifespan
)

# --- CORS Configuration ---
# 🔐 In production, replace with your frontend domain (e.g., https://yourapp.com)
origins = [
    "http://localhost:5500",  # Live Server
    "http://127.0.0.1:5500",
    "http://localhost:3000",  # React/Vite
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Include Routers ---
app.include_router(auth_router, prefix="/auth", tags=["Auth"])
app.include_router(exam.router, prefix="/exam", tags=["Exam"])
app.include_router(logs.router, prefix="/logs", tags=["Logs"])

# --- In-Memory Tracking ---
active_streams = {}

# --- Video Stream Endpoint ---
@app.post("/video/feed")
async def video_feed(
    user_id: int,
    exam_id: int,
    frame: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Receive a video frame, run anti-cheat detection, and log suspicious activity.
    """
    try:
        # Validate file type
        if not frame.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="Invalid file type. Only images allowed.")

        # Read and decode image
        contents = await frame.read()
        np_arr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

        if img is None:
            raise HTTPException(status_code=400, detail="Invalid image data")

        # Run detection (returns processed image and list of logs)
        _, logs_list = detection.detect_faces_and_movements(img, user_id, exam_id)

        # Save logs to DB if any
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

# --- Health Check ---
@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "message": "Anti-Cheat API is running",
        "service": "video-proctoring"
    }

# --- Root Endpoint ---
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
            "video_feed": "/video/feed"
        }
    }