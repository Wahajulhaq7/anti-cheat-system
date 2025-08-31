const API_BASE = "http://localhost:8000";
const token = localStorage.getItem("token");
const role = localStorage.getItem("role");

// Auth guard
if (!token || role !== "invigilator") {
  alert("Access denied");
  localStorage.clear();
  window.location.href = "login.html";
}

// Display username
window.onload = () => {
  const username = localStorage.getItem("username");
  const usernameEl = document.getElementById("username");
  if (usernameEl && username) {
    usernameEl.textContent = username;
  }

  const urlParams = new URLSearchParams(window.location.search);
  const examId = parseInt(urlParams.get("exam_id"));
  const userId = parseInt(urlParams.get("user_id"));

  if (!examId || !userId) {
    alert("Invalid exam or student ID");
    window.location.href = "submitted_exams.html";
    return;
  }

  loadExamData(examId, userId);
};

async function loadExamData(examId, userId) {
  const list = document.getElementById("questionsList");

  try {
    // Load exam details
    const examRes = await fetch(`${API_BASE}/exam/${examId}`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (!examRes.ok) throw new Error("Failed to load exam");
    const exam = await examRes.json();

    // Load student info
    const userRes = await fetch(`${API_BASE}/auth/users/${userId}`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (!userRes.ok) throw new Error("Failed to load student");
    const user = await userRes.json();

    // Load student answers
    const answersRes = await fetch(`${API_BASE}/exam/${examId}/answers?user_id=${userId}`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (!answersRes.ok) throw new Error("Failed to load answers");
    const answers = await answersRes.json();

    // Load MCQs created by invigilator
    const questionsRes = await fetch(`${API_BASE}/exam/${examId}/questions`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (!questionsRes.ok) throw new Error("Failed to load questions");
    const questions = await questionsRes.json();

    // Fill exam details
    document.getElementById("examTitle").textContent = exam.title;
    document.getElementById("studentName").textContent = user.username;
    document.getElementById("submittedAt").textContent =
      answers.length > 0 && answers[0].submitted_at
        ? new Date(answers[0].submitted_at).toLocaleString()
        : "N/A";

    // Render MCQs with answers
    list.innerHTML = "";
    questions.forEach(q => {
  const answer = answers.find(a => a.question_id === q.id);
  const studentChoice = answer ? answer.selected_option : null;
  const isCorrect = studentChoice && studentChoice === q.correct_option;

  const optionMarkup = (label, text) => `
    <div style="margin-left: 10px;">
      ${label}: ${text || ""}
      ${studentChoice === label ? ` <strong>(Student)</strong>` : ""}
      ${q.correct_option === label ? ` <strong style="color:green;">(Correct)</strong>` : ""}
    </div>
  `;

  const div = document.createElement("div");
  div.className = "exam-item";
  div.innerHTML = `
    <div>
      <strong>${q.question}</strong>
      <div style="margin-top:6px;">
        ${optionMarkup("A", q.option_a)}
        ${optionMarkup("B", q.option_b)}
        ${optionMarkup("C", q.option_c)}
        ${optionMarkup("D", q.option_d)}
      </div>
      <p style="margin-top:6px;"><strong>Student Answer:</strong> ${studentChoice || "Not answered"}</p>
      <p><strong>Correct Answer:</strong> ${q.correct_option || "N/A"}</p>
      <p><strong>Status:</strong> 
        <span style="color: ${isCorrect ? 'green' : 'red'};">
          ${studentChoice ? (isCorrect ? '✅ Correct' : '❌ Incorrect') : '⏳ Not answered'}
        </span>
      </p>
    </div>
  `;
  list.appendChild(div);
});


  } catch (err) {
    console.error(err);
    list.innerHTML = `<p class="placeholder" style="color:red;">Error: Failed to load exam data</p>`;
  }
}
