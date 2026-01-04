const API_BASE = "http://localhost:8000";

let currentExamId = null;
let questionIndex = 1;
let createExamInProgress = false; // prevents duplicate submits
let filterExamId = null; // optional filter for Active Students panel

window.onload = async () => {
  const token = localStorage.getItem('token');
  const role = (localStorage.getItem('role') || '').toLowerCase();
  const username = localStorage.getItem('username') || 'Invigilator';

  console.log("Login check — token:", token, "role:", role);

  // ✅ Redirect to login if not an invigilator
  if (!token || role !== 'invigilator') {
    window.location.href = 'login.html';
    return;
  }

  // ✅ Set username in navbar
  const usernameEl = document.getElementById('username');
  if (usernameEl) usernameEl.textContent = username;

  // ✅ Load data
  await loadStats();
  await loadExams();
  loadActiveStudents();
  loadUnusualDetections();

  // Auto-refresh monitoring panels every 10 seconds
  setInterval(loadActiveStudents, 10000);
  setInterval(loadUnusualDetections, 10000);
  
  // Refresh stats (including suspicious count) every 30 seconds
  setInterval(loadStats, 30000);

  setupEventListeners();

  // ✅ Fix: Only add question if container exists AND is empty
  const qContainer = document.getElementById('questionsContainer');
  if (qContainer && qContainer.children.length === 0) {
    addQuestion();
  }
};

function setupEventListeners() {
  const form = document.getElementById('examForm');
  if (form) {
    // Clone to remove previous event listeners
    const clone = form.cloneNode(true);
    form.parentNode.replaceChild(clone, form);

    clone.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!createExamInProgress) {
        createExamInProgress = true;
        disableCreateButton(true);
        await createExam();
        createExamInProgress = false;
        disableCreateButton(false);
      }
    });
  }
}

function disableCreateButton(state) {
  const btn = document.querySelector('#examForm button[type="submit"]');
  if (btn) {
    btn.disabled = state;
    btn.textContent = state ? "Creating..." : "Create Exam";
  }
}

// ----------------- LOAD DASHBOARD STATS -----------------
async function loadStats() {
  const token = localStorage.getItem('token');
  
  // 1. Total Students
  try {
    const usersRes = await fetch(`${API_BASE}/auth/users`, { headers: { 'Authorization': `Bearer ${token}` } });
    if (usersRes.ok) {
      const users = await usersRes.json();
      const students = users.filter(user => user.role === 'student');
      const el = document.getElementById('totalStudents');
      if (el) el.textContent = students.length;
    }
  } catch (err) { console.error(err); }

  // 2. Exams Created
  try {
    const myExamsRes = await fetch(`${API_BASE}/exam/my`, { headers: { 'Authorization': `Bearer ${token}` } });
    const el = document.getElementById('totalExamsCreated');
    if (myExamsRes.ok && el) {
      const myExams = await myExamsRes.json();
      el.textContent = myExams.length;
    }
  } catch (err) { console.error(err); }

  // 3. ✅ NEW: Suspicious Images Count
  try {
    const susRes = await fetch(`${API_BASE}/monitor/suspicious-images/count`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (susRes.ok) {
        const data = await susRes.json();
        const el = document.getElementById('suspiciousCount');
        if (el) el.textContent = data.count; // Updates the Red Warning Card
    }
  } catch (err) { 
      console.error("Failed to load suspicious count:", err); 
  }
}

async function loadExams() {
  try {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_BASE}/exam/active`, { headers: { 'Authorization': `Bearer ${token}` } });
    const exams = await res.json();
    const cnt = document.getElementById('activeExamsCount');
    if (cnt) cnt.textContent = exams.length;
  } catch (err) { console.error(err); }
}

async function loadActiveStudents() {
  try {
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_BASE}/monitor/active-students`, { headers: { "Authorization": `Bearer ${token}` } });
    const list = document.getElementById("activeStudentsList");
    if (!list) return; // Element not on this page
    
    if (!res.ok) { list.innerHTML = "<p>Failed to load active students.</p>"; return; }
    const students = await res.json();
    const filtered = filterExamId ? students.filter(s => String(s.exam_id) === String(filterExamId)) : students;
    
    if (!filtered.length) {
      list.innerHTML = filterExamId ? `<p>No students currently taking exam ${filterExamId}.</p>` : "<p>No students currently taking exams.</p>";
      return;
    }
    list.innerHTML = filtered.map(s => `
      <div class="student-item">
        👨‍🎓 ${s.username} — Exam ${s.exam_id}
        <button onclick="monitorStudent(${s.user_id}, ${s.exam_id})">Monitor</button>
      </div>`).join("");
  } catch (err) { console.error(err); }
}

