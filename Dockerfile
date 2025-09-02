FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# System deps and Microsoft repo for msodbcsql18
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl gnupg apt-transport-https ca-certificates build-essential \
    && curl https://packages.microsoft.com/keys/microsoft.asc | apt-key add - \
    && curl https://packages.microsoft.com/config/debian/12/prod.list > /etc/apt/sources.list.d/microsoft.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends msodbcsql18 unixodbc-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy and install deps
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && pip install --no-cache-dir -r requirements.txt

# Copy app code (backend + frontend)
COPY . .

# Expose port for App Service
ENV PORT=8000
EXPOSE 8000

# Start with gunicorn (adjust module path if your app is backend/main.py → backend.main:app)
CMD ["gunicorn", "-k", "uvicorn.workers.UvicornWorker", "-w", "2", "-b", "0.0.0.0:8000", "main:app"]
