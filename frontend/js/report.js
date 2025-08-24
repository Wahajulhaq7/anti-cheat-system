// frontend/js/report.js

// Prevent non-admins from accessing
const role = localStorage.getItem("role");
if (!role || role !== "admin") {
    alert("Access denied. Admins only.");
    window.location.href = "login.html";
}

// Load reports on page load
window.onload = () => {
    const reportsBody = document.getElementById("reportsBody");
    reportsBody.innerHTML = "<tr><td colspan='6'>Loading reports...</td></tr>";
    fetchReports();
};

// Fetch all students and their exams
async function fetchReports() {
    const token = localStorage.getItem("token");
    const reportsBody = document.getElementById("reportsBody");

    if (!token) {
        window.location.href = "login.html";
        return;
    }

    try {
        // Fetch all users (students)
        const usersRes = await fetch("http://localhost:8000/auth/users", {
            headers: { "Authorization": `Bearer ${token}` }
        });

        if (!usersRes.ok) throw new Error("Failed to load users");

        const users = await usersRes.json();
        const students = users.filter(u => u.role === "student");

        // Fetch all active exams
        const examsRes = await fetch("http://localhost:8000/exam/active", {
            headers: { "Authorization": `Bearer ${token}` }
        });

        if (!examsRes.ok) throw new Error("Failed to load exams");

        const exams = await examsRes.json();

        // Simulate exam attempts (in real app, this comes from DB)
        const studentExams = [];

        students.forEach(student => {
            exams.forEach(exam => {
                // Simulate that every student took every exam
                studentExams.push({
                    student_id: student.id,
                    student_name: student.username,
                    exam_id: exam.id,
                    exam_title: exam.title,
                    date: new Date().toLocaleDateString()
                });
            });
        });

        // Render table
        reportsBody.innerHTML = "";
        if (studentExams.length === 0) {
            reportsBody.innerHTML = "<tr><td colspan='6'>No exam records found</td></tr>";
            return;
        }

        studentExams.forEach(record => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${record.student_id}</td>
                <td>${record.student_name}</td>
                <td>${record.exam_id}</td>
                <td>${record.exam_title}</td>
                <td>${record.date}</td>
                <td>
                    <button class="btn-report" onclick="generateReport(${record.student_id}, ${record.exam_id})">
                        Generate Report
                    </button>
                </td>
            `;
            reportsBody.appendChild(tr);
        });

    } catch (err) {
        console.error("Fetch reports error:", err);
        reportsBody.innerHTML = `<tr><td colspan="6">❌ ${err.message}</td></tr>`;
    }
}

// Generate individual report (mock data)
async function generateReport(studentId, examId) {
    const token = localStorage.getItem("token");

    try {
        // In real app: fetch from /logs/report?user_id=1&exam_id=1
        const cheatingScore = Math.floor(Math.random() * 100);
        const movements = ["no_face", "sudden_movement", "multiple_faces"];
        const lastEvent = movements[Math.floor(Math.random() * movements.length)];

        alert(`📄 Report for Student ID: ${studentId}, Exam ID: ${examId}
        
        Cheating Score: ${cheatingScore}/100
        Suspicious Events: ${movements.join(", ")}
        Last Event: ${lastEvent}

        (In production, this data comes from the backend)`);
    } catch (err) {
        alert("❌ Failed to generate report");
    }
}

// Export all student exam data to CSV
function exportCSV() {
    const rows = [
        ["Student ID", "Student Name", "Exam ID", "Exam Title", "Date"]
    ];

    // Get all rows from table
    document.querySelectorAll("#reportsBody tr").forEach(tr => {
        const cells = tr.querySelectorAll("td");
        if (cells.length > 0) {
            const row = [];
            // Only push first 5 columns (skip Actions)
            for (let i = 0; i < 5; i++) {
                row.push(cells[i].textContent.trim());
            }
            rows.push(row);
        }
    });

    const csvContent = rows.map(row => row.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `student_exam_reports_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
}