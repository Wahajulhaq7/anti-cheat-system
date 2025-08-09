// frontend/js/report.js
async function fetchReports() {
  const token = localStorage.getItem("token");
  const reportsDiv = document.getElementById("reports");
  reportsDiv.innerHTML = "Loading...";

  try {
    // Simulate fetching all reports (you can extend this with real API later)
    const res = await fetch("http://localhost:8000/log/report/1"); // Example exam_id=1
    const data = await res.json();

    reportsDiv.innerHTML = `
      <div class="report-card">
        <h3>Exam ID: 1</h3>
        <p><strong>Cheating Score:</strong> ${data.cheating_score}</p>
        <p><strong>Movements:</strong> ${data.details?.movements || 'None'}</p>
        <p><strong>Last Event:</strong> ${data.details?.last_event || 'N/A'}</p>
        <button onclick="exportCSV()">Export as CSV</button>
      </div>
    `;
  } catch (err) {
    reportsDiv.innerHTML = "❌ Could not load reports.";
    console.error(err);
  }
}

function exportCSV() {
  const csv = [
    ["Exam ID", "Cheating Score", "Suspicious Events"],
    ["1", "25", "no_face, sudden_movement"]
  ].map(row => row.join(",")).join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "cheating_report.csv";
  a.click();
}