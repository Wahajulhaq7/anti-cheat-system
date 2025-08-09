# config.py
import os

# Database - Use Windows Authentication (no username/password)
DB_SERVER = "DESKTOP-QOREVO7\\SQLEXPRESS"
DB_NAME = "Anticheat"

# Leave DB_USER and DB_PASS empty
DB_USER = ""  # Will use Windows Auth
DB_PASS = ""  # Not needed

# JWT
SECRET_KEY = "your-super-secret-jwt-key-change-in-production"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

# Media
FRAME_SAVE_PATH = os.path.join("media", "frames")
os.makedirs(FRAME_SAVE_PATH, exist_ok=True)