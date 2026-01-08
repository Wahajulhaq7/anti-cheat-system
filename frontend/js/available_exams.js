const API_BASE = "http://localhost:8000";
let selectedExamId = null;
let cameraStream = null;

window.onload = async () => {
    const token = localStorage.getItem('token');
    const role = (localStorage.getItem('role') || '').toLowerCase();

    // Redirect if not logged in or not a student
    if (!token || role !== 'student') {
        window.location.href = 'login.html';
        return;
    }

    await loadAvailableExams();
};

async function loadAvailableExams() {
    const container = document.getElementById('exam-list');
    container.innerHTML = '<p style="color:#a0aec0;">Loading exams...</p>';

    try {
        const token = localStorage.getItem('token');
        
        // ✅ FIXED: Changed from /exam/active (Admin Only) to /exam/available (Student)
        const res = await fetch(`${API_BASE}/exam/available`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) {
            // Log detail if available for debugging
            const errData = await res.json().catch(() => ({})); 
            console.error("Fetch error:", res.status, errData);
            throw new Error(`Failed to load exams (${res.status})`);
        }

        const exams = await res.json();
        container.innerHTML = '';

        if (exams.length === 0) {
            container.innerHTML = '<p style="color:#a0aec0;">No active exams available.</p>';
            return;
        }

        exams.forEach(exam => {
            const div = document.createElement('div');
            div.className = 'exam-card';
            div.innerHTML = `
                <h3>${exam.title}</h3>
                <p><strong>ID:</strong> ${exam.id}</p>
                <p>${exam.description || 'No description provided.'}</p>
                <button class="btn-start" onclick="initiateExam(${exam.id})">
                    Start Exam
                </button>
            `;
            container.appendChild(div);
        });

    } catch (err) {
        console.error(err);
        container.innerHTML = '<p style="color:#ef4444;">Error loading exams. Please try again later.</p>';
    }
}

// --- 📸 CAMERA CHECK LOGIC ---

// 1. User clicks "Start Exam" -> Open Modal
function initiateExam(examId) {
    selectedExamId = examId;
    const modal = document.getElementById('cameraModal');
    const btnProceed = document.getElementById('btnStartExam');
    const statusText = document.getElementById('cameraStatus');

    // Reset Modal State
    btnProceed.disabled = true;
    statusText.className = 'check-status status-waiting';
    statusText.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Checking camera permissions...';
    
    modal.style.display = 'flex';

    // Request Camera Immediately
    requestCameraAccess();
}

// 2. Request Camera Permission
async function requestCameraAccess() {
    const videoElement = document.getElementById('cameraPreview');
    const statusText = document.getElementById('cameraStatus');
    const btnProceed = document.getElementById('btnStartExam');

    try {
        // Ask for permission
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        
        // Success
        cameraStream = stream;
        videoElement.srcObject = stream;
        
        statusText.className = 'check-status status-success';
        statusText.innerHTML = '<i class="fa-solid fa-check-circle"></i> Camera connected successfully';
        
        // Enable Start Button
        btnProceed.disabled = false;

    } catch (err) {
        console.error("Camera Error:", err);
        statusText.className = 'check-status status-error';
        statusText.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Camera access denied or not found.';
    }
}

// 3. User clicks "Start Exam" inside Modal -> Go to Exam Page
function proceedToExam() {
    if (!selectedExamId) return;

    // Save ID for the next page
    localStorage.setItem('current_exam_id', selectedExamId);

    // Stop the stream before redirecting (clean up)
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
    }

    // Redirect
    window.location.href = 'startexam.html';
}

// 4. Close Modal & Stop Camera
function closeCameraModal() {
    const modal = document.getElementById('cameraModal');
    modal.style.display = 'none';
    selectedExamId = null;

    // Stop camera to release hardware light
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
    
    const videoElement = document.getElementById('cameraPreview');
    if (videoElement) videoElement.srcObject = null;
}