// frontend/js/students.js

let allStudents = []; // Store students globally for search

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
        // Filter only students
        allStudents = users.filter(user => user.role === "student");
        
        // Initial Render
        renderTable(allStudents);

    } catch (err) {
        console.error("Load students error:", err);
        document.querySelector("#studentsTable tbody").innerHTML = 
            '<tr><td colspan="3" class="placeholder">Failed to load students</td></tr>';
    }
}

// ✅ Search Function
function filterStudents() {
    const query = document.getElementById("searchInput").value.toLowerCase();
    
    const filtered = allStudents.filter(student => 
        student.username.toLowerCase().includes(query) || 
        student.id.toString().includes(query)
    );

    renderTable(filtered);
}

// ✅ Render Table Helper
function renderTable(data) {
    const tbody = document.querySelector("#studentsTable tbody");
    tbody.innerHTML = "";

    document.getElementById("totalStudents").textContent = data.length;

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="placeholder">No students found</td></tr>';
        return;
    }

    data.forEach(student => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${student.id}</td>
            <td>${student.username}</td>
            <td>${student.role}</td>
        `;
        tbody.appendChild(tr);
    });
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