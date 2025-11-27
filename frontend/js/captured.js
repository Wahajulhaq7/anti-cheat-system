// Admin-only access
const role = localStorage.getItem("role");
const token = localStorage.getItem("token");

if (!role || !token) {
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

// Keep track of loaded detections to avoid duplicates
let loadedDetections = new Set();

// Load detections on page load and then refresh periodically
window.onload = () => {
  loadDetections();
  setInterval(loadDetections, 5000); // refresh every 5 seconds
};

async function loadDetections() {
  try {
    const res = await fetch("http://localhost:8000/monitor/unusual-movements", {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    });

    if (!res.ok) {
      if (res.status === 403) alert("Access denied. Admins only.");
      throw new Error(`Failed to fetch detections: ${res.status}`);
    }

    const detections = await res.json();
    const tbody = document.querySelector("#detectionsTable tbody");

    if (detections.length === 0) {
      if (!tbody.hasChildNodes()) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#999;">No detections found.</td></tr>`;
      }
      return;
    }

    // Add new detections on top, skip duplicates
    detections.reverse().forEach(det => {
      const detId = det.id || det.timestamp; // use ID if available, fallback to timestamp
      if (loadedDetections.has(detId)) return; // skip if already loaded
      loadedDetections.add(detId);

      const imageUrl = det.frame_image_path.startsWith("http")
        ? det.frame_image_path
        : `http://localhost:8000/uploads/frames/${det.frame_image_path.split("/").pop()}`;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><img src="${imageUrl}" alt="Detection image" class="detection-img"></td>
        <td>${det.username || "Unknown"}</td>
        <td>${det.exam_id || "N/A"}</td>
        <td>${det.movement_type || "Unknown"}</td>
        <td>${new Date(det.timestamp || Date.now()).toLocaleString()}</td>
      `;
      tbody.prepend(tr); // add new rows to top
    });

  } catch (err) {
    console.error(err);
    alert("❌ Failed to load detections. Check console for details.");
  }
}
