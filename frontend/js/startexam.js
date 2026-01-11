const API_BASE = "http://localhost:8000";
let detectionInterval = null; 
let isViolationProcessing = false; 
let timerInterval = null; // Timer variable

// Global function exposure
window.openSubmitModal = openSubmitModal;
window.closeSubmitModal = closeSubmitModal;

window.addEventListener("DOMContentLoaded", async () => {
  const token = localStorage.getItem("token");
  const username = localStorage.getItem("username");
  const user_id = localStorage.getItem("user_id");
  const exam_id = localStorage.getItem("current_exam_id");

  if (!token || !user_id || !exam_id) {
    alert("Missing exam session. Please login and start an exam.");
    window.location.replace("available_exams.html");
    return;
  }

  const userEl = document.getElementById("username");
  if(userEl) userEl.innerHTML = `<i class="fa-solid fa-user-graduate"></i> ${username}`;

  // --- VIOLATION DETECTION ---
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) handleViolation("tab_switch", exam_id, token);
  });

  window.addEventListener("blur", () => {
    handleViolation("window_blur", exam_id, token);
  });

  detectIncognitoMode(isIncognito => {
    if (isIncognito) handleViolation("incognito_mode", exam_id, token);
  });

  try {
    await fetch(`${API_BASE}/exam/${exam_id}/start`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    });
  } catch (err) { console.error("Failed to record exam start:", err); }

  // Initialize Timer & Questions
  await initExamTimer(exam_id, token);
  await loadQuestions(exam_id);
  startWebcamDetection(user_id, exam_id, token);
});

// --- EXAM TIMER LOGIC ---
async function initExamTimer(exam_id, token) {
    try {
        const res = await fetch(`${API_BASE}/exam/${exam_id}`, {
            headers: { "Authorization": `Bearer ${token}` }
        });
        
        if (!res.ok) throw new Error("Failed to fetch exam details");
        const exam = await res.json();
        
        const durationMinutes = exam.duration_minutes || 60; 
        const storageKey = `exam_end_time_${exam_id}`;
        
        let endTime = localStorage.getItem(storageKey);
        
        if (!endTime) {
            const now = new Date().getTime();
            endTime = now + (durationMinutes * 60 * 1000);
            localStorage.setItem(storageKey, endTime);
        }

        updateTimerDisplay(endTime, exam_id, token);
        timerInterval = setInterval(() => {
            updateTimerDisplay(endTime, exam_id, token);
        }, 1000);

    } catch (err) {
        console.error("Timer Error:", err);
        document.getElementById("timerDisplay").innerText = "00:00";
    }
}

function updateTimerDisplay(endTime, exam_id, token) {
    const now = new Date().getTime();
    const distance = endTime - now;
    
    const displayElement = document.getElementById("timerDisplay");

    // Time expired
    if (distance < 0) {
        clearInterval(timerInterval);
        displayElement.innerText = "00:00";
        displayElement.classList.add("warning");
        
        // Trigger once
        if (!displayElement.dataset.expired) {
            displayElement.dataset.expired = "true";
            
            // Show the Time's Up Modal
            const modal = document.getElementById("timeoutModal");
            if (modal) modal.style.display = "flex";

            // Submit automatically
            submitAnswers(exam_id, token, true); 
        }
        return;
    }

    // Calculate hours, minutes, seconds
    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((distance % (1000 * 60)) / 1000);

    let timeString = "";
    if (hours > 0) {
        timeString += `${hours.toString().padStart(2, '0')}:`;
    }
    timeString += `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    displayElement.innerText = timeString;

    if (distance < 5 * 60 * 1000) {
        displayElement.classList.add("warning");
    }
}

// --- HANDLE VIOLATIONS ---
async function handleViolation(type, exam_id, token) {
  if (isViolationProcessing) return;
  isViolationProcessing = true; 
  console.warn(`🚨 VIOLATION DETECTED: ${type}`);
  reportViolation(type);
  await submitAnswers(exam_id, token, true);
}

// --- LOAD QUESTIONS ---
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
        <button id="submit-answers" class="btn-submit" onclick="openSubmitModal()">Submit Answers</button>
      </div>
    `);

  } catch (err) {
    console.error("Error loading questions:", err);
    list.innerHTML = "<p>Network error.</p>";
  }
}

// --- MODAL LOGIC ---
function openSubmitModal() {
    const modal = document.getElementById('submitModal');
    if (!modal) return;
    modal.style.display = 'flex';

    const confirmBtn = document.getElementById('btnConfirmSubmit');
    if(confirmBtn) {
        confirmBtn.onclick = async function() {
            const exam_id = localStorage.getItem("current_exam_id");
            const token = localStorage.getItem("token");
            closeSubmitModal();
            await submitAnswers(exam_id, token, false);
        };
    }
}

function closeSubmitModal() {
    const modal = document.getElementById('submitModal');
    if (modal) modal.style.display = 'none';
}

// --- SUBMIT ANSWERS (UPDATED WITH DELAY) ---
async function submitAnswers(exam_id, token, isAutoSubmit = false) {
  // Clear timer and storage immediately
  if (timerInterval) clearInterval(timerInterval);
  localStorage.removeItem(`exam_end_time_${exam_id}`);

  const answers = [];
  document.querySelectorAll(".question-block").forEach((block, index) => {
    const selected = block.querySelector("input[type='radio']:checked");
    answers.push({
      question_number: index + 1,
      selected_option: selected ? selected.value : null
    });
  });

  if (!isAutoSubmit && answers.length === 0) {
    alert("No questions loaded. Cannot submit.");
    return false;
  }

  console.log("📤 Submitting answers...");

  // ✅ Helper to handle auto-submit redirect with 6s delay
  const handleAutoSubmitRedirect = () => {
      setTimeout(() => {
          window.location.replace("student.html");
      }, 6000); // 6000ms = 6 seconds
  };

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
      if (!isAutoSubmit) {
         if (responseText.includes("already submitted")) {
            window.location.replace("student.html");
            return; 
         }
         alert("Submission failed. Please try again.");
      } else {
         // Auto-submit failed? Still redirect after delay so user isn't stuck
         handleAutoSubmitRedirect();
      }
      return false;
    }

    if (!isAutoSubmit) {
      alert("🎉 Your exam has been submitted successfully!");
      window.location.replace("student.html");
    } else {
      // ✅ Auto-submit Success -> Wait 6 seconds
      handleAutoSubmitRedirect();
    }
    return true;

  } catch (err) {
    console.error("Submit Error:", err);
    if (!isAutoSubmit) {
        alert("⚠️ Network error. Please try again.");
    } else {
        // Network error on auto-submit -> Wait 6 seconds then exit
        handleAutoSubmitRedirect();
    }
    return false;
  }
}

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
  } catch (err) { console.error(err); }
}

function startWebcamDetection(user_id, exam_id, token) {
  const video = document.getElementById("webcam");
  if (!video) return;

  navigator.mediaDevices.getUserMedia({ video: true }).then(stream => {
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
          } catch (err) { console.error(err); }
        }, "image/jpeg");
      }, 5000);
    }).catch(err => console.error("Webcam denied:", err));
}

function detectIncognitoMode(callback) {
  const fs = window.RequestFileSystem || window.webkitRequestFileSystem;
  if (!fs) { callback(false); return; }
  fs(window.TEMPORARY, 100, () => callback(false), () => callback(true));
}