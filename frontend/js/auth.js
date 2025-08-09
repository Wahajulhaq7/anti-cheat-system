// frontend/js/auth.js

/**
 * Auto-redirect based on login state
 * Ensures user goes to correct page: login, dashboard, or student
 */
window.onload = () => {
  // Don't run redirect if on exam.html (proctoring in progress)
  if (window.location.pathname.includes("exam.html")) {
    return;
  }

  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");
  const path = window.location.pathname;

  // Normalize path checks
  const isLogin = path.includes("login.html");
  const isDashboard = path.includes("dashboard.html");
  const isStudent = path.includes("student.html");

  if (token) {
    // Logged in
    if (role === "admin" && !isDashboard) {
      console.log("Redirecting admin to dashboard.html");
      window.location.href = "dashboard.html";
    } else if (role === "student" && !isStudent) {
      console.log("Redirecting student to student.html");
      // Clear any old exam ID
      localStorage.removeItem("current_exam_id");
      window.location.href = "student.html";
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

  try {
    const res = await fetch("http://localhost:8000/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    if (res.ok) {
      const data = await res.json();

      // Save to localStorage
      localStorage.setItem("token", data.access_token);
      localStorage.setItem("username", username);
      localStorage.setItem("user_id", data.id);
      localStorage.setItem("role", data.role);

      // Redirect based on role
      if (data.role === 'admin') {
        console.log("Login success: Redirecting to dashboard.html");
        window.location.href = "dashboard.html";
      } else if (data.role === 'student') {
        console.log("Login success: Redirecting to student.html");
        window.location.href = "student.html";
      } else {
        // Unknown role → log out
        localStorage.clear();
        alert("Access denied: Unknown role");
        window.location.href = "login.html";
      }
    } else {
      const errData = await res.json();
      error.textContent = errData.detail || "Invalid credentials";
    }
  } catch (err) {
    console.error("Login error:", err);
    error.textContent = "Server connection failed. Is the backend running?";
  }
});