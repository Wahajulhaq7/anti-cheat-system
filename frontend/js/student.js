// frontend/js/student.js

// Auto-redirect if not logged in or wrong role
// In auth.js or student.js
window.onload = () => {
  const token = localStorage.getItem("token");
  if (token) {
    const role = localStorage.getItem("role");
    if (role === "admin") window.location.href = "dashboard.html";
    else window.location.href = "student.html";
  }
  // Load exams and results
  loadExams();
  loadResults();
};

// Fetch available exams
async function loadExams() {
  try {
    const res = await fetch("http://localhost:8000/exam/available", {
      headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
    });

    if (res.ok) {
      const exams = await res.json();
      const list = document.getElementById("exam-list");
      if (exams.length === 0) {
        list.innerHTML = "<p>No exams available.</p>";
      } else {
        list.innerHTML = exams.map(exam => `
          <div class="exam-item">
            <strong>${exam.title}</strong>
            <button onclick="startExam(${exam.id})">Start Exam</button>
          </div>
        `).join("");
      }
    } else {
      document.getElementById("exam-list").innerHTML = "<p>Failed to load exams.</p>";
    }
  } catch (err) {
    console.error("Error loading exams:", err);
  }
}

// Fetch student's results
async function loadResults() {
  const user_id = localStorage.getItem("user_id");
  try {
    const res = await fetch(`http://localhost:8000/log/report/${user_id}`, {
      headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
    });

    if (res.ok) {
      const reports = await res.json();
      const list = document.getElementById("results-list");
      if (reports.length === 0) {
        list.innerHTML = "<p>No results yet.</p>";
      } else {
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
      }
    } else {
      document.getElementById("results-list").innerHTML = "<p>Failed to load results.</p>";
    }
  } catch (err) {
    console.error("Error loading results:", err);
  }
}

// Start an exam
function startExam(exam_id) {
  localStorage.setItem("current_exam_id", exam_id);
  window.location.href = "exam.html";  // Your existing exam page
}

// Logout
function logout() {
  localStorage.clear();
  window.location.href = "login.html";
}