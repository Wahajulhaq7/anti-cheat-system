document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const userId = params.get("user_id") || "";
  const username = params.get("username") || "";

  // Display info
  document.getElementById("studentName").textContent = `Student: ${username || userId || "Unknown"}`;
  document.getElementById("examTitle").textContent = `Exam: ${params.get("exam_title") || params.get("exam_id") || "Unknown"}`;

  // Back button — always go to invigilator.html in SAME folder
  document.getElementById("backBtn").addEventListener("click", () => {
    // If file is in same folder:
    window.location.href = `invigilator.html?user_id=${encodeURIComponent(userId)}&username=${encodeURIComponent(username)}`;
    // If invigilator.html is in parent folder, change to:
    // window.location.href = `../invigilator.html?user_id=...`
  });

  // --------------------------
  // Live monitoring logic...
  // --------------------------
  const API_BASE = "http://localhost:8000";
  const liveImage = document.getElementById("liveImage");
  const detectionList = document.getElementById("detectionList");

  const feedInfo = document.createElement("p");
  feedInfo.id = "feedInfo";
  feedInfo.style.fontSize = "0.9rem";
  feedInfo.style.color = "#555";
  liveImage.insertAdjacentElement("afterend", feedInfo);

  async function fetchLiveImage() {
    try {
      const res = await fetch(`${API_BASE}/monitor/latest-frame?user_id=${encodeURIComponent(userId)}&exam_id=${encodeURIComponent(params.get("exam_id") || "")}`);
      if (!res.ok) throw new Error("Failed to fetch latest frame");
      const data = await res.json();

      if (data.frame_image_path) {
        liveImage.src = `${API_BASE}/${data.frame_image_path}`;
        feedInfo.textContent = `Last update: ${data.timestamp} — Status: ${data.movement_type || "unknown"}`;
      } else {
        liveImage.alt = "No live feed available";
        feedInfo.textContent = "No recent frames captured";
      }
    } catch (err) {
      console.error(err);
      feedInfo.textContent = "⚠ Unable to load feed";
    }
  }

  async function fetchDetections() {
    try {
      const res = await fetch(`${API_BASE}/monitor/unusual-detections`);
      if (!res.ok) throw new Error("Failed to fetch detections");

      const detections = await res.json();
      const filtered = detections.filter(d => String(d.user_id) === userId && String(d.exam_id) === params.get("exam_id"));

      detectionList.innerHTML = "";
      if (filtered.length === 0) {
        detectionList.innerHTML = "<li>No unusual detections.</li>";
      } else {
        filtered.forEach(det => {
          const li = document.createElement("li");
          li.textContent = `[${det.timestamp}] ${det.movement_type}`;
          detectionList.appendChild(li);
        });
      }
    } catch (err) {
      console.error(err);
    }
  }

  // Initial and polling
  fetchLiveImage();
  fetchDetections();
  setInterval(fetchLiveImage, 5000);
  setInterval(fetchDetections, 5000);
});
