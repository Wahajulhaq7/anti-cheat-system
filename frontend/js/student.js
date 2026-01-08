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
 * ✅ CHECK FACE REGISTRATION (Updated)
 * - If 404: Open Modal
 * - If 200: Disable "Register" Button
 */
async function checkFaceRegistration() {
    const user_id = localStorage.getItem("user_id");
    if (!user_id) return;

    try {
        // Try to fetch the profile image
        const res = await fetch(`http://localhost:8000/uploads/profiles/${user_id}.jpg`, {
            method: 'HEAD',
            cache: 'no-store'
        });

        const regButton = document.querySelector(".btn-face-auth"); // Find the button

        if (res.status === 200) {
            // ✅ Image Exists -> Disable Button
            if (regButton) {
                regButton.disabled = true;
                regButton.innerHTML = '<i class="fa-solid fa-check-circle"></i> Face Registered';
                regButton.style.backgroundColor = "#2f855a"; // Green color
                regButton.style.cursor = "default";
                regButton.onclick = null; // Prevent clicking
            }
        } 
        else if (res.status === 404) {
            // ❌ Image Missing -> Open Modal
            console.log("No Face ID found. Opening registration modal.");
            
            const msg = document.querySelector("#faceModal .modal-body p");
            if(msg) {
                msg.innerHTML = "<strong style='color:#e53e3e'>⚠️ Face ID Required</strong><br>You have not registered your face yet.<br>Please capture a clear photo to continue. Remove any obstructions like glasses or hats!!";
            }
            
            openFaceModal();
        }
    } catch (err) {
        console.warn("Could not verify face registration:", err);
    }
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

  // ✅ Trigger the check
  checkFaceRegistration();
};

// ============================================================
// 📸 FACE REGISTRATION LOGIC
// ============================================================
let faceStream = null;

async function openFaceModal() {
    const modal = document.getElementById('faceModal');
    const video = document.getElementById('facePreview');
    const btn = document.getElementById('btnCapture'); // Reset button state
    
    if(btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-camera"></i> Capture';
    }

    modal.style.display = 'flex';

    try {
        // Start Webcam
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        faceStream = stream;
        video.srcObject = stream;
    } catch (err) {
        console.error("Camera Error:", err);
        alert("❌ Camera permission denied. Cannot register face.");
        closeFaceModal();
    }
}

function closeFaceModal() {
    const modal = document.getElementById('faceModal');
    modal.style.display = 'none';

    // Stop Webcam
    if (faceStream) {
        faceStream.getTracks().forEach(track => track.stop());
        faceStream = null;
    }
}

async function captureAndRegister() {
    const video = document.getElementById('facePreview');
    const canvas = document.getElementById('captureCanvas');
    const btn = document.getElementById('btnCapture');

    if (!video.srcObject) return;

    // 1. Draw video frame to canvas
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // 2. Convert to Blob (Image File)
    canvas.toBlob(async (blob) => {
        if (!blob) return;

        // 3. Prepare Form Data
        const formData = new FormData();
        formData.append("file", blob, "face.jpg");

        // UI Feedback
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading...';

        try {
            const token = localStorage.getItem("token");
            const res = await fetch("http://localhost:8000/auth/register-face", {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}` },
                body: formData
            });

            if (res.ok) {
                alert("✅ Face ID Registered Successfully!");
                closeFaceModal(); // Close modal
                
                // ✅ UPDATE BUTTON STATE INSTANTLY WITHOUT RELOAD
                const regButton = document.querySelector(".btn-face-auth");
                if (regButton) {
                    regButton.disabled = true;
                    regButton.innerHTML = '<i class="fa-solid fa-check-circle"></i> Face Registered';
                    regButton.style.backgroundColor = "#2f855a";
                    regButton.style.cursor = "default";
                    regButton.onclick = null;
                }

            } else {
                const err = await res.json();
                alert("❌ " + (err.detail || "Registration failed"));
            }
        } catch (error) {
            console.error(error);
            alert("❌ Network Error");
        } finally {
            if (btn && !btn.disabled) { // Only reset if failed
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-camera"></i> Capture';
            }
        }

    }, 'image/jpeg');
}