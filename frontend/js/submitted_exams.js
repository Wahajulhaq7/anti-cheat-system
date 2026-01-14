// frontend/js/submitted_exams.js

const API_BASE = "http://localhost:8000";
const token = localStorage.getItem("token");
const role = localStorage.getItem("role");

// Global variable to store fetched data for filtering
let allSubmissions = [];

// Auth guard
if (!token || role !== "invigilator") {
    alert("Access denied");
    localStorage.clear();
    window.location.href = "login.html";
}

// Display username & Initialize
window.onload = () => {
    const username = localStorage.getItem("username");
    const usernameEl = document.getElementById("username");
    if (usernameEl && username) {
        usernameEl.innerHTML = `<i class="fa-solid fa-user"></i> ${username}`;
    }
    
    // Attach Event Listeners for Filters
    document.getElementById("searchInput").addEventListener("input", filterSubmissions);
    document.getElementById("dateInput").addEventListener("change", filterSubmissions);
    
    loadSubmittedExams();
};

// Fetch data once
async function loadSubmittedExams() {
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

        // Store data globally
        allSubmissions = submissions;

        // Initial Render
        renderTable(allSubmissions);

    } catch (err) {
        console.error("Error loading submissions:", err);
        tbody.innerHTML = `<tr><td colspan='4' class='placeholder' style="color: #ef4444;">Failed to load submissions.</td></tr>`;
    }
}

// Function to Render Table Rows
function renderTable(data) {
    const tbody = document.getElementById("submissionsBody");
    tbody.innerHTML = ""; // Clear existing

    if (data.length === 0) {
        tbody.innerHTML = "<tr><td colspan='4' class='placeholder'>No matching records found.</td></tr>";
        return;
    }

    data.forEach(sub => {
        const submittedAt = new Date(sub.submitted_at).toLocaleString();
        const tr = document.createElement("tr");
        
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
}

// Filter Logic
function filterSubmissions() {
    const searchTerm = document.getElementById("searchInput").value.toLowerCase();
    const dateValue = document.getElementById("dateInput").value; // YYYY-MM-DD format

    const filtered = allSubmissions.filter(sub => {
        // 1. Check Text (Student Name OR Exam Title)
        const studentName = sub.student_username.toLowerCase();
        const examTitle = (sub.exam_title || "").toLowerCase();
        const matchesText = studentName.includes(searchTerm) || examTitle.includes(searchTerm);

        // 2. Check Date (if selected)
        let matchesDate = true;
        if (dateValue) {
            // Extract YYYY-MM-DD from the submission timestamp
            const subDate = new Date(sub.submitted_at).toISOString().split('T')[0];
            matchesDate = subDate === dateValue;
        }

        return matchesText && matchesDate;
    });

    renderTable(filtered);
}

// Reset Logic
function resetFilters() {
    document.getElementById("searchInput").value = "";
    document.getElementById("dateInput").value = "";
    renderTable(allSubmissions);
}