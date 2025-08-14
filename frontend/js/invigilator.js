// frontend/js/invigilator.js

let currentExamId = null;
let questionIndex = 1;

// ✅ Check auth and load data on page load
window.onload = async () => {
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");
  const username = localStorage.getItem("username");

  if (!token || role !== "invigilator") {
    window.location.href = "login.html";
    return;
  }

  document.getElementById("username").textContent = username;

  await loadStats();
  await loadExams();
  setupEventListeners();
};

// ✅ Setup event listeners
function setupEventListeners() {
  document.getElementById("examForm")?.addEventListener("submit", createExam);
}

// ✅ Load stats (students, suspicious activities, exams)
async function loadStats() {
  try {
    const token = localStorage.getItem("token");

    // Fetch all users (admin/invigilator can see all)
    const usersRes = await fetch("http://localhost:8000/auth/users", {
      headers: { "Authorization": `Bearer ${token}` }
    });

    if (!usersRes.ok) throw new Error("Failed to load users");

    const users = await usersRes.json();
    const students = users.filter(user => user.role === "student");
    document.getElementById("totalStudents").textContent = students.length;

    // Fetch suspicious logs (example endpoint)
    const alertsRes = await fetch("http://localhost:8000/logs/suspicious", {
      headers: { "Authorization": `Bearer ${token}` }
    });

    if (alertsRes.ok) {
      const alerts = await alertsRes.json();
      document.getElementById("suspiciousCount").textContent = alerts.length;
    }

  } catch (err) {
    console.error("Load stats error:", err);
    document.getElementById("totalStudents").textContent = "0";
    document.getElementById("suspiciousCount").textContent = "0";
  }
}

// ✅ Load exams
async function loadExams() {
  try {
    const token = localStorage.getItem("token");
    const res = await fetch("http://localhost:8000/exam/active", {
      headers: { "Authorization": `Bearer ${token}` }
    });

    if (!res.ok) throw new Error("Failed to load exams");

    const exams = await res.json();
    const list = document.getElementById("examsList");
    list.innerHTML = "";

    exams.forEach(exam => {
      const div = document.createElement("div");
      div.className = "exam-item";
      div.innerHTML = `
        <div>
          <strong>${exam.title}</strong>
          <p>${exam.description || ""}</p>
        </div>
        <div>
          <button onclick="editExam(${exam.id})">Edit</button>
          <button onclick="deleteExam(${exam.id})" class="btn-delete">Delete</button>
          <button onclick="monitorExam(${exam.id})" class="btn-monitor">Monitor</button>
        </div>
      `;
      list.appendChild(div);
    });

    document.getElementById("activeExamsCount").textContent = exams.length;
  } catch (err) {
    console.error("Load exams error:", err);
  }
}

// ✅ Add Question
function addQuestion() {
  questionIndex++;
  const container = document.getElementById("questionsContainer");
  const block = document.createElement("div");
  block.className = "question-block";
  block.innerHTML = `
    <h4>Question ${questionIndex}</h4>
    <input type="text" class="question-text" placeholder="Question" required />
    <input type="text" class="option" placeholder="Option A" required />
    <input type="text" class="option" placeholder="Option B" required />
    <input type="text" class="option" placeholder="Option C" required />
    <input type="text" class="option" placeholder="Option D" required />
    <select class="correct-option" required>
      <option value="">Correct Option</option>
      <option value="A">A</option>
      <option value="B">B</option>
      <option value="C">C</option>
      <option value="D">D</option>
    </select>
    <button type="button" onclick="removeQuestion(this)" class="btn-remove">Remove</button>
  `;
  container.appendChild(block);
}

// ✅ Remove Question and Renumber
function removeQuestion(button) {
  const block = button.closest(".question-block");
  block.remove();

  // ✅ Renumber remaining questions
  const blocks = document.querySelectorAll(".question-block");
  blocks.forEach((block, index) => {
    const h4 = block.querySelector("h4");
    h4.textContent = `Question ${index + 1}`;
  });

  questionIndex = blocks.length || 1; // Reset counter
}

