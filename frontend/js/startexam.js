const API_BASE = "http://localhost:8000";
let detectionInterval = null; // Track webcam detection loop

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

  document.getElementById("username").textContent = `👋 ${username}`;

  // --- Tab switch / window blur detection ---
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      handleViolation("tab_switch", exam_id, token);
    }
  });

  window.addEventListener("blur", () => {
    handleViolation("window_blur", exam_id, token);
  });

  // --- Incognito mode detection ---
  detectIncognitoMode(isIncognito => {
    if (isIncognito) {
      handleViolation("incognito_mode", exam_id, token);
    }
  });

  // Tell backend the exam is starting
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

    // Add Submit button
    list.insertAdjacentHTML("beforeend", `
      <div style="margin-top:20px;">
        <button id="submit-answers" class="btn-submit">Submit Answers</button>
      </div>
    `);

    document.getElementById("submit-answers").addEventListener("click", () => {
      submitAnswers(exam_id, localStorage.getItem("token"));
    });

  } catch (err) {
    console.error("Error loading questions:", err);
    list.innerHTML = "<p>Network error.</p>";
  }
}

function startWebcamDetection(user_id, exam_id, token) {
  const video = document.getElementById("webcam");
  const statusEl = document.querySelector(".status");

  navigator.mediaDevices.getUserMedia({ video: true })
    .then(stream => {
      video.srcObject = stream;

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      detectionInterval = setInterval(() => {
        if (video.videoWidth === 0 || video.videoHeight === 0) return;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(async blob => {
          const formData = new FormData();
          formData.append("user_id", user_id);
          formData.append("exam_id", exam_id);
          formData.append("frame", blob, "frame.jpg");

          try {
            const res = await fetch(`${API_BASE}/video/`, {
              method: "POST",
              headers: { "Authorization": `Bearer ${token}` },
              body: formData
            });

            if (!res.ok) {
              throw new Error(`Server responded with ${res.status}`);
            }

            const result = await res.json();
            statusEl.textContent = result.count > 0 
              ? "Suspicious activity detected" 
              : "All clear";
            statusEl.className = result.count > 0 
              ? "status alert" 
              : "status success";
          } catch (err) {
            console.error("Detection error:", err);
            statusEl.textContent = "Detection failed";
            statusEl.className = "status alert";
          }
        }, "image/jpeg");
      }, 5000);
    })
    .catch(err => {
      console.error("Webcam access denied:", err);
      statusEl.textContent = "Webcam not available";
      statusEl.className = "status alert";
    });
}

async function submitAnswers(exam_id, token) {
  const answers = [];
  document.querySelectorAll(".question-block").forEach((block, index) => {
    const selected = block.querySelector("input[type='radio']:checked");
    answers.push({
      question_number: index + 1,
      selected_option: selected ? selected.value : null
    });
  });

  try {
    const res = await fetch(`${API_BASE}/exam/${exam_id}/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ answers })
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Failed to submit answers. (${res.status})\n${errText}`);
      return false;
    }

    const result = await res.json();
    console.log("✅ Answers submitted successfully!", result);
    return true;

  } catch (err) {
    console.error("Error submitting answers:", err);
    return false;
  }
}

// --- Helper: Handle violation with auto-submit + logout ---
async function handleViolation(type, exam_id, token) {
  console.warn(`Violation detected: ${type}`);
  await reportViolation(type);
  const submitted = await submitAnswers(exam_id, token);
  logout(); // Always logout after attempt
}

// --- Helper: Report violations to backend ---
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

// --- Helper: Detect incognito/private mode ---
function detectIncognitoMode(callback) {
  const fs = window.RequestFileSystem || window.webkitRequestFileSystem;
  if (!fs) {
    callback(false);
    return;
  }
  fs(window.TEMPORARY, 100, () => callback(false), () => callback(true));
}
