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
// DATA STATE
// ---------------------------
let allDetectionsData = []; // Store full list for filtering
let loadedDetections = new Set(); // Keep track of duplicates
let detectionToDeleteId = null;

// ---------------------------
// INITIALIZATION
// ---------------------------
window.onload = () => {
  loadDetections();
  setInterval(loadDetections, 5000); // refresh every 5 seconds
  
  // ✅ Event Listeners for Live Filtering
  document.getElementById('searchName').addEventListener('input', renderTable);
  document.getElementById('searchDate').addEventListener('change', renderTable);
};

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
// DATA LOADING & RENDERING
// ---------------------------
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

    const newDetections = await res.json();
    let hasUpdates = false;

    // Process new data
    newDetections.forEach(det => {
        if (!loadedDetections.has(det.id)) {
            loadedDetections.add(det.id);
            allDetectionsData.push(det);
            hasUpdates = true;
        }
    });

    // If new data found, re-sort and render
    if (hasUpdates || allDetectionsData.length === 0) {
        // Sort by timestamp descending (newest first)
        allDetectionsData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        renderTable();
    }

  } catch (err) {
    console.error(err);
  }
}

// ✅ NEW: Filter and Render Table
function renderTable() {
    const nameFilter = document.getElementById('searchName').value.toLowerCase();
    const dateFilter = document.getElementById('searchDate').value;
    
    const tbody = document.querySelector("#detectionsTable tbody");
    tbody.innerHTML = "";

    // Filter Logic
    const filtered = allDetectionsData.filter(det => {
        // 1. Name Check
        const matchesName = (det.username || "").toLowerCase().includes(nameFilter);
        
        // 2. Date Check
        let matchesDate = true;
        if (dateFilter) {
            // Timestamp format comes as ISO: 2026-01-11T14:53...
            // Convert detection timestamp to YYYY-MM-DD
            const detDate = new Date(det.timestamp).toISOString().split('T')[0];
            matchesDate = detDate === dateFilter;
        }
        
        return matchesName && matchesDate;
    });

    // Empty State
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#999; padding: 20px;">No matching detections found.</td></tr>`;
        return;
    }

    // Render Rows
    filtered.forEach(det => {
      const detId = det.id; 
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
      tbody.appendChild(tr);
    });
}

function resetFilters() {
    document.getElementById('searchName').value = '';
    document.getElementById('searchDate').value = '';
    renderTable();
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

    // Remove from local data arrays
    allDetectionsData = allDetectionsData.filter(d => d.id !== detectionToDeleteId);
    loadedDetections.delete(detectionToDeleteId);
    
    // Re-render
    renderTable();

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