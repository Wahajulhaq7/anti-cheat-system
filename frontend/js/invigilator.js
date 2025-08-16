// frontend/js/invigilator.js

let currentExamId = null;
let questionIndex = 1;

window.onload = async () => {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');
  const username = localStorage.getItem('username');

  if (!token || role !== 'invigilator') {
    window.location.href = 'login.html';
    return;
  }

  document.getElementById('username').textContent = username;

  await loadStats();
  await loadExams();
  setupEventListeners();

  if (document.getElementById('questionsContainer')) {
    addQuestion();
  }
};

function setupEventListeners() {
  document.getElementById('examForm')?.addEventListener('submit', createExam);
}

async function loadStats() {
  try {
    const token = localStorage.getItem('token');
    const usersRes = await fetch('http://localhost:8000/auth/users', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!usersRes.ok) throw new Error('Failed to load users');

    const users = await usersRes.json();
    const students = users.filter(user => user.role === 'student');
    document.getElementById('totalStudents').textContent = students.length;
  } catch (err) {
    console.error('Load stats error:', err);
    document.getElementById('totalStudents').textContent = '0';
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
    list.innerHTML = '';

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
    <textarea 
      name="question${questionIndex}" 
      placeholder="Enter question text" 
      required
      class="question-text"
    ></textarea>
    <div class="options-grid">
      <div class="option">
        <label>Option A:</label>
        <input type="text" name="option${questionIndex}A" required>
      </div>
      <div class="option">
        <label>Option B:</label>
        <input type="text" name="option${questionIndex}B" required>
      </div>
      <div class="option">
        <label>Option C:</label>
        <input type="text" name="option${questionIndex}C">
      </div>
      <div class="option">
        <label>Option D:</label>
        <input type="text" name="option${questionIndex}D">
      </div>
    </div>
    <div class="correct-answer">
      <label>Correct Answer:</label>
      <select name="correct${questionIndex}" required>
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
    const h3 = block.querySelector('h3');
    h3.textContent = `Question ${index + 1}`;
  });

  questionIndex = blocks.length || 1;
}

async function createExam(e) {
  e.preventDefault();

  try {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('Please login again');
    }

    const examTitle = document.getElementById('examTitle').value.trim();
    const examDescription = document.getElementById('examDescription')?.value.trim() || '';
    const questions = [];
    let isValid = true;

    document.querySelectorAll('.question-container').forEach((div, index) => {
      const questionText = div.querySelector('textarea').value.trim();
      const options = Array.from(div.querySelectorAll('input'))
        .map(input => input.value.trim());
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
      throw new Error('Please complete all questions with at least 2 options and correct answer');
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
        questions: questions
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to create exam');
    }

    const result = await response.json();
    alert(`✅ Exam created successfully! ID: ${result.exam_id}`);

    document.getElementById('examForm').reset();
    document.getElementById('questionsContainer').innerHTML = '';
    questionIndex = 1;
    addQuestion();
    loadExams();

  } catch (error) {
    console.error('Create exam error:', error);
    alert('❌ ' + error.message);
  }
}

async function editExam(examId) {
  const newTitle = prompt("Enter new title:");
  if (!newTitle) return;

  try {
    const token = localStorage.getItem('token');
    await fetch(`http://localhost:8000/exam/${examId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ title: newTitle })
    });
    loadExams();
  } catch (err) {
    alert("Failed to update exam");
  }
}

async function deleteExam(examId) {
  if (!confirm("Delete this exam?")) return;

  try {
    const token = localStorage.getItem('token');
    await fetch(`http://localhost:8000/exam/${examId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    loadExams();
  } catch (err) {
    alert("Failed to delete exam");
  }
}

async function monitorExam(examId) {
  currentExamId = examId;
  try {
    const token = localStorage.getItem('token');
    const res = await fetch(`http://localhost:8000/exam/${examId}/students`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const students = await res.json();
    const grid = document.getElementById('studentGrid');
    grid.innerHTML = '';

    if (students.length === 0) {
      grid.innerHTML = '<p class="placeholder">No students in this exam</p>';
      return;
    }

    students.forEach(student => {
      const feed = document.createElement('div');
      feed.className = 'student-feed';
      feed.innerHTML = `
        <strong>${student.username}</strong>
        <div class="status">Monitoring...</div>
        <video autoplay muted></video>
      `;
      grid.appendChild(feed);
    });
  } catch (err) {
    console.error('Monitor error:', err);
  }
}

function logout() {
  localStorage.clear();
  window.location.href = 'login.html';
}