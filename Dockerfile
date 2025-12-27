# Use Python 3.10 to ensure compatibility with libraries
FROM python:3.10-slim

# 1. Install system dependencies required for OpenCV and Audio
RUN apt-get update && apt-get install -y \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libasound2-dev \
    portaudio19-dev \
    gcc \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

# 2. Set working directory
WORKDIR /app

# 3. Copy requirements and install
COPY requirements.txt .

# Remove pyodbc from requirements if it exists (since we switched to SQLite)
# or ensure system drivers are installed. We will just install the rest.
RUN pip install --no-cache-dir -r requirements.txt

# 4. Copy the entire application
COPY . .

# 5. Create the uploads directory so the app doesn't crash
RUN mkdir -p uploads/frames

# 6. Expose the port Hugging Face expects (7860)
EXPOSE 7860

# 7. Run the application
# We use --host 0.0.0.0 to make it accessible outside the container
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "7860"]