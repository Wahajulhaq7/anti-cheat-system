// frontend/js/students.js

// Check auth and role
function checkAuth() {
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");
  const username = localStorage.getItem("username");

  if (!token || role !== "invigilator") {
    window.location.href = "login.html";
    return false;
  }

  document.getElementById("username").textContent = username;
  return true;
}

// Load all students (role = student)
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
      tbody.innerHTML = '<tr><td colspan="4" class="placeholder">No students found</td></tr>';
      return;
    }

    students.forEach(student => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${student.id}</td>
        <td>${student.username}</td>
        <td>${student.role}</td>
        <td>
          <button class="action-btn btn-delete" onclick="deleteStudent(${student.id}, '${student.username}')">
            Delete
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error("Load students error:", err);
    document.querySelector("#studentsTable tbody").innerHTML = 
      '<tr><td colspan="4" class="placeholder">Failed to load students</td></tr>';
  }
}
// Delete a student
async function deleteStudent(userId, username) {
  if (!confirm(`Delete student '${username}'? This action cannot be undone.`)) {
    return;
  }

  try {
    const token = localStorage.getItem("token");
    const res = await fetch(`http://localhost:8000/auth/users/${userId}`, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });

    if (res.ok) {
      alert(`✅ Student '${username}' deleted successfully!`);
      loadStudents(); // Refresh list
    } else {
      const data = await res.json();
      alert("❌ " + (data.detail || "Failed to delete student"));
    }
  } catch (err) {
    console.error("Delete error:", err);
    alert("❌ Network error");
  }
}
// Navigate back to invigilator dashboard
function goBack() {
  window.location.href = "invigilator.html";
}
// Logout
function logout() {
  localStorage.clear();
  window.location.href = "login.html";
}

// On load
window.onload = () => {
  if (checkAuth()) {
    loadStudents();
  }
};