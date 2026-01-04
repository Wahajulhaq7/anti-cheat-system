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

// ---------------------------
// MODAL STATE VARIABLES
// ---------------------------
let detectionToDeleteId = null;

// ---------------------------
// LOGOUT FUNCTIONS
// ---------------------------
function openLogoutModal() {
    document.getElementById('logoutModal').style.display = 'flex';
}

function closeLogoutModal() {
    document.getElementById('logoutModal').style.display = 'none';
}

function confirmLogout() {
    localStorage.clear();
    window.location.href = "login.html";
}

// ---------------------------
// LOAD DATA
// ---------------------------
let loadedDetections = new Set();

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

    if (tbody.innerHTML.includes("No detections found")) {
      tbody.innerHTML = "";
    }

    if (detections.length === 0 && !tbody.hasChildNodes()) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#999;">No detections found.</td></tr>`;
      return;
    }

    detections.reverse().forEach(det => {
      const detId = det.id; 
      if (loadedDetections.has(detId)) return;
      loadedDetections.add(detId);

      let path = det.frame_image_path.replace(/\\/g, "/");
      if (path.startsWith("uploads/")) {
        path = path.replace("uploads/", "");
      }
      const imageUrl = `http://localhost:8000/uploads/${path}`;

      const tr = document.createElement("tr");
      tr.id = `row-${detId}`; 

      tr.innerHTML = `
        <td><img src="${imageUrl}" alt="Detection image" class="detection-img"></td>
        <td>${det.username || "Unknown"}</td>
        <td>${det.exam_id || "N/A"}</td>
        <td>${det.movement_type || "Unknown"}</td>
        <td>${new Date(det.timestamp || Date.now()).toLocaleString()}</td>
        <td>
           <button class="btn-view" onclick="openImageModal('${imageUrl}')">
             <i class="fa-solid fa-eye"></i> View
           </button>
           
           <button class="btn-delete" onclick="openDeleteModal(${detId})">
             <i class="fa-solid fa-trash"></i> Delete
           </button>
        </td>
      `;
      tbody.prepend(tr); 
    });

  } catch (err) {
    console.error(err);
  }
}

// ---------------------------
// DELETE FUNCTIONS
// ---------------------------
function openDeleteModal(id) {
    detectionToDeleteId = id;
    document.getElementById('deleteModal').style.display = 'flex';
}

function closeDeleteModal() {
    document.getElementById('deleteModal').style.display = 'none';
    detectionToDeleteId = null;
}

// ✅ SUCCESS MODAL FUNCTIONS
function openSuccessModal() {
    document.getElementById('successModal').style.display = 'flex';
}

function closeSuccessModal() {
    document.getElementById('successModal').style.display = 'none';
}

async function confirmDelete() {
  if (!detectionToDeleteId) return;

  try {
    const res = await fetch(`http://localhost:8000/monitor/detection/${detectionToDeleteId}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${token}` }
    });

    if (!res.ok) {
      throw new Error("Failed to delete detection");
    }

    const row = document.getElementById(`row-${detectionToDeleteId}`);
    if (row) {
      row.remove();
    }
    
    loadedDetections.delete(detectionToDeleteId);
    
    const tbody = document.querySelector("#detectionsTable tbody");
    if (!tbody.hasChildNodes()) {
       tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#999;">No detections found.</td></tr>`;
    }

    closeDeleteModal(); 
    
    // ✅ TRIGGER SUCCESS MODAL HERE
    openSuccessModal(); 

  } catch (err) {
    console.error(err);
    alert("Error deleting detection.");
    closeDeleteModal();
  }
}

// ---------------------------
// IMAGE MODAL FUNCTIONS
// ---------------------------
function openImageModal(imageUrl) {
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');
    
    modalImg.src = imageUrl;
    modal.style.display = "flex"; 
}

function closeImageModal() {
    const modal = document.getElementById('imageModal');
    modal.style.display = "none";
    document.getElementById('modalImage').src = ""; 
}

// ---------------------------
// CLICK OUTSIDE TO CLOSE
// ---------------------------
window.onclick = function(event) {
    const imageModal = document.getElementById('imageModal');
    const logoutModal = document.getElementById('logoutModal');
    const deleteModal = document.getElementById('deleteModal');
    const successModal = document.getElementById('successModal');

    if (event.target === imageModal) closeImageModal();
    if (event.target === logoutModal) closeLogoutModal();
    if (event.target === deleteModal) closeDeleteModal();
    if (event.target === successModal) closeSuccessModal();
};