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

  // ✅ Load data and bind events
  await loadStats();
  await loadExams();
  loadActiveStudents();
  loadUnusualDetections();

  // Auto-refresh monitoring panels every 10 seconds
  setInterval(loadActiveStudents, 10000);
  setInterval(loadUnusualDetections, 10000);

  setupEventListeners();

  if (document.getElementById('questionsContainer')) {
    addQuestion();
  }
};

function setupEventListeners() {
  const form = document.getElementById('examForm');
  if (form) {
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

async function loadStats() {
  const token = localStorage.getItem('token');

  try {
    // ✅ Total Students
    const usersRes = await fetch(`${API_BASE}/auth/users`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (usersRes.ok) {
      const users = await usersRes.json();
      const students = users.filter(user => user.role === 'student');
      const el = document.getElementById('totalStudents');
      if (el) el.textContent = students.length;
    } else {
      const el = document.getElementById('totalStudents');
      if (el) el.textContent = '0';
    }
  } catch (err) {
    console.error('Load total students error:', err);
    const el = document.getElementById('totalStudents');
    if (el) el.textContent = '0';
  }

  try {
    // ✅ Total Exams Created
    const myExamsRes = await fetch(`${API_BASE}/exam/my`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const el = document.getElementById('totalExamsCreated');
    if (myExamsRes.ok) {
      const myExams = await myExamsRes.json();
      if (el) el.textContent = myExams.length;
    } else {
      if (el) el.textContent = '0';
    }
  } catch (err) {
    console.error('Load exams created error:', err);
    const el = document.getElementById('totalExamsCreated');
    if (el) el.textContent = '0';
  }

  try {
    // ✅ Current Exams Ongoing (distinct exam IDs from active students)
    const activeStudentsRes = await fetch(`${API_BASE}/monitor/active-students`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const el = document.getElementById('currentExamsOngoing');
    if (activeStudentsRes.ok) {
      const activeStudents = await activeStudentsRes.json();
      const uniqueExamIds = [...new Set(activeStudents.map(s => s.exam_id))];
      if (el) el.textContent = uniqueExamIds.length;
    } else {
      if (el) el.textContent = '0';
    }
  } catch (err) {
    console.error('Load current exams ongoing error:', err);
    const el = document.getElementById('currentExamsOngoing');
    if (el) el.textContent = '0';
  }
}

async function loadExams() {
  try {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_BASE}/exam/active`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) throw new Error('Failed to load exams');

    const exams = await res.json();
    const list = document.getElementById('examsList');
    if (!list) return;

    list.innerHTML = '';

    if (!exams.length) {
      list.innerHTML = '<p>No active exams found.</p>';
      const cnt = document.getElementById('activeExamsCount');
      if (cnt) cnt.textContent = '0';
      return;
    }

    exams.forEach(exam => {
      const div = document.createElement('div');
      div.className = 'exam-item';
      div.innerHTML = `
        <div>
          <strong>${exam.title}</strong>
          <p>${exam.description || ''}</p>
        </div>
        <div>
          <button onclick="editExam(${exam.id})">Edit</button>
          <button onclick="deleteExam(${exam.id})" class="btn-delete">Delete</button>
          <button onclick="monitorExam(${exam.id})" class="btn-monitor">Monitor</button>
        </div>
      `;
      list.appendChild(div);
    });

    const cnt = document.getElementById('activeExamsCount');
    if (cnt) cnt.textContent = exams.length;

  } catch (err) {
    console.error('Load exams error:', err);
  }
}


// ----------------- NEW: Monitoring Panels -----------------

async function loadActiveStudents() {
  try {
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_BASE}/monitor/active-students`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const list = document.getElementById("activeStudentsList");
    if (!list) return;

    if (!res.ok) {
      list.innerHTML = "<p>Failed to load active students.</p>";
      return;
    }

    const students = await res.json();
    const filtered = filterExamId
      ? students.filter(s => String(s.exam_id) === String(filterExamId))
      : students;

    if (!filtered.length) {
      list.innerHTML = filterExamId
        ? `<p>No students currently taking exam ${filterExamId}.</p>`
        : "<p>No students currently taking exams.</p>";
      return;
    }

    list.innerHTML = filtered.map(s => `
      <div class="student-item">
        👨‍🎓 ${s.username} — Exam ${s.exam_id}
        <button onclick="monitorStudent(${s.user_id}, ${s.exam_id})">Monitor</button>
      </div>
    `).join("");
  } catch (err) {
    console.error("Error loading active students:", err);
  }
}

async function loadUnusualDetections() {
  try {
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_BASE}/monitor/unusual-detections`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const list = document.getElementById("unusualList");
    if (!list) return;

    if (!res.ok) {
      list.innerHTML = "<p>Failed to load unusual detections.</p>";
      return;
    }

    const flagged = await res.json();
    if (!flagged.length) {
      list.innerHTML = "<p>No unusual detections.</p>";
      return;
    }

    list.innerHTML = flagged.map(f => `
      <div class="flagged-item">
        ⚠️ ${f.username} — ${f.movement_type} (${new Date(f.timestamp).toLocaleTimeString()})
        <button onclick="viewUnusualImages(${f.user_id}, ${f.exam_id})">View Images</button>
      </div>
    `).join("");
  } catch (err) {
    console.error("Error loading unusual detections:", err);
  }
}

// ----------------- Navigation helpers -----------------

function monitorStudent(user_id, exam_id) {
  window.location.href = `live_monitor.html?user_id=${user_id}&exam_id=${exam_id}`;
}

function viewUnusualImages(user_id, exam_id) {
  window.location.href = `unusual.html?user_id=${user_id}&exam_id=${exam_id}`;
}

// When clicking "Monitor" on an exam card, filter Active Students to that exam
function monitorExam(exam_id) {
  filterExamId = exam_id;
  // Optionally scroll to the panel
  const panel = document.getElementById("activeStudentsList");
  if (panel) panel.scrollIntoView({ behavior: "smooth", block: "start" });
  loadActiveStudents();
}

// Optional: clear the filter from somewhere in UI (call this if you add a "Clear" button)
function clearExamFilter() {
  filterExamId = null;
  loadActiveStudents();
}

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
  questionIndex = blocks.length || 1;
}

async function createExam() {
  try {
    const token = localStorage.getItem('token');
    if (!token) throw new Error('Please login again');

    const examTitle = document.getElementById('examTitle').value.trim();
    const examDescription = document.getElementById('examDescription')?.value.trim() || '';
    const questions = [];
    let isValid = true;

    document.querySelectorAll('.question-container').forEach((div, index) => {
      const questionText = div.querySelector('textarea').value.trim();
      const options = Array.from(div.querySelectorAll('input')).map(i => i.value.trim());
      const correctAnswer = div.querySelector('select').value;

      if (!questionText || options.slice(0, 2).some(opt => !opt) || !correctAnswer) {
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
      throw new Error('Please complete all questions with at least 2 options and a correct answer');
    }

    const response = await fetch(`${API_BASE}/exam/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        title: examTitle,
        description: examDescription,
        questions
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || 'Failed to create exam');
    }

    const result = await response.json();
    alert(`✅ Exam created successfully! ID: ${result.exam_id}`);

    // Reset form
    const form = document.getElementById('examForm');
    if (form) form.reset();
    const qContainer = document.getElementById('questionsContainer');
    if (qContainer) qContainer.innerHTML = '';
    questionIndex = 1;
    addQuestion();

    // Refresh dashboard
    await loadExams();
    await loadStats();

  } catch (error) {
    console.error('Create exam error:', error);
    alert('❌ ' + error.message);
  }
}

// ----------------- Extra exam actions (optional but referenced in UI) -----------------

function editExam(examId) {
  // Adjust to your actual edit page
  window.location.href = `edit_exam.html?exam_id=${examId}`;
}

async function deleteExam(examId) {
  if (!confirm('Are you sure you want to delete this exam?')) return;
  try {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_BASE}/exam/${examId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Failed to delete exam ${examId}`);
    }
    // Refresh lists and stats
    await loadExams();
    await loadStats();
  } catch (e) {
    console.error('Delete exam error:', e);
    alert('❌ ' + e.message);
  }
}
