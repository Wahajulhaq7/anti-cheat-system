// frontend/js/manage_adminexam.js

// ✅ Auth guard using localStorage
const token = localStorage.getItem("token");
const role = localStorage.getItem("role");

if (!token) {
    window.location.href = "login.html";
} else if (role !== "admin") {
    alert("Access denied — admin role required");
    window.location.href = "login.html";
}

// DOM Loaded
document.addEventListener("DOMContentLoaded", () => {
    fetchExams(); // Load exams on page load
});

// ✅ Fetch and render all exams
async function fetchExams() {
    const examTableBody = document.getElementById("examTableBody");
    const API_BASE = "http://localhost:8000/exam";
    const authHeaders = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
    };

    try {
        const res = await fetch(`${API_BASE}/admin/list`, { headers: authHeaders });

        if (!res.ok) {
            if (res.status === 401) {
                localStorage.removeItem("token");
                localStorage.removeItem("role");
                window.location.href = "login.html";
                return;
            }
            if (res.status === 403) {
                examTableBody.innerHTML = `<tr><td colspan="5">Access denied</td></tr>`;
                return;
            }
            throw new Error(await res.text() || "Failed to fetch exams");
        }

        const exams = await res.json();
        renderExamTable(exams);
    } catch (err) {
        console.error("Fetch exams error:", err);
        examTableBody.innerHTML = `<tr><td colspan="5">Failed to load exams</td></tr>`;
    }
}

// ✅ Render exams in table
function renderExamTable(exams) {
    const examTableBody = document.getElementById("examTableBody");
    examTableBody.innerHTML = ""; // Clear existing

    if (!Array.isArray(exams) || exams.length === 0) {
        examTableBody.innerHTML = `<tr><td colspan="5">No exams found</td></tr>`;
        return;
    }

    exams.forEach(exam => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${exam.title || "Untitled"}</td>
            <td>${exam.username || "Unknown"}</td>
            <td>${exam.created_at ? new Date(exam.created_at).toLocaleDateString() : "N/A"}</td>
            <td><span class="status ${exam.status?.toLowerCase() || 'n-a'}">${exam.status || "N/A"}</span></td>
            <td class="actions">
                <button class="btn-view" onclick="viewExam(${exam.id})">View</button>
            </td>
        `;
        examTableBody.appendChild(row);
    });
}

// ✅ View Exam
function viewExam(examId) {
    if (!examId) return;
    window.location.href = `exam_detail.html?id=${examId}`;
}

// ✅ Logout
function logout() {
    if (confirm("Are you sure you want to log out?")) {
        localStorage.clear();
        window.location.href = "login.html";
    }
}