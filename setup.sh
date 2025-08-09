#!/bin/bash
echo "Setting up Anti-Cheat Detection System..."

# Create folders
mkdir -p anti-cheat-system/{backend,frontend/css,frontend/js,media/frames}

# Move into project
cd anti-cheat-system

# Create Python files
touch backend/{main,database,models,auth,exam,logs,detection,utils}.py
touch config.py

# Create frontend files
touch frontend/{login,dashboard,exam,report}.html
touch frontend/css/style.css
touch frontend/js/{auth,exam,dashboard,report}.js

# Create requirements.txt
cat > requirements.txt << 'EOF'
fastapi==0.110.0
uvicorn==0.29.0
python-multipart==0.0.6
passlib==1.7.4
python-jose[cryptography]==3.3.0
pyodbc==4.0.39
sqlalchemy==2.0.23
opencv-python==4.8.1.78
ultralytics==8.2.14
webrtcvad==2.0.11
pillow==10.0.1
pdfkit==1.0.0
python-csv==1.0
python-dotenv==1.0.0
EOF

# Create empty __init__.py
touch backend/__init__.py

# Fill config.py
cat > config.py << 'EOF'
import os

# Database
DB_SERVER = "localhost"
DB_NAME = "AntiCheatDB"
DB_USER = "sa"
DB_PASS = "YourStrong@Pass123"

# JWT
SECRET_KEY = "your-super-secret-jwt-key-change-in-production"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

# Media
FRAME_SAVE_PATH = os.path.join("media", "frames")
os.makedirs(FRAME_SAVE_PATH, exist_ok=True)
EOF

# Notify
echo "✅ Project structure created!"
echo "💡 Run 'pip install -r requirements.txt' after SQL Server is ready."
echo "💡 Start SQL Server, then run backend/main.py"