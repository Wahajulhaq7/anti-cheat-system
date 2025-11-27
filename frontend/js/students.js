// frontend/js/students.js

// Check auth and role
function checkAuth() {
    const token = localStorage.getItem("token");
    const role = localStorage.getItem("role");

    if (!token || role !== "invigilator") {
        window.location.href = "login.html";
        return false;
    }
    return true;
}

// Load all students (role = student)
async function loadStudents() {
    try {
        const token = localStorage.getItem("token");
        const res = await fetch("http://localhost:8000/auth/users", {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        if (!res.ok) {
            throw new Error("Failed to load users");
        }

        const users = await res.json();
        const students = users.filter(user => user.role === "student");
        const tbody = document.querySelector("#studentsTable tbody");
        tbody.innerHTML = "";

        document.getElementById("totalStudents").textContent = students.length;

        if (students.length === 0) {
            // Updated colspan to 3 (ID, Username, Role)
            tbody.innerHTML = '<tr><td colspan="3" class="placeholder">No students found</td></tr>';
            return;
        }

        students.forEach(student => {
            const tr = document.createElement("tr");
            // Updated rows: Removed the Action/Delete column
            tr.innerHTML = `
                <td>${student.id}</td>
                <td>${student.username}</td>
                <td>${student.role}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error("Load students error:", err);
        // Updated colspan to 3
        document.querySelector("#studentsTable tbody").innerHTML = 
            '<tr><td colspan="3" class="placeholder">Failed to load students</td></tr>';
    }
}

// Navigate back to invigilator dashboard
function goBack() {
    window.location.href = "invigilator.html";
}

// On load
window.onload = () => {
    if (checkAuth()) {
        loadStudents();
    }
};