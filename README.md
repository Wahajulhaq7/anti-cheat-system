# Anti-Cheat System

A modern, AI-powered real-time proctoring platform with **fuzzy logic-based cheating detection**, using deep learning and face recognition to ensure academic integrity in online exams. This system provides both a FastAPI backend and a responsive frontend for administrators, invigilators, and students.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Unique Advantage: Fuzzy Logic Detection](#unique-advantage-fuzzy-logic-detection)
- [Problem Statement](#problem-statement)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Setup & Installation](#setup--installation)
- [Configuration](#configuration)
- [Running the Application](#running-the-application)
- [Architecture Overview](#architecture-overview)
- [Usage](#usage)
- [Customization](#customization)
- [License](#license)

---

## Overview

This Anti-Cheat System aims to make online exams as secure as traditional proctored assessments. It uses deep learning, computer vision, and fuzzy logic to automatically flag suspicious activity and present actionable evidence to exam authorities.

## Features

- 🔒 **Face Verification**: Ensures the registered student is present, thwarts impersonation.
- 📱 **Object Detection**: Detects unauthorized objects (phones, books) using YOLO.
- 👥 **Multiple Person Detection**: Flags presence of more than one person.
- 👤 **Face & Gaze Monitoring**: Detects if face is hidden/not visible or if the candidate is looking away.
- 🗣️ **Voice Activity Detection**: (Planned) Spots abnormal noises or unauthorized conversations.
- 📝 **Detailed Reports**: Every event is logged and can be reviewed by invigilators.
- 🚦 **Fuzzy Logic Scoring**: (Exclusive Feature!) Assigns severity weights to each detection for sophisticated, accurate threat assessment—**see below**.

---

## Unique Advantage: Fuzzy Logic Detection

### What Makes This System Different?

Most proctoring solutions apply rigid “yes/no” rules or static thresholds for flagging suspicious activity, which often leads to **false positives** or **missed detections**.

> **Our Anti-Cheat System uniquely employs fuzzy logic, assigning _weights_ to different cheating behaviors (e.g., using a phone, multiple faces, impersonation) and combining them for an overall threat score.**

### How Fuzzy Logic Improves Detection

- **Threat Weights:** Each suspicious behavior is assigned a rational, expert-informed _weight_ reflecting its seriousness. For example, “Impersonation Detected” is weighted much higher than “Looking Away.”
- **Accurate, Gradual Evaluation:** Instead of auto-failing a student for a single false movement, the system calculates a total score over time. Detections are _combined_ using fuzzy (soft) rules, so borderline or ambiguous cases can still be flagged for review, but not punitive action.
- **Context Awareness:** Allows multiple minor infractions to be judged in proportion to their risk, providing nuanced reports to invigilators instead of “one-size-fits-all” flags.

**_This approach is rare among commercial solutions and is a unique innovation of this project, leading to fewer false alarms and more defensible, interpretable results._**

**Sample fuzzy weights from the system:**
```python
THREAT_WEIGHTS = {
    "Mobile Phone Detected": 50,
    "Book Detected": 40,
    "Impersonation Detected": 100,
    "Multiple Persons": 40,
    "Face Not Visible": 20,
    "Looking Away": 15,
    "Person Absent": 10
}
```
*Example: If a student looks away twice (15+15), one instance their face isn’t visible (20), and one possible phone is detected (50), their cumulative alert score reflects multiple soft risks rather than an absolute fail.*

---

## Problem Statement

Online examinations are highly vulnerable to cheating and impersonation, threatening academic integrity for educational institutions and organizations. Manual proctoring is not scalable or cost-effective for remote assessments. The Anti-Cheat System solves this by using AI-powered detection and fuzzy scoring to automate real-time monitoring, reduce human effort, and provide nuanced, actionable reporting.

---

## Tech Stack

- **Backend:** Python, FastAPI, SQLAlchemy, OpenCV, Ultralytics YOLO, face-recognition, JWT
- **Frontend:** HTML, CSS, JavaScript (vanilla, no framework), minimalistic dashboards
- **Database:** SQL Server (default, easy to adapt for SQLite/Postgres)
- **Containerization:** Docker
- **Libraries:** uvicorn, python-multipart, passlib, python-jose, pyodbc, pillow, pdfkit, dotenv

---

## Project Structure

```
anti-cheat-system/
├── backend/
│   ├── main.py              # FastAPI backend app entry
│   ├── detection.py         # AI/ML + fuzzy logic
│   ├── ...                  # modules: database.py, models.py, etc.
├── frontend/
│   ├── *.html               # UI files
│   ├── css/
│   ├── js/
├── config.py                # Config (DB, secrets)
├── requirements.txt
├── setup.sh                 # One-step project setup
├── Dockerfile
└── uploads/                 # Evidence images, frames
```

---

## Setup & Installation

### 1. Clone the repository
```bash
git clone https://github.com/Wahajulhaq7/anti-cheat-system.git
cd anti-cheat-system
```

### 2. Install dependencies (Python 3.10+ recommended)
```bash
python -m venv venv
source venv/bin/activate      # Linux/macOS
venv\Scripts\activate         # Windows

pip install -r requirements.txt
```

### 3. Database Configuration
Edit `config.py`:
```python
DB_SERVER = "yourserver"
DB_NAME = "AntiCheatDB"
DB_USER = "yourpassword"
DB_PASS = "YourStrong@Pass123"
```

- Use SQL Server Express for dev/testing
- For SQLite/Postgres, adjust `database.py` accordingly

### 4. Prepare directories
```bash
mkdir -p uploads/frames uploads/profiles
```
(Most are created automatically by the code/setup.)

### 5. (Optional) Start with Docker
```bash
docker build -t anti-cheat-system .
docker run -p 7860:7860 anti-cheat-system
```

---

## Running the Application

1. **Start your database.**
2. **Backend:**  
   ```bash
   uvicorn backend.main:app --reload
   ```
    > Defaults to http://localhost:8000

3. **Frontend:**  
    Open HTML files in `/frontend` directly or serve via a local webserver.

4. **Login/Register** as student, admin, or invigilator.

---

## Architecture Overview

- **Backend:** Handles authentication, fuzzy-logic-based AI/ML inference, logging, and evidence capture.
- **Frontend:** Web dashboards for all roles; real-time alert and review capability.
- **Detection Module:** Applies evidence-based, weighted rule system (fuzzy logic) to classify risk.
- **Alerts:** All incidents logged with contextual risk scores and images for easy review.

---

## Usage

- **Students:** Log in, register their face, and take exams under live monitoring.
- **Invigilators/Admins:** Get real-time alerts, risk scores, and review evidence (screenshots, logs).
- **Fuzzy risk scoring** means that instead of being harshly penalized for minor infractions, reports provide a trustable, nuanced view—enabling fairer decisions.

---

## Customization

- Adjust fuzzy weights in `backend/detection.py` to match institutional policy.
- Browse and edit detection rules for even more tailored scoring.
- Swap YOLO weights to accommodate more/other suspicious object types.

---

## License

MIT License. See `LICENSE` for details.

---
*Developed by Wahajulhaq7. Contributions and suggestions are encouraged!*
