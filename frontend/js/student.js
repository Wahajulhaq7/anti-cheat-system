// frontend/js/student.js

/**
 * Check authentication and redirect if not a student
 */
function checkAuth() {
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");

  if (!token) {
    window.location.href = "login.html";
    return false;
  }

  if (role !== "student") {
    alert("Access denied. Students only.");
    localStorage.clear();
    window.location.href = "login.html";
    return false;
  }

  return true;
}

/**
 * Load available exams (for exams.html)
 */
async function loadExams() {
  const token = localStorage.getItem("token");
  const list = document.getElementById("exam-list");
  if (!list) return; // Prevent error if element doesn't exist

  list.innerHTML = "<p>Loading exams...</p>";

  try {
    const res = await fetch("http://localhost:8000/exam/available", {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });

    if (!res.ok) {
      list.innerHTML = "<p>Failed to load exams.</p>";
      return;
    }

    const exams = await res.json();

    if (exams.length === 0) {
      list.innerHTML = "<p>No exams available.</p>";
      return;
    }

    list.innerHTML = exams.map(exam => `
      <div class="exam-item">
        <strong>${exam.title}</strong>
        <button onclick="startExam(${exam.id})">Start Exam</button>
      </div>
    `).join("");
  } catch (err) {
    console.error("Error loading exams:", err);
    list.innerHTML = "<p>Network error. Could not load exams.</p>";
  }
}

/**
 * Load student results (for student.html)
 */
async function loadResults() {
  const user_id = localStorage.getItem("user_id");
  const token = localStorage.getItem("token");
  const list = document.getElementById("results-list");
  if (!list) return; // Prevent error if element doesn't exist

  list.innerHTML = "<p>Loading results...</p>";

  try {
    const res = await fetch(`http://localhost:8000/log/report/${user_id}`, {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });

    if (!res.ok) {
      list.innerHTML = "<p>Failed to load results.</p>";
      return;
    }

    const reports = await res.json();

    if (reports.length === 0) {
      list.innerHTML = "<p>No results yet.</p>";
      return;
    }

    list.innerHTML = reports.map(r => `
      <div class="result-item">
        <p><strong>Exam ID:</strong> ${r.exam_id}</p>
        <p><strong>Movements Detected:</strong> ${r.movement_count}</p>
        <p><strong>Status:</strong> 
          <span class="${r.movement_count > 5 ? 'alert' : 'success'}">
            ${r.movement_count > 5 ? 'Suspicious' : 'Normal'}
          </span>
        </p>
      </div>
    `).join("");
  } catch (err) {
    console.error("Error loading results:", err);
    list.innerHTML = "<p>Network error. Could not load results.</p>";
  }
}

/**
 * Start an exam
 */
function startExam(exam_id) {
  localStorage.setItem("current_exam_id", exam_id);
  window.location.href = "exam.html";
}

/**
 * Logout
 */
function logout() {
  localStorage.clear();
  window.location.href = "login.html";
}

/**
 * Page-specific initialization
 */
window.onload = () => {
  if (!checkAuth()) return;

  const path = window.location.pathname;

  if (path.includes("student.html")) {
    loadResults();
  } else if (path.includes("exams.html")) {
    loadExams();
  }
};