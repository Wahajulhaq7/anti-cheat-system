/**
 * =========================
 * AUTH.JS
 * Updated to match FastAPI /auth/login endpoint
 * =========================
 */

/**
 * Auto-redirect based on login state
 */
window.onload = () => {
  const path = window.location.pathname.toLowerCase();

  // Skip redirect if on any exam page
  if (path.includes("exam")) return;

  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role")?.toLowerCase()?.trim();

  const isLogin = path.includes("login.html");
  const isDashboard = path.includes("dashboard.html");
  const isStudent = path.includes("student.html");
  const isInvigilator = path.includes("invigilator.html");

  if (token) {
    // Logged in → redirect based on role
    if (role === "admin" && !isDashboard) {
      window.location.href = "dashboard.html";
    } else if (role === "student" && !isStudent) {
      localStorage.removeItem("current_exam_id");
      window.location.href = "student.html";
    } else if (role === "invigilator" && !isInvigilator) {
      window.location.href = "invigilator.html";
    }
  } else {
    // Not logged in → must be on login page
    if (!isLogin) {
      window.location.href = "login.html";
    }
  }
};

/**
 * Handle login form submission
 */
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const username = document.getElementById("username")?.value.trim();
    const password = document.getElementById("password")?.value;
    const error = document.getElementById("error");

    if (!username || !password) {
      error.textContent = "Please enter both username and password";
      error.style.display = "block";
      return;
    }

    error.textContent = "";
    error.style.display = "none";

    const API_BASE = "http://localhost:8000";
    const LOGIN_URL = `${API_BASE}/auth/login`;

    try {
      console.log("Attempting login with:", { username });

      const res = await fetch(LOGIN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({ username, password })
      });

      console.log("Login response status:", res.status);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        error.textContent = errData.detail || "Invalid credentials";
        error.style.display = "block";
        return;
      }

      const data = await res.json();
      console.log("Login response data:", data);

      const role = data.role?.toLowerCase()?.trim();
      const validRoles = ["admin", "student", "invigilator"];

      if (!role || !validRoles.includes(role)) {
        throw new Error(`Invalid or missing role: '${role}'`);
      }

      // Save session
      localStorage.setItem("token", data.access_token);
      localStorage.setItem("username", username);
      localStorage.setItem("user_id", data.id);
      localStorage.setItem("role", role);

      // Redirect based on role
      const redirectMap = {
        admin: "dashboard.html",
        student: "student.html",
        invigilator: "invigilator.html"
      };

      // Student-specific cleanup
      if (role === "student") {
        localStorage.removeItem("current_exam_id");
      }

      window.location.href = redirectMap[role] || "login.html";

    } catch (err) {
      console.error("🔐 Login error:", err);
      localStorage.clear();
      alert(
        "Login failed. " +
        (err.message.includes("Invalid or missing role")
          ? "User role not recognized. Contact admin."
          : "Check your connection or try again.")
      );
      window.location.href = "login.html";
    }
  });
});
