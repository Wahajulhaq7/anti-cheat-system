const API_BASE = "http://localhost:8000";
let detectionInterval = null; 
let isViolationProcessing = false; // 🔒 Lock to prevent double submission

window.addEventListener("DOMContentLoaded", async () => {
  const token = localStorage.getItem("token");
  const username = localStorage.getItem("username");
  const user_id = localStorage.getItem("user_id");
  const exam_id = localStorage.getItem("current_exam_id");

  // Bind logout button
  const logoutBtn = document.querySelector(".btn-logout");
  if (logoutBtn) logoutBtn.addEventListener("click", logout);

  if (!token || !user_id || !exam_id) {
    alert("Missing exam session. Please login and start an exam.");
    window.location.replace("available_exams.html");
    return;
  }

  const userEl = document.getElementById("username");
  if(userEl) userEl.innerHTML = `<i class="fa-solid fa-user-graduate"></i> ${username}`;

  // --- 🔒 VIOLATION DETECTION EVENTS ---
  
  // 1. Tab Switch / Minimize
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      handleViolation("tab_switch", exam_id, token);
    }
  });

  // 2. Window Blur (Clicking outside browser)
  window.addEventListener("blur", () => {
    handleViolation("window_blur", exam_id, token);
  });

  // 3. Incognito Detection
  detectIncognitoMode(isIncognito => {
    if (isIncognito) {
      handleViolation("incognito_mode", exam_id, token);
    }
  });

  // Tell backend exam started
  try {
    await fetch(`${API_BASE}/exam/${exam_id}/start`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    });
  } catch (err) {
    console.error("Failed to record exam start:", err);
  }

  await loadQuestions(exam_id);
  startWebcamDetection(user_id, exam_id, token);
});

// --- 🚀 CORE: Handle Violation ---
async function handleViolation(type, exam_id, token) {
  // If already processing a violation, stop here to prevent loops
  if (isViolationProcessing) return;
  isViolationProcessing = true; 

  console.warn(`🚨 VIOLATION DETECTED: ${type}`);

  // 1. Report the violation to backend (fire and forget)
  reportViolation(type);

  // 2. Submit Exam Automatically (Silent Mode)
  // We pass 'true' to indicate auto-submit.
  // The redirect to student.html happens inside submitAnswers.
  await submitAnswers(exam_id, token, true);
  
  // ❌ REMOVED ALERT: No alert here to ensure immediate redirect when tab is hidden.
}

function logout() {
  if (detectionInterval) {
    clearInterval(detectionInterval);
    detectionInterval = null;
  }
  const video = document.getElementById("webcam");
  if (video && video.srcObject) {
    video.srcObject.getTracks().forEach(track => track.stop());
  }

  localStorage.clear();
  window.location.replace("login.html");
}

async function loadQuestions(exam_id) {
  const list = document.getElementById("question-list");
  list.innerHTML = "<p>Loading questions...</p>";

  try {
    const res = await fetch(`${API_BASE}/exam/${exam_id}/questions`, {
      headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
    });

    if (!res.ok) {
      list.innerHTML = `<p>Failed to load questions. (${res.status})</p>`;
      return;
    }

    const questions = await res.json();

    list.innerHTML = questions.map((q, i) => `
      <div class="question-block" data-qnum="${i + 1}">
        <p><strong>Q${i + 1}:</strong> ${q.question}</p>
        <ul>
          ${['A', 'B', 'C', 'D'].map(opt => {
            const val = q[`option_${opt.toLowerCase()}`];
            return `
              <li>
                <label>
                  <input type="radio" name="q${i}" value="${opt}"> ${opt}. ${val}
                </label>
              </li>
            `;
          }).join('')}
        </ul>
      </div>
    `).join("");

    list.insertAdjacentHTML("beforeend", `
      <div style="margin-top:20px;">
        <button id="submit-answers" class="btn-submit">Submit Answers</button>
      </div>
    `);

    document.getElementById("submit-answers").addEventListener("click", () => {
      submitAnswers(exam_id, localStorage.getItem("token"), false);
    });

  } catch (err) {
    console.error("Error loading questions:", err);
    list.innerHTML = "<p>Network error.</p>";
  }
}

// --- 📤 SUBMIT ANSWERS FUNCTION ---
async function submitAnswers(exam_id, token, isAutoSubmit = false) {
  const answers = [];
  document.querySelectorAll(".question-block").forEach((block, index) => {
    const selected = block.querySelector("input[type='radio']:checked");
    answers.push({
      question_number: index + 1,
      selected_option: selected ? selected.value : null
    });
  });

  // If manual submit, require validation. Auto-submit skips this.
  if (!isAutoSubmit && answers.length === 0) {
    alert("No questions loaded. Cannot submit.");
    return false;
  }

  console.log("📤 Submitting answers...");

  try {
    const res = await fetch(`${API_BASE}/exam/${exam_id}/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ answers })
    });

    const responseText = await res.text();

    if (!res.ok) {
      console.error(`❌ Submit Error:`, responseText);
      // Only show alerts if user is manually submitting
      if (!isAutoSubmit) {
         if (responseText.includes("already submitted")) {
            // Already submitted, so just leave
            window.location.replace("student.html");
            return; 
         }
      } 
      
      // If auto-submit failed (e.g. already submitted), force redirect anyway
      if (isAutoSubmit) {
          window.location.replace("student.html");
      }
      return false;
    }

    // --- Success Handling ---
    if (!isAutoSubmit) {
      alert("🎉 Your exam has been submitted successfully!");
    }

    // REDIRECT TO RESULTS
    window.location.replace("student.html");
    return true;

  } catch (err) {
    console.error("Critical Submit Error:", err);
    if (!isAutoSubmit) alert("⚠️ Network error. Please try again.");
    // Force redirect on error if auto-submit to exit the loop
    if (isAutoSubmit) window.location.replace("student.html");
    return false;
  }
}

// --- Helper: Report violations ---
async function reportViolation(type) {
  try {
    await fetch(`${API_BASE}/monitor/violation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${localStorage.getItem("token")}`
      },
      body: JSON.stringify({
        user_id: localStorage.getItem("user_id"),
        exam_id: localStorage.getItem("current_exam_id"),
        violation_type: type,
        timestamp: new Date().toISOString()
      })
    });
  } catch (err) {
    console.error("Failed to report violation:", err);
  }
}

function startWebcamDetection(user_id, exam_id, token) {
  const video = document.getElementById("webcam");
  
  if (!video) return;

  navigator.mediaDevices.getUserMedia({ video: true })
    .then(stream => {
      video.srcObject = stream;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      detectionInterval = setInterval(() => {
        if (video.videoWidth === 0) return;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);

        canvas.toBlob(async blob => {
          const formData = new FormData();
          formData.append("user_id", user_id);
          formData.append("exam_id", exam_id);
          formData.append("frame", blob, "frame.jpg");

          try {
            await fetch(`${API_BASE}/video/`, {
              method: "POST",
              headers: { "Authorization": `Bearer ${token}` },
              body: formData
            });
            // Removed status logic as requested
          } catch (err) { console.error(err); }
        }, "image/jpeg");
      }, 5000);
    })
    .catch(err => {
      console.error("Webcam denied:", err);
    });
}

// --- Helper: Detect incognito ---
function detectIncognitoMode(callback) {
  const fs = window.RequestFileSystem || window.webkitRequestFileSystem;
  if (!fs) { callback(false); return; }
  fs(window.TEMPORARY, 100, () => callback(false), () => callback(true));
}