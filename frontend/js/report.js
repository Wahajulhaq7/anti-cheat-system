// frontend/js/report.js

// State variables for the modal
let currentStudentId = null;
let currentExamId = null;
let selectedImages = new Set(); // Stores paths of selected images

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

async function fetchReports() {
    const token = localStorage.getItem("token");
    const reportsBody = document.getElementById("reportsBody");

    if (!token) {
        window.location.href = "login.html";
        return;
    }

    try {
        const reportsRes = await fetch("http://localhost:8000/log/reports/all", {
            headers: { "Authorization": `Bearer ${token}` }
        });

        if (!reportsRes.ok) throw new Error("Failed to load reports");

        const reports = await reportsRes.json();
        reportsBody.innerHTML = "";

        if (reports.length === 0) {
            reportsBody.innerHTML = "<tr><td colspan='7'>No cheating reports found</td></tr>";
            return;
        }

        reports.forEach(report => {
            const tr = document.createElement("tr");
            const examDate = new Date(report.exam_date).toLocaleDateString();
            const cheatingScore = report.cheating_score || 0;
            
            let scoreColor = "#28a745"; 
            if (cheatingScore >= 50) scoreColor = "#ffc107"; 
            if (cheatingScore >= 75) scoreColor = "#dc3545"; 

            tr.innerHTML = `
                <td>${report.student_id}</td>
                <td>${report.student_name}</td>
                <td>${report.exam_id}</td>
                <td>${report.exam_title}</td>
                <td>${examDate}</td>
                <td>
                    <span style="color: ${scoreColor}; font-weight: bold;">
                        ${cheatingScore}%
                    </span>
                </td>
                <td>
                    <button class="btn-report-view" onclick="openImageSelector(${report.student_id}, ${report.exam_id})">
                        <i class="fa-solid fa-images"></i> Select & Generate
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

// --- NEW FUNCTION: Open Modal and Load Images ---
async function openImageSelector(studentId, examId) {
    const token = localStorage.getItem("token");
    currentStudentId = studentId;
    currentExamId = examId;
    selectedImages.clear(); // Reset selection
    updateSelectionCount();

    const modal = document.getElementById("imageModal");
    const grid = document.getElementById("imageGrid");
    
    modal.style.display = "block";
    grid.innerHTML = '<p>Loading evidence images...</p>';

    try {
        // Fetch detailed report which contains image paths
        const response = await fetch(`http://localhost:8000/log/report/detailed/${studentId}/${examId}`, {
            headers: { "Authorization": `Bearer ${token}` }
        });

        if (!response.ok) throw new Error("Could not fetch report details");

        const report = await response.json();
        grid.innerHTML = ""; // Clear loading text

        if (!report.movements || report.movements.length === 0) {
            grid.innerHTML = "<p>No suspicious frames captured for this exam.</p>";
            return;
        }

        // Loop through movements and create image cards
        report.movements.forEach(move => {
            // Assume backend provides 'image_url' or 'frame_path'
            // If image_url is missing, use a placeholder or check your backend logic
            if (move.image_url) {
                const imgCard = document.createElement("div");
                imgCard.className = "img-card";
                imgCard.onclick = () => toggleImageSelection(imgCard, move.image_url);

                const img = document.createElement("img");
                // Ensure the URL is absolute (adjust localhost port if needed)
                img.src = `http://localhost:8000/${move.image_url}`; 
                img.alt = move.movement_type;
                
                // Optional: Add timestamp tooltip
                img.title = `${move.movement_type} - ${new Date(move.timestamp).toLocaleTimeString()}`;

                imgCard.appendChild(img);
                grid.appendChild(imgCard);
            }
        });
        
        if (grid.children.length === 0) {
            grid.innerHTML = "<p>No images found in the logs.</p>";
        }

    } catch (err) {
        console.error(err);
        grid.innerHTML = `<p style="color:red">Error loading images: ${err.message}</p>`;
    }
}

// --- NEW FUNCTION: Toggle Selection ---
function toggleImageSelection(cardElement, imagePath) {
    if (selectedImages.has(imagePath)) {
        selectedImages.delete(imagePath);
        cardElement.classList.remove("selected");
    } else {
        selectedImages.add(imagePath);
        cardElement.classList.add("selected");
    }
    updateSelectionCount();
}

function updateSelectionCount() {
    document.getElementById("selectionCount").innerText = `${selectedImages.size} images selected`;
}

// --- NEW FUNCTION: Generate PDF with Selected Images ---
async function generateCustomPDF() {
    const token = localStorage.getItem("token");
    const btn = document.getElementById("btnGenerateWithImages");
    
    // Convert Set to Array
    const imageList = Array.from(selectedImages);

    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating...';
    btn.disabled = true;

    try {
        // IMPORTANT: We use POST now because we are sending data (image list)
        const response = await fetch(`http://localhost:8000/log/report/pdf/custom`, {
            method: "POST",
            headers: { 
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                student_id: currentStudentId,
                exam_id: currentExamId,
                selected_images: imageList
            })
        });

        if (!response.ok) throw new Error("Failed to generate PDF");

        const pdfBlob = await response.blob();
        const pdfUrl = URL.createObjectURL(pdfBlob);
        window.open(pdfUrl, '_blank');
        
        // Close modal after success
        closeImageModal();

    } catch (err) {
        console.error("PDF Error:", err);
        alert(`❌ ${err.message}`);
    } finally {
        btn.innerHTML = '<i class="fa-solid fa-file-pdf"></i> Generate Report';
        btn.disabled = false;
    }
}

function closeImageModal() {
    document.getElementById("imageModal").style.display = "none";
}

// Close modal if clicked outside
window.onclick = function(event) {
    const modal = document.getElementById("imageModal");
    if (event.target == modal) {
        closeImageModal();
    }
}