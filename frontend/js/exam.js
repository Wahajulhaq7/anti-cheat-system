// frontend/js/exam.js
window.onload = () => {
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");

  // Block access if not logged in
  if (!token) {
    alert("Please log in first");
    window.location.href = "login.html";
    return;
  }

  // Block non-students
  if (role !== "student") {
    alert("Access denied");
    window.location.href = "dashboard.html";
    return;
  }

  // Start webcam, screen sharing, etc.
  startExamProctoring();
};
// Capture webcam and screen
async function startExam() {
  const user_id = localStorage.getItem("user_id");
  const exam_id = 1; // from exam selection

  const webcam = await navigator.mediaDevices.getUserMedia({ video: true });
  const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });

  document.getElementById("webcam").srcObject = webcam;
  document.getElementById("screen").srcObject = screen;

  // Send video frames every 2 seconds
  setInterval(() => {
    const video = document.getElementById("webcam");
    const canvas = document.createElement("canvas");
    canvas.width = video.width; canvas.height = video.height;
    canvas.getContext("2d").drawImage(video, 0, 0);
    canvas.toBlob(async (blob) => {
      const fd = new FormData();
      fd.append("frame", blob, "frame.jpg");
      fd.append("user_id", user_id);
      fd.append("exam_id", exam_id);
      await fetch("http://localhost:8000/video/feed", {
        method: "POST",
        body: fd
      });
    });
  }, 2000);

  // Monitor screen metadata
  setInterval(() => {
    fetch("http://localhost:8000/log/screen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id,
        exam_id,
        app_name: navigator.userAgent,
        tab_title: document.title
      })
    });
  }, 5000);
}