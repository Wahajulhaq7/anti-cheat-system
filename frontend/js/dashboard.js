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

// ✅ Fetch and display all users
// frontend/js/dashboard.js

async function loadUsers() {
  try {
    const res = await fetch("http://localhost:8000/auth/users");
    if (res.ok) {
      const users = await res.json();
      const tbody = document.querySelector("#usersTable tbody");
      tbody.innerHTML = "";

      users.forEach(user => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${user.id}</td> <!-- Ensure id is correctly bound -->
          <td><input type="text" value="${user.username}" data-field="username" /></td>
          <td>
            <select data-field="role">
              <option value="student" ${user.role === 'student' ? 'selected' : ''}>Student</option>
              <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
            </select>
          </td>
          <td>
            <button onclick="openEditModal(${user.id}, this)">Edit</button>
            <button onclick="deleteUser(${user.id})">Delete</button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }
  } catch (err) {
    console.error("Failed to load users:", err);
  }
}
// ✅ Add new user
async function addUser() {
  const username = document.getElementById("newUsername").value;
  const password = document.getElementById("newPassword").value;
  const role = document.getElementById("newRole").value;

  if (!username || !password) {
    alert("Username and password required");
    return;
  }

  const res = await fetch("http://localhost:8000/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, role })
  });

  if (res.ok) {
    alert("✅ User created!");
    document.getElementById("newUsername").value = "";
    document.getElementById("newPassword").value = "";
    loadUsers(); // Refresh list
  } else {
    const err = await res.json();
    alert("❌ " + err.detail);
  }
}

// ✅ Open edit modal
let currentUserID = null;

// frontend/js/dashboard.js

function openEditModal(user_id, button) {
  currentUserID = user_id;
  const tr = button.closest("tr");
  const username = tr.querySelector('[data-field="username"]').value;
  const role = tr.querySelector('[data-field="role"]').value;

  console.log("Opening edit modal for user:", { user_id, username, role });

  document.getElementById("modalUsername").value = username;
  document.getElementById("modalRole").value = role;
  document.getElementById("modalPassword").value = "";

  document.getElementById("editUserModal").style.display = "flex";
}

async function saveUserFromModal() {
  const username = document.getElementById("modalUsername").value.trim();
  const role = document.getElementById("modalRole").value;
  const password = document.getElementById("modalPassword").value;

  console.log("Updating user:", { user_id: currentUserID, username, role, password });

  const res = await fetch(`http://localhost:8000/auth/users/${currentUserID}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, role, ...(password && { password }) })
  });

  if (res.ok) {
    alert("✅ User updated successfully!");
    closeModal();
    loadUsers(); // Refresh list
  } else {
    const err = await res.json();
    console.error("❌ Update failed:", err);
    alert("❌ " + (err.detail || "Failed to update user"));
  }
}function closeModal() {
  document.getElementById("editUserModal").style.display = "none";
}

// ✅ Delete user
async function deleteUser(user_id) {
  if (!confirm("Are you sure you want to delete this user?")) return;

  const res = await fetch(`http://localhost:8000/auth/users/${user_id}`, {
    method: "DELETE"
  });

  if (res.ok) {
    alert("✅ User deleted!");
    loadUsers(); // Refresh list
  } else {
    const err = await res.json();
    alert("❌ " + err.detail);
  }
}

// ✅ Create exam
async function createExam() {
  const title = document.getElementById("examTitle").value;
  const user_id = localStorage.getItem("user_id");

  try {
    const res = await fetch("http://localhost:8000/exam/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, user_id: parseInt(user_id) })
    });

    if (res.ok) {
      alert("✅ Exam created!");
    } else {
      alert("❌ Failed to create exam");
    }
  } catch (err) {
    alert("❌ Server connection failed");
  }
}