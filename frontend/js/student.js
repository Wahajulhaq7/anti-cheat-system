// frontend/js/student.js

/**
 * Check authentication and redirect if not a student
 */
function checkAuth() {
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");

  if (!token) {
    window.location.href = "login.html";
    return false;
  }

  if (role !== "student") {
    alert("Access denied. Students only.");
    localStorage.clear();
    window.location.href = "login.html";
    return false;
  }

  return true;
}

/**
 * Display logged-in username in navbar
 */
function displayUsername() {
  const username = localStorage.getItem("username");
  const usernameSpan = document.getElementById("username");
  if (username && usernameSpan) {
    usernameSpan.innerHTML = `<i class="fa-solid fa-user-graduate"></i> ${username}`;
  }
}

/**
 * Load student results (Updated for Table Layout)
 */
async function loadResults() {
  const user_id = localStorage.getItem("user_id");
  const token = localStorage.getItem("token");
  const tbody = document.getElementById("resultsBody");
  
  if (!tbody) return;

  if (!user_id) {
    tbody.innerHTML = "<tr><td colspan='5' class='placeholder'>User ID missing — please log in again.</td></tr>";
    return;
  }

  try {
    const res = await fetch(`http://localhost:8000/log/report/user/${user_id}`, {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });

    if (!res.ok) {
      tbody.innerHTML = "<tr><td colspan='5' class='placeholder'>Failed to load results.</td></tr>";
      return;
    }

    const reports = await res.json();

    if (reports.length === 0) {
      tbody.innerHTML = "<tr><td colspan='5' class='placeholder'>No exam results found.</td></tr>";
      return;
    }

    // Render Table Rows
    tbody.innerHTML = reports.map(r => {
      const scorePercent = r.total_answered > 0 
        ? ((r.correct_count / r.total_answered) * 100).toFixed(1) 
        : 0;
      
      const statusClass = r.movement_count > 5 ? "alert" : "success";
      const statusText = r.movement_count > 5 ? "Suspicious" : "Clean";
      const iconClass = r.movement_count > 5 ? "fa-circle-exclamation" : "fa-check-circle";

      return `
        <tr>
          <td>
            <div style="display: flex; align-items: center; gap: 10px;">
              <i class="fa-solid fa-file-lines" style="color: #a855f7; font-size: 18px;"></i>
              <strong>${r.exam_title}</strong>
            </div>
          </td>
          <td>#${r.exam_id}</td>
          <td>
            <span style="font-weight: bold; color: white;">${r.correct_count}/${r.total_answered}</span> 
            <span style="color: #a0aec0; font-size: 12px;">(${scorePercent}%)</span>
          </td>
          <td>${r.movement_count}</td>
          <td>
            <span class="status ${statusClass}">
              <i class="fa-solid ${iconClass}"></i> ${statusText}
            </span>
          </td>
        </tr>
      `;
    }).join("");

  } catch (err) {
    console.error("Error loading results:", err);
    tbody.innerHTML = "<tr><td colspan='5' class='placeholder'>Network error. Could not load results.</td></tr>";
  }
}

/**
 * Logout
 */
function logout() {
  localStorage.clear();
  window.location.href = "login.html";
}

/**
 * Page-specific initialization
 */
window.onload = () => {
  if (!checkAuth()) return;
  displayUsername();
  
  // Call loadResults only if on student.html (results page)
  if (document.getElementById("resultsBody")) {
    loadResults();
  }
};