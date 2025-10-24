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
  const tbody = document.querySelector("#submissionsList tbody");
  tbody.innerHTML = "<tr><td colspan='4' class='text-center py-4'>Loading submitted exams...</td></tr>";

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
      tbody.innerHTML = "<tr><td colspan='4' class='text-center py-4'>No exams have been submitted yet.</td></tr>";
      return;
    }

    tbody.innerHTML = "";

    submissions.forEach(sub => {
      const submittedAt = new Date(sub.submitted_at).toLocaleString();
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="px-5 py-5 border-b border-gray-200 bg-white text-sm">
          <p class="text-gray-900 whitespace-no-wrap">${sub.student_username}</p>
        </td>
        <td class="px-5 py-5 border-b border-gray-200 bg-white text-sm">
          <p class="text-gray-900 whitespace-no-wrap">${sub.exam_title || "Untitled Exam"}</p>
        </td>
        <td class="px-5 py-5 border-b border-gray-200 bg-white text-sm">
          <p class="text-gray-900 whitespace-no-wrap">${submittedAt}</p>
        </td>
        <td class="px-5 py-5 border-b border-gray-200 bg-white text-sm">
          <button 
            class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded" 
            onclick="viewAnswers(${sub.exam_id}, ${sub.student_id})">
            📝 View Answers
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });

  } catch (err) {
    console.error("Error loading submissions:", err);
    tbody.innerHTML = `<tr><td colspan='4' class='text-center py-4 text-red-500'>Failed to load submissions.</td></tr>`;
  }
}