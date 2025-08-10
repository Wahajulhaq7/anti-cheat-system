// frontend/js/dashboard.js

// ✅ Prevent non-admins from accessing dashboard
const role = localStorage.getItem("role");
if (!role) {
  window.location.href = "login.html";
} else if (role !== "admin") {
  alert("Access denied. Admins only.");
  window.location.href = "student.html";
}

// ✅ Logout function
function logout() {
  localStorage.clear();
  window.location.href = "login.html";
}

// ✅ Load all users on page load
window.onload = () => {
  loadUsers();
};

// Helper: Create role dropdown
function createRoleSelect(currentRole) {
  const roles = ['student', 'admin', 'invigilator'];
  return `
    <select data-field="role">
      ${roles.map(r => `
        <option value="${r}" ${currentRole.toLowerCase() === r ? 'selected' : ''}>
          ${r.charAt(0).toUpperCase() + r.slice(1)}
        </option>
      `).join('')}
    </select>
  `;
}

// ✅ Fetch and display all users
async function loadUsers() {
  try {
    const token = localStorage.getItem("token");
    if (!token) {
      console.warn("No token found. Redirecting to login.");
      window.location.href = "login.html";
      return;
    }

    const res = await fetch("http://localhost:8000/auth/users", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    });

    if (res.status === 401) {
      console.error("401 Unauthorized: Invalid or expired token");
      alert("Session expired. Please log in again.");
      logout();
      return;
    }

    if (res.status === 403) {
      alert("Access denied. Admins only.");
      window.location.href = "student.html";
      return;
    }

    if (!res.ok) {
      throw new Error(`HTTP error! Status: ${res.status}`);
    }

    const users = await res.json();
    const tbody = document.querySelector("#usersTable tbody");
    tbody.innerHTML = "";

    users.forEach(user => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${user.id}</td>
        <td>${user.username}</td>
        <td>${createRoleSelect(user.role)}</td>
        <td>
          <button class="btn-edit" onclick="openEditModal(${user.id}, this)">Edit</button>
          <button class="btn-delete" onclick="deleteUser(${user.id})">Delete</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error("Load users error:", err);
    if (err.message.includes("Failed to fetch")) {
      alert("❌ Network error: Unable to reach server. Is the backend running?");
    } else {
      alert("❌ Failed to load users");
    }
  }
}

// ✅ Add new user
async function addUser() {
  const username = document.getElementById("newUsername").value.trim();
  const password = document.getElementById("newPassword").value;
  const role = document.getElementById("newRole").value;

  if (!username || !password) {
    alert("Username and password are required");
    return;
  }

  try {
    const token = localStorage.getItem("token");
    const res = await fetch("http://localhost:8000/auth/register", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ username, password, role })
    });

    if (res.status === 401) {
      alert("Session expired. Please log in again.");
      logout();
      return;
    }

    if (res.ok) {
      alert("✅ User created!");
      document.getElementById("newUsername").value = "";
      document.getElementById("newPassword").value = "";
      loadUsers(); // Refresh list
    } else {
      const err = await res.json();
      alert("❌ " + (err.detail || "Failed to create user"));
    }
  } catch (err) {
    console.error("Create error:", err);
    alert("❌ Server connection failed");
  }
}

// ✅ Edit User Modal
let currentUserID = null;
let originalUsername = "";
let originalRole = "";

function openEditModal(userId, button) {
  currentUserID = userId;
  const row = button.closest("tr");
  originalUsername = row.cells[1].textContent;
  originalRole = row.querySelector("select").value;

  document.getElementById("modalUsername").value = originalUsername;
  document.getElementById("modalRole").value = originalRole;
  document.getElementById("modalPassword").value = "";

  document.getElementById("editUserModal").style.display = "flex";
}

// ✅ Save user (only send changed fields)
async function saveUserFromModal() {
  const username = document.getElementById("modalUsername").value.trim();
  const role = document.getElementById("modalRole").value;
  const password = document.getElementById("modalPassword").value;

  if (!username) {
    alert("Username is required");
    return;
  }

  const payload = {};
  if (username !== originalUsername) payload.username = username;
  if (role !== originalRole) payload.role = role;
  if (password) payload.password = password;

  if (Object.keys(payload).length === 0) {
    closeModal();
    return;
  }

  try {
    const token = localStorage.getItem("token");
    const res = await fetch(`http://localhost:8000/auth/users/${currentUserID}`, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (res.status === 401) {
      alert("Session expired. Please log in again.");
      logout();
      return;
    }

    if (res.ok) {
      alert("✅ User updated!");
      loadUsers();
      closeModal();
    } else {
      const err = await res.json();
      alert("❌ " + (err.detail || "Update failed"));
    }
  } catch (err) {
    console.error("Update error:", err);
    alert("❌ Network error");
  }
}

// ✅ Close modal
function closeModal() {
  document.getElementById("editUserModal").style.display = "none";
}

// ✅ Delete user
async function deleteUser(userId) {
  if (!confirm("Are you sure you want to delete this user?")) return;

  try {
    const token = localStorage.getItem("token");
    const res = await fetch(`http://localhost:8000/auth/users/${userId}`, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });

    if (res.status === 401) {
      alert("Session expired. Please log in again.");
      logout();
      return;
    }

    if (res.ok) {
      alert("✅ User deleted!");
      loadUsers();
    } else {
      const err = await res.json();
      alert("❌ " + (err.detail || "Delete failed"));
    }
  } catch (err) {
    console.error("Delete error:", err);
    alert("❌ Network error");
  }
}

// ✅ Create exam
async function createExam() {
  const title = document.getElementById("examTitle").value.trim();
  const user_id = localStorage.getItem("user_id");

  if (!title) {
    alert("Exam title is required");
    return;
  }

  try {
    const token = localStorage.getItem("token");
    const res = await fetch("http://localhost:8000/exam/create", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ title, user_id: parseInt(user_id) })
    });

    if (res.status === 401) {
      alert("Session expired. Please log in again.");
      logout();
      return;
    }

    if (res.ok) {
      alert("✅ Exam created!");
      document.getElementById("examTitle").value = "";
    } else {
      alert("❌ Failed to create exam");
    }
  } catch (err) {
    alert("❌ Server connection failed");
  }
}