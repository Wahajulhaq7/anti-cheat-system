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
 * Display logged-in username in navbar
 */
function displayUsername() {
  const username = localStorage.getItem("username");
  if (username) {
    document.getElementById("username").textContent = `👋 ${username}`;
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
    const res = await fetch("http://localhost:8000/exam/available", {
      headers: { "Authorization": `Bearer ${token}` }
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
        <strong>${exam.title}</strong><br/>
        <small>${exam.description || ''}</small><br/>
        <button class="btn-start" onclick="startExam(${exam.id})">Start Exam</button>
      </div>
    `).join("");
  } catch (err) {
    console.error("Error loading exams:", err);
    list.innerHTML = "<p>Network error. Could not load exams.</p>";
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
 * On page load
 */
window.onload = () => {
  if (!checkAuth()) return;
  displayUsername();
  loadExams();
};