async function loadUnusualDetections() {
  try {
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_BASE}/monitor/unusual-detections`, { headers: { "Authorization": `Bearer ${token}` } });
    const list = document.getElementById("unusualList");
    if (!list) return; // Element not on this page

    if (!res.ok) { list.innerHTML = "<p>Failed to load unusual detections.</p>"; return; }
    const flagged = await res.json();
    
    if (!flagged.length) { list.innerHTML = "<p>No unusual detections.</p>"; return; }
    
    list.innerHTML = flagged.map(f => `
      <div class="flagged-item">
        ⚠️ ${f.username} — ${f.movement_type} (${new Date(f.timestamp).toLocaleTimeString()})
        <button onclick="viewUnusualImages(${f.user_id}, ${f.exam_id})">View Images</button>
      </div>`).join("");
  } catch (err) { console.error(err); }
}

function monitorStudent(user_id, exam_id) { window.location.href = `live_monitor.html?user_id=${user_id}&exam_id=${exam_id}`; }
function viewUnusualImages(user_id, exam_id) { window.location.href = `unusual.html?user_id=${user_id}&exam_id=${exam_id}`; }
function monitorExam(exam_id) { filterExamId = exam_id; loadActiveStudents(); }

// ----------------- Exam Creation Helpers -----------------

function addQuestion() {
  const container = document.createElement('div');
  container.className = 'question-container';
  container.innerHTML = `
    <div class="question-header">
      <h3>Question ${questionIndex}</h3>
      <button type="button" class="remove-btn" onclick="removeQuestion(this)">Remove</button>
    </div>
    <textarea placeholder="Enter question text" required class="question-text"></textarea>
    <div class="options-grid">
      <div class="option"><label>Option A:</label><input type="text" required></div>
      <div class="option"><label>Option B:</label><input type="text" required></div>
      <div class="option"><label>Option C:</label><input type="text"></div>
      <div class="option"><label>Option D:</label><input type="text"></div>
    </div>
    <div class="correct-answer">
      <label>Correct Answer:</label>
      <select required>
        <option value="">Select correct answer</option>
        <option value="A">A</option>
        <option value="B">B</option>
        <option value="C">C</option>
        <option value="D">D</option>
      </select>
    </div>
  `;
  const containerEl = document.getElementById('questionsContainer');
  if (containerEl) {
    containerEl.appendChild(container);
    questionIndex++;
  }
}

function removeQuestion(button) {
  const block = button.closest('.question-container');
  if (!block) return;
  block.remove();
  const blocks = document.querySelectorAll('.question-container');
  blocks.forEach((b, index) => {
    const h3 = b.querySelector('h3');
    if (h3) h3.textContent = `Question ${index + 1}`;
  });
  questionIndex = blocks.length + 1;
}

async function createExam() {
  try {
    const token = localStorage.getItem('token');
    if (!token) throw new Error('Please login again');

    const examTitle = document.getElementById('examTitle').value.trim();
    const questions = [];
    let isValid = true;

    // Collect Data
    document.querySelectorAll('.question-container').forEach((div, index) => {
      const questionText = div.querySelector('textarea').value.trim();
      const options = Array.from(div.querySelectorAll('.options-grid input')).map(i => i.value.trim());
      const correctAnswer = div.querySelector('select').value;

      if (!questionText || !options[0] || !options[1] || !correctAnswer) {
        isValid = false;
        return;
      }

      questions.push({
        questionNumber: index + 1,
        questionText,
        options,
        correctAnswer
      });
    });

    if (!examTitle) throw new Error('Exam title is required');
    if (!isValid || questions.length === 0) {
      throw new Error('Please complete all questions fields.');
    }

    const response = await fetch(`${API_BASE}/exam/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        title: examTitle,
        description: "", 
        questions
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || 'Failed to create exam');
    }

    const result = await response.json();
    
    // Trigger Success Modal (Defined in HTML)
    if (typeof openSuccessModal === 'function') {
        openSuccessModal(`Exam created successfully! ID: ${result.exam_id}`);
    } else {
        alert(`✅ Exam created successfully! ID: ${result.exam_id}`);
    }

    // Reset form
    const form = document.getElementById('examForm');
    if (form) form.reset();
    const qContainer = document.getElementById('questionsContainer');
    if (qContainer) qContainer.innerHTML = '';
    questionIndex = 1;
    addQuestion();

    await loadExams();
    await loadStats();

  } catch (error) {
    console.error('Create exam error:', error);
    alert('❌ ' + error.message);
  }
}

// ----------------- Extra exam actions -----------------
function editExam(examId) { window.location.href = `edit_exam.html?exam_id=${examId}`; }
async function deleteExam(examId) {
  if (!confirm('Are you sure you want to delete this exam?')) return;
  try {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_BASE}/exam/${examId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Failed to delete exam ${examId}`);
    await loadExams();
    await loadStats();
  } catch (e) { alert('❌ ' + e.message); }
}