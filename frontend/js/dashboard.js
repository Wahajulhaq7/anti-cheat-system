// frontend/js/dashboard.js

// Prevent non-admins from accessing dashboard
const role = localStorage.getItem("role");
if (!role) {
  window.location.href = "login.html";
} else if (role !== "admin") {
  alert("Access denied. Admins only.");
  window.location.href = "student.html";
}

// Logout function
function logout() {
  localStorage.clear();
  window.location.href = "login.html";
}

// Load all users on page load
window.onload = () => {
  loadUsers();
  loadDashboardStats(); 
};

// Toggle password visibility
function togglePassword(fieldId) {
  const field = document.getElementById(fieldId);
  const button = event.currentTarget;

  if (field.type === "password") {
    field.type = "text";
    button.textContent = "👁️";
  } else {
    field.type = "password";
    button.textContent = "👁️";
  }
}

// --- NEW: Load Dashboard Analytics ---
async function loadDashboardStats() {
    const token = localStorage.getItem("token");
    if (!token) return;

    try {
        const usersRes = await fetch("http://localhost:8000/auth/users/count/all", {
            headers: { "Authorization": `Bearer ${token}` }
        });
        if (usersRes.ok) {
            const data = await usersRes.json();
            const el = document.getElementById("totalUsersCount"); 
            if (el) el.textContent = data.count;
        }

        const examsRes = await fetch("http://localhost:8000/exam/count/all", {
            headers: { "Authorization": `Bearer ${token}` }
        });
        if (examsRes.ok) {
            const data = await examsRes.json();
            const el = document.getElementById("totalExamsCount");
            if (el) el.textContent = data.count;
        }

        const susRes = await fetch("http://localhost:8000/monitor/suspicious-images/count", {
            headers: { "Authorization": `Bearer ${token}` }
        });
        if (susRes.ok) {
            const data = await susRes.json();
            const el = document.getElementById("suspiciousCount");
            if (el) el.textContent = data.count;
        }

    } catch (err) {
        console.error("Failed to load dashboard stats:", err);
    }
}

// Fetch and display all users
async function loadUsers() {
  try {
    const token = localStorage.getItem("token");
    if (!token) {
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
      alert("Session expired. Please log in again.");
      logout();
      return;
    }

    if (res.status === 403) {
      alert("Access denied. Admins only.");
      window.location.href = "student.html";
      return;
    }

    if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`);

    const users = await res.json();
    const tbody = document.querySelector("#usersTable tbody");
    tbody.innerHTML = "";

    users.forEach(user => {
      const tr = document.createElement("tr");
      const displayRole = user.role.charAt(0).toUpperCase() + user.role.slice(1);
      
      tr.innerHTML = `
        <td>${user.id}</td>
        <td>${user.username}</td>
        <td class="role-cell" data-role="${user.role}">${displayRole}</td>
        <td>
          <button class="btn-edit" onclick="openEditModal(${user.id}, this)">Edit</button>
          <button class="btn-delete" onclick="deleteUser(${user.id})">Delete</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error("Load users error:", err);
    alert("❌ Failed to load users.");
  }
}

// Add new user
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
      loadUsers();
    } else {
      const err = await res.json();
      alert("❌ " + (err.detail || "Failed to create user"));
    }
  } catch (err) {
    console.error("Create error:", err);
    alert("❌ Server connection failed");
  }
}

// Edit User Modal Variables
let currentUserID = null;
let originalUsername = "";
let originalRole = "";

function openEditModal(userId, button) {
  currentUserID = userId;
  const row = button.closest("tr");
  originalUsername = row.cells[1].textContent;
  
  // Get raw role from data attribute
  originalRole = row.querySelector(".role-cell").getAttribute("data-role");

  document.getElementById("modalUsername").value = originalUsername;
  document.getElementById("modalRole").value = originalRole;
  document.getElementById("modalPassword").value = "";

  document.getElementById("editUserModal").style.display = "flex";
}

// Close modal
function closeModal() {
  document.getElementById("editUserModal").style.display = "none";
}

// Delete user (Logic handled in HTML via global vars for simplicity or can be here)
// Note: verify deleteUser calls in HTML match signatures here.

// ✅ PROCEED CLEANUP (Called from the Privacy Modal)
async function proceedCleanup() {
    // 1. Close Privacy Modal immediately
    closePrivacyModal();

    // 2. Show loading state on main button
    const btn = document.getElementById("btnTriggerCleanup");
    if (btn) {
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Cleaning...';
        btn.disabled = true;
    }

    try {
        const token = localStorage.getItem("token");
        const res = await fetch("http://localhost:8000/admin/privacy/cleanup", {
            method: "POST",
            headers: { "Authorization": `Bearer ${token}` }
        });

        const data = await res.json();
        
        if (res.ok) {
            // 3. Open Success Modal with Details
            openSuccessModal(`
                <strong>Privacy Purge Complete!</strong><br><br>
                Policy: Older than ${data.retention_policy}<br>
                Status: ${data.message}
            `);
            loadDashboardStats();
        } else {
            alert("❌ Cleanup failed: " + (data.detail || "Unknown error"));
        }
    } catch (err) {
        console.error(err);
        alert("❌ Network Error");
    } finally {
        // 4. Reset Button
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-broom"></i> Run Cleanup Now';
            btn.disabled = false;
        }
    }
}