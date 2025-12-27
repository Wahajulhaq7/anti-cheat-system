// frontend/js/captured.js

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

    // Only clear if empty state text is currently shown
    if (tbody.innerHTML.includes("No detections found")) {
      tbody.innerHTML = "";
    }

    if (detections.length === 0 && !tbody.hasChildNodes()) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#999;">No detections found.</td></tr>`;
      return;
    }

    // Add new detections on top, skip duplicates
    detections.reverse().forEach(det => {
      const detId = det.id; 
      if (loadedDetections.has(detId)) return; // skip if already loaded
      loadedDetections.add(detId);

      let path = det.frame_image_path.replace(/\\/g, "/");
      // remove accidental leading uploads/
      if (path.startsWith("uploads/")) {
        path = path.replace("uploads/", "");
      }
      const imageUrl = `http://localhost:8000/uploads/${path}`;

      const tr = document.createElement("tr");
      // Assign ID to row for easy removal
      tr.id = `row-${detId}`; 

      tr.innerHTML = `
        <td><img src="${imageUrl}" alt="Detection image" class="detection-img"></td>
        <td>${det.username || "Unknown"}</td>
        <td>${det.exam_id || "N/A"}</td>
        <td>${det.movement_type || "Unknown"}</td>
        <td>${new Date(det.timestamp || Date.now()).toLocaleString()}</td>
        <td>
           <button class="btn-view" onclick="openModal('${imageUrl}')">
             <i class="fa-solid fa-eye"></i> View
           </button>
           
           <button class="btn-delete" onclick="deleteDetection(${detId})">
             <i class="fa-solid fa-trash"></i> Delete
           </button>
        </td>
      `;
      tbody.prepend(tr); // add new rows to top
    });

  } catch (err) {
    console.error(err);
  }
}

// ✅ DELETE FUNCTION
async function deleteDetection(id) {
  if (!confirm("Are you sure you want to delete this detection logs and image?")) {
    return;
  }

  try {
    const res = await fetch(`http://localhost:8000/monitor/detection/${id}`, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });

    if (!res.ok) {
      throw new Error("Failed to delete detection");
    }

    // Remove from UI immediately
    const row = document.getElementById(`row-${id}`);
    if (row) {
      row.remove();
    }
    
    loadedDetections.delete(id);
    
    // Check if table is empty
    const tbody = document.querySelector("#detectionsTable tbody");
    if (!tbody.hasChildNodes()) {
       tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#999;">No detections found.</td></tr>`;
    }

  } catch (err) {
    console.error(err);
    alert("Error deleting detection.");
  }
}

// ✅ MODAL FUNCTIONS
function openModal(imageUrl) {
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');
    
    modalImg.src = imageUrl;
    // Use Flexbox to center (defined in CSS)
    modal.style.display = "flex"; 
}

function closeModal() {
    const modal = document.getElementById('imageModal');
    modal.style.display = "none";
    // Clear src to stop video/loading
    document.getElementById('modalImage').src = ""; 
}

// Close if clicked outside the image
window.onclick = function(event) {
    const modal = document.getElementById('imageModal');
    if (event.target === modal) {
        closeModal();
    }
};