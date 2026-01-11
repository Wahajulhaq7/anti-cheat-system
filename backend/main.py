import sys
import os

# Add current directory to Python path
sys.path.append(os.path.dirname(__file__))

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import cv2
import logging
from contextlib import asynccontextmanager
import gc
import signal
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import text
from apscheduler.schedulers.background import BackgroundScheduler 

# Import routers
from backend.monitor import router as monitor_router
from backend.database import init_db, SessionLocal, get_db
from backend.auth import router as auth_router, get_current_user
from backend.exam import router as exam_router
from backend import logs, detection
from backend.detection import router as video_router

# ---------------- Logging ----------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)

# ==============================================================================
# 🧹 PRIVACY FEATURE: AUTO-DELETE OLD DATA (20 DAYS)
# ==============================================================================
RETENTION_DAYS = 20  
UPLOADS_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads")
FRAMES_DIR = os.path.join(UPLOADS_DIR, "frames")
PROFILES_DIR = os.path.join(UPLOADS_DIR, "profiles")

def cleanup_old_records():
    """
    Background Task: 
    1. Deletes violation images and DB records older than 20 DAYS.
    2. Deletes unused profile pictures older than 20 DAYS.
    """
    db = SessionLocal() 
    try:
        cutoff_date = datetime.now() - timedelta(days=RETENTION_DAYS)
        logger.info(f"🧹 [PRIVACY JOB] Checking for data older than {cutoff_date.strftime('%Y-%m-%d')}...")

        # --- STEP 1: CLEANUP VIOLATION FRAMES & DB RECORDS ---
        query = text("""
            SELECT id, frame_image_path 
            FROM dbo.Movements 
            WHERE timestamp < :cutoff AND frame_image_path IS NOT NULL
        """)
        old_records = db.execute(query, {"cutoff": cutoff_date}).fetchall()

        deleted_frames = 0
        
        for row in old_records:
            relative_path = row.frame_image_path
            if not relative_path: continue

            full_path = os.path.join(UPLOADS_DIR, relative_path)
            
            if os.path.exists(full_path):
                try:
                    os.remove(full_path)
                    deleted_frames += 1
                except Exception as e:
                    logger.error(f"❌ Error deleting frame {full_path}: {e}")
            else:
                deleted_frames += 1

        # Delete from Database
        delete_query = text("DELETE FROM dbo.Movements WHERE timestamp < :cutoff")
        result = db.execute(delete_query, {"cutoff": cutoff_date})
        
        # --- STEP 2: CLEANUP OLD PROFILES (FILE SYSTEM SCAN) ---
        deleted_profiles = 0
        if os.path.exists(PROFILES_DIR):
            for filename in os.listdir(PROFILES_DIR):
                file_path = os.path.join(PROFILES_DIR, filename)
                
                # Check file modification time
                try:
                    file_mtime = datetime.fromtimestamp(os.path.getmtime(file_path))
                    if file_mtime < cutoff_date:
                        os.remove(file_path)
                        deleted_profiles += 1
                except Exception as e:
                    logger.error(f"❌ Error deleting profile {filename}: {e}")

        db.commit()
        
        if result.rowcount > 0 or deleted_profiles > 0:
            logger.info(f"✅ [PRIVACY JOB] Purged {result.rowcount} DB records, {deleted_frames} frames, and {deleted_profiles} old profiles.")
        else:
            logger.info("✅ [PRIVACY JOB] System is clean. No old data found.")

    except Exception as e:
        logger.error(f"❌ [PRIVACY JOB FAILED] {e}")
        db.rollback()
    finally:
        db.close()

# ---------------- Lifespan Manager ----------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 Starting up the Anti-Cheat Detection API...")
    init_db()
    logger.info("✅ Database initialized")

    # --- START SCHEDULER (Runs every 24 hours) ---
    scheduler = BackgroundScheduler()
    scheduler.add_job(cleanup_old_records, 'interval', hours=24, id='privacy_cleanup')
    scheduler.start()
    logger.info("🚀 Privacy cleanup scheduler started (Runs every 24 hours).")
    
    # Run once immediately on startup
    cleanup_old_records()

    yield
    
    logger.info("🛑 Shutting down the Anti-Cheat Detection API...")
    scheduler.shutdown()
    logger.info("🛑 Scheduler shut down.")

    # Cleanup resources
    try:
        if hasattr(detection, 'model') and detection.model is not None:
            del detection.model
            gc.collect()
            logger.info("✅ YOLO model cleared from memory")
    except Exception: pass

    try:
        cv2.destroyAllWindows()
        logger.info("✅ OpenCV resources released")
    except Exception: pass

    logger.info("✅ Shutdown complete. Safe to exit.")

# ---------------- Signal Handler ----------------
def signal_handler(sig, frame):
    logger.info("🛑 Received interrupt signal. Initiating graceful shutdown...")
    sys.exit(0)

signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)

# ---------------- App Initialization ----------------
app = FastAPI(
    title="Anti-Cheat Detection API",
    version="1.0.0",
    description="API for real-time exam proctoring and anti-cheat detection",
    lifespan=lifespan
)

# ---------------- CORS Middleware ----------------
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
app.include_router(logs.router, tags=["Logs"])
app.include_router(monitor_router, prefix="/monitor", tags=["Monitor"])
app.include_router(video_router, prefix="/video", tags=["Video"])

# --- ENDPOINT: MANUAL CLEANUP TRIGGER ---
@app.post("/admin/privacy/cleanup", tags=["Monitor"])
async def trigger_cleanup(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admins only")
    
    # Run synchronously for immediate feedback
    cleanup_old_records()
    
    return {
        "status": "success", 
        "message": f"Manual privacy purge triggered.",
        "retention_policy": f"{RETENTION_DAYS} days"
    }

# ---------------- Static File Serving ----------------
app.mount("/uploaded_reports", StaticFiles(directory="uploaded_reports"), name="reports")

if os.path.isdir(UPLOADS_DIR):
    app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")
    logger.info(f"📂 Serving uploaded files from: {os.path.abspath(UPLOADS_DIR)}")
else:
    logger.warning("⚠️ Uploads folder not found; uploaded files not being served.")

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")
if os.path.isdir(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
    logger.info(f"📂 Serving static frontend from: {os.path.abspath(FRONTEND_DIR)}")
else:
    logger.warning("⚠️ Frontend folder not found; static files not being served.")

# ---------------- Health Check ----------------
@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "message": "Anti-Cheat API is running",
        "service": "video-proctoring"
    }

# ---------------- Root Endpoint ----------------
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
            "monitor": "/monitor/",
            "reports": "/log/reports/all"
        }
    }