# Base image
FROM python:3.11-slim

# Global env settings
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DEBIAN_FRONTEND=noninteractive

WORKDIR /app

# Install system dependencies for pyodbc + SQL Server ODBC
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gnupg \
    apt-transport-https \
    ca-certificates \
    build-essential \
    unixodbc \
    unixodbc-dev \
    libgssapi-krb5-2 \
    && rm -rf /var/lib/apt/lists/*

# Install Microsoft ODBC Driver 18 with INLINE EULA ACCEPTANCE
RUN curl https://packages.microsoft.com/keys/microsoft.asc \
      | gpg --dearmor > /usr/share/keyrings/microsoft-prod.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/microsoft-prod.gpg] \
      https://packages.microsoft.com/debian/12/prod bookworm main" \
        > /etc/apt/sources.list.d/microsoft-prod.list \
    && apt-get update \
    && ACCEPT_EULA=Y apt-get install -y --no-install-recommends msodbcsql18 \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend and frontend files
COPY backend /app/backend
COPY frontend /app/frontend
COPY config.py /app/config.py

# Expose app port
EXPOSE 8000

# Start FastAPI with Uvicorn from backend
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
