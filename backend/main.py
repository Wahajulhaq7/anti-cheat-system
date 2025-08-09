# backend/main.py
from fastapi import FastAPI, Request, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from backend.database import test_connection
import cv2
import asyncio
from threading import Thread
from backend import auth, exam, logs, detection
import nest_asyncio  # Added
import numpy as np
from sqlalchemy import text

app = FastAPI(title="Anti-Cheat Detection API")

# Apply nest_asyncio to handle nested event loops
nest_asyncio.apply()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(exam.router)
app.include_router(logs.router)

# In-memory tracking
active_streams = {}

# Test DB
@app.on_event("startup")
def startup():
    test_connection()

# Video Stream Endpoint
@app.post("/video/feed")
async def video_feed(user_id: int, exam_id: int, frame: UploadFile = File(...)):
    contents = await frame.read()
    np_arr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

    # Run detection
    processed, logs = detection.detect_faces_and_movements(img, user_id, exam_id)

    # Save logs to DB
    insert = text("""
        INSERT INTO Movements (user_id, exam_id, movement_type, timestamp, frame_image_path)
        VALUES (:user_id, :exam_id, :movement_type, :timestamp, :frame_image_path)
    """)
    with detection.engine.connect() as conn:
        for log in logs:
            conn.execute(insert, log)
        conn.commit()

    return {"status": "processed", "count": len(logs)}

# Start Uvicorn via command line:
# uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000