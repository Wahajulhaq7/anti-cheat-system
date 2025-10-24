import sys
import os
sys.path.append(os.path.dirname(__file__))  # ✅ Add current dir to path

from fastapi import FastAPI, Depends, HTTPException, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
import cv2
import numpy as np
import logging
from contextlib import asynccontextmanager
import os
import gc
import signal
import sys

from backend.monitor import router as monitor_router
from backend.database import get_db, init_db
from backend.auth import router as auth_router
from backend.exam import router as exam_router
from backend import logs, detection
from backend.models import Movement
from backend.detection import router as video_router  # ✅ Import video_router

# ---------------- Logging ----------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)

# ---------------- Lifespan with Cleanup ----------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 Starting up the Anti-Cheat Detection API...")
    init_db()
    logger.info("✅ Database initialized")
    yield
    logger.info("🛑 Shutting down the Anti-Cheat Detection API...")

    # ✅ Cleanup: Clear YOLO model from memory if exists
    try:
        if hasattr(detection, 'model') and detection.model is not None:
            del detection.model
            gc.collect()
            logger.info("✅ YOLO model cleared from memory")
    except Exception as e:
        logger.warning(f"⚠️ Failed to cleanup model: {e}")

    # ✅ Cleanup: Release OpenCV resources (if any)
    try:
        cv2.destroyAllWindows()
        logger.info("✅ OpenCV resources released")
    except Exception as e:
        logger.warning(f"⚠️ Failed to release OpenCV: {e}")

    logger.info("✅ Shutdown complete. Safe to exit.")


# ---------------- Signal Handler ----------------
def signal_handler(sig, frame):
    logger.info("🛑 Received interrupt signal. Initiating graceful shutdown...")
    sys.exit(0)

signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)


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
app.include_router(monitor_router, prefix="/monitor", tags=["Monitor"])
app.include_router(video_router, prefix="/video", tags=["Video"])  # ✅ Handles /video/

# ---------------- Static Frontend ----------------
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")
if os.path.isdir(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
    logger.info(f"📂 Serving static frontend from {FRONTEND_DIR}")
else:
    logger.warning("⚠️ Frontend folder not found; static files not being served.")

# ---------------- Static Files for Uploads ----------------
UPLOADS_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads")
if os.path.isdir(UPLOADS_DIR):
    app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")
    logger.info(f"📂 Serving uploaded files from {UPLOADS_DIR}")
else:
    logger.warning("⚠️ Uploads folder not found; uploaded files not being served.")


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
            "video_feed": "/video/",
            "monitor": "/monitor/"
        }
    }
