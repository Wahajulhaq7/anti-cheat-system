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
    // Update: Handle icon + text structure if element exists
    if (usernameEl && username) {
        usernameEl.innerHTML = `<i class="fa-solid fa-user"></i> ${username}`;
    }
    loadSubmittedExams();
};

// Fetch and render submitted exams
async function loadSubmittedExams() {
    // UPDATED: Select by the new ID used in the HTML
    const tbody = document.getElementById("submissionsBody");
    tbody.innerHTML = "<tr><td colspan='4' class='placeholder'>Loading submitted exams...</td></tr>";

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
            tbody.innerHTML = "<tr><td colspan='4' class='placeholder'>No exams have been submitted yet.</td></tr>";
            return;
        }

        tbody.innerHTML = "";

        submissions.forEach(sub => {
            const submittedAt = new Date(sub.submitted_at).toLocaleString();
            const tr = document.createElement("tr");
            
            // UPDATED: Clean HTML structure (CSS handles styling now)
            tr.innerHTML = `
                <td>${sub.student_username}</td>
                <td>${sub.exam_title || "Untitled Exam"}</td>
                <td>${submittedAt}</td>
                <td>
                    <button 
                        class="btn-view" 
                        onclick="viewAnswers(${sub.exam_id}, ${sub.student_id})">
                        <i class="fa-solid fa-eye"></i> View Answers
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

    } catch (err) {
        console.error("Error loading submissions:", err);
        tbody.innerHTML = `<tr><td colspan='4' class='placeholder' style="color: #ef4444;">Failed to load submissions.</td></tr>`;
    }
}