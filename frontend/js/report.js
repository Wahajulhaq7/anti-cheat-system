// frontend/js/report.js

// Prevent non-admins from accessing
const role = localStorage.getItem("role");
if (!role || role !== "admin") {
    alert("Access denied. Admins only.");
    window.location.href = "login.html";
}

// Load reports on page load
window.onload = () => {
    const reportsBody = document.getElementById("reportsBody");
    reportsBody.innerHTML = "<tr><td colspan='7'>Loading reports...</td></tr>";
    fetchReports();
};

// Fetch all cheating reports from the backend
async function fetchReports() {
    const token = localStorage.getItem("token");
    const reportsBody = document.getElementById("reportsBody");

    if (!token) {
        window.location.href = "login.html";
        return;
    }

    try {
        // Fetch all cheating reports
        const reportsRes = await fetch("http://localhost:8000/log/reports/all", {
            headers: { "Authorization": `Bearer ${token}` }
        });

        if (!reportsRes.ok) {
            if (reportsRes.status === 403) {
                throw new Error("Access denied. Admin/Invigilator access required.");
            }
            throw new Error("Failed to load reports");
        }

        const reports = await reportsRes.json();

        // Render table
        reportsBody.innerHTML = "";
        if (reports.length === 0) {
            reportsBody.innerHTML = "<tr><td colspan='7'>No cheating reports found</td></tr>";
            return;
        }

        reports.forEach(report => {
            const tr = document.createElement("tr");
            const examDate = new Date(report.exam_date).toLocaleDateString();
            const cheatingScore = report.cheating_score || 0;
            const suspiciousEvents = report.suspicious_events || 0;
            
            // Color code based on cheating score
            let scoreColor = "#28a745"; // Green for low risk
            if (cheatingScore >= 50) scoreColor = "#ffc107"; // Yellow for medium risk
            if (cheatingScore >= 75) scoreColor = "#dc3545"; // Red for high risk

            tr.innerHTML = `
                <td>${report.student_id}</td>
                <td>${report.student_name}</td>
                <td>${report.exam_id}</td>
                <td>${report.exam_title}</td>
                <td>${examDate}</td>
                <td>
                    <span style="color: ${scoreColor}; font-weight: bold;">
                        ${cheatingScore}% (${suspiciousEvents} events)
                    </span>
                </td>
                <td>
                    <button class="btn-report" onclick="generateDetailedReport(${report.student_id}, ${report.exam_id})">
                        View Details
                    </button>
                    <button class="btn-report" onclick="generatePDFReport(${report.student_id}, ${report.exam_id})" style="margin-left: 5px; background: #28a745;">
                        📄 PDF Report
                    </button>
                </td>
            `;
            reportsBody.appendChild(tr);
        });

    } catch (err) {
        console.error("Fetch reports error:", err);
        reportsBody.innerHTML = `<tr><td colspan="7">❌ ${err.message}</td></tr>`;
    }
}

// Generate detailed report using real backend data
async function generateDetailedReport(studentId, examId) {
    const token = localStorage.getItem("token");

    if (!token) {
        window.location.href = "login.html";
        return;
    }

    try {
        const response = await fetch(`http://localhost:8000/log/report/detailed/${studentId}/${examId}`, {
            headers: { "Authorization": `Bearer ${token}` }
        });

        if (!response.ok) {
            if (response.status === 403) {
                throw new Error("Access denied. Admin/Invigilator access required.");
            }
            if (response.status === 404) {
                throw new Error("Report not found.");
            }
            throw new Error("Failed to load detailed report");
        }

        const report = await response.json();
        
        // Format movements for display
        let movementDetails = "No suspicious activities detected.";
        if (report.movements && report.movements.length > 0) {
            movementDetails = report.movements.map(m => 
                `• ${m.movement_type} at ${new Date(m.timestamp).toLocaleString()}`
            ).join('\n');
        }

        // Create detailed report message
        const reportMessage = `📄 Detailed Cheating Report

Student: ${report.student_name}
Exam: ${report.exam_title}
Date: ${new Date(report.exam_date).toLocaleDateString()}

📊 SUMMARY:
• Total Questions Answered: ${report.total_answered}
• Suspicious Events: ${report.suspicious_events}
• Cheating Score: ${report.cheating_score}%

🚨 SUSPICIOUS ACTIVITIES:
${movementDetails}

Risk Level: ${getRiskLevel(report.cheating_score)}`;

        alert(reportMessage);

    } catch (err) {
        console.error("Detailed report error:", err);
        alert(`❌ ${err.message}`);
    }
}

// Helper function to determine risk level
function getRiskLevel(score) {
    if (score === 0) return "✅ No Risk";
    if (score <= 20) return "🟢 Low Risk";
    if (score <= 50) return "🟡 Medium Risk";
    if (score <= 75) return "🟠 High Risk";
    return "🔴 Very High Risk";
}

// Generate PDF report and open in new tab
async function generatePDFReport(studentId, examId) {
    const token = localStorage.getItem("token");

    if (!token) {
        window.location.href = "login.html";
        return;
    }

    try {
        // Show loading message
        const button = event.target;
        const originalText = button.textContent;
        button.textContent = "Generating PDF...";
        button.disabled = true;

        // Call the PDF generation endpoint
        const response = await fetch(`http://localhost:8000/log/report/pdf/${studentId}/${examId}`, {
            headers: { "Authorization": `Bearer ${token}` }
        });

        if (!response.ok) {
            if (response.status === 403) {
                throw new Error("Access denied. Admin/Invigilator access required.");
            }
            if (response.status === 404) {
                throw new Error("Report not found.");
            }
            throw new Error("Failed to generate PDF report");
        }

        // Get the PDF blob
        const pdfBlob = await response.blob();
        
        // Create a URL for the blob
        const pdfUrl = URL.createObjectURL(pdfBlob);
        
        // Open PDF in new tab
        window.open(pdfUrl, '_blank');
        
        // Clean up the URL after a short delay
        setTimeout(() => {
            URL.revokeObjectURL(pdfUrl);
        }, 1000);

        // Reset button
        button.textContent = originalText;
        button.disabled = false;

    } catch (err) {
        console.error("PDF generation error:", err);
        alert(`❌ ${err.message}`);
        
        // Reset button on error
        const button = event.target;
        button.textContent = "📄 PDF Report";
        button.disabled = false;
    }
}

// Keep the old function for backward compatibility
async function generateReport(studentId, examId) {
    return generateDetailedReport(studentId, examId);
}

// Export all student exam data to CSV
function exportCSV() {
    const rows = [
        ["Student ID", "Student Name", "Exam ID", "Exam Title", "Date"]
    ];

    // Get all rows from table
    document.querySelectorAll("#reportsBody tr").forEach(tr => {
        const cells = tr.querySelectorAll("td");
        if (cells.length > 0) {
            const row = [];
            // Only push first 5 columns (skip Actions)
            for (let i = 0; i < 5; i++) {
                row.push(cells[i].textContent.trim());
            }
            rows.push(row);
        }
    });

    const csvContent = rows.map(row => row.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `student_exam_reports_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
}
