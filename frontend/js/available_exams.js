/**
 * ====== CONFIG ======
 * Centralized API base — change this if backend URL changes
 */
const API_BASE = "http://localhost:8000";

/**
 * Check authentication and redirect if not a student
 */
function checkAuth() {
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");

  if (!token || role !== "student") {
    alert("Access denied. Students only.");
    localStorage.clear();
    window.location.href = "login.html";
    return false;
  }
  return true;
}

/**
 * Display logged-in username in navbar
 */
function displayUsername() {
  const username = localStorage.getItem("username");
  const usernameEl = document.getElementById("username");
  if (username && usernameEl) {
    usernameEl.textContent = `👋 ${username}`;
  }
}

/**
 * Load available exams
 */
async function loadExams() {
  const token = localStorage.getItem("token");
  const list = document.getElementById("exam-list");
  list.innerHTML = "<p>Loading exams...</p>";

  try {
    const response = await fetch(`${API_BASE}/exam/available`, {
      method: "GET",
      headers: { 
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch exams (HTTP ${response.status})`);
    }

    const exams = await response.json();

    if (!Array.isArray(exams) || exams.length === 0) {
      list.innerHTML = "<p>No exams available.</p>";
      return;
    }

    list.innerHTML = exams.map(exam => `
      <div class="exam-item">
        <strong>${exam.title}</strong><br/>
        <small>${exam.description || 'No description provided.'}</small><br/>
        <button class="btn-start" data-exam-id="${exam.id}">Start Exam</button>
      </div>
    `).join("");

    // Attach event listeners after rendering
    document.querySelectorAll(".btn-start").forEach(btn => {
      btn.addEventListener("click", () => {
        const examId = btn.getAttribute("data-exam-id");
        startExam(examId);
      });
    });

  } catch (error) {
    console.error("Error loading exams:", error);
    list.innerHTML = `<p style="color:red;">
      Network error. Could not load exams.<br/>
      <small>${error.message}</small>
    </p>`;
  }
}

/**
 * Start an exam
 */
function startExam(exam_id) {
  if (!exam_id) {
    alert("Invalid exam ID.");
    return;
  }
  localStorage.setItem("current_exam_id", exam_id);
  window.location.assign("startexam.html");
}

/**
 * Logout
 */
function logout() {
  localStorage.clear();
  window.location.href = "login.html";
}

/**
 * On page load
 */
window.addEventListener("DOMContentLoaded", () => {
  if (!checkAuth()) return;
  displayUsername();
  loadExams();
});
