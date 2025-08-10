// frontend/js/auth.js

/**
 * Auto-redirect based on login state
 * Ensures user goes to correct page: login, dashboard, student, or invigilator
 */
window.onload = () => {
  // Don't run redirect if on exam.html (proctoring in progress)
  if (window.location.pathname.includes("exam.html")) {
    return;
  }

  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role")?.toLowerCase()?.trim();
  const path = window.location.pathname;

  // Normalize path checks
  const isLogin = path.includes("login.html");
  const isDashboard = path.includes("dashboard.html");
  const isStudent = path.includes("student.html");
  const isInvigilator = path.includes("invigilator.html");

  if (token) {
    // Logged in → redirect based on role
    if (role === "admin" && !isDashboard) {
      console.log("Redirecting admin to dashboard.html");
      window.location.href = "dashboard.html";
    } else if (role === "student" && !isStudent) {
      console.log("Redirecting student to student.html");
      localStorage.removeItem("current_exam_id");
      window.location.href = "student.html";
    } else if (role === "invigilator" && !isInvigilator) {
      console.log("Redirecting invigilator to invigilator.html");
      window.location.href = "invigilator.html";
    }
  } else {
    // Not logged in → must be on login page
    if (!isLogin) {
      console.log("No token → redirecting to login.html");
      window.location.href = "login.html";
    }
  }
};

/**
 * Handle login form submission
 */
document.getElementById("loginForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const username = document.getElementById("username")?.value.trim();
  const password = document.getElementById("password")?.value;
  const error = document.getElementById("error");

  // Validate input
  if (!username || !password) {
    error.textContent = "Please enter both username and password";
    return;
  }

  // Clear previous error
  error.textContent = "";

  // frontend/js/auth.js

const API_BASE = "http://localhost:8000"; // Base URL without specific endpoints
const LOGIN_URL = `${API_BASE}/auth/login`; // Correctly builds /auth/login

document.getElementById("loginForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const username = document.getElementById("username")?.value.trim();
  const password = document.getElementById("password")?.value;
  const error = document.getElementById("error");

  if (!username || !password) {
    error.textContent = "Please enter both username and password";
    return;
  }

  error.textContent = "";

  try {
    console.log("Attempting login with:", { username });

    const res = await fetch(LOGIN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ username, password })
    });

    if (!res.ok) {
      const errData = await res.json();
      error.textContent = errData.detail || "Invalid credentials";
      return;
    }

    const data = await res.json();
    console.log("Login response:", data);

    const role = data.role?.toLowerCase()?.trim();
    const validRoles = ['admin', 'student', 'invigilator'];

    if (!role || !validRoles.includes(role)) {
      throw new Error("Invalid or missing role");
    }

    localStorage.setItem("token", data.access_token);
    localStorage.setItem("username", username);
    localStorage.setItem("user_id", data.id);
    localStorage.setItem("role", role);

    if (role === 'admin') {
      window.location.href = "dashboard.html";
    } else if (role === 'student') {
      window.location.href = "student.html";
    } else if (role === 'invigilator') {
      window.location.href = "invigilator.html";
    }
  } catch (err) {
    console.error("Login error:", err);
    localStorage.clear();
    alert("Access denied: Unknown role or server error. Please contact admin.");
    window.location.href = "login.html";
  }
}
)
});