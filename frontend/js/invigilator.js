let currentExamId = null;
let questionIndex = 1;
let createExamInProgress = false; // prevents duplicate submits

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
  setupEventListeners();

  if (document.getElementById('questionsContainer')) {
    addQuestion();
  }
};

function setupEventListeners() {
  const form = document.getElementById('examForm');
  if (form) {
    // Remove old listeners to prevent multiple bindings
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
  try {
    const token = localStorage.getItem('token');

    // ✅ Total Students
    const usersRes = await fetch('http://localhost:8000/auth/users', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!usersRes.ok) throw new Error(`Failed to load users: ${usersRes.status}`);
    const users = await usersRes.json();
    const students = users.filter(user => user.role === 'student');
    document.getElementById('totalStudents').textContent = students.length;

    // ✅ Total Exams Created by current invigilator
    const myExamsRes = await fetch('http://localhost:8000/exam/my', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (myExamsRes.ok) {
      const myExams = await myExamsRes.json();
      document.getElementById('totalExamsCreated').textContent = myExams.length;
    } else {
      document.getElementById('totalExamsCreated').textContent = '0';
    }

  } catch (err) {
    console.error('Load stats error:', err);
    document.getElementById('totalStudents').textContent = '0';
    document.getElementById('totalExamsCreated').textContent = '0';
  }
}

async function loadExams() {
  try {
    const token = localStorage.getItem('token');
    const res = await fetch('http://localhost:8000/exam/active', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) throw new Error('Failed to load exams');

    const exams = await res.json();
    const list = document.getElementById('examsList');
    if (!list) return;

    list.innerHTML = '';

    if (!exams.length) {
      list.innerHTML = '<p>No active exams found.</p>';
      document.getElementById('activeExamsCount').textContent = '0';
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

    document.getElementById('activeExamsCount').textContent = exams.length;

  } catch (err) {
    console.error('Load exams error:', err);
  }
}

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
  document.getElementById('questionsContainer').appendChild(container);
  questionIndex++;
}

function removeQuestion(button) {
  const block = button.closest('.question-container');
  block.remove();
  const blocks = document.querySelectorAll('.question-container');
  blocks.forEach((block, index) => {
    block.querySelector('h3').textContent = `Question ${index + 1}`;
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

    if (!isValid || questions.length === 0) {
      throw new Error('Please complete all questions with at least 2 options and a correct answer');
    }

    const response = await fetch('http://localhost:8000/exam/create', {
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
      const error = await response.json();
      throw new Error(error.detail || 'Failed to create exam');
    }

    const result = await response.json();
    alert(`✅ Exam created successfully! ID: ${result.exam_id}`);

    // Reset form
    document.getElementById('examForm').reset();
    document.getElementById('questionsContainer').innerHTML = '';
    questionIndex = 1;
    addQuestion();

    // Refresh stats and list
    await loadExams();
    await loadStats();

  } catch (error) {
    console.error('Create exam error:', error);
    alert('❌ ' + error.message);
  }
}
