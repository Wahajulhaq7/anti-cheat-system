// frontend/js/submitted_exams.js

const API_BASE = "http://localhost:8000";
const token = localStorage.getItem("token");
const role = localStorage.getItem("role");

// Auth guard
if (!token || role !== "invigilator") {
  alert("Access denied");
  localStorage.clear();
  window.location.href = "login.html";
}

// Display username
window.onload = () => {
  const username = localStorage.getItem("username");
  const usernameEl = document.getElementById("username");
  if (usernameEl && username) {
    usernameEl.textContent = username;
  }
  loadSubmittedExams();
};

// Fetch and render submitted exams
async function loadSubmittedExams() {
  const list = document.getElementById("submissionsList");
  list.innerHTML = "<p class='placeholder'>Loading submitted exams...</p>";

  try {
    const res = await fetch(`${API_BASE}/exam/submitted`, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    });

    if (!res.ok) {
      throw new Error("Failed to fetch submissions");
    }

    const submissions = await res.json();

    if (!Array.isArray(submissions) || submissions.length === 0) {
      list.innerHTML = "<p class='placeholder'>No exams have been submitted yet.</p>";
      return;
    }

    list.innerHTML = "";

    submissions.forEach(sub => {
      const submittedAt = new Date(sub.submitted_at).toLocaleString();
      const div = document.createElement("div");
      div.className = "exam-item";
      div.innerHTML = `
        <div>
          <strong>${sub.exam_title || "Untitled Exam"}</strong>
          <p>Student: ${sub.student_username}</p>
          <p><small>Submitted: ${submittedAt}</small></p>
          <p><small>Unusual Detections: ${sub.unusual_count || 0}</small></p>
        </div>
        <div>
          <button 
            class="btn-view" 
            onclick="viewAnswers(${sub.exam_id}, ${sub.student_id})">
            📝 View Answers
          </button>
        </div>
      `;
      list.appendChild(div);
    });

  } catch (err) {
    console.error("Error loading submissions:", err);
    list.innerHTML = `<p class="placeholder" style="color:red;">
      Failed to load submissions.
    </p>`;
  }
}