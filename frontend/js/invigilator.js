// Check authentication and role
function checkAuth() {
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('role');

    if (!token || role !== 'invigilator') {
        window.location.href = 'login.html';
    }

    // Display username
    const username = localStorage.getItem('username');
    document.getElementById('currentUser').textContent = `Welcome, ${username}`;
}

// Create new exam
async function createExam() {
    const title = document.getElementById('examTitle').value.trim();
    const description = document.getElementById('examDescription').value.trim();

    if (!title) {
        alert('Please enter an exam title');
        return;
    }

    try {
        const token = localStorage.getItem('token');
        const response = await fetch('http://localhost:8000/exam/create', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ title, description })
        });

        if (!response.ok) {
            throw new Error('Failed to create exam');
        }

        alert('✅ Exam created successfully!');
        document.getElementById('examTitle').value = '';
        document.getElementById('examDescription').value = '';
        loadActiveExams();
    } catch (error) {
        console.error('Create exam error:', error);
        alert('❌ ' + error.message);
    }
}

// Load active exams
async function loadActiveExams() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('http://localhost:8000/exam/active', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to load exams');
        }

        const exams = await response.json();
        const examsList = document.getElementById('activeExams');
        examsList.innerHTML = exams.map(exam => `
            <div class="exam-card">
                <h3>${exam.title}</h3>
                <p>${exam.description || 'No description'}</p>
                <button onclick="monitorExam(${exam.id})">Monitor</button>
            </div>
        `).join('');
    } catch (error) {
        console.error('Load exams error:', error);
    }
}

// Logout function
function logout() {
    localStorage.clear();
    window.location.href = 'login.html';
}

// Check authentication at page load
window.onload = function() {
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('role');

    if (!token || role !== 'invigilator') {
        window.location.href = 'login.html';
        return;
    }

    // Initialize invigilator dashboard
    loadActiveExams();
    setupEventListeners();
}