// ✅ Create Exam
async function createExam(e) {
  e.preventDefault();

  const title = document.getElementById("examTitle").value.trim();
  const description = document.getElementById("examDescription").value.trim();

  if (!title) {
    alert("Title is required");
    return;
  }

  const questions = [];
  const blocks = document.querySelectorAll(".question-block");

  for (const block of blocks) {
    const question = block.querySelector(".question-text").value.trim();
    const options = Array.from(block.querySelectorAll(".option")).map(el => el.value.trim());
    const correct = block.querySelector(".correct-option").value;

    if (!question || options.some(opt => !opt) || !correct) {
      alert("Please fill all fields in every question");
      return;
    }

    questions.push({
      question,
      options: JSON.stringify({
        A: options[0],
        B: options[1],
        C: options[2],
        D: options[3]
      }),
      correct_option: correct
    });
  }

  try {
    const token = localStorage.getItem("token");

    // Create exam
    const examRes = await fetch("http://localhost:8000/exam/create", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ title, description })
    });

    if (!examRes.ok) {
      const error = await examRes.json().catch(() => ({}));
      throw new Error(error.detail || "Failed to create exam");
    }

    const exam = await examRes.json();

    // Create MCQs
    for (const q of questions) {
      await fetch("http://localhost:8000/exam/mcq", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          exam_id: exam.id,
          question: q.question,
          options: q.options,
          correct_option: q.correct_option
        })
      });
    }

    alert("✅ Exam and MCQs created successfully!");
    document.getElementById("examForm").reset();
    document.getElementById("questionsContainer").innerHTML = `
      <div class="question-block">
        <h4>Question 1</h4>
        <input type="text" class="question-text" placeholder="Question" required />
        <input type="text" class="option" placeholder="Option A" required />
        <input type="text" class="option" placeholder="Option B" required />
        <input type="text" class="option" placeholder="Option C" required />
        <input type="text" class="option" placeholder="Option D" required />
        <select class="correct-option" required>
          <option value="">Correct Option</option>
          <option value="A">A</option>
          <option value="B">B</option>
          <option value="C">C</option>
          <option value="D">D</option>
        </select>
      </div>
    `;
    questionIndex = 1;
    loadExams();
  } catch (err) {
    console.error("Create exam error:", err);
    alert("❌ " + err.message);
  }
}

// ✅ Edit Exam
async function editExam(examId) {
  const newTitle = prompt("Enter new title:");
  if (!newTitle) return;

  try {
    const token = localStorage.getItem("token");
    await fetch(`http://localhost:8000/exam/${examId}`, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ title: newTitle })
    });
    loadExams();
  } catch (err) {
    alert("Failed to update exam");
  }
}

// ✅ Delete Exam
async function deleteExam(examId) {
  if (!confirm("Delete this exam?")) return;

  try {
    const token = localStorage.getItem("token");
    await fetch(`http://localhost:8000/exam/${examId}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${token}` }
    });
    loadExams();
  } catch (err) {
    alert("Failed to delete exam");
  }
}

// ✅ Monitor Exam
async function monitorExam(examId) {
  currentExamId = examId;
  try {
    const token = localStorage.getItem("token");
    const res = await fetch(`http://localhost:8000/exam/${examId}/students`, {
      headers: { "Authorization": `Bearer ${token}` }
    });

    const students = await res.json();
    const grid = document.getElementById("studentGrid");
    grid.innerHTML = "";

    if (students.length === 0) {
      grid.innerHTML = '<p class="placeholder">No students in this exam</p>';
      return;
    }

    students.forEach(student => {
      const feed = document.createElement("div");
      feed.className = "student-feed";
      feed.innerHTML = `
        <strong>${student.username}</strong>
        <div class="status">Monitoring...</div>
        <video autoplay muted></video>
      `;
      grid.appendChild(feed);
    });
  } catch (err) {
    console.error("Monitor error:", err);
  }
}

// ✅ Logout
function logout() {
  localStorage.clear();
  window.location.href = "login.html";
}